// src/lib/tvl.ts
// Pure helpers for the TVL & revenue indexer.
//
// Everything here is deterministic and side-effect-free — easy to reason about
// and easy to unit-test against a mock provider.

import { ethers } from "ethers"

// Arc public RPC caps `eth_getLogs` at 20,000 results. For a busy stablecoin
// Transfer event a 5,000-block window can blow past that. Wrap getLogs with
// recursive bisection: on the specific "too many results" error, halve the
// range and retry each side, recurse until the RPC accepts it. Surfaces ALL
// other errors normally — we only special-case the documented oversize one.
const RPC_OVERSIZE_PATTERNS = [
  /max\s*results?/i,
  /exceeds?\s+\d+/i,
  /too many results/i,
  /-32602/, // Arc's specific code for this on the testnet RPC
]
export async function getLogsBisecting(
  provider: ethers.JsonRpcProvider,
  filter: { address?: string; topics?: any[] },
  fromBlock: number,
  toBlock: number,
): Promise<ethers.Log[]> {
  if (fromBlock > toBlock) return []
  try {
    return await provider.getLogs({ ...filter, fromBlock, toBlock })
  } catch (e: any) {
    const msg = (e?.error?.message || e?.info?.error?.message || e?.message || "")
    const oversize = RPC_OVERSIZE_PATTERNS.some(r => r.test(msg))
    if (!oversize || fromBlock === toBlock) throw e
    // Sequential halves (not Promise.all) — keeps RPC pressure constant
    // even as we recurse into pathological ranges. The total wall-clock
    // is bounded by MAX_LOG_RANGE anyway.
    const mid = Math.floor((fromBlock + toBlock) / 2)
    const a = await getLogsBisecting(provider, filter, fromBlock, mid)
    const b = await getLogsBisecting(provider, filter, mid + 1, toBlock)
    return a.concat(b)
  }
}

// Transfer(address indexed from, address indexed to, uint256 value)
export const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)")

export const ERC20_BALANCE_ABI = [
  "function balanceOf(address) view returns (uint256)",
]

// 6-confirmation buffer for reorg safety. Arc finality is fast, but this
// makes any single-block reorg invisible to our snapshots.
export const REORG_BUFFER = 6

// eth_getLogs max range. Conservative; many RPCs cap at 5k–10k blocks.
export const MAX_LOG_RANGE = 5_000

export interface StablecoinRow {
  id: number
  address: string         // lowercase
  symbol: string
  decimals: number
  peg_currency: string    // 'USD', 'EUR', ...
}

export interface ProjectContractRow {
  id: number
  project_id: number
  address: string         // lowercase
  role: "tvl" | "revenue" | "treasury" | "volume"
  label: string | null
  start_block: number
  // Volume-only metadata; null for other roles. Indexer ignores volume rows
  // missing any required field for their method and records an alert.
  //
  //   volume_method = 'swap_event'        → requires signature+topic+amount_arg+stablecoin
  //   volume_method = 'outflow_transfer'  → requires only stablecoin (sums Transfer-OUT)
  volume_method?: "swap_event" | "outflow_transfer" | null
  volume_event_signature?: string | null
  volume_event_topic?: string | null
  volume_amount_arg?: number | null
  volume_stablecoin_id?: number | null
}

export interface ForexMap {
  // currency → rate (USD per 1 unit of currency)
  [currency: string]: { rate: number; effective_date: string; source: string }
}

// Pad an address to a 32-byte log topic.
export function addressToTopic(addr: string): string {
  return "0x" + "0".repeat(24) + addr.toLowerCase().replace(/^0x/, "")
}

// Decode the unindexed `value` payload of a Transfer log.
export function decodeTransferAmount(data: string): bigint {
  return BigInt(data)
}

// Extract the to-address from a Transfer log's topic[2].
export function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase()
}

// Convert a stablecoin raw amount (in token decimals) to USD scaled by 1e6.
// e.g. 1_000_000 USDC (6 decimals) at USD peg → 1_000_000 * 1 * 1e6 / 1e6 = 1_000_000 → $1.00 in our display scale
//      1 EURC at EUR peg with rate 1.10 → 1 * 1.10 * 1e6 / 1e0 → 1_100_000 → $1.10
//
// Returns a bigint in 1e6-USD fixed point — same scale used everywhere
// (`projects.tvl_usd_e6`, etc.). Display layer divides by 1_000_000.
export function toUsdE6(
  rawAmount: bigint,
  tokenDecimals: number,
  pegToUsdRate: number,
): bigint {
  // Scale the rate to a bigint with 8 decimals so we keep precision.
  const rateScaled = BigInt(Math.round(pegToUsdRate * 1e8))   // e.g. 1.10 → 110000000
  // amount * rate / 10^tokenDecimals → amount in USD
  // Then scale to 1e6 fixed point. Combine: amount * rate * 1e6 / (10^tokenDecimals * 1e8)
  const num = rawAmount * rateScaled * BigInt(1_000_000)
  const denom = BigInt(10) ** BigInt(tokenDecimals) * BigInt(100_000_000)
  return num / denom
}

// Format a 1e6-USD bigint to a human-readable string. Used in logs / API.
export function formatUsdE6(usdE6: bigint): string {
  const million = BigInt(1_000_000)
  const whole = usdE6 / million
  const frac = (usdE6 % million).toString().padStart(6, "0").slice(0, 2)
  return `$${Number(whole).toLocaleString()}.${frac}`
}

// Solidity event signatures are dual-purpose. The same source declaration
// drives TWO different downstream uses:
//
//   • topic[0] hash:  keccak256 of the CANONICAL form — no arg names, no
//                     `indexed` keyword. e.g.
//                     "Transfer(address indexed from, address indexed to, uint256 value)"
//                     → keccak256("Transfer(address,address,uint256)")
//
//   • log.data:        contains ONLY the non-indexed args in declaration order.
//                     For the example above, data is just `(uint256)`.
//
// We accept the founder-provided signature in its full Solidity form
// (with `indexed` keywords + arg names — what they'd paste from their
// contract source). Two helpers split it correctly for the two uses.

function splitTopArgs(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ""
  for (const ch of s) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) { out.push(buf); buf = ""; continue }
    buf += ch
  }
  if (buf.trim() || out.length > 0) out.push(buf)
  return out
}

// Strip arg names + the `indexed` keyword. Returns the canonical signature
// used for topic[0] hashing.
//   "Transfer(address indexed from, address indexed to, uint256 value)"
//     → "Transfer(address,address,uint256)"
export function canonicalEventSignature(input: string): string {
  const m = input.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/)
  if (!m) return input.trim()
  const types = splitTopArgs(m[2]).map(arg => {
    // Each arg looks like "address indexed from" or "uint256 amount0" or "uint256".
    // Tuple types like "(uint256,address)" stay intact in the first token.
    const cleaned = arg.replace(/\bindexed\b/g, " ").trim()
    // Take the leading type token (everything up to the first whitespace).
    const m2 = cleaned.match(/^(\S+)/)
    return m2 ? m2[1] : cleaned
  })
  return `${m[1]}(${types.join(",")})`
}

// Returns the ABI types of the NON-INDEXED args in declaration order. These
// are exactly the types whose ABI-encoded values appear concatenated in
// `log.data` and can be decoded by ethers.AbiCoder.
//   "Swap(address indexed sender, uint256 amount0In, uint256 amount0Out, address indexed to)"
//     → ["uint256", "uint256"]
export function dataArgTypes(input: string): string[] {
  const m = input.match(/^[A-Za-z_][A-Za-z0-9_]*\((.*)\)$/)
  if (!m) return []
  return splitTopArgs(m[1])
    .map(a => a.trim())
    .filter(a => a.length > 0)
    .filter(a => !/\bindexed\b/.test(a))
    .map(a => {
      const m2 = a.match(/^(\S+)/)
      return m2 ? m2[1] : a
    })
}

// Kept for backwards compatibility (used by older code paths). Returns the
// canonical types — same as canonicalEventSignature(), but as a list.
export function parseEventArgTypes(signature: string): string[] {
  const canon = canonicalEventSignature(signature)
  const m = canon.match(/^[A-Za-z_][A-Za-z0-9_]*\((.*)\)$/)
  if (!m) return []
  return splitTopArgs(m[1]).map(s => s.trim()).filter(Boolean)
}
