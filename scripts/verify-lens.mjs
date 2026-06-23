// Verifies, after the entity-secret rotation / key change, that:
//  • the new creds authenticate
//  • Lens AI's wallet exists and (after funding) holds USDC
//  • the EXISTING campaign payout wallet is still under this same account
//    (i.e. nothing broke) — it should appear in the wallet list.
import { readFileSync } from "node:fs"
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] }

const apiKey = process.env.CIRCLE_API_KEY
const entitySecret = process.env.CIRCLE_ENTITY_SECRET
const LENS = (process.env.LENS_WALLET_ADDRESS || "").toLowerCase()
const LENS_ID = process.env.LENS_WALLET_ID
const CAMPAIGN = (process.env.PAYOUT_WALLET_ADDRESS || "").toLowerCase()

const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets")
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

const w = await client.listWallets({ pageSize: 50 })
const wallets = (w.data?.wallets || [])
console.log("✓ Auth OK. Wallets under this account:", wallets.length)
for (const x of wallets) console.log("   ", x.address, "|", x.blockchain, "|", x.id)

const has = (a) => wallets.some(x => (x.address || "").toLowerCase() === a)
console.log("\nLens AI wallet present:    ", has(LENS) ? "YES ✓" : "NO ✗")
console.log("Campaign wallet present:   ", CAMPAIGN ? (has(CAMPAIGN) ? "YES ✓ (same account — campaign intact)" : "NO ✗ (DIFFERENT ACCOUNT — campaign would break!)") : "(PAYOUT_WALLET_ADDRESS not set locally)")

try {
  const bal = await client.getWalletTokenBalance({ id: LENS_ID })
  const toks = (bal.data?.tokenBalances || []).map(t => `${t.token?.symbol}=${t.amount}`)
  console.log("\nLens AI wallet balances:   ", toks.length ? toks.join(", ") : "(empty — fund it)")
} catch (e) { console.log("\n(balance check skipped:", e?.message || e, ")") }
