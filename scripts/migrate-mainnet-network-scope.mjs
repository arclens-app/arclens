// Safely separates Arc testnet and mainnet data without deleting history.
// Rollout: backup -> --prepare -> deploy chain-aware app on testnet ->
// --finalize -> switch the app environment to mainnet and redeploy.

import { existsSync, readFileSync } from "node:fs"
import pg from "pg"

const TESTNET_CHAIN_ID = 5_042_002
const MAINNET_CHAIN_ID = 5_042
const preparing = process.argv.includes("--prepare")
const finalizing = process.argv.includes("--finalize")
const inspecting = process.argv.includes("--inspect")
const databaseSsl = process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }

if (preparing && finalizing) throw new Error("Choose either --prepare or --finalize, not both")
if (process.argv.includes("--apply")) {
  throw new Error("--apply was replaced by the safer two-stage flow: run --prepare, deploy the chain-aware app on testnet, then run --finalize")
}

const envPath = new URL("../.env.local", import.meta.url)
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8")
  for (const line of env.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const PREPARE_SQL = `
SELECT pg_advisory_xact_lock(hashtext('arclens-mainnet-network-scope-v2'));

-- Existing rows are historical Arc testnet data. This additive phase leaves
-- the currently deployed application operational.
ALTER TABLE stablecoins          ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE project_contracts    ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE indexer_cursors      ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE tvl_snapshots        ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE revenue_events       ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE revenue_daily        ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE volume_events        ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE volume_daily         ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE indexer_alerts       ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE indexed_transactions ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE contracts            ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE contract_names_cache ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE circle_wallet_users  ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE campaigns            ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE campaign_completions ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE campaign_completions ADD COLUMN IF NOT EXISTS profile_wallet TEXT;
ALTER TABLE reviews              ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE reviews              ADD COLUMN IF NOT EXISTS profile_wallet TEXT;
ALTER TABLE lens_payouts         ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE lens_premium         ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE projects             ADD COLUMN IF NOT EXISTS metrics_chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};
ALTER TABLE projects             ADD COLUMN IF NOT EXISTS subgraph_chain_id INTEGER NOT NULL DEFAULT ${TESTNET_CHAIN_ID};

-- A deployment record proves that a project is live on the selected network
-- without opting that contract into TVL, volume or revenue indexing.
ALTER TABLE project_contracts DROP CONSTRAINT IF EXISTS project_contracts_role_check;
ALTER TABLE project_contracts
  ADD CONSTRAINT project_contracts_role_check
  CHECK (role IN ('deployment', 'tvl', 'revenue', 'treasury', 'volume'));

-- ArcLens identity is separate from any one wallet. The normalized email is
-- private login data; public APIs never return this table. Circle TEST and LIVE
-- wallet rows for the same verified email point to the same account.
CREATE TABLE IF NOT EXISTS arclens_accounts (
  id               BIGSERIAL PRIMARY KEY,
  normalized_email TEXT NOT NULL UNIQUE,
  primary_wallet   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE arclens_accounts ADD COLUMN IF NOT EXISTS primary_wallet TEXT;
ALTER TABLE circle_wallet_users ADD COLUMN IF NOT EXISTS account_id BIGINT REFERENCES arclens_accounts(id);

INSERT INTO arclens_accounts (normalized_email)
SELECT DISTINCT LOWER(TRIM(email))
FROM circle_wallet_users
WHERE email IS NOT NULL AND TRIM(email) <> ''
ON CONFLICT (normalized_email) DO NOTHING;

UPDATE circle_wallet_users c
SET account_id = a.id
FROM arclens_accounts a
WHERE c.account_id IS NULL AND LOWER(TRIM(c.email)) = a.normalized_email;

-- tester_wallet / wallet remain the original proof authors. Browser-wallet
-- addresses stay valid across EVM networks. Historical Circle TEST addresses
-- remain private until the user verifies and receives their LIVE wallet.
UPDATE campaign_completions cc
SET profile_wallet = CASE
  WHEN EXISTS (
    SELECT 1 FROM circle_wallet_users cwu
    WHERE LOWER(cwu.wallet_address) = LOWER(cc.tester_wallet)
  ) THEN NULL
  ELSE LOWER(cc.tester_wallet)
END
WHERE profile_wallet IS NULL;

UPDATE reviews r
SET profile_wallet = CASE
  WHEN EXISTS (
    SELECT 1 FROM circle_wallet_users cwu
    WHERE LOWER(cwu.wallet_address) = LOWER(r.wallet)
  ) THEN NULL
  ELSE LOWER(r.wallet)
END
WHERE profile_wallet IS NULL;

-- Add network-aware uniqueness before removing any legacy constraint. The new
-- code can therefore deploy safely while the site still targets testnet.
CREATE UNIQUE INDEX IF NOT EXISTS stablecoins_chain_address_key ON stablecoins (chain_id, LOWER(address));
CREATE UNIQUE INDEX IF NOT EXISTS stablecoins_chain_symbol_key ON stablecoins (chain_id, LOWER(symbol));
CREATE UNIQUE INDEX IF NOT EXISTS project_contracts_chain_project_address_role_key ON project_contracts (chain_id, project_id, LOWER(address), role);
CREATE UNIQUE INDEX IF NOT EXISTS indexer_cursors_chain_kind_stablecoin_key ON indexer_cursors (chain_id, kind, stablecoin_id);
CREATE UNIQUE INDEX IF NOT EXISTS revenue_events_chain_tx_log_key ON revenue_events (chain_id, LOWER(tx_hash), log_index);
CREATE UNIQUE INDEX IF NOT EXISTS volume_events_chain_tx_log_key ON volume_events (chain_id, LOWER(tx_hash), log_index);
CREATE UNIQUE INDEX IF NOT EXISTS revenue_daily_chain_project_day_key ON revenue_daily (chain_id, project_id, day);
CREATE UNIQUE INDEX IF NOT EXISTS volume_daily_chain_project_day_key ON volume_daily (chain_id, project_id, day);
CREATE UNIQUE INDEX IF NOT EXISTS tvl_snapshots_chain_project_block_key ON tvl_snapshots (chain_id, project_id, block_number);
CREATE UNIQUE INDEX IF NOT EXISTS indexed_transactions_chain_hash_key ON indexed_transactions (chain_id, hash);
CREATE UNIQUE INDEX IF NOT EXISTS contracts_chain_address_key ON contracts (chain_id, address);
CREATE UNIQUE INDEX IF NOT EXISTS contract_names_cache_chain_address_key ON contract_names_cache (chain_id, address);
CREATE UNIQUE INDEX IF NOT EXISTS circle_wallet_users_chain_email_key ON circle_wallet_users (chain_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_chain_slug_key ON campaigns (chain_id, LOWER(slug));
CREATE UNIQUE INDEX IF NOT EXISTS campaign_completions_chain_campaign_tester_key ON campaign_completions (chain_id, campaign_id, LOWER(tester_wallet));
CREATE UNIQUE INDEX IF NOT EXISTS reviews_chain_project_wallet_key ON reviews (chain_id, project_id, LOWER(wallet));

CREATE INDEX IF NOT EXISTS indexed_transactions_chain_block ON indexed_transactions (chain_id, block_number DESC);
CREATE INDEX IF NOT EXISTS project_contracts_chain_project ON project_contracts (chain_id, project_id);
CREATE INDEX IF NOT EXISTS campaigns_chain_status ON campaigns (chain_id, status);
CREATE INDEX IF NOT EXISTS reviews_chain_project ON reviews (chain_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lens_payouts_chain_created ON lens_payouts (chain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lens_premium_chain_created ON lens_premium (chain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS circle_wallet_users_account_idx ON circle_wallet_users (account_id);
CREATE INDEX IF NOT EXISTS campaign_completions_profile_wallet_idx ON campaign_completions (LOWER(profile_wallet), created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_profile_wallet_idx ON reviews (LOWER(profile_wallet), created_at DESC);
`

const FINALIZE_SQL = `
SELECT pg_advisory_xact_lock(hashtext('arclens-mainnet-network-scope-v2'));

-- Run only after the chain-aware application has deployed successfully on
-- testnet. The composite indexes above continue enforcing uniqueness.
ALTER TABLE stablecoins DROP CONSTRAINT IF EXISTS stablecoins_address_key;
ALTER TABLE stablecoins DROP CONSTRAINT IF EXISTS stablecoins_symbol_key;
ALTER TABLE project_contracts DROP CONSTRAINT IF EXISTS project_contracts_project_id_address_role_key;
ALTER TABLE indexer_cursors DROP CONSTRAINT IF EXISTS indexer_cursors_pkey;
ALTER TABLE revenue_events DROP CONSTRAINT IF EXISTS revenue_events_tx_hash_log_index_key;
ALTER TABLE volume_events DROP CONSTRAINT IF EXISTS volume_events_tx_hash_log_index_key;
ALTER TABLE revenue_daily DROP CONSTRAINT IF EXISTS revenue_daily_pkey;
ALTER TABLE volume_daily DROP CONSTRAINT IF EXISTS volume_daily_pkey;
ALTER TABLE tvl_snapshots DROP CONSTRAINT IF EXISTS tvl_snapshots_project_id_block_number_key;
ALTER TABLE indexed_transactions DROP CONSTRAINT IF EXISTS indexed_transactions_pkey;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_pkey;
ALTER TABLE contract_names_cache DROP CONSTRAINT IF EXISTS contract_names_cache_pkey;
ALTER TABLE contract_names_cache DROP CONSTRAINT IF EXISTS contract_names_cache_address_key;
ALTER TABLE circle_wallet_users DROP CONSTRAINT IF EXISTS circle_wallet_users_email_key;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_slug_key;
ALTER TABLE campaign_completions DROP CONSTRAINT IF EXISTS campaign_completions_campaign_id_tester_wallet_key;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_project_id_wallet_key;

-- A testnet campaign cannot safely accept mainnet proofs or real rewards.
-- Close only the still-active historical campaigns; they remain visible in
-- the same ended-campaign history with all submissions and reputation intact.
UPDATE campaigns
   SET status = 'ended',
       ended_at = COALESCE(ended_at, NOW()),
       ended_reason = COALESCE(ended_reason, 'network_transition')
 WHERE chain_id = ${TESTNET_CHAIN_ID} AND status = 'active';

-- Mainnet assets get separate rows. No historical record is removed.
INSERT INTO stablecoins (chain_id, address, symbol, name, decimals, peg_currency, active, notes)
VALUES
  (${MAINNET_CHAIN_ID}, '0x3600000000000000000000000000000000000000', 'USDC', 'USD Coin', 6, 'USD', true, 'Arc mainnet native USDC ERC-20 interface'),
  (${MAINNET_CHAIN_ID}, '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1', 'EURC', 'Euro Coin', 6, 'EUR', true, 'Arc mainnet EURC'),
  (${MAINNET_CHAIN_ID}, '0x171a4217b86a807a64eb94757db6849fb4bdbaa0', 'cirBTC', 'Circle Wrapped Bitcoin', 8, 'BTC', true, 'Arc mainnet Circle Wrapped Bitcoin')
ON CONFLICT (chain_id, LOWER(address)) DO NOTHING;
`

console.log("ArcLens mainnet network-scope migration")
console.log(`Historical rows remain Arc testnet: ${TESTNET_CHAIN_ID}`)
console.log(`New mainnet rows use: ${MAINNET_CHAIN_ID}`)

if (inspecting) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
  const inspectPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: databaseSsl })
  try {
    const tables = ["stablecoins", "project_contracts", "indexer_cursors", "tvl_snapshots", "revenue_events", "revenue_daily", "volume_events", "volume_daily", "indexed_transactions", "contracts", "contract_names_cache", "circle_wallet_users", "campaigns", "campaign_completions", "reviews", "lens_payouts", "lens_premium", "arclens_accounts"]
    const [columns, constraints, indexes, duplicates] = await Promise.all([
      inspectPool.query(`SELECT table_name, column_name, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1) AND column_name IN ('chain_id','metrics_chain_id','subgraph_chain_id','account_id','profile_wallet') ORDER BY table_name, column_name`, [tables.concat("projects")]),
      inspectPool.query(`SELECT table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema='public' AND table_name = ANY($1) ORDER BY table_name, constraint_name`, [tables]),
      inspectPool.query(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename = ANY($1) ORDER BY tablename, indexname`, [tables]),
      inspectPool.query(`
        SELECT 'contracts.address' AS key, COUNT(*)::int AS duplicate_groups FROM (SELECT LOWER(address) FROM contracts GROUP BY LOWER(address) HAVING COUNT(*) > 1) d
        UNION ALL SELECT 'contract_names_cache.address', COUNT(*)::int FROM (SELECT LOWER(address) FROM contract_names_cache GROUP BY LOWER(address) HAVING COUNT(*) > 1) d
        UNION ALL SELECT 'indexed_transactions.hash', COUNT(*)::int FROM (SELECT LOWER(hash) FROM indexed_transactions GROUP BY LOWER(hash) HAVING COUNT(*) > 1) d
        UNION ALL SELECT 'campaigns.slug', COUNT(*)::int FROM (SELECT LOWER(slug) FROM campaigns WHERE slug IS NOT NULL GROUP BY LOWER(slug) HAVING COUNT(*) > 1) d
        UNION ALL SELECT 'campaign_completions.campaign_wallet', COUNT(*)::int FROM (SELECT campaign_id, LOWER(tester_wallet) FROM campaign_completions GROUP BY campaign_id, LOWER(tester_wallet) HAVING COUNT(*) > 1) d
        UNION ALL SELECT 'reviews.project_wallet', COUNT(*)::int FROM (SELECT project_id, LOWER(wallet) FROM reviews GROUP BY project_id, LOWER(wallet) HAVING COUNT(*) > 1) d
        UNION ALL SELECT 'tvl_snapshots.project_block', COUNT(*)::int FROM (SELECT project_id, block_number FROM tvl_snapshots GROUP BY project_id, block_number HAVING COUNT(*) > 1) d
      `),
    ])
    console.log(JSON.stringify({ columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, duplicates: duplicates.rows }, null, 2))
  } finally {
    await inspectPool.end()
  }
  process.exit(0)
}

if (!preparing && !finalizing) {
  console.log("\nPREVIEW ONLY — no database connection was opened and no data was changed.")
  console.log("Phase 1: --prepare adds network columns and compatible indexes.")
  console.log("Phase 2: --finalize removes legacy uniqueness and inserts mainnet assets.")
  process.exit(0)
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
const phase = preparing ? "prepare" : "finalize"
const sql = preparing ? PREPARE_SQL : FINALIZE_SQL
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: databaseSsl })
const client = await pool.connect()
try {
  await client.query("BEGIN")
  await client.query(sql)
  await client.query("COMMIT")
  console.log(`Migration ${phase} phase committed successfully.`)
} catch (error) {
  await client.query("ROLLBACK")
  console.error(`Migration ${phase} phase rolled back; no partial schema change was kept.`)
  throw error
} finally {
  client.release()
  await pool.end()
}
