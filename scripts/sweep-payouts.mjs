// Sweep: backfill on-chain hashes onto 'pending' payouts that have settled, and
// remove the fake demo-seed / simulated rows so the board shows only real
// on-chain payouts. Safe to re-run (a cron could call this).
import { readFileSync } from "node:fs"
import pg from "pg"
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const l of env.split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets")
const client = initiateDeveloperControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET })

const pend = await pool.query(`SELECT id, tx_id FROM lens_payouts WHERE status='pending' AND (tx_hash IS NULL OR tx_hash='') AND tx_id IS NOT NULL AND tx_id<>''`)
let done = 0
for (const row of pend.rows) {
  try {
    const t = await client.getTransaction({ id: row.tx_id })
    const tx = t?.data?.transaction
    if (tx?.txHash) {
      const st = tx.state === "COMPLETE" || tx.state === "CONFIRMED" ? "complete" : "pending"
      await pool.query(`UPDATE lens_payouts SET tx_hash=$2, status=$3 WHERE id=$1`, [row.id, tx.txHash, st])
      done++
    }
  } catch (e) { console.log("  skip", row.tx_id, e?.message) }
}
console.log(`backfilled ${done}/${pend.rows.length} hashes`)

const del = await pool.query(`DELETE FROM lens_payouts WHERE reason='demo seed' OR status='simulated'`)
console.log(`removed ${del.rowCount} demo/simulated rows`)

const real = await pool.query(`SELECT project_name, status, tx_hash FROM lens_payouts WHERE status IN ('complete','pending') ORDER BY created_at DESC LIMIT 8`)
console.log("\nreal payouts now:")
real.rows.forEach(x => console.log("  ", x.project_name, "|", x.status, "|", x.tx_hash || "(hash pending)"))
await pool.end()
