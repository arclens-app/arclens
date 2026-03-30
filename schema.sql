-- schema.sql
-- Run this once against your Postgres database.
-- Local: psql -d arclens -f schema.sql
-- Neon/Supabase: paste in the SQL editor

-- ─── CONTRACT REGISTRY ────────────────────────────────────────────────────────
-- The core table. Every claimed contract lives here.

CREATE TABLE IF NOT EXISTS contracts (
  address          TEXT PRIMARY KEY,          -- lowercase, no checksum
  name             TEXT NOT NULL,
  type             TEXT,                       -- ERC-20, DEX, NFT, Staking...
  description      TEXT,
  logo_url         TEXT,                       -- Cloudflare R2 URL
  website          TEXT,
  twitter          TEXT,
  github           TEXT,
  audit_url        TEXT,
  source_code      TEXT,                       -- full flattened Solidity
  verified         BOOLEAN  DEFAULT false,
  flagged          BOOLEAN  DEFAULT false,
  flag_reason      TEXT,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deployer         TEXT,                       -- address that deployed it
  tx_count         BIGINT   DEFAULT 0,
  unique_users     BIGINT   DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_contracts_name     ON contracts (name);
CREATE INDEX IF NOT EXISTS idx_contracts_verified ON contracts (verified);
CREATE INDEX IF NOT EXISTS idx_contracts_type     ON contracts (type);
CREATE INDEX IF NOT EXISTS idx_contracts_tx_count ON contracts (tx_count DESC);

-- ─── FAST NAME LOOKUP CACHE ───────────────────────────────────────────────────
-- Used by the transaction feed to label "to" addresses without hitting
-- the full contracts table on every transaction.

CREATE TABLE IF NOT EXISTS contract_names_cache (
  address    TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  logo       TEXT,
  verified   BOOLEAN DEFAULT false,
  flagged    BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the cache when contracts table changes
CREATE OR REPLACE FUNCTION sync_names_cache()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO contract_names_cache (address, name, logo, verified, flagged)
  VALUES (NEW.address, NEW.name, NEW.logo_url, NEW.verified, NEW.flagged)
  ON CONFLICT (address) DO UPDATE SET
    name       = EXCLUDED.name,
    logo       = EXCLUDED.logo,
    verified   = EXCLUDED.verified,
    flagged    = EXCLUDED.flagged,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_cache ON contracts;
CREATE TRIGGER trigger_sync_cache
  AFTER INSERT OR UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION sync_names_cache();

-- ─── USDC TRANSFER INDEX ──────────────────────────────────────────────────────
-- Indexed from Arc Transfer events by the indexer.
-- Enables AI queries like "last 5 large USDC transactions".

CREATE TABLE IF NOT EXISTS usdc_transfers (
  id           BIGSERIAL PRIMARY KEY,
  tx_hash      TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  block_time   TIMESTAMPTZ NOT NULL,
  from_addr    TEXT NOT NULL,
  to_addr      TEXT NOT NULL,
  amount_raw   NUMERIC NOT NULL,            -- raw 6-decimal USDC units
  amount_usdc  NUMERIC GENERATED ALWAYS AS (amount_raw / 1000000) STORED,
  gas_usdc     NUMERIC,                     -- fee in USDC
  status       TEXT DEFAULT 'confirmed'
);

CREATE INDEX IF NOT EXISTS idx_transfers_block    ON usdc_transfers (block_number DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_from     ON usdc_transfers (from_addr);
CREATE INDEX IF NOT EXISTS idx_transfers_to       ON usdc_transfers (to_addr);
CREATE INDEX IF NOT EXISTS idx_transfers_amount   ON usdc_transfers (amount_usdc DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_time     ON usdc_transfers (block_time DESC);

-- ─── CONTRACT FLAGS / REPORTS ─────────────────────────────────────────────────
-- Community-submitted reports. Reviewed before applying to contracts.flagged.

CREATE TABLE IF NOT EXISTS contract_reports (
  id           BIGSERIAL PRIMARY KEY,
  address      TEXT NOT NULL,
  reporter     TEXT,                         -- reporter wallet address
  reason       TEXT NOT NULL,
  evidence     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  reviewed     BOOLEAN DEFAULT false,
  actioned     BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_reports_address ON contract_reports (address);

-- ─── SEED: KNOWN CONTRACTS ────────────────────────────────────────────────────
-- Pre-populate with contracts we know about.

INSERT INTO contracts (address, name, type, description, verified, tx_count)
VALUES
  ('0x3600000000000000000000000000000000000000', 'USDC', 'ERC-20', 'Official USD Coin — Arc native gas token, issued by Circle.', true, 0),
  ('0x0000000000000000000000000000000000000000', 'Zero Address', 'System', 'The zero address — used for contract creation transactions.', true, 0)
ON CONFLICT (address) DO NOTHING;
