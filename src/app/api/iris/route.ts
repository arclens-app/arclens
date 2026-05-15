import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const dir   = req.nextUrl.searchParams.get("dir") // "in" | "out"
  const limit = req.nextUrl.searchParams.get("limit") || "50"
  const param = dir === "out" ? "sourceDomain=26" : "destinationDomain=26"

  try {
    const res  = await fetch(
      `https://iris-api-sandbox.circle.com/v2/messages?${param}&limit=${limit}`,
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
