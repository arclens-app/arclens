import { NextRequest, NextResponse } from "next/server"
import { rateLimit, getIp } from "@/lib/ratelimit"

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