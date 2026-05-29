// scripts/migrate-ai.mjs
// Schema for ArcLens AI. Four tables, all idempotent.
//
//   ai_conversations    — per-user chat history. Lets the AI reference
//                          past chats with the same wallet over time.
//   ai_knowledge_base   — curated facts about Arc / ArcLens / Circle that
//                          the AI cites in answers. Grows over time.
//   ai_knowledge_gaps   — questions the AI couldn't answer. Used to fill the
//                          KB without humans noticing what users actually ask.
//   ai_actions          — every autonomous action the AI takes (USDC payouts,
//                          contract registrations, dispute verdicts) with
//                          tx_hash and reason. Drives /admin/ai-ops transparency.
//
// Run:  node scripts/migrate-ai.mjs

import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const SQL = `
CREATE TABLE IF NOT EXISTS ai_conversations (
  id            BIGSERIAL PRIMARY KEY,
  user_addr     TEXT,                      -- lowercase 0x… or NULL for anon
  route         TEXT NOT NULL,             -- '/ecosystem/[slug]' etc.
  role          TEXT,                      -- 'founder' | 'tester' | 'visitor' | 'admin'
  messages      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_user   ON ai_conversations (user_addr, last_used_at DESC) WHERE user_addr IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_conv_recent ON ai_conversations (last_used_at DESC);

CREATE TABLE IF NOT EXISTS ai_knowledge_base (
  id             BIGSERIAL PRIMARY KEY,
  topic          TEXT NOT NULL,                            -- e.g. 'arc-basics', 'usdc-on-arc', 'how-to-register'
  fact           TEXT NOT NULL,                            -- the one-line fact the AI cites
  source_url     TEXT,                                     -- where this came from (a page on ArcLens or external doc)
  added_by       TEXT NOT NULL DEFAULT 'system',           -- 'system' (seed script) | 'admin' | 'ai-self-fill'
  useful_count   INTEGER NOT NULL DEFAULT 0,               -- how often it was cited successfully
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic, fact)
);
CREATE INDEX IF NOT EXISTS idx_ai_kb_topic ON ai_knowledge_base (topic);

CREATE TABLE IF NOT EXISTS ai_knowledge_gaps (
  id            BIGSERIAL PRIMARY KEY,
  question      TEXT NOT NULL,
  user_addr     TEXT,
  route         TEXT,
  resolved_at   TIMESTAMPTZ,
  filled_kb_id  BIGINT REFERENCES ai_knowledge_base(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_gaps_open ON ai_knowledge_gaps (created_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS ai_actions (
  id             BIGSERIAL PRIMARY KEY,
  kind           TEXT NOT NULL,           -- 'pay_tester' | 'configure_tvl' | 'triage_dispute' | 'summarize' | etc.
  initiator      TEXT NOT NULL,           -- 'user_confirmed' | 'autonomous' | 'admin_confirmed'
  user_addr      TEXT,                    -- which user triggered (NULL if pure autonomous)
  payload        JSONB,                   -- task-specific: {to_wallet, amount, reason} for pay_tester
  tx_hash        TEXT,                    -- on-chain hash when applicable
  status         TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','succeeded','failed','skipped')),
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_actions_kind ON ai_actions (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_status ON ai_actions (status) WHERE status IN ('pending','failed');
`

async function main() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(SQL)
    await client.query("COMMIT")
    console.log("✓ AI migration committed.")

    const r = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN ('ai_conversations','ai_knowledge_base','ai_knowledge_gaps','ai_actions')
       ORDER BY table_name`,
    )
    console.log("\nTables present:")
    for (const row of r.rows) console.log("  ✓", row.table_name)
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("Migration failed:", e)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}
main()
