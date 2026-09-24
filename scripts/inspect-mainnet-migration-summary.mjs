import { existsSync, readFileSync } from "node:fs"
import pg from "pg"

const envPath = new URL("../.env.local", import.meta.url)
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

try {
  const rows = async (sql) => (await pool.query(sql)).rows
  const summary = {
    campaigns: await rows(`
      SELECT chain_id, status, COUNT(*)::int AS count
      FROM campaigns GROUP BY chain_id, status ORDER BY chain_id, status
    `),
    circleWallets: await rows(`
      SELECT chain_id, COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE account_id IS NULL)::int AS unlinked
      FROM circle_wallet_users GROUP BY chain_id ORDER BY chain_id
    `),
    projectContracts: await rows(`
      SELECT chain_id, COUNT(*)::int AS count
      FROM project_contracts GROUP BY chain_id ORDER BY chain_id
    `),
    stablecoins: await rows(`
      SELECT chain_id, COUNT(*)::int AS count
      FROM stablecoins GROUP BY chain_id ORDER BY chain_id
    `),
    profileAliases: (await rows(`
      SELECT
        (SELECT COUNT(*)::int
           FROM campaign_completions cc
          WHERE cc.profile_wallet IS NULL
            AND EXISTS (
              SELECT 1 FROM circle_wallet_users cwu
               WHERE LOWER(cwu.wallet_address) = LOWER(cc.tester_wallet)
            )) AS completions_awaiting_circle_mainnet_wallet,
        (SELECT COUNT(*)::int
           FROM campaign_completions cc
          WHERE cc.profile_wallet IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM circle_wallet_users cwu
               WHERE LOWER(cwu.wallet_address) = LOWER(cc.tester_wallet)
            )) AS unexpected_completion_nulls,
        (SELECT COUNT(*)::int
           FROM reviews r
          WHERE r.profile_wallet IS NULL
            AND EXISTS (
              SELECT 1 FROM circle_wallet_users cwu
               WHERE LOWER(cwu.wallet_address) = LOWER(r.wallet)
            )) AS reviews_awaiting_circle_mainnet_wallet,
        (SELECT COUNT(*)::int
           FROM reviews r
          WHERE r.profile_wallet IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM circle_wallet_users cwu
               WHERE LOWER(cwu.wallet_address) = LOWER(r.wallet)
            )) AS unexpected_review_nulls
    `))[0],
  }
  console.log(JSON.stringify(summary))
} finally {
  await pool.end()
}
