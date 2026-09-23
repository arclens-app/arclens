import { NextResponse } from "next/server"
import { ARC_RPC_HTTP } from "@/lib/constants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RpcResponse = {
  result?: string
  error?: { message?: string }
}

async function rpc(method: "eth_blockNumber" | "eth_gasPrice"): Promise<string> {
  const response = await fetch(ARC_RPC_HTTP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id: 1 }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`)
  const data = await response.json() as RpcResponse
  if (!data.result || data.error) throw new Error(data.error?.message || `Missing ${method} result`)
  return data.result
}

export async function GET() {
  try {
    const [blockHex, gasHex] = await Promise.all([
      rpc("eth_blockNumber"),
      rpc("eth_gasPrice"),
    ])
    const blockNumber = Number.parseInt(blockHex, 16)
    const gasPriceWei = BigInt(gasHex).toString()
    if (!Number.isSafeInteger(blockNumber)) throw new Error("Invalid block number")

    return NextResponse.json(
      { blockNumber, gasPriceWei },
      { headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=20" } },
    )
  } catch (error) {
    console.error("[arc-status]", error)
    return NextResponse.json(
      { error: "Arc network status is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
