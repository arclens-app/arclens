import pg from "pg"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
const TESTNET = 5_042_002
const MAINNET = 5_042
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0]

  const historical = await one(`
    SELECT
      (SELECT COUNT(*)::int FROM campaigns WHERE chain_id=$1) campaigns,
      (SELECT COUNT(*)::int FROM campaign_completions WHERE chain_id=$1) completions,
      (SELECT COUNT(*)::int FROM reviews WHERE chain_id=$1) reviews,
      (SELECT COUNT(*)::int FROM indexed_transactions WHERE chain_id=$1) transactions
  `, [TESTNET])
  assert(historical.campaigns === 1, "historical campaign was not preserved")
  assert(historical.completions === 2, "historical completions were not preserved")
  assert(historical.reviews === 2, "historical reviews were not preserved")
  assert(historical.transactions === 1, "historical transaction was not preserved")

  const campaign = await one(`SELECT status, ended_reason FROM campaigns WHERE slug='legacy-campaign'`)
  assert(campaign.status === "ended", "active testnet campaign was not safely ended")
  assert(campaign.ended_reason === "network_transition", "campaign transition reason is missing")

  const account = await one(`
    SELECT a.normalized_email, c.account_id
      FROM arclens_accounts a
      JOIN circle_wallet_users c ON c.account_id=a.id
     WHERE a.normalized_email='founder@example.com' AND c.chain_id=$1
  `, [TESTNET])
  assert(account?.account_id, "historical Circle identity was not linked to an ArcLens account")

  const profiles = await pool.query(`
    SELECT tester_wallet, profile_wallet FROM campaign_completions ORDER BY id
  `)
  assert(profiles.rows[0].profile_wallet === null, "testnet Circle wallet leaked into the current public profile")
  assert(profiles.rows[1].profile_wallet === "0x2222222222222222222222222222222222222222", "browser-wallet profile was not preserved")

  const reviewProfiles = await pool.query(`SELECT wallet, profile_wallet FROM reviews ORDER BY id`)
  assert(reviewProfiles.rows[0].profile_wallet === null, "testnet Circle review identity was not hidden pending migration")
  assert(reviewProfiles.rows[1].profile_wallet === "0x2222222222222222222222222222222222222222", "browser-wallet review identity was not preserved")

  const mainnetAssets = await one(`SELECT COUNT(*)::int count FROM stablecoins WHERE chain_id=$1`, [MAINNET])
  assert(mainnetAssets.count === 3, "mainnet stablecoins were not seeded")

  // The same logical identifiers must coexist across networks after finalize.
  await pool.query(`INSERT INTO circle_wallet_users (email,circle_user_id,wallet_address,chain_id,account_id) VALUES ('founder@example.com','live-user','0x4444444444444444444444444444444444444444',$1,$2)`, [MAINNET, account.account_id])
  await pool.query(`INSERT INTO campaigns (slug,title,creator_wallet,status,chain_id) VALUES ('legacy-campaign','Mainnet Campaign','0x4444444444444444444444444444444444444444','pending_approval',$1)`, [MAINNET])
  await pool.query(`INSERT INTO indexed_transactions (hash,block_number,chain_id) VALUES ('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',456,$1)`, [MAINNET])
  await pool.query(`INSERT INTO project_contracts (project_id,address,role,chain_id) VALUES (1,'0x3333333333333333333333333333333333333333','tvl',$1)`, [MAINNET])

  const coexist = await one(`
    SELECT
      (SELECT COUNT(*)::int FROM circle_wallet_users WHERE email='founder@example.com') wallets,
      (SELECT COUNT(*)::int FROM campaigns WHERE slug='legacy-campaign') campaigns,
      (SELECT COUNT(*)::int FROM indexed_transactions WHERE hash='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') transactions,
      (SELECT COUNT(*)::int FROM project_contracts WHERE address='0x3333333333333333333333333333333333333333') contracts
  `)
  assert(Object.values(coexist).every(value => value === 2), "testnet and mainnet records cannot coexist")

  const role = await one(`
    INSERT INTO project_contracts (project_id,address,role,chain_id)
    VALUES (1,'0x5555555555555555555555555555555555555555','deployment',$1)
    RETURNING role
  `, [MAINNET])
  assert(role.role === "deployment", "mainnet deployment role was not enabled")

  console.log(JSON.stringify({
    migration: "passed",
    historical,
    mainnetAssets: mainnetAssets.count,
    crossNetworkCoexistence: coexist,
    circleIdentityLinked: true,
    browserWalletHistoryPreserved: true,
  }))
} finally {
  await pool.end()
}
