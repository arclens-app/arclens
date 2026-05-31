import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const email = "lunexfinance@gmail.com"
const ownerWallet = "0x8b66734eb4405b3e2960d83f655468202c39e1d8"

// 1. Circle wallets tied to the founder's email — the address Circle gives him
//    on email sign-in. If it differs from owner_wallet, that's the lockout.
const cw = await pool.query(
  `SELECT email, wallet_address, created_at FROM circle_wallet_users WHERE LOWER(email) = LOWER($1)`,
  [email],
).catch(e => ({ rows: [], err: e.message }))
console.log(`=== circle_wallet_users for ${email}: ${cw.rows?.length ?? 0} ===`)
if (cw.err) console.log("  (query error: " + cw.err + ")")
for (const w of cw.rows) {
  const addr = (w.wallet_address || "").toLowerCase()
  console.log(`  ${w.wallet_address}  created ${w.created_at}`)
  console.log(`    matches owner_wallet? ${addr === ownerWallet}`)
}

// 2. Is the owner_wallet itself a known Circle wallet (any email)?
const owns = await pool.query(
  `SELECT email, wallet_address FROM circle_wallet_users WHERE LOWER(wallet_address) = $1`,
  [ownerWallet],
).catch(() => ({ rows: [] }))
console.log(`\n=== who owns wallet ${ownerWallet}? ===`)
if (owns.rows.length === 0) console.log("  not in circle_wallet_users → it's a browser wallet (MetaMask/Rabby etc.)")
for (const w of owns.rows) console.log(`  circle email: ${w.email}`)

// 3. Confirm the canonical dashboard slug/url.
const p = await pool.query(`SELECT id, name, slug FROM projects WHERE id = 24`)
console.log(`\n=== canonical dashboard ===`)
for (const row of p.rows) console.log(`  /dashboard/${row.slug}   (name: ${row.name})`)

await pool.end()
