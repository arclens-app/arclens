// scripts/register-erc8004.mjs
//
// Register Lens AI as an ERC-8004 Trustless Agent on Arc Testnet, using the
// OFFICIAL registries already deployed there (no contract deployment needed).
//
//   IdentityRegistry   0x8004A818BFB912233c491871b3d84c89A494BD9e
//   ReputationRegistry 0x8004B663056A597Dffe9eCcC1965A193B7388713
//
// Usage:
//   node scripts/register-erc8004.mjs                          # register() -> mints agentId, prints it
//   node scripts/register-erc8004.mjs set-uri <id> <cardUrl>   # setAgentURI(id, url)
//   node scripts/register-erc8004.mjs whoami <id>              # read the on-chain agent wallet
//
// Requires: LENS_AGENT_PRIVATE_KEY = a funded Arc wallet (needs a little USDC for gas).
// This wallet OWNS the agent identity NFT. To bind Lens AI's payout (Circle) wallet
// as the declared agent wallet, use setAgentWallet later (needs that wallet's signature).

import { createWalletClient, createPublicClient, http, parseAbi, decodeEventLog } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const RPC = "https://rpc.testnet.arc.network"
const CHAIN_ID = 5042002
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e"

const pk = process.env.LENS_AGENT_PRIVATE_KEY
if (!pk) {
  console.error("✗ Set LENS_AGENT_PRIVATE_KEY (a funded Arc wallet; needs a little USDC for gas).")
  process.exit(1)
}

const account = privateKeyToAccount(pk.startsWith("0x") ? pk : "0x" + pk)
const chain = {
  id: CHAIN_ID,
  name: "arc-testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
}
const wallet = createWalletClient({ account, chain, transport: http(RPC) })
const pub = createPublicClient({ chain, transport: http(RPC) })

const abi = parseAbi([
  "function register() external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function getAgentWallet(uint256 agentId) external view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
])

const mode = process.argv[2]

try {
  if (mode === "whoami") {
    const id = BigInt(process.argv[3])
    const w = await pub.readContract({ address: IDENTITY_REGISTRY, abi, functionName: "getAgentWallet", args: [id] })
    console.log(`agentId ${id} → wallet ${w}`)
  } else if (mode === "set-uri") {
    const id = BigInt(process.argv[3])
    const uri = process.argv[4]
    if (!uri) { console.error("usage: set-uri <agentId> <cardUrl>"); process.exit(1) }
    const hash = await wallet.writeContract({ address: IDENTITY_REGISTRY, abi, functionName: "setAgentURI", args: [id, uri] })
    console.log("setAgentURI tx:", hash)
    await pub.waitForTransactionReceipt({ hash })
    console.log(`✅ agentURI set for agentId ${id} → ${uri}`)
  } else {
    console.log("Registering Lens AI from", account.address, "on Arc Testnet…")
    const hash = await wallet.writeContract({ address: IDENTITY_REGISTRY, abi, functionName: "register", args: [] })
    console.log("register tx:", hash)
    const receipt = await pub.waitForTransactionReceipt({ hash })
    let agentId = null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) continue
      try {
        const ev = decodeEventLog({ abi, data: log.data, topics: log.topics })
        if (ev.eventName === "Transfer") { agentId = ev.args.tokenId; break }
      } catch { /* not the Transfer event */ }
    }
    console.log("\n✅ Registered. agentId =", agentId?.toString() ?? "(check tx on explorer)")
    if (agentId != null) {
      console.log("\nNext steps:")
      console.log(`  1. Set env  LENS_AGENT_ID=${agentId}  (so /api/agent/card resolves on-chain)`)
      console.log(`  2. Point the identity at the card:`)
      console.log(`     node scripts/register-erc8004.mjs set-uri ${agentId} https://arclenz.xyz/api/agent/card`)
    }
  }
} catch (e) {
  console.error("✗ failed:", e?.shortMessage || e?.message || e)
  process.exit(1)
}
