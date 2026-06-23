// Mints Lens AI its OWN Circle Developer-Controlled Wallet on Arc Testnet — the
// canonical Circle way: createWalletSet → createWallets (blockchains:
// ["ARC-TESTNET"]). Run once; fund the printed address with testnet USDC; then
// set LENS_WALLET_ADDRESS to it on Vercel + .env.local so Lens AI pays from its
// own dev-controlled wallet (separate from the campaign payout wallet).
//
// Requires YOUR creds in .env.local (do NOT paste them anywhere else):
//   CIRCLE_API_KEY=...
//   CIRCLE_ENTITY_SECRET=...
// Run: node scripts/create-lens-wallet.mjs
import { readFileSync } from "node:fs"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const apiKey = process.env.CIRCLE_API_KEY
const entitySecret = process.env.CIRCLE_ENTITY_SECRET
if (!apiKey || !entitySecret) {
  console.error("✗ Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in .env.local. Add them (your Circle creds) and re-run.")
  process.exit(1)
}

const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets")
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

console.log("Creating wallet set…")
const ws = await client.createWalletSet({ name: "Lens AI" })
const walletSetId = ws.data?.walletSet?.id
console.log("  walletSetId:", walletSetId)

console.log("Creating Lens AI wallet on ARC-TESTNET…")
const w = await client.createWallets({
  walletSetId,
  blockchains: ["ARC-TESTNET"],
  accountType: process.env.LENS_WALLET_ACCOUNT_TYPE || "EOA",
  count: 1,
  idempotencyKey: crypto.randomUUID(),
})
const wallet = w.data?.wallets?.[0]

console.log("\n=== Lens AI — Circle Developer-Controlled Wallet ===")
console.log("LENS_WALLET_ADDRESS=" + (wallet?.address || "(none)"))
console.log("LENS_WALLET_ID=" + (wallet?.id || "(none)"))
console.log("\nNext:")
console.log("  1) Fund LENS_WALLET_ADDRESS with testnet USDC (Circle/Arc faucet).")
console.log("  2) Set LENS_WALLET_ADDRESS on Vercel + .env.local.")
console.log("  3) Lens AI now pays from its own dev-controlled wallet.")
