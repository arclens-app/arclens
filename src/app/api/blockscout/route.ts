import { NextRequest, NextResponse } from "next/server"
import { ARC_EXPLORER_URL } from "@/lib/constants"

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path")
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 })

  // Reject path traversal and non-API-safe characters
  if (path.includes("..") || path.startsWith("/") || !/^[a-zA-Z0-9/_\-.?=&:,]+$/.test(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  try {
    const res = await fetch(`${ARC_EXPLORER_URL}/api/` + path, { signal: AbortSignal.timeout(8_000) })
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json({ error: "Explorer request failed", status: res.status }, { status: 502 })
    }
    if (!text.trim()) {
      return NextResponse.json({ error: "Explorer returned an empty response" }, { status: 502 })
    }
    let data: unknown
    try { data = JSON.parse(text) }
    catch { return NextResponse.json({ error: "Explorer returned an invalid response" }, { status: 502 }) }

  // Cache at Vercel edge — blocks/txs change fast so keep short,
  // but even 10s cache cuts invocations dramatically under load
  const isStatic = path.includes("addresses/0x000") || path.includes("tokens")
  const maxAge   = isStatic ? 120 : 20

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=60`,
      },
    })
  } catch (error) {
    console.error("[blockscout proxy]", error)
    return NextResponse.json({ error: "Explorer temporarily unavailable" }, { status: 502 })
  }
}
