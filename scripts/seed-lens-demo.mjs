// Seed a few SIMULATED Lens AI payouts from real verified Arc projects, so the
// /lens showcase + dashboard cards show realistic data before the Gemini key /
// Circle wallet are wired locally. Every row is status='simulated', reason=
// 'demo seed' — clear them anytime with:
//   DELETE FROM lens_payouts WHERE reason='demo seed';
//
// Run: node scripts/seed-lens-demo.mjs
import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const BASE = 500
const WEIGHT = { official: 4, partner: 3, verified: 2, established: 1.5 }
function tierOf(p) {
  if (p.hard_risk) return null
  const key = p.recognition === "official" ? "official" : p.recognition === "partner" ? "partner"
    : p.trust_level === "verified" ? "verified" : p.established ? "established" : null
  if (!key) return null
  const base = p.recognition === "official" ? "Arc Official" : p.recognition === "partner" ? "Arc Partner"
    : p.trust_level === "verified" ? "Verified" : null
  const label = base ? (p.established ? `${base} · Established` : base) : "Established"
  return { key, label, amount: Math.round(BASE * WEIGHT[key]) }
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS lens_payouts (
    id BIGSERIAL PRIMARY KEY, conversation_id BIGINT, asker_id TEXT, builder_wallet TEXT NOT NULL,
    project_slug TEXT, project_name TEXT, trust_label TEXT, amount_e6 BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', tx_hash TEXT, tx_id TEXT, reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
await pool.query(`ALTER TABLE lens_payouts ADD COLUMN IF NOT EXISTS asker_id TEXT`)

await pool.query(`DELETE FROM lens_payouts WHERE reason='demo seed'`)

const r = await pool.query(`
  SELECT slug, name, LOWER(owner_wallet) wallet, trust_level, recognition, established,
         COALESCE((trust_profile->>'hard_risk')::bool,false) hard_risk
    FROM projects
   WHERE approved AND live AND owner_wallet IS NOT NULL
     AND (recognition IN ('official','partner') OR trust_level='verified' OR established=true)
     AND COALESCE((trust_profile->>'hard_risk')::bool,false)=false
   LIMIT 8`)

let rows = 0
for (const p of r.rows) {
  const t = tierOf(p); if (!t) continue
  const cites = 2 + Math.floor(Math.random() * 12)            // 2–13 cites
  for (let i = 0; i < cites; i++) {
    const mins = Math.floor(Math.random() * 600)               // within last 10h
    await pool.query(
      `INSERT INTO lens_payouts (asker_id, builder_wallet, project_slug, project_name, trust_label, amount_e6, status, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'simulated','demo seed', NOW() - make_interval(mins => $7))`,
      [`demo-seed-${i}`, p.wallet, p.slug, p.name, t.label, t.amount, mins])
    rows++
  }
  console.log(`  ${p.name.padEnd(22)} ${t.label.padEnd(22)} ${cites} cites × $${(t.amount/1e6).toFixed(4)}`)
}
console.log(`\nSeeded ${rows} simulated payouts across ${r.rows.length} verified projects.`)
await pool.end()
