// scripts/deploy-registry.mjs
// Compiles contracts/ArcLensRegistry.sol and deploys it to Arc.
//
// Standalone, manual-run tool. It does NOT touch the app, the database, or
// production — it only deploys a contract from the key you provide.
//
// One-time prep:
//   npm i -D solc
//
// Run:
//   DEPLOYER_PRIVATE_KEY=0x...        # dedicated registry attester wallet,
//                                     # funded with only a little USDC for gas
//   REGISTRY_OWNER_ADDRESS=0x...      # secure/offline owner wallet
//   ARC_RPC_HTTP=https://rpc.mainnet.arc.io
//   ARC_CHAIN_ID=5042
//   node scripts/deploy-registry.mjs
//
// After it prints the address, set in your env: ARCLENS_REGISTRY=0x...

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"
import { createWalletClient, createPublicClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"

dotenv.config({ path: ".env.local" })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RPC      = process.env.ARC_RPC_HTTP
const CHAIN_ID = Number(process.env.ARC_CHAIN_ID)
const PK       = process.env.DEPLOYER_PRIVATE_KEY
const OWNER    = process.env.REGISTRY_OWNER_ADDRESS

if (!PK || !OWNER) {
  console.error("✗ Set DEPLOYER_PRIVATE_KEY and REGISTRY_OWNER_ADDRESS.")
  process.exit(1)
}
if (RPC !== "https://rpc.mainnet.arc.io" || CHAIN_ID !== 5042) {
  console.error("✗ Refusing deployment: ARC_RPC_HTTP must be Arc mainnet and ARC_CHAIN_ID must be 5042.")
  process.exit(1)
}
if (!/^0x[a-fA-F0-9]{40}$/.test(OWNER)) {
  console.error("✗ REGISTRY_OWNER_ADDRESS must be a valid EVM address.")
  process.exit(1)
}

// 1) Compile with solc
let solc
try { solc = (await import("solc")).default } catch {
  console.error("✗ solc not installed. Run:  npm i -D solc")
  process.exit(1)
}
const srcPath = path.join(__dirname, "..", "contracts", "ArcLensRegistry.sol")
const source  = fs.readFileSync(srcPath, "utf8")
const input = {
  language: "Solidity",
  sources: { "ArcLensRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
}
const compiled = JSON.parse(solc.compile(JSON.stringify(input)))
const fatals = (compiled.errors || []).filter(e => e.severity === "error")
;(compiled.errors || []).forEach(e => console.log(e.formattedMessage))
if (fatals.length) { console.error("✗ compile failed"); process.exit(1) }

const artifact = compiled.contracts["ArcLensRegistry.sol"]["ArcLensRegistry"]
const abi      = artifact.abi
const bytecode = ("0x" + artifact.evm.bytecode.object)

// 2) Deploy
const chain = {
  id: CHAIN_ID,
  name: "arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, // cosmetic; gas math is wei-based
  rpcUrls: { default: { http: [RPC] } },
}
const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK)
if (account.address.toLowerCase() === OWNER.toLowerCase()) {
  console.error("✗ Registry owner and automated attester must be different wallets.")
  process.exit(1)
}
const wallet  = createWalletClient({ account, chain, transport: http(RPC) })
const pub     = createPublicClient({ chain, transport: http(RPC) })

const actualChainId = await pub.getChainId()
if (actualChainId !== CHAIN_ID) {
  console.error(`✗ RPC reported chain ${actualChainId}; expected ${CHAIN_ID}.`)
  process.exit(1)
}

console.log(`Deploying ArcLensRegistry`)
console.log(`  from   ${account.address}`)
console.log(`  chain  ${CHAIN_ID}  rpc ${RPC}`)
const hash = await wallet.deployContract({ abi, bytecode })
console.log(`  tx     ${hash}`)
const receipt = await pub.waitForTransactionReceipt({ hash })
if (receipt.status !== "success" || !receipt.contractAddress) {
  throw new Error("Registry deployment transaction failed")
}
const address = receipt.contractAddress
console.log(`\n✅ ArcLensRegistry deployed at: ${address}`)
console.log(`   owner + attester: ${account.address}`)

// 3) Begin two-step transfer to the secure owner. The deployment wallet stays
// the attester, but ownership does not move until OWNER calls acceptOwnership.
console.log(`\nStarting ownership transfer to ${OWNER} ...`)
const ownershipHash = await wallet.writeContract({
  address,
  abi,
  functionName: "transferOwnership",
  args: [OWNER],
})
const ownershipReceipt = await pub.waitForTransactionReceipt({ hash: ownershipHash })
if (ownershipReceipt.status !== "success") throw new Error("Ownership proposal transaction failed")
console.log(`✓ ownership proposed to ${OWNER}`)

// 4) Save the ABI for the app to read later
const abiOut = path.join(__dirname, "..", "contracts", "ArcLensRegistry.abi.json")
fs.writeFileSync(abiOut, JSON.stringify(abi, null, 2))
console.log(`\nSaved ABI -> ${abiOut}`)
console.log(`\nNext steps:`)
console.log(`  • from ${OWNER}, call acceptOwnership() on ${address}`)
console.log(`  • set ARCLENS_REGISTRY=${address}`)
console.log(`  • store the deployer key only as the sensitive ATTESTER_PRIVATE_KEY`)
console.log(`  • verify the source code on the Arc explorer`)
