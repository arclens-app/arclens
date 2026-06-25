// src/lib/gateway.ts
//
// Real x402 / Circle Gateway nanopayment verification for Lens AI's seller
// endpoints. Buyers (other agents, or the paid chat) pay gas-free over Circle
// Gateway; we verify + settle the EIP-3009 authorization here, settling real
// USDC on Arc. Mirrors the official circlefin/arc-nanopayments reference.
//
// ADDITIVE + GATED: only engages when a `payment-signature` header is present
// AND SELLER_ADDRESS is configured. The existing `x-lens-pay: sim` demo path is
// left untouched, so nothing breaks if Gateway env isn't set.

import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server"

// Arc Testnet constants (from the @circle-fin/x402-batching reference).
const ARC_TESTNET_NETWORK = "eip155:5042002"
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000"
const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"

// Lens AI receives to its own wallet. SELLER_ADDRESS wins, then the Lens wallet.
const SELLER_ADDRESS = (process.env.SELLER_ADDRESS ||
  process.env.LENS_WALLET_ADDRESS ||
  process.env.PAYOUT_WALLET_ADDRESS ||
  "") as `0x${string}` | ""

let _facilitator: BatchFacilitatorClient | null = null
function facilitator(): BatchFacilitatorClient {
  if (!_facilitator) _facilitator = new BatchFacilitatorClient()
  return _facilitator
}

export function gatewayConfigured(): boolean {
  return !!SELLER_ADDRESS
}

function requirements(priceE6: number) {
  return {
    scheme: "exact" as const,
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: String(priceE6), // USDC atomic units (6 decimals)
    payTo: SELLER_ADDRESS,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
  }
}

/** Base64 `PAYMENT-REQUIRED` header so standard GatewayClient buyers can pay. */
export function paymentRequiredHeader(priceE6: number, endpoint: string): string {
  const body = {
    x402Version: 2,
    resource: {
      url: endpoint,
      description: `Lens AI — pay-per-call (${(priceE6 / 1e6).toFixed(4)} USDC)`,
      mimeType: "application/json",
    },
    accepts: [requirements(priceE6)],
  }
  return Buffer.from(JSON.stringify(body)).toString("base64")
}

/** Base64 `PAYMENT-RESPONSE` header confirming settlement back to the buyer. */
export function paymentResponseHeader(tx: string | null, payer?: string): string {
  return Buffer.from(
    JSON.stringify({ success: true, transaction: tx, network: ARC_TESTNET_NETWORK, payer: payer ?? null }),
  ).toString("base64")
}

export interface GatewaySettlement {
  ok: boolean
  payer?: string
  tx?: string | null
  reason?: string
}

/** Verify + settle a base64 `payment-signature` header via Circle Gateway. */
export async function verifyAndSettle(
  paymentSignature: string,
  priceE6: number,
): Promise<GatewaySettlement> {
  if (!gatewayConfigured()) return { ok: false, reason: "gateway_not_configured" }
  try {
    const reqs = requirements(priceE6)
    const payload = JSON.parse(Buffer.from(paymentSignature, "base64").toString("utf-8"))
    const v = await facilitator().verify(payload, reqs)
    if (!v.isValid) return { ok: false, reason: v.invalidReason || "invalid" }
    const s = await facilitator().settle(payload, reqs)
    if (!s.success) return { ok: false, reason: s.errorReason || "settle_failed" }
    return { ok: true, payer: s.payer ?? v.payer, tx: s.transaction ?? null }
  } catch (e: any) {
    return { ok: false, reason: e?.message || String(e) }
  }
}
