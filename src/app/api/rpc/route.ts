import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const rpc = process.env.ARC_RPC_HTTP
  if (!rpc) return NextResponse.json({ error: "RPC not configured" }, { status: 500 })

  const body = await req.json()
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json", "accept": "application/json" },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return NextResponse.json(data)
}
