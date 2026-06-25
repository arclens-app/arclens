// scripts/register-erc8004-circle.mjs
//
// Register Lens AI as an ERC-8004 Trustless Agent on Arc Testnet FROM its own
// Circle developer-controlled wallet — so the on-chain agent identity genuinely
// IS Lens AI's wallet (not a throwaway key). Uses the OFFICIAL IdentityRegistry
// already deployed on Arc Testnet.
//
// Run:  node --env-file=.env.local scripts/register-erc8004-circle.mjs
//
// Needs (from .env.local): CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, LENS_WALLET_ID.
// Lens AI's wallet must hold a little USDC for gas.

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { createPublicClient, http, parseAbi, decodeEventLog } from "viem"
import { randomUUID } from "node:crypto"

const RPC = "https://rpc.testnet.arc.network"
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
const CARD_URL = process.env.LENS_CARD_URL || "https://arclenz.xyz/api/agent/card"

const apiKey = process.env.CIRCLE_API_KEY
const entitySecret = process.env.CIRCLE_ENTITY_SECRET
const walletId = process.env.LENS_WALLET_ID
if (!apiKey || !entitySecret || !walletId) {
  console.error("✗ Missing CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET / LENS_WALLET_ID in .env.local")
  process.exit(1)
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
const chain = { id: 5042002, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const pub = createPublicClient({ chain, transport: http(RPC) })
const abi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])

async function exec(label, abiFunctionSignature, abiParameters) {
  const tx = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: IDENTITY_REGISTRY,
    abiFunctionSignature,
    abiParameters,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  })
  const id = tx?.data?.id
  if (!id) throw new Error(`${label}: no tx id — ${JSON.stringify(tx?.data ?? tx)}`)
  process.stdout.write(`  ${label}: tx ${id} — settling`)
  let hash = null, state = null
  for (let i = 0; i < 40 && !hash; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const g = await client.getTransaction({ id })
    hash = g?.data?.transaction?.txHash || null
    state = g?.data?.transaction?.state || null
    if (state === "FAILED" || state === "CANCELLED") throw new Error(`${label}: transaction ${state}`)
    if (!hash) process.stdout.write(".")
  }
  if (!hash) throw new Error(`${label}: no txHash after polling (state ${state})`)
  console.log(` ✓\n  ${label}: ${hash}`)
  return hash
}

try {
  console.log("Registering Lens AI as an ERC-8004 agent from its Circle wallet…\n")
  const regHash = await exec("register", "register()", [])
  const receipt = await pub.waitForTransactionReceipt({ hash: regHash })
  let agentId = null
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) continue
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics })
      if (ev.eventName === "Transfer") { agentId = ev.args.tokenId; break }
    } catch { /* not the mint Transfer */ }
  }
  if (agentId == null) {
    console.error(`\nRegistered, but couldn't parse agentId from logs. Inspect tx: ${regHash}`)
    process.exit(1)
  }
  console.log(`\n✅ Registered. Lens AI is ERC-8004 agentId = ${agentId}\n`)

  console.log("Pointing the identity at the Agent Card…\n")
  await exec("setAgentURI", "setAgentURI(uint256,string)", [agentId.toString(), CARD_URL])

  console.log(`\n🪙  Done. Lens AI = ERC-8004 agentId ${agentId}, owned by its Circle wallet, card → ${CARD_URL}`)
  console.log(`Next: set LENS_AGENT_ID=${agentId} in Vercel so /api/agent/card resolves the on-chain link.`)
} catch (e) {
  console.error("\n✗ failed:", e?.message || e)
  process.exit(1)
}
