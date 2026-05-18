import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { enforce } from "@/lib/ratelimit"
import { getSession } from "@/lib/session"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// Tiered edit policy for live campaigns:
// - COSMETIC: applied instantly. Founders can fix typos, swap banners, update links
//   without waiting for admin. Low-stakes, easily reversible.
// - MATERIAL: queued in pending_campaign_updates for admin approval. Stops
//   bait-and-switch (high reward to attract testers → silently nerf after).
// - Anything not in either list is locked once the campaign exists.
const COSMETIC = new Set(["tagline", "description", "app_url", "banner_position", "campaign_logo", "reward_description", "invite_codes"])
const MATERIAL = new Set(["expires_at", "total_slots", "contract_address"])

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const walletParam = req.nextUrl.searchParams.get("wallet")

  const isNumeric = /^\d+$/.test(id)
  const whereClause = isNumeric ? "c.id = $1" : "c.slug = $1"

  try {
    pool.query("UPDATE campaigns SET status = 'ended' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < NOW()").catch(() => {})

    const campaignRes = await pool.query(
      `SELECT
         c.*,
         (SELECT COUNT(*) FROM campaign_completions cc WHERE cc.campaign_id = c.id) AS completion_count,
         (SELECT COUNT(*) FROM campaign_completions cc WHERE cc.campaign_id = c.id AND cc.status = 'reviewed') AS reviewed_count
       FROM campaigns c WHERE ${whereClause}`,
      [isNumeric ? Number(id) : id]
    )

    if (!campaignRes.rows.length) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const campaignId = campaignRes.rows[0].id
    const creatorWallet = campaignRes.rows[0].creator_wallet

    // Auto-finalize submissions not rated within 7 days — provisional_score becomes the final quality_score
    pool.query(
      `UPDATE campaign_completions
       SET quality_score = provisional_score, status = 'reviewed', reviewed_at = NOW()
       WHERE campaign_id = $1
         AND status = 'submitted'
         AND created_at < NOW() - INTERVAL '7 days'
         AND provisional_score IS NOT NULL`,
      [campaignId]
    ).catch(() => {})

    const completionsRes = await pool.query(
      `SELECT tester_wallet, auto_score, builder_rating, quality_score, status,
              reward_delivered, review_answers, contract_verified, created_at
       FROM campaign_completions WHERE campaign_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [campaignId]
    )

    // Return the most recent pending or rejected edit request to the creator
    let pendingUpdate = null
    if (walletParam && creatorWallet?.toLowerCase() === walletParam.toLowerCase()) {
      try {
        const upd = await pool.query(
          `SELECT id, proposed_changes, status, submitted_at, admin_note
           FROM pending_campaign_updates
           WHERE campaign_id = $1 AND requester_wallet = $2 AND status IN ('pending','rejected')
           ORDER BY submitted_at DESC LIMIT 1`,
          [campaignId, walletParam.toLowerCase()]
        )
        if (upd.rows.length > 0) pendingUpdate = upd.rows[0]
      } catch { }
    }

    return NextResponse.json({
      campaign:    campaignRes.rows[0],
      completions: completionsRes.rows,
      pendingUpdate,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// PUT — founder submits a campaign edit. Cosmetic edits apply instantly,
// material edits queue for admin approval, everything else is rejected.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await enforce(req, "campaign-edit", { limit: 20, windowMs: 60_000 })
  if (blocked) return blocked

  const { id } = await params
  try {
    const { creator_wallet, changes } = await req.json()
    if (!creator_wallet || !changes || typeof changes !== "object") {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }
    const wallet = String(creator_wallet).toLowerCase()

    // Session must match the wallet making the edit — same one-sign-in pattern
    // used by every other founder action on the platform.
    const sess = getSession(req)
    if (!sess || sess.addr !== wallet) {
      return NextResponse.json({ error: "Sign in with the campaign creator wallet to edit" }, { status: 401 })
    }

    const isNumeric = /^\d+$/.test(id)
    const campaign = await pool.query(
      `SELECT id, title, filled_slots FROM campaigns WHERE ${isNumeric ? "id = $1" : "slug = $1"} AND creator_wallet = $2`,
      [isNumeric ? Number(id) : id, wallet]
    )
    if (!campaign.rows.length) return NextResponse.json({ error: "Campaign not found or not authorized" }, { status: 403 })
    const c = campaign.rows[0]

    // Split incoming changes by tier
    const cosmetic: Record<string, any> = {}
    const material: Record<string, any> = {}
    const rejected: string[] = []
    for (const [key, rawVal] of Object.entries(changes)) {
      if (rawVal === undefined || rawVal === "") continue
      if (COSMETIC.has(key))       cosmetic[key] = rawVal
      else if (MATERIAL.has(key))  material[key] = rawVal
      else                          rejected.push(key)
    }
    if (rejected.length) {
      return NextResponse.json(
        { error: `These fields are locked once a campaign exists: ${rejected.join(", ")}. Contact support if you need them changed.` },
        { status: 400 }
      )
    }
    if (!Object.keys(cosmetic).length && !Object.keys(material).length) {
      return NextResponse.json({ error: "No valid changes submitted" }, { status: 400 })
    }

    // Validate material changes (the ones that affect tester economics)
    if (material.total_slots !== undefined) {
      const n = parseInt(String(material.total_slots))
      if (isNaN(n) || n < 1) return NextResponse.json({ error: "Invalid slot count" }, { status: 400 })
      if (n < c.filled_slots) return NextResponse.json({ error: `Slot count cannot be below current filled count (${c.filled_slots})` }, { status: 400 })
    }
    if (material.contract_address !== undefined) {
      const addr = String(material.contract_address).trim()
      if (addr && !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return NextResponse.json({ error: "Contract address must be a valid 0x address" }, { status: 400 })
      }
      material.contract_address = addr || null
    }

    // Normalize invite_codes — dedupe case-insensitively, trim, cap.
    if (cosmetic.invite_codes !== undefined) {
      const raw = Array.isArray(cosmetic.invite_codes) ? cosmetic.invite_codes : []
      const seen = new Set<string>()
      const out: string[] = []
      for (const v of raw) {
        if (typeof v !== "string") continue
        const trimmed = v.trim().slice(0, 64)
        if (!trimmed) continue
        const key = trimmed.toUpperCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(trimmed)
        if (out.length >= 200) break
      }
      cosmetic.invite_codes = JSON.stringify(out)
    }

    // Apply cosmetic changes immediately. Build the SET clause dynamically but
    // safely — keys are constrained to COSMETIC, so no SQL injection surface.
    let appliedCount = 0
    if (Object.keys(cosmetic).length) {
      const keys   = Object.keys(cosmetic)
      const setSql = keys.map((k, i) => `${k} = $${i + 2}`).join(", ")
      const vals   = keys.map(k => cosmetic[k])
      await pool.query(`UPDATE campaigns SET ${setSql} WHERE id = $1`, [c.id, ...vals])
      appliedCount = keys.length
    }

    // Queue material changes for admin review
    let queuedCount = 0
    if (Object.keys(material).length) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pending_campaign_updates (
          id SERIAL PRIMARY KEY,
          campaign_id INT NOT NULL,
          campaign_title TEXT,
          requester_wallet TEXT NOT NULL,
          proposed_changes JSONB NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          submitted_at TIMESTAMPTZ DEFAULT NOW(),
          admin_note TEXT
        )
      `)
      await pool.query(
        `INSERT INTO pending_campaign_updates (campaign_id, campaign_title, requester_wallet, proposed_changes) VALUES ($1, $2, $3, $4)`,
        [c.id, c.title, wallet, JSON.stringify(material)]
      )
      queuedCount = Object.keys(material).length
    }

    return NextResponse.json({
      success:        true,
      appliedInstant: appliedCount,
      queuedForAdmin: queuedCount,
      message:
        queuedCount > 0 && appliedCount > 0
          ? `${appliedCount} change${appliedCount === 1 ? "" : "s"} live now, ${queuedCount} pending admin review.`
        : queuedCount > 0
          ? `${queuedCount} change${queuedCount === 1 ? "" : "s"} submitted for admin review.`
          : `${appliedCount} change${appliedCount === 1 ? "" : "s"} are live now.`,
    })
  } catch (err) {
    console.error("[Forge PUT]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// PATCH — record deposit tx hash (called after builder funds USDC campaign)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { deposit_tx_hash, creator_wallet } = await req.json()
    if (!deposit_tx_hash || !creator_wallet) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

    const result = await pool.query(
      `UPDATE campaigns SET deposit_tx_hash = $1, status = 'active'
       WHERE id = $2 AND creator_wallet = $3 AND status = 'approved'
       RETURNING id`,
      [deposit_tx_hash, id, creator_wallet.toLowerCase()]
    )
    if (!result.rows.length) return NextResponse.json({ error: "Campaign not found, not owned by wallet, or not awaiting funding" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
