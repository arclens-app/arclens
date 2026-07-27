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

// The address is echoed back on the confirmation page, so it must never reach
// the HTML unescaped — otherwise anyone can craft a URL on our own domain that
// renders content they control, which is how legitimate domains end up hosting
// phishing pages. Validate the shape first, then escape what we print.
const EMAIL_RE = /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// One-click unsubscribe (RFC 8058) — Gmail posts List-Unsubscribe=One-Click
export async function POST(req: NextRequest) {
  try {
    const email = (req.nextUrl.searchParams.get("email") || "").trim()
    if (!email) return new NextResponse("Missing email", { status: 400 })
    if (!EMAIL_RE.test(email)) return new NextResponse("Invalid email", { status: 400 })
    await addUnsub(email)
    return new NextResponse("Unsubscribed", { status: 200 })
  } catch (err) {
    console.error("[Unsubscribe POST]", err)
    return new NextResponse("Error", { status: 500 })
  }
}

// Click-through unsubscribe from email footer link
export async function GET(req: NextRequest) {
  const raw   = req.nextUrl.searchParams.get("email") || ""
  const email = EMAIL_RE.test(raw.trim()) ? raw.trim() : ""
  try {
    if (email) await addUnsub(email)
  } catch (err) {
    console.error("[Unsubscribe GET]", err)
  }
  const safeEmail = escapeHtml(email)
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
    <p>${safeEmail ? `<strong style="color:#e8ecff">${safeEmail}</strong><br>` : ""}You will no longer receive marketing emails from ArcLens.</p>
    <p style="margin-top:24px;font-size:12px;color:#2e3a5c;">Transactional emails (magic links you request, security notices) will still be delivered. <a href="https://arclenz.xyz">Return to ArcLens →</a></p>
  </div></body></html>`
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } })
}
