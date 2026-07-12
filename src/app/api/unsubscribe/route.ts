import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/dbPool"

const pool = getPool()

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_unsubscribes (
      email TEXT PRIMARY KEY,
      unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function addUnsub(email: string) {
  await ensureTable()
  await pool.query(
    `INSERT INTO email_unsubscribes (email) VALUES ($1) ON CONFLICT DO NOTHING`,
    [email.toLowerCase().trim()]
  )
}

// One-click unsubscribe (RFC 8058) — Gmail posts List-Unsubscribe=One-Click
export async function POST(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email")
    if (!email) return new NextResponse("Missing email", { status: 400 })
    await addUnsub(email)
    return new NextResponse("Unsubscribed", { status: 200 })
  } catch (err) {
    console.error("[Unsubscribe POST]", err)
    return new NextResponse("Error", { status: 500 })
  }
}

// Click-through unsubscribe from email footer link
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") || ""
  try {
    if (email) await addUnsub(email)
  } catch (err) {
    console.error("[Unsubscribe GET]", err)
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed — ArcLens</title>
  <style>body{margin:0;font-family:Arial,sans-serif;background:#060c20;color:#e8ecff;display:flex;align-items:center;justify-content:center;min-height:100vh;}
  .box{text-align:center;max-width:400px;padding:40px 24px;}
  .logo span:first-child{color:#e8ecff;font-size:24px;font-weight:700;}
  .logo span:last-child{color:#1a56ff;font-size:24px;font-weight:700;}
  h1{font-size:20px;margin:24px 0 8px;}p{color:#6b7da8;font-size:14px;line-height:1.7;}
  a{color:#1a56ff;text-decoration:none;}</style></head>
  <body><div class="box">
    <div class="logo"><span>Arc</span><span>Lens</span></div>
    <h1>You've been unsubscribed</h1>
    <p>${email ? `<strong style="color:#e8ecff">${email}</strong><br>` : ""}You will no longer receive marketing emails from ArcLens.</p>
    <p style="margin-top:24px;font-size:12px;color:#2e3a5c;">Transactional emails (magic links you request, security notices) will still be delivered. <a href="https://arclenz.xyz">Return to ArcLens →</a></p>
  </div></body></html>`
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } })
}
