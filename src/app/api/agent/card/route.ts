// src/app/api/agent/card/route.ts
//
// ERC-8004 registration file (the "Agent Card") for Lens AI.
// The on-chain IdentityRegistry agentURI points here. Schema per
// https://eips.ethereum.org/EIPS/eip-8004#registration-v1
//
// Once Lens AI is registered (scripts/register-erc8004.mjs), set LENS_AGENT_ID
// to the minted agentId so the `registrations` array resolves on-chain ↔ off-chain.

import { NextResponse } from "next/server"

export const runtime = "nodejs"

const CHAIN_ID = 5042002 // Arc Testnet
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
const AGENT_WALLET = (process.env.LENS_WALLET_ADDRESS || process.env.PAYOUT_WALLET_ADDRESS || "").toLowerCase()
const AGENT_ID = process.env.LENS_AGENT_ID || null

export async function GET() {
  const card: Record<string, unknown> = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Lens AI",
    description:
      "The trust & intelligence agent for the Arc ecosystem. Ask who's real on Arc, discover projects, or read a project's live metrics — and every paid call funds the verified builders whose data answers it. Pay-per-call over x402, settled in USDC on Arc.",
    image: "https://arclenz.xyz/lens-reveal.png",
    services: [
      { name: "trust-oracle", endpoint: "https://arclenz.xyz/api/agent", version: "1" },
      { name: "chat", endpoint: "https://arclenz.xyz/lens" },
    ],
    active: true,
    registrations: AGENT_ID
      ? [{ agentId: Number(AGENT_ID), agentRegistry: `eip155:${CHAIN_ID}:${IDENTITY_REGISTRY}` }]
      : [],
    x402Support: true,
    supportedTrust: ["reputation"],
  }
  if (AGENT_WALLET) card.agentWallet = AGENT_WALLET
  return NextResponse.json(card, { headers: { "Cache-Control": "public, s-maxage=300" } })
}
