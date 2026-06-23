import { readFileSync } from "node:fs"
import pg from "pg"
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND (column_name ILIKE '%logo%' OR column_name ILIKE '%image%' OR column_name ILIKE '%icon%' OR column_name ILIKE '%avatar%')`)
console.log("logo-ish columns:", cols.rows.map(r => r.column_name).join(", ") || "(none)")

const q = async (label, sql) => { const r = await pool.query(sql); console.log(label.padEnd(52), r.rows[0].n) }
await q("Verified / Partner / Official / Established (any)", `SELECT COUNT(*) n FROM projects WHERE approved AND live AND (recognition IN ('official','partner') OR trust_level='verified' OR established=true) AND COALESCE((trust_profile->>'hard_risk')::bool,false)=false`)
await q("…of those, with a payout wallet (EARN NOW)", `SELECT COUNT(*) n FROM projects WHERE approved AND live AND (recognition IN ('official','partner') OR trust_level='verified' OR established=true) AND COALESCE((trust_profile->>'hard_risk')::bool,false)=false AND owner_wallet IS NOT NULL`)
await q("verified tier total", `SELECT COUNT(*) n FROM projects WHERE approved AND live AND trust_level='verified'`)
await q("established total", `SELECT COUNT(*) n FROM projects WHERE approved AND live AND established=true`)
await q("claimed (has owner_wallet) total", `SELECT COUNT(*) n FROM projects WHERE approved AND live AND owner_wallet IS NOT NULL`)
await pool.end()
