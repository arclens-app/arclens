import { NextResponse } from "next/server"
import { ARC_RPC_HTTP } from "@/lib/constants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RpcResponse = {
  result?: unknown
  error?: { message?: string }
}

type ArcBlock = {
  number: string
  timestamp: string
  transactions: unknown[]
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(ARC_RPC_HTTP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`)
  const data = await response.json() as RpcResponse
  if (data.result == null || data.error) throw new Error(data.error?.message || `Missing ${method} result`)
  return data.result as T
}

export async function GET() {
  try {
    const [blockHex, gasHex] = await Promise.all([
      rpc<string>("eth_blockNumber"),
      rpc<string>("eth_gasPrice"),
    ])
    const blockNumber = Number.parseInt(blockHex, 16)
    const gasPriceWei = BigInt(gasHex).toString()
    if (!Number.isSafeInteger(blockNumber)) throw new Error("Invalid block number")

    // Arc produces blocks quickly and its block timestamps use whole seconds.
    // Sampling only five blocks can therefore produce a zero-second span. A
    // wider sample gives the homepage a stable live TPS and block-time value.
    const sampleSize = 12
    const rawBlocks = await Promise.all(
      Array.from({ length: sampleSize }, (_, index) =>
        rpc<ArcBlock>("eth_getBlockByNumber", [
          `0x${Math.max(0, blockNumber - index).toString(16)}`,
          false,
        ]),
      ),
    )
    const blocks = rawBlocks.map(block => ({
      number: Number.parseInt(block.number, 16),
      timestamp: Number.parseInt(block.timestamp, 16),
      txCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
    }))
    const newest = blocks[0]
    const oldest = blocks.at(-1)
    const spanSeconds = newest && oldest ? newest.timestamp - oldest.timestamp : 0
    const intervalCount = newest && oldest ? newest.number - oldest.number : 0
    const averageBlockTimeSeconds = spanSeconds > 0 && intervalCount > 0
      ? spanSeconds / intervalCount
      : null
    const transactionsPerSecond = spanSeconds > 0
      ? blocks.reduce((total, block) => total + block.txCount, 0) / spanSeconds
      : null

    return NextResponse.json(
      {
        blockNumber,
        gasPriceWei,
        averageBlockTimeSeconds,
        transactionsPerSecond,
        recentBlocks: blocks.slice(0, 4),
      },
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
