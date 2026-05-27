import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function one(label, sql, params = []) {
  try {
    const r = await pool.query(sql, params)
    const v = r.rows[0] ? Object.values(r.rows[0])[0] : null
    console.log(`${label.padEnd(40)} ${v}`)
  } catch (e) { console.log(`${label.padEnd(40)} (ERR: ${e.message.slice(0,60)})`) }
}

console.log("\n=== Headline numbers (grant-relevant) ===\n")
await one("Projects (approved + live)",         "SELECT COUNT(*) FROM projects WHERE approved AND live")
await one("Projects (total submitted)",         "SELECT COUNT(*) FROM projects")
await one("Projects with owner (claimed)",      "SELECT COUNT(*) FROM projects WHERE owner_wallet IS NOT NULL")
await one("Contracts in registry (claimed)",    "SELECT COUNT(*) FROM contracts WHERE badge IN ('claimed','verified','official')")
await one("Contracts verified (source-code)",   "SELECT COUNT(*) FROM contracts WHERE badge='verified'")
await one("Campaigns (total)",                  "SELECT COUNT(*) FROM campaigns")
await one("Campaigns (active or activated)",    "SELECT COUNT(*) FROM campaigns WHERE status IN ('active','approved')")
await one("Total tester completions",           "SELECT COUNT(*) FROM campaign_completions")
await one("Unique testers (have completed)",    "SELECT COUNT(DISTINCT tester_wallet) FROM campaign_completions")
await one("Unique founders (own a project)",    "SELECT COUNT(DISTINCT owner_wallet) FROM projects WHERE owner_wallet IS NOT NULL")
await one("Builder profiles (have rep row)",    "SELECT COUNT(*) FROM tester_reputation")
await one("Reviewed completions",               "SELECT COUNT(*) FROM campaign_completions WHERE status='reviewed'")
await one("Total XP awarded (sum)",             "SELECT COALESCE(SUM(xp_earned),0) FROM campaign_completions WHERE xp_earned IS NOT NULL")
await one("USDC rewards delivered (sum, $)",    "SELECT COALESCE(SUM(reward_usdc_amount),0) FROM campaign_completions cc JOIN campaigns c ON c.id=cc.campaign_id WHERE cc.reward_delivered AND c.reward_type='usdc'")
await one("Reviews on projects (count)",        "SELECT COUNT(*) FROM reviews")
await one("Avg quality_score across reviewed",  "SELECT ROUND(AVG(quality_score)::numeric, 2) FROM campaign_completions WHERE quality_score IS NOT NULL")
await one("Project page views (week_num table)","SELECT COUNT(*) FROM project_views")
await one("DB tables (all)",                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")

console.log("\n=== Recent activity (last 30 days) ===\n")
await one("New projects (30d)",                 "SELECT COUNT(*) FROM projects WHERE created_at > NOW() - INTERVAL '30 days'")
await one("New campaigns (30d)",                "SELECT COUNT(*) FROM campaigns WHERE created_at > NOW() - INTERVAL '30 days'")
await one("New completions (30d)",              "SELECT COUNT(*) FROM campaign_completions WHERE created_at > NOW() - INTERVAL '30 days'")
await one("New completions (7d)",               "SELECT COUNT(*) FROM campaign_completions WHERE created_at > NOW() - INTERVAL '7 days'")
await one("Active testers (7d)",                "SELECT COUNT(DISTINCT tester_wallet) FROM campaign_completions WHERE created_at > NOW() - INTERVAL '7 days'")

await pool.end()
