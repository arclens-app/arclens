// src/lib/arc.ts
// Arc RPC provider — singleton pattern so we never open duplicate connections.
// Uses ethers v6. All monetary values returned in USDC (6 decimals).

import { ethers } from "ethers"
import {
  ARC_RPC_HTTP,
  ARC_RPC_WS,
  ARC_CHAIN_ID,
  USDC_ADDRESS,
  USDC_DECIMALS,
  formatUSDC,
} from "./constants"

// ─── SINGLETON HTTP PROVIDER ─────────────────────────────────────────────────
let _httpProvider: ethers.JsonRpcProvider | null = null

export function getProvider(): ethers.JsonRpcProvider {
  if (!_httpProvider) {
    _httpProvider = new ethers.JsonRpcProvider(ARC_RPC_HTTP, {
      chainId:  ARC_CHAIN_ID,
      name:     "arc-testnet",
    })
  }
  return _httpProvider
}

// ─── SINGLETON WEBSOCKET PROVIDER ────────────────────────────────────────────
let _wsProvider: ethers.WebSocketProvider | null = null

export function getWsProvider(): ethers.WebSocketProvider {
  if (!_wsProvider) {
    _wsProvider = new ethers.WebSocketProvider(ARC_RPC_WS, {
      chainId: ARC_CHAIN_ID,
      name:    "arc-testnet",
    })

    // Auto-reconnect on close
    _wsProvider.websocket.addEventListener("close", () => {
      console.warn("[ArcLens] WebSocket closed — reconnecting…")
      _wsProvider = null
      setTimeout(getWsProvider, 3000)
    })
  }
  return _wsProvider
}

// ─── USDC CONTRACT (minimal ABI — only what we need) ─────────────────────────
const USDC_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]

export function getUSDCContract(
  signerOrProvider?: ethers.Signer | ethers.Provider
): ethers.Contract {
  return new ethers.Contract(
    USDC_ADDRESS,
    USDC_ABI,
    signerOrProvider ?? getProvider()
  )
}

// ─── TYPED FETCH FUNCTIONS ────────────────────────────────────────────────────

/**
 * Fetch the latest block with full transaction objects.
 * All fee values are converted to USDC display strings.
 */
export async function getLatestBlock() {
  const provider = getProvider()
  const block = await provider.getBlock("latest", true)
  if (!block) throw new Error("Could not fetch latest block")

  const baseFeeGwei = block.baseFeePerGas
    ? Number(ethers.formatUnits(block.baseFeePerGas, "gwei"))
    : 160

  return {
    number:       block.number,
    hash:         block.hash,
    timestamp:    block.timestamp,
    txCount:      block.transactions.length,
    gasUsed:      block.gasUsed,
    gasLimit:     block.gasLimit,
    baseFeeGwei,
    // Fee collected = gasUsed × baseFee, denominated in USDC (6 decimals)
    feeUSDC:      formatUSDC(block.gasUsed * (block.baseFeePerGas ?? 160n * 10n ** 9n) / 10n ** 12n),
    validator:    block.miner,
    parentHash:   block.parentHash,
  }
}

/**
 * Fetch a full transaction with its receipt.
 * Returns gas cost in USDC display format.
 */
export async function getTransaction(hash: string) {
  const provider = getProvider()
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(hash),
    provider.getTransactionReceipt(hash),
  ])

  if (!tx) throw new Error(`Transaction not found: ${hash}`)

  const baseFee  = receipt?.effectiveGasPrice ?? tx.gasPrice ?? 160n * 10n ** 9n
  const gasUsed  = receipt?.gasUsed ?? 0n
  const feeWei   = gasUsed * baseFee
  // Convert wei → USDC micro (wei / 1e12) then → USDC (/ 1e6)
  const feeUSDC  = formatUSDC(feeWei / 10n ** 12n)

  return {
    hash:         tx.hash,
    blockNumber:  tx.blockNumber,
    from:         tx.from,
    to:           tx.to,
    value:        tx.value,
    // Value in USDC for display (Arc uses USDC as native, but value field
    // on non-USDC txs will be 0 — real value is in Transfer events)
    valueUSDC:    formatUSDC(tx.value / 10n ** 12n),
    gasUsed:      receipt?.gasUsed ?? 0n,
    gasPrice:     baseFee,
    feeUSDC,
    status:       receipt?.status === 1 ? "confirmed" : receipt ? "failed" : "pending",
    data:         tx.data,
    nonce:        tx.nonce,
    logs:         receipt?.logs ?? [],
    confirmations: receipt ? (await provider.getBlockNumber()) - (tx.blockNumber ?? 0) : 0,
  }
}

/**
 * Fetch address info including USDC balance.
 */
export async function getAddressInfo(address: string) {
  const provider = getProvider()
  const usdc     = getUSDCContract()

  const [
    txCount,
    usdcBalance,
    code,
  ] = await Promise.all([
    provider.getTransactionCount(address),
    usdc.balanceOf(address).catch(() => 0n),
    provider.getCode(address),
  ])

  const isContract = code !== "0x"

  return {
    address,
    txCount,
    usdcBalance:    formatUSDC(usdcBalance),
    usdcBalanceRaw: usdcBalance,
    isContract,
    code:           isContract ? code : null,
  }
}

/**
 * Fetch current gas price in Gwei and USDC cost per tx type.
 */
export async function getGasInfo() {
  const provider    = getProvider()
  const feeData     = await provider.getFeeData()
  const baseFeeGwei = feeData.gasPrice
    ? Number(ethers.formatUnits(feeData.gasPrice, "gwei"))
    : 160

  return {
    baseFeeGwei: Math.round(baseFeeGwei),
    costs: {
      transfer:       `$${(baseFeeGwei * 21_000  * 1e-9).toFixed(4)}`,
      erc20Transfer:  `$${(baseFeeGwei * 46_000  * 1e-9).toFixed(4)}`,
      contractCall:   `$${(baseFeeGwei * 85_000  * 1e-9).toFixed(4)}`,
      contractDeploy: `$${(baseFeeGwei * 200_000 * 1e-9).toFixed(4)}`,
    },
  }
}

/**
 * Fetch recent blocks (last N blocks).
 */
export async function getRecentBlocks(count = 10) {
  const provider   = getProvider()
  const latest     = await provider.getBlockNumber()
  const blockNums  = Array.from({ length: count }, (_, i) => latest - i)

  const blocks = await Promise.all(
    blockNums.map(n => provider.getBlock(n, false))
  )

  return blocks.filter(Boolean).map(b => ({
    number:    b!.number,
    hash:      b!.hash,
    timestamp: b!.timestamp,
    txCount:   b!.transactions.length,
    gasUsed:   b!.gasUsed,
    validator: b!.miner,
    feeUSDC:   formatUSDC(
      b!.gasUsed * (b!.baseFeePerGas ?? 160n * 10n ** 9n) / 10n ** 12n
    ),
  }))
}

/**
 * Fetch USDC total supply (circulating on Arc).
 */
export async function getUSDCSupply(): Promise<string> {
  const usdc   = getUSDCContract()
  const supply = await usdc.totalSupply()
  return formatUSDC(supply)
}

/**
 * Decode ERC-20 Transfer events from transaction logs.
 * Returns human-readable transfer list.
 */
export function decodeTransferLogs(
  logs: ethers.Log[]
): { from: string; to: string; amount: string }[] {
  const transferTopic = ethers.id("Transfer(address,address,uint256)")
  return logs
    .filter(log => log.topics[0] === transferTopic)
    .map(log => {
      const from   = `0x${log.topics[1].slice(26)}`
      const to     = `0x${log.topics[2].slice(26)}`
      const amount = BigInt(log.data)
      return { from, to, amount: formatUSDC(amount) }
    })
}
