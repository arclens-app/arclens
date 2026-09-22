import { NextRequest, NextResponse } from "next/server"
import { enforce } from "@/lib/ratelimit"
import { CCTP_DOMAIN, CCTP_IRIS_BASE } from "@/lib/constants"

export async function GET(req: NextRequest) {
  const blocked = await enforce(req, "iris", { limit: 60, windowMs: 60_000 })
  if (blocked) return blocked

  const dir   = req.nextUrl.searchParams.get("dir") // "in" | "out"
  // Clamp limit to a safe range so callers can't DoS Circle's iris-api on our behalf
  const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50
  const param = dir === "out" ? `sourceDomain=${CCTP_DOMAIN}` : `destinationDomain=${CCTP_DOMAIN}`

  try {
    const res  = await fetch(
      `${CCTP_IRIS_BASE}/v2/messages?${param}&limit=${limit}`,
      { headers: { "Accept": "application/json" }, next: { revalidate: 30 } }
    )
    if (!res.ok) return NextResponse.json({ messages: [] })
    const data = await res.json()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    })
  } catch {
    return NextResponse.json({ messages: [] })
  }
}
