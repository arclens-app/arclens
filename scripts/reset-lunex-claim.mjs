import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const ID = 24

// BEFORE — record everything so this is fully reversible.
const before = await pool.query(
  `SELECT id, name, slug, email, owner_email, owner_wallet, claimed_at, claim_token, claim_token_expires
   FROM projects WHERE id = $1`, [ID])
console.log("=== BEFORE (save this for reversibility) ===")
console.log(JSON.stringify(before.rows[0], null, 2))

// Reset ONLY the wallet-link fields. Keep email + owner_email so the founder's
// claim-email validation still passes. NULLing owner_wallet lifts the
// 'already claimed' guard so a fresh claim can proceed.
await pool.query(
  `UPDATE projects
   SET owner_wallet = NULL,
       claimed_at = NULL,
       claim_token = NULL,
       claim_token_expires = NULL
   WHERE id = $1`, [ID])

const after = await pool.query(
  `SELECT id, name, slug, email, owner_email, owner_wallet, claimed_at, approved, live,
          (claim_token IS NOT NULL) AS has_token
   FROM projects WHERE id = $1`, [ID])
console.log("\n=== AFTER ===")
console.log(JSON.stringify(after.rows[0], null, 2))
console.log("\nLunex wallet link cleared. Founder can now reclaim at /activate/lunex (request a fresh link with email lunexfinance@gmail.com).")

await pool.end()
