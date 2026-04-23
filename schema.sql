CREATE TABLE IF NOT EXISTS campaign_completions (
  id integer DEFAULT nextval('campaign_completions_id_seq'::regclass) NOT NULL,
  campaign_id integer NOT NULL,
  tester_wallet text NOT NULL,
  tx_hashes ARRAY DEFAULT '{}'::text[] NOT NULL,
  review_answers jsonb DEFAULT '{}'::jsonb NOT NULL,
  auto_score integer DEFAULT 0 NOT NULL,
  builder_rating integer,
  quality_score numeric,
  status character varying DEFAULT 'pending'::character varying NOT NULL,
  reward_delivered boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at timestamp with time zone,
  contract_verified boolean DEFAULT false,
  provisional_score numeric
);

CREATE TABLE IF NOT EXISTS campaigns (
  id integer DEFAULT nextval('campaigns_id_seq'::regclass) NOT NULL,
  title character varying NOT NULL,
  tagline character varying,
  description text NOT NULL,
  project_id integer,
  project_name character varying,
  project_logo text,
  creator_wallet text NOT NULL,
  type character varying DEFAULT 'beta_test'::character varying NOT NULL,
  tasks jsonb DEFAULT '[]'::jsonb NOT NULL,
  review_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
  reward_type character varying DEFAULT 'other'::character varying NOT NULL,
  reward_description text,
  total_slots integer,
  filled_slots integer DEFAULT 0 NOT NULL,
  is_fcfs boolean DEFAULT true NOT NULL,
  min_rank integer DEFAULT 0 NOT NULL,
  status character varying DEFAULT 'active'::character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  reward_usdc_amount numeric,
  deposit_tx_hash text,
  rejection_reason text,
  contract_address text,
  campaign_logo text,
  app_url text,
  slug text
);

CREATE TABLE IF NOT EXISTS contract_names_cache (
  address text NOT NULL,
  name text NOT NULL,
  logo text,
  verified boolean DEFAULT false,
  flagged boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract_reports (
  id bigint DEFAULT nextval('contract_reports_id_seq'::regclass) NOT NULL,
  address text NOT NULL,
  reporter text,
  reason text NOT NULL,
  evidence text,
  created_at timestamp with time zone DEFAULT now(),
  reviewed boolean DEFAULT false,
  actioned boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS contracts (
  address text NOT NULL,
  name text NOT NULL,
  type text,
  description text,
  logo_url text,
  website text,
  twitter text,
  github text,
  audit_url text,
  source_code text,
  verified boolean DEFAULT false,
  flagged boolean DEFAULT false,
  flag_reason text,
  verified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deployer text,
  tx_count bigint DEFAULT 0,
  unique_users bigint DEFAULT 0,
  badge text DEFAULT 'claimed'::text,
  email text
);

CREATE TABLE IF NOT EXISTS events (
  id integer DEFAULT nextval('events_id_seq'::regclass) NOT NULL,
  name text NOT NULL,
  tagline text,
  type text,
  description text,
  date timestamp with time zone,
  end_date timestamp with time zone,
  timezone text DEFAULT 'UTC'::text,
  location text,
  is_online boolean DEFAULT false,
  link text,
  logo_url text,
  organizer text,
  organizer_twitter text,
  email text,
  tags ARRAY,
  badge text DEFAULT 'community'::text,
  featured boolean DEFAULT false,
  approved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexed_transactions (
  hash text NOT NULL,
  block_number bigint NOT NULL,
  block_time timestamp with time zone NOT NULL,
  from_addr text NOT NULL,
  to_addr text,
  value_raw numeric DEFAULT 0,
  gas_used bigint DEFAULT 0,
  gas_price numeric DEFAULT 0,
  status text DEFAULT 'confirmed'::text,
  is_usdc_xfer boolean DEFAULT false,
  usdc_amount numeric,
  usdc_to text
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key text NOT NULL,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_updates (
  id integer DEFAULT nextval('pending_updates_id_seq'::regclass) NOT NULL,
  project_id integer NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  submitted_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'pending'::text
);

CREATE TABLE IF NOT EXISTS project_views (
  project_id integer NOT NULL,
  device_id text NOT NULL,
  viewed_at timestamp with time zone DEFAULT now(),
  week_num integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id bigint DEFAULT nextval('projects_id_seq'::regclass) NOT NULL,
  name text NOT NULL,
  tagline text,
  description text,
  category text,
  logo_url text,
  website text,
  twitter text,
  github text,
  discord text,
  contract text,
  featured boolean DEFAULT false,
  approved boolean DEFAULT false,
  live boolean DEFAULT true,
  launched_at date,
  created_at timestamp with time zone DEFAULT now(),
  color text,
  email text,
  badge text DEFAULT 'approved'::text,
  social_proof text,
  view_count integer DEFAULT 0,
  slug text,
  claim_token text,
  claim_token_expires timestamp with time zone,
  claimed_at timestamp with time zone,
  owner_email text,
  owner_wallet text,
  city text,
  country text,
  lat double precision,
  lng double precision
);

CREATE TABLE IF NOT EXISTS reviews (
  id integer DEFAULT nextval('reviews_id_seq'::regclass) NOT NULL,
  project_id integer NOT NULL,
  wallet text NOT NULL,
  category text NOT NULL,
  rating integer NOT NULL,
  review_text text NOT NULL,
  is_public boolean DEFAULT true,
  contact text,
  badge text DEFAULT 'unverified'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tester_reputation (
  wallet text NOT NULL,
  campaigns_completed integer DEFAULT 0 NOT NULL,
  total_score numeric DEFAULT 0 NOT NULL,
  avg_score numeric DEFAULT 0 NOT NULL,
  rank integer DEFAULT 0 NOT NULL,
  rank_points integer DEFAULT 0 NOT NULL,
  impact_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  pfp_url text
);

CREATE TABLE IF NOT EXISTS usdc_transfers (
  id bigint DEFAULT nextval('usdc_transfers_id_seq'::regclass) NOT NULL,
  tx_hash text NOT NULL,
  block_number bigint NOT NULL,
  block_time timestamp with time zone NOT NULL,
  from_addr text NOT NULL,
  to_addr text NOT NULL,
  amount_raw numeric NOT NULL,
  amount_usdc numeric,
  gas_usdc numeric,
  status text DEFAULT 'confirmed'::text
);

