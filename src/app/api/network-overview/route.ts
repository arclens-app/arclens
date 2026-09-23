import { NextResponse } from "next/server"
import { ARC_RPC_HTTP } from "@/lib/constants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RpcResponse<T> = { result?: T; error?: { message?: string } }
type RpcTransaction = {
  hash: string
  from: string
  to: string | null
  value?: string
  gas?: string
  gasPrice?: string
}
type RpcBlock = {
  number: string
  timestamp: string
  gasUsed: string
  baseFeePerGas?: string
  miner?: string
  transactions: RpcTransaction[]
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
  const data = await response.json() as RpcResponse<T>
  if (data.result == null || data.error) throw new Error(data.error?.message || `Missing ${method} result`)
  return data.result
}

function hexNumber(value: string | undefined, fallback = "0x0") {
  return Number.parseInt(value || fallback, 16)
}

export async function GET() {
  try {
    const [blockHex, gasHex] = await Promise.all([
      rpc<string>("eth_blockNumber"),
      rpc<string>("eth_gasPrice"),
    ])
    const blockNumber = hexNumber(blockHex)
    if (!Number.isSafeInteger(blockNumber)) throw new Error("Invalid block number")

    // Twelve full blocks are enough to smooth sub-second timestamp rounding,
    // while the UI displays only the newest six and ten transactions.
    const rawBlocks = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        rpc<RpcBlock>("eth_getBlockByNumber", [
          `0x${Math.max(0, blockNumber - index).toString(16)}`,
          true,
        ]),
      ),
    )
    const sampled = rawBlocks.map(block => ({
      raw: block,
      number: hexNumber(block.number),
      timestamp: hexNumber(block.timestamp),
      txCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
    }))
    const newest = sampled[0]
    const oldest = sampled.at(-1)
    const spanSeconds = newest && oldest ? newest.timestamp - oldest.timestamp : 0
    const transactionsPerSecond = spanSeconds > 0
      ? sampled.reduce((total, block) => total + block.txCount, 0) / spanSeconds
      : null

    const blocks = sampled.slice(0, 6).map(block => {
      const gasUsed = BigInt(block.raw.gasUsed || "0x0")
      const baseFee = BigInt(block.raw.baseFeePerGas || gasHex)
      return {
        number: block.number,
        txCount: block.txCount,
        feeUSDC: (Number(gasUsed * baseFee) / 1e18).toFixed(4),
        validator: block.raw.miner || "",
        timestamp: block.timestamp,
      }
    })

    const transactions = sampled.slice(0, 6).flatMap(block =>
      block.raw.transactions.slice(0, 4).map(transaction => {
        const gasLimit = BigInt(transaction.gas || "0x0")
        const gasPrice = BigInt(transaction.gasPrice || gasHex)
        return {
          hash: transaction.hash,
          from: transaction.from,
          to: transaction.to,
          valueUSDC: "$" + (Number(BigInt(transaction.value || "0x0")) / 1e18).toFixed(2),
          gasUSDC: "$" + (Number(gasLimit * gasPrice) / 1e18).toFixed(4),
          timestamp: block.timestamp,
        }
      }),
    ).slice(0, 10)

    return NextResponse.json(
      {
        blockNumber,
        gasPriceWei: BigInt(gasHex).toString(),
        transactionsPerSecond,
        blocks,
        transactions,
      },
      { headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=20" } },
    )
  } catch (error) {
    console.error("[network-overview]", error)
    return NextResponse.json(
      { error: "Arc network data is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
