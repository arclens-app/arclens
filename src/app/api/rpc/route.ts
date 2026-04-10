impo { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const rpc = process.env.ARC_RPC_HTTP
  if (!rpc) return NextResponse.json({ error: "RPC not configured" }, { status: 500 })

  const body     = await req.json()
  const response = await fetch(rpc, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "accept": "application/json" },
    body:    JSON.stringify(body),
  })

  const data = await response.json()

  // eth_getCode changes very rarely — cache for 60s
  // eth_blockNumber changes every block — cache for 5s
  const method = body?.method || ""
  const maxAge = method === "eth_getCode" ? 60
               : method === "eth_blockNumber" ? 5
               : 10

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=30`,
    },
  })
}