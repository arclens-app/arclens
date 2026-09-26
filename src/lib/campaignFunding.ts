import { createPublicClient, decodeEventLog, formatUnits, http, parseUnits, type Hash, type Hex } from "viem"
import { ARC_CHAIN_ID, ARC_RPC_HTTP, USDC_ADDRESS } from "@/lib/constants"

const TRANSFER_ABI = [{
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" },
  ],
}] as const

export type CampaignFundingCheck =
  | { ok: true; amountE6: bigint }
  | { ok: false; reason: string; pending?: boolean }

function address(value: string | undefined): `0x${string}` | null {
  const normalized = value?.trim().toLowerCase()
  return /^0x[0-9a-f]{40}$/.test(normalized || "") ? normalized as `0x${string}` : null
}

export function requiredCampaignFundingE6(rewardUsdcAmount: unknown, totalSlots: unknown): bigint | null {
  const reward = String(rewardUsdcAmount ?? "").trim()
  const slots = Number(totalSlots)
  if (!/^\d+(\.\d{1,6})?$/.test(reward) || !Number.isSafeInteger(slots) || slots < 1) return null
  try {
    const perTester = parseUnits(reward, 6)
    return perTester > 0n ? perTester * BigInt(slots) : null
  } catch {
    return null
  }
}

export function fundedAmountFromLogs(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
  founderWallet: string,
  payoutWallet: string,
): bigint {
  const founder = address(founderWallet)
  const payout = address(payoutWallet)
  if (!founder || !payout) return 0n

  let total = 0n
  for (const log of logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({
        abi: TRANSFER_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as { eventName: "Transfer"; args: { from: string; to: string; value: bigint } }
      if (
        decoded.eventName === "Transfer" &&
        decoded.args.from.toLowerCase() === founder &&
        decoded.args.to.toLowerCase() === payout
      ) total += decoded.args.value
    } catch {
      // Ignore unrelated or malformed logs. Only a valid USDC Transfer counts.
    }
  }
  return total
}

export async function verifyCampaignFunding(input: {
  txHash: string
  founderWallet: string
  rewardUsdcAmount: unknown
  totalSlots: unknown
}): Promise<CampaignFundingCheck> {
  const txHash = input.txHash.trim().toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) return { ok: false, reason: "Invalid transaction hash" }

  const founder = address(input.founderWallet)
  const payout = address(process.env.PAYOUT_WALLET_ADDRESS || process.env.NEXT_PUBLIC_ARCLENS_PAYOUT_ADDRESS)
  if (!founder) return { ok: false, reason: "Campaign founder wallet is invalid" }
  if (!payout) return { ok: false, reason: "Campaign payout wallet is not configured" }

  const required = requiredCampaignFundingE6(input.rewardUsdcAmount, input.totalSlots)
  if (!required) return { ok: false, reason: "Campaign reward or slot count is invalid" }

  const client = createPublicClient({ chain: undefined, transport: http(ARC_RPC_HTTP) })
  try {
    const receipt = await client.waitForTransactionReceipt({ hash: txHash as Hash, confirmations: 1, timeout: 15_000 })
    if (receipt.status !== "success") return { ok: false, reason: "Funding transaction failed on-chain" }
    if (receipt.from.toLowerCase() !== founder) {
      return { ok: false, reason: "Funding transaction was not sent by the campaign founder" }
    }

    // Arc uses USDC as its native gas and value token. A normal App Kit USDC
    // send is therefore a direct native-value transaction (18-decimal EVM
    // precision), not necessarily an ERC-20 Transfer log. Keep the log path as
    // a compatibility fallback, but require one exact transfer format.
    const transaction = await client.getTransaction({ hash: txHash as Hash })
    const nativeFunded =
      transaction.from.toLowerCase() === founder &&
      transaction.to?.toLowerCase() === payout &&
      transaction.input === "0x" &&
      transaction.value === required * 1_000_000_000_000n
        ? required
        : 0n
    const erc20Funded = fundedAmountFromLogs(receipt.logs, founder, payout)
    const funded = nativeFunded === required ? nativeFunded : erc20Funded
    if (funded !== required) {
      return {
        ok: false,
        reason: `Funding transaction must transfer exactly ${formatUnits(required, 6)} USDC to the ArcLens campaign wallet`,
      }
    }
    return { ok: true, amountE6: funded }
  } catch (error: unknown) {
    const detail = error as { shortMessage?: string; message?: string }
    const message = String(detail?.shortMessage || detail?.message || error)
    if (/not found|could not be found|unknown transaction/i.test(message)) {
      return { ok: false, pending: true, reason: "Funding transaction is not confirmed on Arc yet. Wait a moment and try again." }
    }
    console.error(`[campaignFunding] Arc ${ARC_CHAIN_ID} receipt check failed:`, message)
    return { ok: false, reason: "Could not verify the funding transaction on Arc" }
  }
}
