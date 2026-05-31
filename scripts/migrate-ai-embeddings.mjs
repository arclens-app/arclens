import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// Store the embedding as jsonb (array of floats). Avoids needing the pgvector
// extension; the KB is small enough that cosine-in-JS over all rows is instant.
await pool.query(`ALTER TABLE ai_knowledge_base ADD COLUMN IF NOT EXISTS embedding jsonb`)
console.log("ai_knowledge_base.embedding column ready (jsonb).")

const r = await pool.query(`SELECT COUNT(*)::int total, COUNT(embedding)::int embedded FROM ai_knowledge_base`)
console.log(`facts: ${r.rows[0].total} · embedded: ${r.rows[0].embedded}`)
console.log(r.rows[0].embedded < r.rows[0].total
  ? "→ run `node scripts/embed-kb.mjs` (needs a Gemini key set) to backfill embeddings."
  : "→ all facts embedded.")

await pool.end()
