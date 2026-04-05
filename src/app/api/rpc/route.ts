import { NextRequest, NextResponse } from "next/server"

const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 5000 // 5 seconds

export async function POST(req: NextRequest) {
  const rpc = process.env.ARC_RPC_HTTP
  if (!rpc) return NextResponse.json({ error: "RPC not configured" }, { status: 500 })

  const body = await req.json()
  const method = body.method || ""

  // Cache read-only calls only
  const cacheable = ["eth_blockNumber", "eth_gasPrice", "eth_chainId"].includes(method)
  if (cacheable) {
    const cached = cache.get(method)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }
  }

  const response = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json", "accept": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await response.json()

  if (cacheable) cache.set(method, { data, ts: Date.now() })

  return NextResponse.json(data)
}