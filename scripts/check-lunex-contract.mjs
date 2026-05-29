import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const ID = 24

// 0. Did Lunex re-claim after the reset?
const p = await pool.query(
  `SELECT id, name, slug, owner_wallet, claimed_at, approved, live,
          tvl_tracking_enabled, tvl_usd_e6::text tvl, volume_cum_usd_e6::text vol,
          revenue_cum_usd_e6::text rev, tvl_last_indexed_at
   FROM projects WHERE id = $1`, [ID])
console.log("=== PROJECT ===")
console.log(JSON.stringify(p.rows[0], null, 2))

// 1. Registered contracts
const pc = await pool.query(
  `SELECT id, address, role, label, start_block, deployer_address,
          verified_at, revoked_at, revoke_reason, created_at,
          volume_method, volume_event_signature, volume_amount_arg, volume_stablecoin_id
   FROM project_contracts WHERE project_id = $1 ORDER BY created_at DESC`, [ID])
console.log(`\n=== PROJECT_CONTRACTS (${pc.rows.length}) ===`)
for (const c of pc.rows) {
  console.log(JSON.stringify(c, null, 2))

  // event counts
  const ve = await pool.query(`SELECT COUNT(*)::int n FROM volume_events WHERE contract_id = $1`, [c.id]).catch(() => ({ rows: [{ n: "n/a" }] }))
  const re = await pool.query(`SELECT COUNT(*)::int n FROM revenue_events WHERE contract_id = $1`, [c.id]).catch(() => ({ rows: [{ n: "n/a" }] }))
  console.log(`  volume_events: ${ve.rows[0].n} · revenue_events: ${re.rows[0].n}`)

  // cursor
  const cur = await pool.query(
    `SELECT kind, last_block, updated_at FROM indexer_cursors WHERE kind LIKE $1 OR kind LIKE $2`,
    [`%${c.id}`, `%${c.role}_${c.id}`]).catch(() => ({ rows: [] }))
  console.log(`  cursors: ${cur.rows.length ? JSON.stringify(cur.rows) : "none yet"}`)

  // status derivation (mirror admin route)
  const ageMin = (Date.now() - new Date(c.created_at).getTime()) / 60000
  const events = c.role === "volume" ? Number(ve.rows[0].n) : c.role === "revenue" ? Number(re.rows[0].n) : 0
  let status = "quiet"
  if (c.revoked_at) status = "revoked"
  else if (c.role === "tvl") {
    const ia = p.rows[0].tvl_last_indexed_at ? (Date.now() - new Date(p.rows[0].tvl_last_indexed_at).getTime()) / 60000 : Infinity
    status = ia < 15 ? "working" : ageMin < 10 ? "awaiting" : "quiet"
  } else status = events > 0 ? "working" : ageMin < 10 ? "awaiting" : "quiet"
  console.log(`  → STATUS: ${status}  (age ${ageMin.toFixed(1)} min)`)
}

// 2. Alerts
const al = await pool.query(
  `SELECT kind, severity, message, created_at, resolved_at FROM indexer_alerts WHERE project_id = $1 ORDER BY created_at DESC LIMIT 5`, [ID]
).catch(() => ({ rows: [] }))
console.log(`\n=== INDEXER ALERTS (${al.rows.length}) ===`)
for (const a of al.rows) console.log(`  [${a.severity}] ${a.kind}: ${a.message} ${a.resolved_at ? "(resolved)" : ""}`)

await pool.end()
