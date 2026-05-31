// Operator-register the Lunex swap pool as a TVL contract (in addition to its
// existing volume role) so its in-pool liquidity counts toward TVL. Justified:
// the pool was already deployer-verified by the owner EOA for volume (id 8);
// we copy that same proof onto a tvl-role row. Idempotent.

import { readFileSync } from "node:fs"
import pg from "pg"
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const r = await pool.query(
  `INSERT INTO project_contracts (project_id, address, role, label, start_block, deployer_address, signed_message, deployer_sig, verified_at)
   SELECT project_id, address, 'tvl', 'LunexSwapPool (liquidity)', start_block, deployer_address, signed_message, deployer_sig, NOW()
   FROM project_contracts WHERE id = 8
   ON CONFLICT (project_id, address, role) DO NOTHING
   RETURNING id`,
)
if (r.rows.length) console.log(`✓ pool registered as TVL (row id ${r.rows[0].id}) — its USDC+EURC liquidity counts toward TVL next cron tick.`)
else console.log("· already registered as TVL — nothing to do.")

await pool.query(`UPDATE projects SET tvl_tracking_enabled = true WHERE id = 24`)
const c = await pool.query(`SELECT id, role, label FROM project_contracts WHERE project_id = 24 AND revoked_at IS NULL ORDER BY id`)
console.log("Lunex tracked contracts:", c.rows.map(x => `${x.role}:${x.label || x.id}`).join(", "))
await pool.end()
