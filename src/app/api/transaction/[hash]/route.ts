import { NextRequest, NextResponse } from "next/server"
import { ARC_RPC_HTTP, CIRBTC_ADDRESS, EURC_ADDRESS, USDC_ADDRESS } from "@/lib/constants"

export const dynamic = "force-dynamic"

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const TOKENS = new Map([
  [USDC_ADDRESS.toLowerCase(), { symbol: "USDC", decimals: 6 }],
  [EURC_ADDRESS.toLowerCase(), { symbol: "EURC", decimals: 6 }],
  [CIRBTC_ADDRESS.toLowerCase(), { symbol: "cirBTC", decimals: 8 }],
])

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const response = await fetch(ARC_RPC_HTTP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`)
  const text = await response.text()
  if (!text.trim()) throw new Error("Arc RPC returned an empty response")
  const data = JSON.parse(text)
  if (data.error) throw new Error(data.error.message || "Arc RPC request failed")
  return (data.result ?? null) as T | null
}

function hexBigInt(value: string | null | undefined) {
  try { return BigInt(value || "0x0") } catch { return 0n }
}

function formatUnits(value: bigint, decimals: number, maximum = decimals) {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, "0").slice(0, maximum).replace(/0+$/, "")
  return `${whole}.${fraction || "0"}`
}

type RpcTransaction = {
  hash: string
  from: string
  to: string | null
  value: string
  gas?: string
  gasPrice?: string
  input?: string
  nonce?: string
  blockNumber?: string | null
}
type RpcReceipt = {
  status?: string
  gasUsed?: string
  effectiveGasPrice?: string
  blockNumber?: string
  logs?: Array<{ address: string; topics: string[]; data: string }>
}
type RpcBlock = { timestamp?: string }

export async function GET(_req: NextRequest, context: { params: Promise<{ hash: string }> }) {
  const { hash: rawHash } = await context.params
  const hash = String(rawHash || "").toLowerCase()
  if (!/^0x[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: "Invalid transaction hash" }, { status: 400 })
  }

  try {
    const [tx, receipt] = await Promise.all([
      rpc<RpcTransaction>("eth_getTransactionByHash", [hash]),
      rpc<RpcReceipt>("eth_getTransactionReceipt", [hash]),
    ])
    if (!tx) return NextResponse.json({ error: "Transaction not found on Arc" }, { status: 404 })

    const blockNumberHex = receipt?.blockNumber || tx.blockNumber || null
    const block = blockNumberHex ? await rpc<RpcBlock>("eth_getBlockByNumber", [blockNumberHex, false]) : null
    const timestampSeconds = Number(hexBigInt(block?.timestamp))
    const gasUsed = hexBigInt(receipt?.gasUsed)
    const gasPrice = hexBigInt(receipt?.effectiveGasPrice || tx.gasPrice)
    const input = tx.input || "0x"

    const tokenTransfers = (receipt?.logs || []).flatMap(log => {
      const token = TOKENS.get(String(log.address || "").toLowerCase())
      if (!token || log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length < 3) return []
      return [{
        from: `0x${log.topics[1].slice(-40)}`.toLowerCase(),
        to: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
        amount: formatUnits(hexBigInt(log.data), token.decimals),
        symbol: token.symbol,
      }]
    })
    const usdcTransfer = tokenTransfers.find(transfer => transfer.symbol === "USDC")
    const status = !receipt ? "pending" : hexBigInt(receipt.status) === 1n ? "success" : "failed"
    const selector = input.length >= 10 ? input.slice(0, 10).toLowerCase() : null

    return NextResponse.json({
      transaction: {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        toName: null,
        value: `$${formatUnits(hexBigInt(tx.value), 18, 6)}`,
        gasUSDC: receipt ? `$${formatUnits(gasUsed * gasPrice, 18, 8)}` : "Pending",
        gasUsed: receipt ? gasUsed.toLocaleString() : "Pending",
        blockNumber: blockNumberHex ? `#${hexBigInt(blockNumberHex).toLocaleString()}` : "Pending",
        timestamp: timestampSeconds ? new Date(timestampSeconds * 1000).toISOString() : "",
        method: selector === "0xa9059cbb" ? "transfer" : selector,
        status,
        nonce: Number(hexBigInt(tx.nonce)),
        type: tx.to == null ? "contract_creation" : input !== "0x" ? "contract_call" : "transfer",
        inputData: input,
        decodedInput: null,
        isUSDCTransfer: Boolean(usdcTransfer),
        usdcAmount: usdcTransfer?.amount || null,
        tokenTransfers,
      },
    }, { headers: { "Cache-Control": receipt ? "public, s-maxage=30, stale-while-revalidate=60" : "private, no-store" } })
  } catch (error) {
    console.error("[transaction]", error)
    return NextResponse.json({ error: "Transaction data is temporarily unavailable" }, { status: 502 })
  }
}
