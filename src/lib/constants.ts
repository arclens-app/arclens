export type ArcNetwork = "testnet" | "mainnet"

type ArcNetworkConfig = {
  chainId: number
  chainName: string
  rpcHttp: string
  rpcWs: string
  explorerUrl: string
  explorerApi: string
  usdcAddress: string
  eurcAddress: string
  cirbtcAddress: string
  circleBlockchain: "ARC-TESTNET" | "ARC"
  appKitChain: "Arc_Testnet" | "Arc"
  cctpIrisBase: string
}

// Testnet is the fail-safe default. Mainnet must be selected explicitly.
const requestedNetwork = process.env.NEXT_PUBLIC_ARC_NETWORK?.toLowerCase()
export const ARC_NETWORK: ArcNetwork = requestedNetwork === "mainnet" ? "mainnet" : "testnet"

const NETWORKS: Record<ArcNetwork, ArcNetworkConfig> = {
  testnet: {
    chainId: 5_042_002,
    chainName: "Arc Testnet",
    rpcHttp: "https://rpc.testnet.arc.io",
    rpcWs: "wss://rpc.testnet.arc.io",
    explorerUrl: "https://explorer.testnet.arc.io",
    explorerApi: "https://explorer.testnet.arc.io/api/v2",
    usdcAddress: "0x3600000000000000000000000000000000000000",
    eurcAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    cirbtcAddress: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
    circleBlockchain: "ARC-TESTNET",
    appKitChain: "Arc_Testnet",
    cctpIrisBase: "https://iris-api-sandbox.circle.com",
  },
  mainnet: {
    chainId: 5_042,
    chainName: "Arc",
    rpcHttp: "https://rpc.mainnet.arc.io",
    // Arc's public primary RPC is HTTP-only. Configure a provider URL before
    // enabling any feature that needs a persistent WebSocket connection.
    rpcWs: "",
    explorerUrl: "https://explorer.arc.io",
    explorerApi: "https://explorer.arc.io/api/v2",
    usdcAddress: "0x3600000000000000000000000000000000000000",
    eurcAddress: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    cirbtcAddress: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
    circleBlockchain: "ARC",
    appKitChain: "Arc",
    cctpIrisBase: "https://iris-api.circle.com",
  },
}

const active = NETWORKS[ARC_NETWORK]

export const ARC_IS_MAINNET = ARC_NETWORK === "mainnet"
export const ARC_CHAIN_ID = active.chainId
export const ARC_CHAIN_ID_HEX = `0x${ARC_CHAIN_ID.toString(16)}`
export const ARC_CHAIN_NAME = active.chainName
export const ARC_RPC_HTTP = process.env.NEXT_PUBLIC_ARC_RPC_HTTP || active.rpcHttp
export const ARC_RPC_WS = process.env.NEXT_PUBLIC_ARC_RPC_WS || active.rpcWs
export const ARC_EXPLORER_URL = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || active.explorerUrl
export const ARC_EXPLORER_API = process.env.NEXT_PUBLIC_ARC_EXPLORER_API || active.explorerApi
export const USDC_ADDRESS = active.usdcAddress
export const EURC_ADDRESS = active.eurcAddress
export const CIRBTC_ADDRESS = active.cirbtcAddress
export const USDC_DECIMALS = 6
export const EURC_DECIMALS = 6
export const CIRBTC_DECIMALS = 8
export const CIRCLE_BLOCKCHAIN = active.circleBlockchain
export const APP_KIT_CHAIN = active.appKitChain
export const CCTP_IRIS_BASE = active.cctpIrisBase
export const CCTP_DOMAIN = 26
// User deposits into Arc Trials remain unavailable until the operator enables
// them after checking the payout wallet and the active network end to end.
export const CAMPAIGN_USDC_ENABLED = process.env.NEXT_PUBLIC_CAMPAIGN_USDC_ENABLED === "true"
export const BASE_FEE_GWEI = BigInt(160)
export const BASE_FEE_WEI  = BigInt(160) * BigInt(10) ** BigInt(9)

export const ADD_CHAIN_PARAMS = {
  chainId: ARC_CHAIN_ID_HEX,
  chainName: ARC_CHAIN_NAME,
  // Native USDC uses 18-decimal internal precision for gas. Its ERC-20
  // interface still uses 6 decimals for balances and transfers.
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: [ARC_RPC_HTTP],
  blockExplorerUrls: [ARC_EXPLORER_URL],
} as const

export function gasToUSDC(gasUsed: number, baseFeeGwei = 160): string {
  const costUSDC = (gasUsed * baseFeeGwei * 1e-9)
  return "$" + costUSDC.toFixed(3)
}

export function formatUSDC(raw: bigint | string | number): string {
  const n = typeof raw === "bigint" ? raw : BigInt(String(raw))
  const million = BigInt(1000000)
  const whole = n / million
  const frac = n % million
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
