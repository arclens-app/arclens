// One-time Lens AI registration in the canonical ERC-8004 Identity Registry
// on Arc mainnet. The Circle developer-controlled Lens wallet becomes the
// on-chain owner, and the identity points directly at ArcLens's Agent Card.
//
// Run:
//   node --env-file=.env.local scripts/register-erc8004-mainnet.mjs

// Required: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, LENS_WALLET_ID.

// This script is deliberately mainnet-specific. It does not read or alter the
// existing Arc testnet registration. Lens AI was registered successfully as
// agent #290 on 2026-09-26; do not run this script again for the same identity.

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { createPublicClient, decodeEventLog, http, parseAbi } from "viem"
import { randomUUID } from "node:crypto"

const CHAIN_ID = 5042
const RPC = "https://rpc.mainnet.arc.io"
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
const CARD_URL = process.env.LENS_CARD_URL || "https://arclenz.xyz/api/agent/card"

const apiKey = process.env.CIRCLE_API_KEY
const entitySecret = process.env.CIRCLE_ENTITY_SECRET
const walletId = process.env.LENS_WALLET_ID
if (!apiKey || !entitySecret || !walletId) {
  throw new Error("Missing CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET or LENS_WALLET_ID")
}

const chain = {
  id: CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
}
const publicClient = createPublicClient({ chain, transport: http(RPC) })
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])

const code = await publicClient.getBytecode({ address: IDENTITY_REGISTRY })
if (!code || code === "0x") throw new Error("Canonical ERC-8004 mainnet registry has no bytecode")

console.log("Registering Lens AI in ERC-8004 on Arc mainnet...")
const created = await circle.createContractExecutionTransaction({
  walletId,
  contractAddress: IDENTITY_REGISTRY,
  abiFunctionSignature: "register(string)",
  abiParameters: [CARD_URL],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  idempotencyKey: randomUUID(),
})
const transactionId = created?.data?.id
if (!transactionId) throw new Error(`Circle returned no transaction id: ${JSON.stringify(created?.data ?? created)}`)

const settled = await circle.getTransaction({
  id: transactionId,
  waitForTxHash: true,
  pollingInterval: 1_000,
  signal: AbortSignal.timeout(120_000),
})
const transaction = settled?.data?.transaction
const txHash = transaction?.txHash
if (!txHash) throw new Error(`Registration did not produce a transaction hash (state: ${transaction?.state || "unknown"})`)

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 })
if (receipt.status !== "success") throw new Error(`Registration reverted: ${txHash}`)

let agentId = null
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) continue
  try {
    const event = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics })
    if (event.eventName === "Transfer" && event.args.from === "0x0000000000000000000000000000000000000000") {
      agentId = event.args.tokenId
      break
    }
  } catch { /* unrelated registry log */ }
}
if (agentId == null) throw new Error(`Registered but could not determine agentId. Inspect ${txHash}`)

console.log(JSON.stringify({
  ok: true,
  chainId: CHAIN_ID,
  identityRegistry: IDENTITY_REGISTRY,
  agentId: agentId.toString(),
  agentURI: CARD_URL,
  txHash,
  circleTransactionId: transactionId,
}, null, 2))
