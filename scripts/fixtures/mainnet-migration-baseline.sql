CREATE TABLE stablecoins (
  id SERIAL PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT,
  decimals INTEGER,
  peg_currency TEXT,
  active BOOLEAN DEFAULT true,
  notes TEXT
);

CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT,
  owner_wallet TEXT,
  approved BOOLEAN DEFAULT true,
  live BOOLEAN DEFAULT true
);

CREATE TABLE project_contracts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  address TEXT NOT NULL,
  role TEXT NOT NULL,
  UNIQUE (project_id, address, role),
  CONSTRAINT project_contracts_role_check CHECK (role IN ('tvl', 'revenue', 'treasury', 'volume'))
);

CREATE TABLE indexer_cursors (
  kind TEXT NOT NULL,
  stablecoin_id INTEGER NOT NULL,
  last_block BIGINT,
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (kind, stablecoin_id)
);

CREATE TABLE tvl_snapshots (
  project_id INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_time TIMESTAMPTZ,
  total_usd_e6 BIGINT,
  breakdown JSONB,
  PRIMARY KEY (project_id, block_number)
);

CREATE TABLE revenue_events (
  id SERIAL PRIMARY KEY,
  project_id INTEGER,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE revenue_daily (
  project_id INTEGER NOT NULL,
  day DATE NOT NULL,
  total_usd_e6 BIGINT,
  event_count INTEGER,
  PRIMARY KEY (project_id, day)
);

CREATE TABLE volume_events (
  id SERIAL PRIMARY KEY,
  project_id INTEGER,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE volume_daily (
  project_id INTEGER NOT NULL,
  day DATE NOT NULL,
  total_usd_e6 BIGINT,
  event_count INTEGER,
  PRIMARY KEY (project_id, day)
);

CREATE TABLE indexer_alerts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER,
  kind TEXT,
  severity TEXT,
  message TEXT,
  details JSONB
);

CREATE TABLE indexed_transactions (
  hash TEXT PRIMARY KEY,
  block_number BIGINT
);

CREATE TABLE contracts (
  address TEXT PRIMARY KEY,
  name TEXT,
  deployer TEXT,
  verified BOOLEAN DEFAULT false,
  flagged BOOLEAN DEFAULT false
);

CREATE TABLE contract_names_cache (
  address TEXT PRIMARY KEY,
  name TEXT,
  logo TEXT,
  verified BOOLEAN DEFAULT false,
  flagged BOOLEAN DEFAULT false
);

CREATE TABLE circle_wallet_users (
  email TEXT NOT NULL UNIQUE,
  circle_user_id TEXT,
  wallet_id TEXT,
  wallet_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  creator_wallet TEXT,
  status TEXT,
  ended_at TIMESTAMPTZ,
  ended_reason TEXT
);

CREATE TABLE campaign_completions (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  tester_wallet TEXT NOT NULL,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, tester_wallet)
);

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  wallet TEXT NOT NULL,
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, wallet)
);

CREATE TABLE lens_payouts (
  id SERIAL PRIMARY KEY,
  builder_wallet TEXT,
  project_slug TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lens_premium (
  id SERIAL PRIMARY KEY,
  asker_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO stablecoins (address, symbol, name, decimals, peg_currency)
VALUES ('0x3600000000000000000000000000000000000000', 'USDC', 'Testnet USDC', 6, 'USD');

INSERT INTO projects (slug, name, owner_wallet)
VALUES ('legacy-project', 'Legacy Project', '0x1111111111111111111111111111111111111111');

INSERT INTO circle_wallet_users (email, circle_user_id, wallet_id, wallet_address)
VALUES ('founder@example.com', 'test-user', 'test-wallet', '0x1111111111111111111111111111111111111111');

INSERT INTO campaigns (slug, title, creator_wallet, status)
VALUES ('legacy-campaign', 'Legacy Campaign', '0x1111111111111111111111111111111111111111', 'active');

INSERT INTO campaign_completions (campaign_id, tester_wallet, status)
VALUES
  (1, '0x1111111111111111111111111111111111111111', 'reviewed'),
  (1, '0x2222222222222222222222222222222222222222', 'reviewed');

INSERT INTO reviews (project_id, wallet, review_text)
VALUES
  (1, '0x1111111111111111111111111111111111111111', 'Circle test wallet review'),
  (1, '0x2222222222222222222222222222222222222222', 'Browser wallet review');

INSERT INTO project_contracts (project_id, address, role)
VALUES (1, '0x3333333333333333333333333333333333333333', 'tvl');

INSERT INTO indexed_transactions (hash, block_number)
VALUES ('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 123);
