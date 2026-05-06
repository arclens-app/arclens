export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { randomBytes } from "crypto"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

export async function POST(req: NextRequest) {
  try {
    const { email, slug } = await req.json()
    if (!email?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: "Email and project required" }, { status: 400 })
    }
    const result = await pool.query(
      `SELECT id, name, slug, email FROM projects WHERE (slug = $1 OR id::text = $1) AND approved = true AND live = true`,
      [slug.trim()]
    )
    if (result.rows.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const project = result.rows[0]
    if (project.email?.toLowerCase() !== email.trim().toLowerCase()) {
      return NextResponse.json({ error: "Email does not match the submission email for this project" }, { status: 403 })
    }
    const token   = randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await pool.query(
      `UPDATE projects SET claim_token = $1, claim_token_expires = $2, owner_email = $3 WHERE id = $4`,
      [token, expires, email.trim().toLowerCase(), project.id]
    )
    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://arclenz.xyz"
    const dashboardUrl = `${base}/dashboard/${project.slug || project.id}?token=${token}`
    try {
      const { Resend } = await import("resend")
      const resend = new Resend(process.env.RESEND_API_KEY || "")
      await resend.emails.send({
        from:     "ArcLens <support@mail.arclenz.xyz>",
        reply_to: process.env.TEAM_EMAIL || "arclensdev@gmail.com",
        to:       email.trim(),
        subject: `Your ArcLens dashboard for ${project.name}`,
        html: `<div style="font-family:monospace;max-width:520px;margin:0 auto;padding:40px 20px;background:#060c20;color:#e8ecff;"><div style="margin-bottom:32px;"><span style="font-size:20px;font-weight:700;color:#e8ecff;">Arc</span><span style="font-size:20px;font-weight:700;color:#1a56ff;">Lens</span></div><h1 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#e8ecff;">Your founder dashboard</h1><p style="font-size:14px;color:#6b7da8;line-height:1.7;margin:0 0 28px;">Click below to access your dashboard for <strong style="color:#e8ecff;">${project.name}</strong>. Expires in 30 minutes.</p><a href="${dashboardUrl}" style="display:inline-block;padding:14px 28px;background:#1a56ff;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:28px;">Open my dashboard</a><p style="font-size:12px;color:#2e3a5c;">If you did not request this, ignore this email.</p></div>`,
      })
    } catch (emailErr) { console.error("[Email]", emailErr) }
    return NextResponse.json({ success: true, message: "Check your email for the dashboard link", debug_url: process.env.NODE_ENV === "development" ? dashboardUrl : undefined })
  } catch (err) { console.error("[Claim POST]", err); return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function GET(req: NextRequest) {
  try {
    const slug   = req.nextUrl.searchParams.get("slug")
    const token  = req.nextUrl.searchParams.get("token")
    const wallet = req.nextUrl.searchParams.get("wallet")
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 })
    let projectRow: any = null
    if (wallet) {
      const result = await pool.query(
        `SELECT id, name, slug, tagline, description, category, logo_url, website, twitter, github, discord, contract, featured, badge, color, email, claimed_at, view_count, owner_wallet, city, country FROM projects WHERE (slug = $1 OR id::text = $1) AND owner_wallet = $2 AND approved = true AND live = true`,
        [slug, wallet.toLowerCase()]
      )
      if (result.rows.length === 0) return NextResponse.json({ error: "Wallet not authorized for this project" }, { status: 403 })
      projectRow = result.rows[0]
    } else if (token) {
      const result = await pool.query(
        `SELECT id, name, slug, tagline, description, category, logo_url, website, twitter, github, discord, contract, featured, badge, color, email, claimed_at, view_count, owner_wallet, city, country, claim_token_expires FROM projects WHERE (slug = $1 OR id::text = $1) AND claim_token = $2`,
        [slug, token]
      )
      if (result.rows.length === 0) return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
      if (new Date(result.rows[0].claim_token_expires) < new Date()) return NextResponse.json({ error: "Token expired" }, { status: 403 })
      projectRow = result.rows[0]
      if (!projectRow.claimed_at) await pool.query(`UPDATE projects SET claimed_at = NOW() WHERE id = $1`, [projectRow.id])
    } else {
      return NextResponse.json({ error: "Missing token or wallet" }, { status: 400 })
    }
    const reviews   = await pool.query(`SELECT id, wallet, category, rating, review_text, is_public, contact, badge, created_at FROM reviews WHERE project_id = $1 ORDER BY created_at DESC`, [projectRow.id])
    const weekNum   = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
    const weekViews = await pool.query(`SELECT COUNT(*) as cnt FROM project_views WHERE project_id = $1 AND week_num = $2`, [projectRow.id, weekNum])
    return NextResponse.json({ project: { ...projectRow, claim_token: undefined, claim_token_expires: undefined }, reviews: reviews.rows, weekViews: parseInt(weekViews.rows[0]?.cnt || "0"), hasWallet: !!projectRow.owner_wallet })
  } catch (err) { console.error("[Claim GET]", err); return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  try {
    const { token, slug, wallet } = await req.json()
    if (!token || !slug || !wallet) return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    const result = await pool.query(`SELECT id, claim_token_expires FROM projects WHERE (slug = $1 OR id::text = $1) AND claim_token = $2`, [slug, token])
    if (result.rows.length === 0) return NextResponse.json({ error: "Invalid token" }, { status: 403 })
    if (new Date(result.rows[0].claim_token_expires) < new Date()) return NextResponse.json({ error: "Token expired" }, { status: 403 })
    await pool.query(`UPDATE projects SET owner_wallet = $1 WHERE id = $2`, [wallet.toLowerCase(), result.rows[0].id])
    return NextResponse.json({ success: true })
  } catch (err) { console.error("[Claim PUT]", err); return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function PATCH(req: NextRequest) {
  try {
    const { wallet } = await req.json()
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 })
    const result = await pool.query(
      `SELECT id, name, slug, tagline, category, logo_url, website, twitter, github, discord, contract, featured, badge, color, email, claimed_at, view_count, owner_wallet FROM projects WHERE owner_wallet = $1 AND approved = true AND live = true`,
      [wallet.toLowerCase()]
    )
    return NextResponse.json({ projects: result.rows })
  } catch (err) { console.error("[Claim PATCH]", err); return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}
