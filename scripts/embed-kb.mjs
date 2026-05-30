// Backfill embeddings for the AI knowledge base using Gemini text-embedding-004.
// Idempotent: only embeds rows whose embedding is NULL (pass --all to re-embed).
// Requires a Gemini key in .env.local (GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY).
import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
if (!apiKey) {
  console.error("No Gemini key found (GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY). Set one in .env.local first.")
  process.exit(1)
}

const reembedAll = process.argv.includes("--all")
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const { embed } = await import("ai")
const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
const google = createGoogleGenerativeAI({ apiKey })
const model = google.textEmbeddingModel("gemini-embedding-001")

const rows = await pool.query(
  `SELECT id, topic, fact FROM ai_knowledge_base ${reembedAll ? "" : "WHERE embedding IS NULL"} ORDER BY id`,
)
console.log(`embedding ${rows.rows.length} fact(s)…`)

let done = 0
for (const row of rows.rows) {
  const value = `[${row.topic}] ${row.fact}`
  try {
    const { embedding } = await embed({ model, value })
    await pool.query(`UPDATE ai_knowledge_base SET embedding = $2::jsonb WHERE id = $1`, [row.id, JSON.stringify(embedding)])
    done++
    if (done % 10 === 0) console.log(`  ${done}/${rows.rows.length}`)
  } catch (e) {
    console.error(`  ! id ${row.id} failed: ${e?.message || e}`)
  }
}
console.log(`done: ${done}/${rows.rows.length} embedded.`)
await pool.end()
