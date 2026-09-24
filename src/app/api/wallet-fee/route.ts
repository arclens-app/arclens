import { NextRequest, NextResponse } from "next/server"
import { ARC_RPC_HTTP, CIRBTC_ADDRESS, EURC_ADDRESS, USDC_ADDRESS } from "@/lib/constants"

export const dynamic = "force-dynamic"

const SUPPORTED_TOKENS = new Set([
  USDC_ADDRESS.toLowerCase(),
  EURC_ADDRESS.toLowerCase(),
  CIRBTC_ADDRESS.toLowerCase(),
])

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(ARC_RPC_HTTP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`)
  const data = await response.json()
  if (data.error || data.result == null) throw new Error(data.error?.message || "Arc RPC request failed")
  return String(data.result)
}

function formatUsdc18(value: bigint) {
  const base = 10n ** 18n
  const fraction = (value % base).toString().padStart(18, "0").slice(0, 8).replace(/0+$/, "")
  return `${value / base}.${fraction || "0"}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const from = String(body.from || "").toLowerCase()
    const to = String(body.to || "").toLowerCase()
    const token = String(body.token || "").toLowerCase()
    const amount = String(body.amount || "")

    if (!/^0x[a-f0-9]{40}$/.test(from) || !/^0x[a-f0-9]{40}$/.test(to)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 })
    }
    if (!SUPPORTED_TOKENS.has(token) || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
      return NextResponse.json({ error: "Invalid transfer" }, { status: 400 })
    }

    const data = `0xa9059cbb${to.slice(2).padStart(64, "0")}${BigInt(amount).toString(16).padStart(64, "0")}`
    const [gasHex, gasPriceHex] = await Promise.all([
      rpc("eth_estimateGas", [{ from, to: token, data }]),
      rpc("eth_gasPrice", []),
    ])
    const gasLimit = BigInt(gasHex)
    const gasPriceWei = BigInt(gasPriceHex)
    // Small headroom communicates a safe estimate while Circle still chooses
    // the final fee at signing time.
    const estimatedFeeWei = gasLimit * gasPriceWei * 115n / 100n

    return NextResponse.json(
      { gasLimit: gasLimit.toString(), gasPriceWei: gasPriceWei.toString(), feeUsdc: formatUsdc18(estimatedFeeWei) },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[wallet-fee]", error)
    return NextResponse.json({ error: "Fee estimate temporarily unavailable" }, { status: 502 })
  }
}
