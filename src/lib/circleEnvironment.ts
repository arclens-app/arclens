import "server-only"

import { ARC_IS_MAINNET } from "@/lib/constants"

/** Prevent a TEST key from touching Arc mainnet, or a LIVE key from touching testnet. */
export function getCircleEnvironmentError(): string | null {
  const key = String(process.env.CIRCLE_API_KEY || "").trim()
  if (!key) return "Circle API key is not configured"

  const isTestKey = key.startsWith("TEST_API_KEY:")
  const isLiveKey = key.startsWith("LIVE_API_KEY:")

  if (ARC_IS_MAINNET && !isLiveKey) {
    return "Arc mainnet wallets are not enabled yet"
  }
  if (!ARC_IS_MAINNET && !isTestKey) {
    return "Arc testnet wallets require a Circle test API key"
  }
  return null
}
