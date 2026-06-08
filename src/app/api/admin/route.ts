import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { Resend } from "resend"
import { timingSafeEqual } from "crypto"
import { enforce } from "@/lib/ratelimit"
import { attestOnChain, subjectFor } from "@/lib/registry"
import { loadPhishingList, hostOf, checkWebsite, analyzeContract, assessProject } from "@/lib/trustEngine"

const pool   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// Lazy Resend init. The SDK constructor throws "Missing API key" on empty
// string in newer versions, which would crash the entire route at module load
// (and break admin LOGIN, not just email-sending paths) in any environment
// without RESEND_API_KEY (e.g. local dev). Instead, build the client per-call
// and let calls no-op gracefully if the key isn't configured.
let _resend: Resend | null = null
function resendClient(): Resend | null {
  if (_resend) return _resend
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  try { _resend = new Resend(key); return _resend } catch { return null }
}
// Drop-in replacement for `resend.emails.send(...)` that no-ops when Resend
// isn't configured, so admin actions don't fail just because email sending
// isn't available (e.g. local dev). Logs so the operator knows email was skipped.
const resend = {
  emails: {
    async send(opts: Parameters<Resend["emails"]["send"]>[0]) {
      const r = resendClient()
      if (!r) { console.warn("[admin] RESEND_API_KEY not set — email skipped"); return { data: null, error: null } }
      return r.emails.send(opts)
    },
  },
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""

function checkAuth(pw: string): boolean {
  if (!ADMIN_PASSWORD || !pw) return false
  const a = Buffer.from(pw)
  const b = Buffer.from(ADMIN_PASSWORD)
  if (a.length !== b.length) return false
  // Constant-time compare so password length/prefix can't be timing-leaked
  return timingSafeEqual(a, b)
}

// Password MUST come from the Authorization header — never query string or body.
// Query strings land in access logs and Referer headers, leaking the secret.
function resolvePassword(req: NextRequest): string {
  const auth = req.headers.get("authorization") || ""
  return auth.startsWith("Bearer ") ? auth.slice(7) : ""
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://arclenz.xyz"

function unsubFooter(email: string) {
  const link = `${BASE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`
  return `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0;">
    <p style="font-size:11px;color:#1e2a40;text-align:center;line-height:1.8;">
      You're receiving this because you submitted a project or campaign on ArcLens.<br>
      <a href="${link}" style="color:#2e3a5c;text-decoration:underline;">Unsubscribe</a>
    </p>`
}

function unsubHeaders(email: string) {
  const url = `${BASE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`
  return {
    "List-Unsubscribe": `<${url}>, <mailto:support@mail.arclenz.xyz?subject=unsubscribe&body=${encodeURIComponent(email)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

async function isUnsubscribed(email: string): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT 1 FROM email_unsubscribes WHERE email = $1`,
      [email.toLowerCase().trim()]
    )
    return r.rows.length > 0
  } catch {
    return false
  }
}

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
    if (await isUnsubscribed(row.email)) return

    const campaignUrl   = `${BASE_URL}/trials/${row.campaign_slug || campaignId}`
    const dashboardUrl  = `${BASE_URL}/dashboard/${row.project_slug || row.project_name?.toLowerCase().replace(/\s+/g, "-") || ""}`
    const forgeUrl      = `${BASE_URL}/trials`
    const base = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#060c20;color:#e8ecff;`
    const label = `font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:0.1em;`

    if (status === "approved") {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Your campaign is live — ${row.title}`,
        headers:  unsubHeaders(row.email),
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
          ${unsubFooter(row.email)}
        </div>`,
      })
    } else {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Campaign not approved — ${row.title}`,
        headers:  unsubHeaders(row.email),
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
          ${unsubFooter(row.email)}
        </div>`,
      })
    }
  } catch (err) {
    console.error("[Admin] Campaign email failed:", err)
  }
}

async function sendProjectUpdateEmail(
  projectId: number,
  status: "approved" | "rejected",
  reason?: string,
  changes?: Array<{ field: string; new_value: string }>
) {
  try {
    const res = await pool.query(`SELECT name, email, slug FROM projects WHERE id = $1`, [projectId])
    const row = res.rows[0]
    if (!row?.email) return
    if (await isUnsubscribed(row.email)) return

    const slug         = row.slug || row.name?.toLowerCase().replace(/\s+/g, "-") || ""
    const listingUrl   = `${BASE_URL}/ecosystem/${slug}`
    const dashboardUrl = `${BASE_URL}/dashboard/${slug}`
    const base  = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#060c20;color:#e8ecff;`
    const label = `font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:0.1em;`

    const FIELD_LABELS: Record<string, string> = {
      name: "Project name", tagline: "Tagline", description: "Description",
      logo_url: "Logo", website: "Website", twitter: "X / Twitter",
      github: "GitHub", discord: "Discord", contract: "Contract address",
    }

    if (status === "approved") {
      const changesHtml = changes?.length
        ? `<div style="padding:14px 16px;background:rgba(0,184,122,0.05);border:1px solid rgba(0,184,122,0.15);border-radius:8px;margin-bottom:24px;">
            <div style="font-size:9px;font-family:monospace;color:#00b87a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Changes applied</div>
            ${changes.map(c => `<div style="font-size:12px;color:#e8ecff;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
              <span style="color:#6b7da8;">${FIELD_LABELS[c.field] || c.field}</span>
              <span style="color:#2e3a5c;margin:0 6px;">→</span>
              <span>${String(c.new_value).substring(0, 80)}${String(c.new_value).length > 80 ? "…" : ""}</span>
            </div>`).join("")}
          </div>`
        : ""

      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Listing updates live — ${row.name}`,
        headers:  unsubHeaders(row.email),
        html: `<div style="${base}">
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:22px;font-weight:700;color:#1a56ff;">Lens</span></div>
          <div style="${label}color:#00b87a;">Listing Updates Applied</div>
          <h1 style="font-size:22px;font-weight:700;margin:10px 0 8px;color:#e8ecff;">${row.name}</h1>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 20px;">
            Your requested changes have been reviewed and are now live on the Arc Ecosystem directory.
          </p>
          ${changesHtml}
          <a href="${listingUrl}" style="display:inline-block;padding:13px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:12px;">View Live Listing →</a>
          ${unsubFooter(row.email)}
        </div>`,
      })
    } else {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Listing update not approved — ${row.name}`,
        headers:  unsubHeaders(row.email),
        html: `<div style="${base}">
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:22px;font-weight:700;color:#1a56ff;">Lens</span></div>
          <div style="${label}color:#e03348;">Listing Update Not Approved</div>
          <h1 style="font-size:22px;font-weight:700;margin:10px 0 8px;color:#e8ecff;">${row.name}</h1>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 16px;">
            Your requested listing changes were not approved at this time.
          </p>
          ${reason ? `<div style="padding:14px 18px;background:rgba(224,51,72,0.08);border:1px solid rgba(224,51,72,0.2);border-radius:8px;font-size:13px;color:#e8ecff;margin-bottom:24px;line-height:1.7;">${reason}</div>` : ""}
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 28px;">
            You can submit a revised request from your project dashboard. Reply to this email if you have questions.
          </p>
          <a href="${dashboardUrl}" style="display:inline-block;padding:13px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open Dashboard →</a>
          ${unsubFooter(row.email)}
        </div>`,
      })
    }
  } catch (err) {
    console.error("[Admin] Project update email failed:", err)
  }
}

async function sendCampaignUpdateEmail(campaignId: number, campaignTitle: string, status: "approved" | "rejected", reason?: string) {
  try {
    const res = await pool.query(
      `SELECT c.slug AS campaign_slug, p.email, p.name AS project_name
       FROM campaigns c
       LEFT JOIN projects p ON p.owner_wallet = c.creator_wallet AND p.approved = true
       WHERE c.id = $1 ORDER BY p.created_at DESC LIMIT 1`,
      [campaignId]
    )
    const row = res.rows[0]
    if (!row?.email) return
    if (await isUnsubscribed(row.email)) return

    const campaignUrl = `${BASE_URL}/trials/${row.campaign_slug || campaignId}`
    const base  = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#060c20;color:#e8ecff;`
    const label = `font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:0.1em;`

    if (status === "approved") {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Campaign update approved — ${campaignTitle}`,
        headers:  unsubHeaders(row.email),
        html: `<div style="${base}">
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:22px;font-weight:700;color:#1a56ff;">Lens</span></div>
          <div style="${label}color:#00b87a;">Campaign Update Approved</div>
          <h1 style="font-size:22px;font-weight:700;margin:10px 0 8px;color:#e8ecff;">${campaignTitle}</h1>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 28px;">
            Your requested changes have been reviewed and applied to your campaign. They are now live.
          </p>
          <a href="${campaignUrl}" style="display:inline-block;padding:13px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View Campaign →</a>
          ${unsubFooter(row.email)}
        </div>`,
      })
    } else {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Campaign update not approved — ${campaignTitle}`,
        headers:  unsubHeaders(row.email),
        html: `<div style="${base}">
          <div style="margin-bottom:28px;"><span style="font-size:22px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:22px;font-weight:700;color:#1a56ff;">Lens</span></div>
          <div style="${label}color:#e03348;">Campaign Update Not Approved</div>
          <h1 style="font-size:22px;font-weight:700;margin:10px 0 8px;color:#e8ecff;">${campaignTitle}</h1>
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 16px;">
            Your requested campaign changes were not approved at this time.
          </p>
          ${reason ? `<div style="padding:14px 18px;background:rgba(224,51,72,0.08);border:1px solid rgba(224,51,72,0.2);border-radius:8px;font-size:13px;color:#e8ecff;margin-bottom:24px;line-height:1.7;">${reason}</div>` : ""}
          <p style="font-size:14px;color:#6b7da8;line-height:1.8;margin:0 0 28px;">
            You can submit a revised request from your campaign page. If you have questions, reply to this email.
          </p>
          <a href="${campaignUrl}" style="display:inline-block;padding:13px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View Campaign →</a>
          ${unsubFooter(row.email)}
        </div>`,
      })
    }
  } catch (err) {
    console.error("[Admin] Campaign update email failed:", err)
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
    if (await isUnsubscribed(row.email)) return

    const ecosystemUrl = `${BASE_URL}/ecosystem`
    const dashboardUrl = `${BASE_URL}/dashboard/${row.slug || row.name?.toLowerCase().replace(/\s+/g, "-") || ""}`
    const base  = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#060c20;color:#e8ecff;`
    const label = `font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:0.1em;`

    if (status === "approved") {
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       row.email,
        subject:  `Your ArcLens listing is live — ${row.name}`,
        headers:  unsubHeaders(row.email),
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
          ${unsubFooter(row.email)}
          <p style="font-size:11px;color:#1e2a40;margin:8px 0 0;text-align:center;">⚠ We will never DM you first or ask for funds. Always verify you are communicating through official ArcLens channels.</p>
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
        headers:  unsubHeaders(row.email),
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
          ${unsubFooter(row.email)}
        </div>`,
      })
    }
  } catch (err) {
    console.error("[Admin] Project email failed:", err)
  }
}

export async function GET(req: NextRequest) {
  // Tight limit: admin should never hit this endpoint 30 times in a minute
  // organically. Aggressive throttle frustrates password brute-force.
  const blocked = await enforce(req, "admin-auth", { limit: 30, windowMs: 60_000 })
  if (blocked) return blocked

  const action   = req.nextUrl.searchParams.get("action")
  const password = resolvePassword(req)
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
      let pendingCampaignUpdates: unknown[] = []
      try {
        const pcu = await pool.query(
          `SELECT * FROM pending_campaign_updates WHERE status = 'pending' ORDER BY submitted_at DESC`
        )
        pendingCampaignUpdates = pcu.rows
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
      let allCampaigns: unknown[] = []
      try {
        const ac = await pool.query(
          `SELECT id, title, status, creator_wallet, project_name, filled_slots, total_slots, created_at
           FROM campaigns ORDER BY created_at DESC LIMIT 200`
        )
        allCampaigns = ac.rows
      } catch { }

      return NextResponse.json({
        submissions: pending.rows,
        projects: approved.rows,
        contracts: contracts.rows,
        pendingUpdates,
        events,
        pendingCampaigns,
        pendingCampaignUpdates,
        allCampaigns,
      }, { headers: { "Cache-Control": "no-store" } })
    } catch (e) {
      console.error("[Admin] list error:", e)
      return NextResponse.json({ error: String(e), submissions: [], projects: [], contracts: [], pendingUpdates: [], events: [] })
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "admin-auth", { limit: 30, windowMs: 60_000 })
  if (blocked) return blocked

  const body = await req.json()
  const { id, action, table, data } = body
  if (!checkAuth(resolvePassword(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
            const { AppKit } = await import("@circle-fin/app-kit")
            const kit   = new AppKit()
            const total = ((Number(c.reward_usdc_amount) || 0) * (Number(c.total_slots) || 10)).toFixed(2)

            const circleApiKey     = process.env.CIRCLE_API_KEY
            const circleSecret     = process.env.CIRCLE_ENTITY_SECRET
            const payoutWalletAddr = process.env.PAYOUT_WALLET_ADDRESS
            const payoutPrivKey    = process.env.PAYOUT_WALLET_PRIVATE_KEY

            if (circleApiKey && circleSecret && payoutWalletAddr) {
              const { createCircleWalletsAdapter } = await import("@circle-fin/adapter-circle-wallets")
              const adapter = createCircleWalletsAdapter({ apiKey: circleApiKey, entitySecret: circleSecret })
              await kit.send({
                from:   { adapter: adapter as any, chain: "Arc_Testnet", address: payoutWalletAddr as `0x${string}` },
                to:     c.creator_wallet,
                amount: total,
                token:  "USDC",
              })
            } else if (payoutPrivKey) {
              const { createAdapterFromPrivateKey } = await import("@circle-fin/adapter-viem-v2")
              const adapter = await createAdapterFromPrivateKey({ privateKey: payoutPrivKey as `0x${string}` } as any)
              await kit.send({
                from:   { adapter: adapter as any, chain: "Arc_Testnet" },
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
        // Publish the project on-chain the moment it goes live, at its current
        // tier (listed unless already higher) — every accepted project lands in
        // the registry, not just ones that later earn a tier change. Env-gated.
        try {
          const after = (await pool.query(
            `SELECT trust_level, recognition, slug, established,
                    (SELECT address FROM project_contracts WHERE project_id = projects.id AND verified_at IS NOT NULL AND revoked_at IS NULL LIMIT 1) AS proven
               FROM projects WHERE id = $1`, [id]
          )).rows[0]
          const subject = subjectFor({ provenContract: after?.proven, slug: after?.slug })
          if (subject) attestOnChain(subject, after.trust_level, after.recognition, "arclenz.xyz/ecosystem/" + (after.slug || ""), !!after.established).catch(() => {})
        } catch {}
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
      // Check previous approval + trust state before updating
      const before = await pool.query(`SELECT approved, live, trust_level, recognition, established FROM projects WHERE id = $1`, [id])
      const wasApproved = before.rows[0]?.approved === true
      const wasLive     = before.rows[0]?.live === true
      const tierKey = (rec: any, lvl: any) => rec === "official" ? "arc_official" : rec === "partner" ? "arc_partner" : (lvl || "listed")
      const beforeKey = tierKey(before.rows[0]?.recognition, before.rows[0]?.trust_level)

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

      // Recognition is the manual lever. Trust level itself is automatic — Claimed
      // on claim, Verified via the audit grant below — so the editor never writes it.
      if (data.recognition !== undefined) {
        await pool.query(`UPDATE projects SET recognition = $1, trust_updated_at = NOW() WHERE id = $2`, [data.recognition === "none" ? null : data.recognition, id])
      }

      // Verified (audit) — admin grants when a real third-party audit is on
      // record. Verified sets trust_level='verified'; un-verifying drops back to
      // claimed (if a founder owns it) or listed. auditor/url stored for display.
      if (data.audited !== undefined || data.auditor !== undefined || data.audit_url !== undefined) {
        const verified = !!data.audited
        const ow = (await pool.query(`SELECT owner_wallet FROM projects WHERE id = $1`, [id])).rows[0]?.owner_wallet
        const fallback = ow ? "claimed" : "listed"
        await pool.query(
          `UPDATE projects SET
             auditor = $1, audit_url = $2, audit_status = $3,
             trust_level = CASE WHEN $4 THEN 'verified' WHEN trust_level = 'verified' THEN $5 ELSE trust_level END,
             trust_updated_at = NOW()
           WHERE id = $6`,
          [data.auditor?.trim() || null, data.audit_url?.trim() || null, verified ? "approved" : "none", verified, fallback, id]
        )
      }

      // Mirror on-chain ONCE — only when the resulting badge tier actually changed,
      // so an unrelated edit never burns gas. Env-gated no-op until the registry is set.
      const after = (await pool.query(
        `SELECT trust_level, recognition, slug, established,
                (SELECT address FROM project_contracts WHERE project_id = projects.id AND verified_at IS NOT NULL AND revoked_at IS NULL LIMIT 1) AS proven
           FROM projects WHERE id = $1`, [id]
      )).rows[0]
      const subject = subjectFor({ provenContract: after?.proven, slug: after?.slug })
      const firstPublish = !wasApproved // newly approved/live via this update → publish even if tier is unchanged
      const estChanged = !!after?.established !== !!before.rows[0]?.established
      if (subject && (firstPublish || estChanged || tierKey(after?.recognition, after?.trust_level) !== beforeKey)) {
        attestOnChain(subject, after.trust_level, after.recognition, "arclenz.xyz/ecosystem/" + (after.slug || ""), !!after.established).catch(() => {})
      }

      return NextResponse.json({ success: true })
    }
    if (action === "approve-all-updates") {
      const updates = await pool.query(
        `SELECT * FROM pending_updates WHERE project_id = $1 AND status = 'pending'`, [id]
      )
      const appliedChanges: Array<{ field: string; new_value: string }> = []
      for (const u of updates.rows as any[]) {
        await pool.query(`UPDATE projects SET ${u.field} = $1 WHERE id = $2`, [u.new_value, u.project_id])
        await pool.query(`UPDATE pending_updates SET status = 'approved' WHERE id = $1`, [u.id])
        appliedChanges.push({ field: u.field, new_value: String(u.new_value) })
      }
      await sendProjectUpdateEmail(Number(id), "approved", undefined, appliedChanges)
      return NextResponse.json({ success: true })
    }
    if (action === "reject-all-updates") {
      const reason = data?.reason?.trim() || null
      await pool.query(`UPDATE pending_updates SET status = 'rejected' WHERE project_id = $1 AND status = 'pending'`, [id])
      await sendProjectUpdateEmail(Number(id), "rejected", reason || undefined)
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
    if (action === "delete-campaign") {
      await pool.query("DELETE FROM campaign_completions WHERE campaign_id = $1", [id])
      await pool.query("DELETE FROM pending_campaign_updates WHERE campaign_id = $1", [id]).catch(() => {})
      await pool.query("DELETE FROM campaigns WHERE id = $1", [id])
      return NextResponse.json({ success: true })
    }
    // ── Campaign repair actions ──────────────────────────────────────────────
    if (action === "reactivate-campaign") {
      await pool.query("UPDATE campaigns SET status = 'active' WHERE id = $1", [id])
      return NextResponse.json({ success: true })
    }
    if (action === "sync-slots") {
      // Recalculate filled_slots from actual completions — fixes count drift
      await pool.query(
        `UPDATE campaigns SET filled_slots = (
           SELECT COUNT(*) FROM campaign_completions WHERE campaign_id = $1
         ) WHERE id = $1`,
        [id]
      )
      return NextResponse.json({ success: true })
    }
    if (action === "remove-completion") {
      const testerWallet = data?.tester_wallet?.trim()?.toLowerCase()
      if (!testerWallet) return NextResponse.json({ error: "tester_wallet required" }, { status: 400 })
      const del = await pool.query(
        "DELETE FROM campaign_completions WHERE campaign_id = $1 AND tester_wallet = $2 RETURNING id",
        [id, testerWallet]
      )
      if (del.rowCount) {
        await pool.query("UPDATE campaigns SET filled_slots = GREATEST(0, filled_slots - 1) WHERE id = $1", [id])
      }
      return NextResponse.json({ success: true, removed: del.rowCount })
    }
    if (action === "reset-campaign") {
      // Clear all completions and reset slot count — keeps campaign active
      await pool.query("DELETE FROM campaign_completions WHERE campaign_id = $1", [id])
      await pool.query("UPDATE campaigns SET filled_slots = 0, status = 'active' WHERE id = $1", [id])
      return NextResponse.json({ success: true })
    }
    if (action === "approve-campaign-update") {
      const upd = await pool.query(`SELECT * FROM pending_campaign_updates WHERE id = $1`, [id])
      if (upd.rows.length > 0) {
        const u = upd.rows[0] as any
        const ch = u.proposed_changes as Record<string, any>
        const keys = Object.keys(ch)
        const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ")
        await pool.query(`UPDATE campaigns SET ${setClauses} WHERE id = $1`, [u.campaign_id, ...keys.map(k => ch[k])])
        await pool.query(`UPDATE pending_campaign_updates SET status = 'approved' WHERE id = $1`, [id])
        await sendCampaignUpdateEmail(u.campaign_id, u.campaign_title, "approved")
      }
      return NextResponse.json({ success: true })
    }
    if (action === "reject-campaign-update") {
      const reason = data?.reason?.trim() || null
      const upd = await pool.query(`SELECT * FROM pending_campaign_updates WHERE id = $1`, [id])
      await pool.query(`UPDATE pending_campaign_updates SET status = 'rejected', admin_note = $2 WHERE id = $1`, [id, reason])
      if (upd.rows.length > 0) {
        const u = upd.rows[0] as any
        await sendCampaignUpdateEmail(u.campaign_id, u.campaign_title, "rejected", reason || undefined)
      }
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
    // Manual identity verification (the trust-layer "Identified" toggle).
    // `id` = builder wallet address. An admin confirms the team's X + domain
    // (the review they already do), and we recompute identity_level. Identified
    // requires BOTH proven; otherwise it falls back to claimed/none.
    if (action === "set-identity") {
      const addr = String(id).toLowerCase()
      const xv = !!data?.x_verified
      const dv = !!data?.domain_verified
      const upd = await pool.query(
        `UPDATE builder_profiles
            SET x_verified           = $2,
                domain_verified      = $3,
                identity_level       = CASE WHEN $2 AND $3 THEN 'identified'
                                            WHEN claimed_at IS NOT NULL THEN 'claimed'
                                            ELSE 'none' END,
                identity_verified_at = CASE WHEN $2 AND $3 THEN NOW() ELSE identity_verified_at END,
                updated_at           = NOW()
          WHERE address = $1
        RETURNING identity_level`,
        [addr, xv, dv]
      )
      if (!upd.rows.length) return NextResponse.json({ error: "No builder profile for that address" }, { status: 404 })
      return NextResponse.json({ success: true, identity_level: upd.rows[0].identity_level })
    }
    // Grant/remove recognition (Arc Partner / Arc Official). `id` = project id or
    // slug. Recognition rides on top of the earned trust ladder — separate from it.
    if (action === "set-recognition") {
      const rec = data?.recognition
      const val = (!rec || rec === "none") ? null : String(rec)
      if (val && val !== "partner" && val !== "official") return NextResponse.json({ error: "recognition must be partner, official, or none" }, { status: 400 })
      const r = await pool.query("UPDATE projects SET recognition = $1 WHERE id::text = $2 OR slug = $2 RETURNING id", [val, String(id)])
      if (!r.rows.length) return NextResponse.json({ error: "Project not found" }, { status: 404 })
      return NextResponse.json({ success: true, recognition: val })
    }
    // Advisory: run the safety checks live for one project and return the facts
    // so an admin can decide the trust level with them in front of them. Read-only.
    if (action === "assess-project") {
      const proj = (await pool.query(`SELECT id, website, contract, contracts FROM projects WHERE id::text = $1 OR slug = $1`, [String(id)])).rows[0]
      if (!proj) return NextResponse.json({ error: "Project not found" }, { status: 404 })
      const regs = (await pool.query(
        `SELECT address, role, (verified_at IS NOT NULL) AS verified FROM project_contracts WHERE project_id = $1 AND revoked_at IS NULL`,
        [proj.id]
      )).rows
      // All listed contracts — registered (proven) + primary + extras, deduped.
      const seen = new Set(regs.map((c: any) => String(c.address).toLowerCase()))
      const all = regs.map((c: any) => ({ address: c.address, role: c.role, verified: c.verified }))
      const addOne = (addr: any, role: string) => {
        const a = String(addr || "").trim()
        if (/^0x[a-fA-F0-9]{40}$/.test(a) && !seen.has(a.toLowerCase())) { seen.add(a.toLowerCase()); all.push({ address: a, role, verified: false }) }
      }
      addOne(proj.contract, "primary")
      for (const e of (Array.isArray(proj.contracts) ? proj.contracts : [])) addOne(e, "extra")
      const list = await loadPhishingList()
      const analyzed = []
      for (const c of all) analyzed.push(await analyzeContract({ address: c.address, role: c.role, verified: c.verified }))
      const websiteVerdict = checkWebsite(hostOf(proj.website), list)
      const { hardRisk, profile } = assessProject({ websiteVerdict, contracts: analyzed })
      return NextResponse.json({ success: true, hardRisk, profile })
    }
    // Established eligibility — the OBJECTIVE on-chain gate an admin checks before
    // granting Established: claimed + contract deployed >=60d + >=50 distinct
    // caller wallets (real users, not the project's own) + not risk-flagged. The
    // grant itself is manual (set-established), so wash-trading can't auto-earn it.
    if (action === "check-established") {
      const ARCSCAN = "https://testnet.arcscan.app/api/v2"
      const proj = (await pool.query(
        `SELECT id, contract, owner_wallet, trust_profile,
                (SELECT address FROM project_contracts WHERE project_id = projects.id AND revoked_at IS NULL LIMIT 1) AS reg
           FROM projects WHERE id::text = $1 OR slug = $1`, [String(id)]
      )).rows[0]
      if (!proj) return NextResponse.json({ error: "Project not found" }, { status: 404 })
      const addr = String(proj.contract || proj.reg || "").toLowerCase()
      const owner = String(proj.owner_wallet || "").toLowerCase()
      const claimed = !!proj.owner_wallet
      const risk = proj.trust_profile?.hard_risk === true
      const reasons: string[] = []
      if (!claimed) reasons.push("not claimed")
      if (risk) reasons.push("risk-flagged")
      if (!/^0x[0-9a-f]{40}$/.test(addr)) {
        return NextResponse.json({ success: true, eligible: false, claimed, risk, ageDays: null, distinctCallers: 0, reasons: [...reasons, "no contract on record"] })
      }
      let ageDays: number | null = null
      try {
        const a: any = await (await fetch(`${ARCSCAN}/addresses/${addr}`, { headers: { Accept: "application/json" } })).json()
        const ctx = a?.creation_transaction_hash || a?.creation_tx_hash
        if (ctx) {
          const t: any = await (await fetch(`${ARCSCAN}/transactions/${ctx}`, { headers: { Accept: "application/json" } })).json()
          if (t?.timestamp) ageDays = Math.floor((Date.now() - new Date(t.timestamp).getTime()) / 86_400_000)
        }
      } catch {}
      const callers = new Set<string>()
      try {
        let url = `${ARCSCAN}/addresses/${addr}/transactions?filter=to`
        for (let page = 0; page < 6 && callers.size < 60; page++) {
          const r: any = await (await fetch(url, { headers: { Accept: "application/json" } })).json()
          for (const it of (r?.items || [])) {
            const f = String(it?.from?.hash || "").toLowerCase()
            if (f && f !== addr && f !== owner) callers.add(f)
          }
          if (!r?.next_page_params) break
          url = `${ARCSCAN}/addresses/${addr}/transactions?filter=to&` + new URLSearchParams(r.next_page_params).toString()
        }
      } catch {}
      const distinctCallers = callers.size
      if (ageDays === null || ageDays < 60) reasons.push(ageDays === null ? "deploy age unknown" : `deployed ${ageDays}d ago (need 60)`)
      if (distinctCallers < 50) reasons.push(`${distinctCallers} distinct callers (need 50)`)
      const eligible = claimed && !risk && ageDays !== null && ageDays >= 60 && distinctCallers >= 50
      return NextResponse.json({ success: true, eligible, claimed, risk, ageDays, distinctCallers, contract: addr, reasons })
    }
    // Grant / revoke Established (admin, only meaningful for an eligible project).
    if (action === "set-established") {
      await pool.query(`UPDATE projects SET established = $1, trust_updated_at = NOW() WHERE id::text = $2 OR slug = $2`, [!!data?.established, String(id)])
      // Mirror on-chain so the Established marker matches the site immediately.
      try {
        const p = (await pool.query(
          `SELECT trust_level, recognition, slug, established,
                  (SELECT address FROM project_contracts WHERE project_id = projects.id AND verified_at IS NOT NULL AND revoked_at IS NULL LIMIT 1) AS proven
             FROM projects WHERE id::text = $1 OR slug = $1 LIMIT 1`, [String(id)]
        )).rows[0]
        const subject = subjectFor({ provenContract: p?.proven, slug: p?.slug })
        if (subject) attestOnChain(subject, p.trust_level, p.recognition, "arclenz.xyz/ecosystem/" + (p.slug || ""), !!p.established).catch(() => {})
      } catch {}
      return NextResponse.json({ success: true, established: !!data?.established })
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