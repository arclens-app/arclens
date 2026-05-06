import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { Resend } from "resend"
const pool   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const resend = new Resend(process.env.RESEND_API_KEY || "")
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""
function checkAuth(pw: string) { return !!ADMIN_PASSWORD && pw === ADMIN_PASSWORD }

async function sendCampaignEmail(campaignId: number, status: "approved" | "rejected", reason?: string) {
  try {
    // Get campaign + project email
    const res = await pool.query(
      `SELECT c.title, c.type, c.creator_wallet, c.slug AS campaign_slug, p.email, p.name AS project_name, p.slug AS project_slug
       FROM campaigns c
       LEFT JOIN projects p ON p.owner_wallet = c.creator_wallet AND p.approved = true
       WHERE c.id = $1
       ORDER BY p.created_at DESC LIMIT 1`,
      [campaignId]
    )
    const row = res.rows[0]
    if (!row?.email) return  // no email on file — silently skip

    const base_url      = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://arclenz.xyz"
    const campaignUrl   = `${base_url}/forge/${row.campaign_slug || campaignId}`
    const dashboardUrl  = `${base_url}/dashboard/${row.project_slug || row.project_name?.toLowerCase().replace(/\s+/g, "-") || ""}`
    const forgeUrl      = `${base_url}/forge`
    const base = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#060c20;color:#e8ecff;`
    const label = `font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:0.1em;`

    if (status === "approved") {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Your campaign is live — ${row.title}`,
        html: `<div style="${base}">
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:22px;font-weight:700;color:#1a56ff;">Lens</span></div>
          <div style="${label}color:#00b87a;">Campaign Approved</div>
          <h1 style="font-size:22px;font-weight:700;margin:10px 0 8px;color:#e8ecff;">${row.title}</h1>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 28px;">
            Your campaign is now live on Arc Trials. Testers can discover and complete it right now.
          </p>
          <a href="${campaignUrl}" style="display:inline-block;padding:13px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:16px;">View Live Campaign →</a>
          <br>
          <a href="${dashboardUrl}" style="display:inline-block;padding:13px 28px;background:transparent;color:#8aaeff;text-decoration:none;border-radius:8px;font-size:14px;border:1px solid rgba(26,86,255,0.3);">Open Dashboard</a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0;">
          <p style="font-size:12px;color:#2e3a5c;">You're receiving this because your project submitted a campaign on ArcLens.</p>
        </div>`,
      })
    } else {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Campaign update — ${row.title}`,
        html: `<div style="${base}">
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:22px;font-weight:700;color:#1a56ff;">Lens</span></div>
          <div style="${label}color:#e03348;">Campaign Not Approved</div>
          <h1 style="font-size:22px;font-weight:700;margin:10px 0 8px;color:#e8ecff;">${row.title}</h1>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 16px;">
            Your campaign was not approved at this time.
          </p>
          ${reason ? `<div style="padding:14px 18px;background:rgba(224,51,72,0.08);border:1px solid rgba(224,51,72,0.2);border-radius:8px;font-size:13px;color:#e8ecff;margin-bottom:24px;line-height:1.7;">${reason}</div>` : ""}
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 28px;">
            You can resubmit a revised campaign from the Arc Trials page. If you have questions, reply to this email.
          </p>
          <a href="${forgeUrl}" style="display:inline-block;padding:13px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Go to Arc Trials</a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0;">
          <p style="font-size:12px;color:#2e3a5c;">You're receiving this because your project submitted a campaign on ArcLens.</p>
        </div>`,
      })
    }
  } catch (err) {
    console.error("[Admin] Campaign email failed:", err)
  }
}

async function sendProjectEmail(projectId: number, status: "approved" | "rejected", reason?: string) {
  try {
    const res = await pool.query(
      `SELECT name, email, slug FROM projects WHERE id = $1`,
      [projectId]
    )
    const row = res.rows[0]
    if (!row?.email) return

    const base_url     = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://arclenz.xyz"
    const ecosystemUrl = `${base_url}/ecosystem`
    const dashboardUrl = `${base_url}/dashboard/${row.slug || row.name?.toLowerCase().replace(/\s+/g, "-") || ""}`
    const base  = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#060c20;color:#e8ecff;`
    const label = `font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:0.1em;`

    if (status === "approved") {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Your ArcLens listing is live — ${row.name}`,
        html: `<div style="${base}">
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:22px;font-weight:700;color:#1a56ff;">Lens</span></div>
          <div style="${label}color:#00b87a;">Listing Approved</div>
          <h1 style="font-size:22px;font-weight:700;margin:10px 0 8px;color:#e8ecff;">${row.name} is now live on ArcLens</h1>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 20px;">
            Your project has been reviewed and approved. It is now publicly listed on the ArcLens Ecosystem Directory and visible to everyone building and exploring on Arc Testnet.
          </p>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 28px;">
            To manage your listing — edit your description, update your logo, links, and project details — you will need to claim your project dashboard first. Click the button below, enter this email address, and we will send you a magic link to access and control your listing directly. Once your wallet is connected from the dashboard, you will not need the magic link again and can sign in directly going forward.
          </p>
          <a href="${dashboardUrl}" style="display:inline-block;padding:13px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:16px;">Claim your dashboard →</a>
          <br>
          <a href="${ecosystemUrl}" style="display:inline-block;padding:13px 28px;background:transparent;color:#8aaeff;text-decoration:none;border-radius:8px;font-size:14px;border:1px solid rgba(26,86,255,0.3);margin-top:8px;">View on Ecosystem</a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0;">
          <p style="font-size:12px;color:#2e3a5c;margin:0 0 6px;">— ArcLens Team</p>
          <p style="font-size:12px;color:#2e3a5c;margin:0 0 6px;">arclenz.xyz · @arclens_app</p>
          <p style="font-size:11px;color:#1e2a40;margin:16px 0 0;">⚠ We will never DM you first or ask for funds. Always verify you are communicating through official ArcLens channels.</p>
        </div>`,
      })
    } else {
      const reasonHtml = reason
        ? `<div style="padding:14px 18px;background:rgba(224,51,72,0.08);border:1px solid rgba(224,51,72,0.2);border-radius:8px;font-size:13px;color:#e8ecff;margin-bottom:24px;line-height:1.7;">${reason}</div>`
        : `<div style="padding:14px 18px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;font-size:13px;color:#6b7da8;margin-bottom:24px;line-height:1.7;">No specific reason was provided. Reply to this email if you would like more context.</div>`

      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Your ArcLens listing submission — ${row.name}`,
        html: `<div style="${base}">
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:22px;font-weight:700;color:#1a56ff;">Lens</span></div>
          <div style="${label}color:#e03348;">Listing Not Approved</div>
          <h1 style="font-size:22px;font-weight:700;margin:10px 0 8px;color:#e8ecff;">Thank you for submitting ${row.name}</h1>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 16px;">
            After review, we are unable to approve your listing at this time. The reason is noted below.
          </p>
          ${reasonHtml}
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 28px;">
            If this is something you can address, you are welcome to resubmit once those changes have been made. Use the same project name and email when resubmitting so we can track the update. If you believe this decision was made in error, simply reply to this email and we will take another look.
          </p>
          <a href="${ecosystemUrl}" style="display:inline-block;padding:13px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View Ecosystem Directory</a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0;">
          <p style="font-size:12px;color:#2e3a5c;margin:0 0 6px;">We appreciate you building on Arc and hope to see your project listed in the future.</p>
          <p style="font-size:12px;color:#2e3a5c;margin:0 0 6px;">— ArcLens Team</p>
          <p style="font-size:12px;color:#2e3a5c;margin:0 0 6px;">arclenz.xyz · @arclens_app</p>
          <p style="font-size:11px;color:#1e2a40;margin:16px 0 0;">⚠ We will never DM you first or ask for funds. Always verify you are communicating through official ArcLens channels.</p>
        </div>`,
      })
    }
  } catch (err) {
    console.error("[Admin] Project email failed:", err)
  }
}

export async function GET(req: NextRequest) {
  const action   = req.nextUrl.searchParams.get("action")
  const password = req.nextUrl.searchParams.get("password") || ""
  if (!checkAuth(password)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (action === "auth") return NextResponse.json({ ok: true })
  if (action === "list") {
    try {
      const [pending, approved] = await Promise.all([
        pool.query("SELECT * FROM projects WHERE approved = false ORDER BY created_at DESC"),
        pool.query("SELECT * FROM projects WHERE approved = true ORDER BY created_at DESC"),
      ])
      let contracts: { rows: unknown[] } = { rows: [] }
      try {
        const c = await pool.query("SELECT * FROM contracts ORDER BY created_at DESC")
        contracts = c
      } catch { }
      let pendingUpdates: unknown[] = []
      try {
        const pu = await pool.query(
          `SELECT pu.*, p.name as project_name, p.slug as project_slug
           FROM pending_updates pu
           JOIN projects p ON p.id = pu.project_id
           WHERE pu.status = 'pending'
           ORDER BY pu.submitted_at DESC`
        )
        pendingUpdates = pu.rows
      } catch { }
      let events: unknown[] = []
      try {
        const ev = await pool.query("SELECT * FROM events ORDER BY created_at DESC")
        events = ev.rows
      } catch { }
      let pendingCampaigns: unknown[] = []
      try {
        const pc = await pool.query(
          `SELECT c.id, c.title, c.tagline, c.type, c.description, c.tasks, c.review_questions,
                  c.reward_type, c.reward_description, c.reward_usdc_amount,
                  c.contract_address, c.app_url, c.min_rank, c.is_fcfs,
                  c.creator_wallet, c.project_name, c.project_logo, c.campaign_logo,
                  c.total_slots, c.expires_at, c.status, c.created_at, c.deposit_tx_hash,
                  (SELECT COUNT(*) FROM campaign_completions WHERE campaign_id = c.id) AS completion_count
           FROM campaigns c WHERE c.status = 'pending_approval' ORDER BY c.created_at DESC`
        )
        pendingCampaigns = pc.rows
      } catch { }
      return NextResponse.json({
        submissions: pending.rows,
        projects: approved.rows,
        contracts: contracts.rows,
        pendingUpdates,
        events,
        pendingCampaigns,
      }, { headers: { "Cache-Control": "no-store" } })
    } catch (e) {
      console.error("[Admin] list error:", e)
      return NextResponse.json({ error: String(e), submissions: [], projects: [], contracts: [], pendingUpdates: [], events: [] })
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { id, action, password, table, data } = body
  if (!checkAuth(password)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!id || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  try {
    if (table === "campaigns") {
      if (action === "approve") {
        // Deposit already paid at creation — approve goes straight to active
        await pool.query("UPDATE campaigns SET status = 'active' WHERE id = $1", [id])
        await sendCampaignEmail(id, "approved")
      } else if (action === "reject") {
        // Refund USDC to founder if campaign was pre-funded
        const camp = await pool.query(
          "SELECT reward_type, deposit_tx_hash, creator_wallet, reward_usdc_amount, total_slots FROM campaigns WHERE id = $1",
          [id]
        )
        const c = camp.rows[0]
        if (c?.reward_type === "usdc" && c?.deposit_tx_hash && c?.creator_wallet) {
          try {
            const payoutKey = process.env.PAYOUT_WALLET_PRIVATE_KEY
            if (payoutKey) {
              const { createAdapterFromPrivateKey } = await import("@circle-fin/adapter-viem-v2")
              const { AppKit }                      = await import("@circle-fin/app-kit")
              const adapter = await createAdapterFromPrivateKey({ privateKey: payoutKey as `0x${string}` } as any)
              const kit     = new AppKit()
              const total   = ((Number(c.reward_usdc_amount) || 0) * (Number(c.total_slots) || 10)).toFixed(2)
              await kit.send({
                from:   { adapter, chain: "Arc_Testnet" },
                to:     c.creator_wallet,
                amount: total,
                token:  "USDC",
              })
            }
          } catch (refundErr) {
            console.error("[Admin] USDC refund failed:", refundErr)
            // Still reject — log refund failure for manual follow-up
          }
        }
        const reason = data?.reason?.trim() || null
        await pool.query(
          "UPDATE campaigns SET status = 'rejected', rejection_reason = $2 WHERE id = $1",
          [id, reason]
        )
        await sendCampaignEmail(id, "rejected", reason || undefined)
      }
      return NextResponse.json({ success: true })
    }
    if (action === "approve") {
      if (table === "contracts") {
        await pool.query("UPDATE contracts SET verified = true WHERE address = $1", [id])
        await pool.query(
          `INSERT INTO contract_names_cache (address, name, verified, flagged)
           SELECT address, name, verified, flagged FROM contracts WHERE address = $1
           ON CONFLICT (address) DO UPDATE SET verified = true, updated_at = NOW()`,
          [id]
        )
      } else if (table === "events") {
        await pool.query("UPDATE events SET approved = true WHERE id = $1", [id])
      } else {
        await pool.query("UPDATE projects SET approved = true, live = true WHERE id = $1", [id])
        await sendProjectEmail(Number(id), "approved")
      }
      return NextResponse.json({ success: true })
    }
    if (action === "reject" || action === "delete") {
      if (table === "contracts") {
        await pool.query("DELETE FROM contracts WHERE address = $1", [id])
        await pool.query("DELETE FROM contract_names_cache WHERE address = $1", [id])
      } else if (table === "events") {
        await pool.query("DELETE FROM events WHERE id = $1", [id])
      } else {
        const reason = data?.reason?.trim() || null
        await sendProjectEmail(Number(id), "rejected", reason || undefined)
        await pool.query("DELETE FROM projects WHERE id = $1", [id])
      }
      return NextResponse.json({ success: true })
    }
    if (action === "update" && data) {
      // Check previous approval state before updating
      const before = await pool.query(`SELECT approved, live FROM projects WHERE id = $1`, [id])
      const wasApproved = before.rows[0]?.approved === true
      const wasLive     = before.rows[0]?.live === true

      const contractsArr = Array.isArray(data.contracts)
        ? data.contracts.map((c: string) => c.trim()).filter(Boolean)
        : []
      await pool.query(
        `UPDATE projects SET
          name=$1, tagline=$2, description=$3, category=$4,
          logo_url=$5, website=$6, twitter=$7, github=$8,
          discord=$9, contract=$10, contracts=$11, email=$12, badge=$13, featured=$14, live=$15, approved=true,
          city=$16, country=$17,
          lat=CASE WHEN $18::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN $18::numeric ELSE lat END,
          lng=CASE WHEN $19::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN $19::numeric ELSE lng END
         WHERE id=$20`,
        [
          data.name || null, data.tagline || null, data.description || null,
          data.category || null, data.logo_url || null, data.website || null,
          data.twitter || null, data.github || null,
          data.discord?.trim() || null, data.contract?.trim() || null, contractsArr,
          data.email?.trim() || null,
          data.badge || null,
          data.featured ? true : false, data.live !== false,
          data.city?.trim() || null, data.country?.trim() || null,
          data.lat !== undefined && data.lat !== null && data.lat !== "" ? String(data.lat) : null,
          data.lng !== undefined && data.lng !== null && data.lng !== "" ? String(data.lng) : null,
          id
        ]
      )

      // Send approval email only if project is being made live for the first time
      const goingLive = data.live !== false
      if (goingLive && (!wasApproved || !wasLive)) {
        await sendProjectEmail(Number(id), "approved")
      }

      return NextResponse.json({ success: true })
    }
    if (action === "approve-update") {
      const upd = await pool.query(`SELECT * FROM pending_updates WHERE id = $1`, [id])
      if (upd.rows.length > 0) {
        const u = upd.rows[0] as any
        await pool.query(`UPDATE projects SET ${u.field} = $1 WHERE id = $2`, [u.new_value, u.project_id])
        await pool.query(`UPDATE pending_updates SET status = 'approved' WHERE id = $1`, [id])
      }
      return NextResponse.json({ success: true })
    }
    if (action === "reject-update") {
      await pool.query(`UPDATE pending_updates SET status = 'rejected' WHERE id = $1`, [id])
      return NextResponse.json({ success: true })
    }
    if (action === "feature-event") {
      await pool.query("UPDATE events SET featured = NOT featured WHERE id = $1", [id])
      return NextResponse.json({ success: true })
    }
    if (action === "badge-event") {
      await pool.query("UPDATE events SET badge = $1 WHERE id = $2", [data?.badge || "community", id])
      return NextResponse.json({ success: true })
    }
    if (action === "geocode" && data?.city) {
      const q = encodeURIComponent(`${data.city.trim()}${data.country ? ", " + data.country.trim() : ""}`)
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
          { headers: { "User-Agent": "ArcLens/1.0 (arclenz.xyz)" } }
        )
        const geoData = await geoRes.json()
        if (!geoData?.[0]) return NextResponse.json({ error: "Location not found — try a more specific city name" }, { status: 404 })
        const lat = parseFloat(geoData[0].lat)
        const lng = parseFloat(geoData[0].lon)
        await pool.query(
          "UPDATE projects SET lat = $1, lng = $2, city = $3, country = $4 WHERE id = $5",
          [lat, lng, data.city.trim(), data.country?.trim() || null, id]
        )
        return NextResponse.json({ success: true, lat, lng })
      } catch {
        return NextResponse.json({ error: "Geocoding failed" }, { status: 500 })
      }
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[Admin] post error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}