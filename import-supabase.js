const { Pool } = require("pg")
const fs = require("fs")

const SUPABASE_URL = "postgresql://postgres:%40Obilekwu1999@db.kqozlrvlfowuxgzzlgim.supabase.co:5432/postgres"
const pool = new Pool({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } })

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  name text NOT NULL,
  tagline text, description text, category text, logo_url text,
  website text, twitter text, github text, discord text, contract text,
  featured boolean DEFAULT false, approved boolean DEFAULT false, live boolean DEFAULT true,
  launched_at date, created_at timestamptz DEFAULT now(),
  color text, email text, badge text DEFAULT 'approved',
  social_proof text, view_count integer DEFAULT 0, slug text,
  claim_token text, claim_token_expires timestamptz, claimed_at timestamptz,
  owner_email text, owner_wallet text, city text, country text,
  lat double precision, lng double precision
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  project_id integer NOT NULL, wallet text NOT NULL, category text NOT NULL,
  rating integer NOT NULL, review_text text NOT NULL,
  is_public boolean DEFAULT true, contact text,
  badge text DEFAULT 'unverified', created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  title varchar NOT NULL, tagline varchar, description text NOT NULL,
  project_id integer, project_name varchar, project_logo text,
  creator_wallet text NOT NULL, type varchar DEFAULT 'beta_test',
  tasks jsonb DEFAULT '[]', review_questions jsonb DEFAULT '[]',
  reward_type varchar DEFAULT 'other', reward_description text,
  total_slots integer, filled_slots integer DEFAULT 0,
  is_fcfs boolean DEFAULT true, min_rank integer DEFAULT 0,
  status varchar DEFAULT 'active', created_at timestamptz DEFAULT now(),
  expires_at timestamptz, updated_at timestamptz DEFAULT now(),
  reward_usdc_amount numeric, deposit_tx_hash text, rejection_reason text,
  contract_address text, campaign_logo text, app_url text, slug text
);

CREATE TABLE IF NOT EXISTS campaign_completions (
  id SERIAL PRIMARY KEY,
  campaign_id integer NOT NULL, tester_wallet text NOT NULL,
  tx_hashes text[] DEFAULT '{}', review_answers jsonb DEFAULT '{}',
  auto_score integer DEFAULT 0, builder_rating integer,
  quality_score numeric, status varchar DEFAULT 'pending',
  reward_delivered boolean DEFAULT false, created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz, contract_verified boolean DEFAULT false,
  provisional_score numeric
);

CREATE TABLE IF NOT EXISTS contracts (
  address text PRIMARY KEY, name text NOT NULL, type text, description text,
  logo_url text, website text, twitter text, github text,
  audit_url text, source_code text, verified boolean DEFAULT false,
  flagged boolean DEFAULT false, flag_reason text, verified_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deployer text, tx_count bigint DEFAULT 0, unique_users bigint DEFAULT 0,
  badge text DEFAULT 'claimed', email text
);

CREATE TABLE IF NOT EXISTS contract_names_cache (
  address text PRIMARY KEY, name text NOT NULL, logo text,
  verified boolean DEFAULT false, flagged boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract_reports (
  id BIGSERIAL PRIMARY KEY, address text NOT NULL, reporter text,
  reason text NOT NULL, evidence text, created_at timestamptz DEFAULT now(),
  reviewed boolean DEFAULT false, actioned boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY, name text NOT NULL, tagline text, type text,
  description text, date timestamptz, end_date timestamptz,
  timezone text DEFAULT 'UTC', location text, is_online boolean DEFAULT false,
  link text, logo_url text, organizer text, organizer_twitter text,
  email text, tags text[], badge text DEFAULT 'community',
  featured boolean DEFAULT false, approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pending_updates (
  id SERIAL PRIMARY KEY, project_id integer NOT NULL, field text NOT NULL,
  old_value text, new_value text, submitted_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS project_views (
  project_id integer NOT NULL, device_id text NOT NULL,
  viewed_at timestamptz DEFAULT now(), week_num integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tester_reputation (
  wallet text PRIMARY KEY, campaigns_completed integer DEFAULT 0,
  total_score numeric DEFAULT 0, avg_score numeric DEFAULT 0,
  rank integer DEFAULT 0, rank_points integer DEFAULT 0,
  impact_count integer DEFAULT 0, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), pfp_url text
);

CREATE TABLE IF NOT EXISTS indexed_transactions (
  hash text PRIMARY KEY, block_number bigint NOT NULL,
  block_time timestamptz NOT NULL, from_addr text NOT NULL,
  to_addr text, value_raw numeric DEFAULT 0, gas_used bigint DEFAULT 0,
  gas_price numeric DEFAULT 0, status text DEFAULT 'confirmed',
  is_usdc_xfer boolean DEFAULT false, usdc_amount numeric, usdc_to text
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key text PRIMARY KEY, value text NOT NULL
);

CREATE TABLE IF NOT EXISTS usdc_transfers (
  id BIGSERIAL PRIMARY KEY, tx_hash text NOT NULL, block_number bigint NOT NULL,
  block_time timestamptz NOT NULL, from_addr text NOT NULL,
  to_addr text NOT NULL, amount_raw numeric NOT NULL,
  amount_usdc numeric, gas_usdc numeric, status text DEFAULT 'confirmed'
);
`

async function run() {
  // Drop and recreate tables cleanly
  console.log("Creating tables...")
  const statements = SCHEMA.split(";").map(s => s.trim()).filter(s => s.length > 10)
  for (const stmt of statements) {
    try {
      await pool.query(stmt)
    } catch (e) {
      console.log("Schema error:", e.message.slice(0, 100))
    }
  }
  console.log("✓ Tables ready")

  // Import data in batches of 50
  console.log("Importing data...")
  const backup = fs.readFileSync("backup.sql", "utf8")
  const lines = backup.split("\n").map(l => l.trim()).filter(l => l.startsWith("INSERT INTO"))
  let success = 0, skip = 0
  const BATCH = 50
  for (let i = 0; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH)
    const combined = batch.join(";\n") + ";"
    try {
      await pool.query(combined)
      success += batch.length
    } catch (e) {
      // Batch failed — try one by one
      for (const line of batch) {
        try {
          await pool.query(line)
          success++
        } catch (e2) {
          skip++
          if (skip <= 3) console.log("Row skip:", e2.message.slice(0, 100))
        }
      }
    }
    if (i % 500 === 0) console.log(`  ${i}/${lines.length}...`)
  }
  console.log(`✓ ${success} rows imported, ${skip} skipped`)

  // Verify key tables
  const counts = await Promise.all([
    pool.query("SELECT COUNT(*) FROM projects"),
    pool.query("SELECT COUNT(*) FROM reviews"),
    pool.query("SELECT COUNT(*) FROM contracts"),
    pool.query("SELECT COUNT(*) FROM events"),
  ])
  console.log(`\nVerification:`)
  console.log(`  projects: ${counts[0].rows[0].count}`)
  console.log(`  reviews:  ${counts[1].rows[0].count}`)
  console.log(`  contracts: ${counts[2].rows[0].count}`)
  console.log(`  events:   ${counts[3].rows[0].count}`)

  await pool.end()
  console.log("\n✓ Done. Ready to update Vercel DATABASE_URL.")
}

run().catch(e => { console.error("FAILED:", e.message); process.exit(1) })
