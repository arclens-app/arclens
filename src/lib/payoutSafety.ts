import { ARC_NETWORK, type ArcNetwork } from "@/lib/constants"

const configuredNetwork = process.env.PAYOUT_NETWORK?.toLowerCase()

export const PAYOUT_NETWORK: ArcNetwork | null =
  configuredNetwork === "mainnet" || configuredNetwork === "testnet"
    ? configuredNetwork
    : null

// Sending real USDC requires two explicit, matching settings. Credentials by
// themselves can never switch payouts on or choose the wrong network.
export function payoutsEnabledForActiveNetwork(): boolean {
  return process.env.PAYOUTS_ENABLED === "true" && PAYOUT_NETWORK === ARC_NETWORK
}

export function payoutSafetyMessage(): string {
  if (process.env.PAYOUTS_ENABLED !== "true") return "USDC payouts are paused"
  if (!PAYOUT_NETWORK) return "PAYOUT_NETWORK must be set to testnet or mainnet"
  if (PAYOUT_NETWORK !== ARC_NETWORK) {
    return `Payout network ${PAYOUT_NETWORK} does not match active Arc network ${ARC_NETWORK}`
  }
  return "USDC payouts are enabled"
}
