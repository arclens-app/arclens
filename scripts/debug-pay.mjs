import { readFileSync } from "node:fs"
import pg from "pg"
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const r = await pool.query("SELECT slug, name, LOWER(owner_wallet) w FROM projects WHERE slug='lunex'")
const dest = r.rows[0]?.w
console.log("Lunex owner_wallet (destination):", dest)
await pool.end()

const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets")
const client = initiateDeveloperControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET })

const bal = await client.getWalletTokenBalance({ id: process.env.LENS_WALLET_ID })
console.log("\ntoken balances:\n", JSON.stringify(bal?.data?.tokenBalances, null, 2))
const usdc = (bal?.data?.tokenBalances || []).find(t => /^usdc$/i.test(t?.token?.symbol || ""))
console.log("\nresolved USDC tokenId:", usdc?.token?.id, "| blockchain:", usdc?.token?.blockchain, "| native:", usdc?.token?.isNative)

try {
  const tx = await client.createTransaction({
    walletId: process.env.LENS_WALLET_ID,
    tokenId: usdc?.token?.id,
    destinationAddress: dest,
    amounts: ["0.001"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: crypto.randomUUID(),
  })
  console.log("\ncreateTransaction OK:", JSON.stringify(tx?.data))
} catch (e) {
  console.log("\ncreateTransaction ERROR:", e?.message || e)
  console.log("details:", JSON.stringify(e?.response?.data || e?.data || {}, null, 2))
}
