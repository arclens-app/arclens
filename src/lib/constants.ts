export const ARC_CHAIN_ID = 2588
export const ARC_RPC_HTTP = "https://rpc.arc-testnet.io"
export const ARC_RPC_WS = "wss://ws.arc-testnet.io"
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
export const USDC_DECIMALS = 6
export const BASE_FEE_GWEI = 160n
export const BASE_FEE_WEI = 160n * 10n ** 9n

export const ADD_CHAIN_PARAMS = {
  chainId: "0xA1C",
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: ["https://rpc.arc-testnet.io"],
  blockExplorerUrls: ["https://arclens.app"],
} as const

export function gasToUSDC(gasUsed: number, baseFeeGwei = 160): string {
  const costUSDC = (gasUsed * baseFeeGwei * 1e-9)
  return "$" + costUSDC.toFixed(3)
}

export function formatUSDC(raw: bigint | string | number): string {
  const n = typeof raw === "bigint" ? raw : BigInt(String(raw))
  const whole = n / 1_000_000n
  const frac = n % 1_000_000n
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2)
  return "$" + Number(whole).toLocaleString() + "." + fracStr
}

export function shortAddr(addr: string, chars = 4): string {
  if (!addr || addr.length < 10) return addr
  return addr.slice(0, chars + 2) + "..." + addr.slice(-chars)
}

export function shortHash(hash: string, chars = 6): string {
  if (!hash || hash.length < 14) return hash
  return hash.slice(0, chars + 2) + "..." + hash.slice(-chars)
}
