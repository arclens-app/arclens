import { NextRequest, NextResponse } from "next/server"
import { rateLimit, getIp } from "@/lib/ratelimit"

// 5 MB — anything larger is almost certainly not a profile picture or logo
const MAX_BYTES = 5 * 1024 * 1024
// Whitelist common image formats; reject everything else so abusers can't
// upload PDFs, executables, archives, or anything else to our Imgbb account
// SVG is included because project-logo uploads use it; note SVGs can carry
// JS (XSS risk) — Imgbb sanitizes most cases, but this is a follow-up to
// review separately if you ever serve SVGs from your own origin.
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
])
const ALLOWED_EXT  = /\.(jpe?g|png|webp|gif|svg)$/i

export async function POST(req: NextRequest) {
  // Rate limit: 20 uploads per hour per IP
  const rl = await rateLimit(`upload:${getIp(req)}`, 20, 3_600_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } }
    )
  }

  const formData = await req.formData()
  const file = formData.get("image") as File
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large — max 5 MB" }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Only JPG, PNG, WebP, or GIF images allowed" }, { status: 415 })
  }
  if (file.name && !ALLOWED_EXT.test(file.name)) {
    return NextResponse.json({ error: "File extension must match an image format" }, { status: 415 })
  }

  // Convert to base64
  const bytes  = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString("base64")

  // Upload to Imgbb
  const body = new URLSearchParams()
  body.append("key", process.env.IMGBB_API_KEY || "")
  body.append("image", base64)
  body.append("name", file.name)

  const res  = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body })
  const data = await res.json() as { success: boolean; data?: { url: string; display_url: string } }

  if (!data.success) return NextResponse.json({ error: "Upload failed" }, { status: 500 })

  return NextResponse.json({ url: data.data?.display_url || data.data?.url })
}