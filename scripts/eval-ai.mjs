// scripts/eval-ai.mjs
// ArcLens AI eval suite — deterministic data-layer checks (no LLM, no key needed).
// Catches the regressions that matter most: KB intact + embedded, stablecoins
// registered, headline data live, the tool queries sound, feedback path exists.
// Exits non-zero on any failure so it can gate a deploy / run in CI.
//
// Run:  node scripts/eval-ai.mjs
// (LLM-behavioural evals — "does 'top TVL' trigger a tool call, no hallucinated
//  numbers" — are the natural next layer; this guards the ground truth.)

import { readFileSync } from "node:fs"
import pg from "pg"
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

let pass = 0, fail = 0
const check = (name, ok, detail = "") => { if (ok) { pass++; console.log("  ✓", name) } else { fail++; console.log("  ✗", name, detail ? "— " + detail : "") } }
const q = async (sql, params = []) => (await pool.query(sql, params)).rows

try {
  // 1. Knowledge base: seeded + fully embedded (semantic search depends on it)
  const [kb] = await q(`SELECT COUNT(*)::int total, COUNT(embedding)::int embedded FROM ai_knowledge_base`)
  check("KB has >= 40 facts", kb.total >= 40, `total=${kb.total}`)
  check("KB fully embedded", kb.embedded === kb.total, `${kb.embedded}/${kb.total} embedded`)

  // 2. Stablecoins registry — USDC + EURC active (EURC drives TVL/volume EURC legs)
  const stables = (await q(`SELECT symbol FROM stablecoins WHERE active = true`)).map(r => r.symbol)
  check("USDC registered + active", stables.includes("USDC"))
  check("EURC registered + active", stables.includes("EURC"), `have: ${stables.join(",")}`)

  // 3. Headline data — Lunex tracking live (the demo + the announcement)
  const [lx] = await q(`SELECT tvl_usd_e6::text tvl, tvl_tracking_enabled, owner_wallet FROM projects WHERE id = 24`)
  check("Lunex TVL > 0", lx && BigInt(lx.tvl || "0") > 0n, `tvl_e6=${lx?.tvl}`)
  check("Lunex tracking enabled", lx?.tvl_tracking_enabled === true)
  check("Lunex has owner (builder attribution)", !!lx?.owner_wallet)

  // 4. Ecosystem stats tool invariants
  const [eco] = await q(`SELECT COUNT(*) FILTER (WHERE approved AND live)::int projects,
                                COALESCE(SUM(tvl_usd_e6) FILTER (WHERE approved AND live),0)::text tvl
                         FROM projects`)
  check("ecosystem has live projects", eco.projects > 0, `projects=${eco.projects}`)
  check("ecosystem total TVL > 0", BigInt(eco.tvl) > 0n)

  // 5. list_top_projects invariant — at least one ranked project with a value
  const top = await q(`SELECT name FROM projects WHERE approved AND live AND tvl_usd_e6 > 0 ORDER BY tvl_usd_e6 DESC LIMIT 1`)
  check("top-TVL ranking returns a project", top.length === 1, top[0]?.name)

  // 6. Feedback path exists (new ratings table)
  const [fb] = await q(`SELECT to_regclass('public.ai_feedback') IS NOT NULL AS exists`)
  check("ai_feedback table exists", fb.exists)

  // 7. No unresolved CRITICAL indexer alerts (warnings are fine)
  const [crit] = await q(`SELECT COUNT(*)::int n FROM indexer_alerts WHERE resolved_at IS NULL AND severity = 'critical'`)
  check("no critical open alerts", crit.n === 0, `${crit.n} critical`)

  console.log(`\n${pass} passed, ${fail} failed`)
} catch (e) {
  console.error("eval crashed:", e.message)
  fail++
} finally {
  await pool.end()
  process.exit(fail ? 1 : 0)
}
