import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// Inspect columns of usdc_transfers and campaigns to find the payout wallet
console.log("=== usdc_transfers columns ===")
const c1 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='usdc_transfers' ORDER BY ordinal_position")
for (const r of c1.rows) console.log(" ", r.column_name, r.data_type)

console.log("\n=== campaigns: deposit fields ===")
const c2 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND (column_name ILIKE '%deposit%' OR column_name ILIKE '%payout%' OR column_name ILIKE '%escrow%') ORDER BY ordinal_position`)
for (const r of c2.rows) console.log(" ", r.column_name)

console.log("\n=== Funded campaign deposit_tx_hash (if any) ===")
const c3 = await pool.query("SELECT id, title, deposit_tx_hash, reward_type FROM campaigns WHERE deposit_tx_hash IS NOT NULL LIMIT 5")
for (const r of c3.rows) console.log(JSON.stringify(r))

await pool.end()
