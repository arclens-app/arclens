import { NextRequest, NextResponse } from "next/server"
import { ARC_RPC_HTTP, CIRBTC_ADDRESS, EURC_ADDRESS, USDC_ADDRESS } from "@/lib/constants"

const ASSETS = [
  { symbol: "USDC", address: USDC_ADDRESS, decimals: 6 },
  { symbol: "EURC", address: EURC_ADDRESS, decimals: 6 },
  { symbol: "cirBTC", address: CIRBTC_ADDRESS, decimals: 8 },
] as const

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
  if (data.error) throw new Error(data.error.message || "Arc RPC request failed")
  return String(data.result || "0x0")
}

function formatHexUnits(hex: string, decimals: number) {
  const value = BigInt(hex || "0x0")
  const base = 10n ** BigInt(decimals)
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "")
  return `${value / base}.${fraction || "0"}`
}

export async function GET(_req: NextRequest, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params
  const wallet = String(address || "").toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 })
  }

  try {
    const encodedWallet = wallet.slice(2).padStart(64, "0")
    const balances = await Promise.all(ASSETS.map(async asset => {
      const raw = await rpc("eth_call", [
        { to: asset.address, data: `0x70a08231${encodedWallet}` },
        "latest",
      ])
      return { symbol: asset.symbol, amount: formatHexUnits(raw, asset.decimals) }
    }))

    return NextResponse.json(
      { balances },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[wallet-balances]", error)
    return NextResponse.json({ error: "Balance temporarily unavailable" }, { status: 502 })
  }
}
