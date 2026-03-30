'use server'
// src/lib/db.ts
// Contract registry â€” Postgres via the `pg` npm package.
// Run: npm install pg @types/pg
//
// Schema (run once):
//
//   CREATE TABLE contracts (
//     address       TEXT PRIMARY KEY,           -- lowercase checksummed
//     name          TEXT NOT NULL,
//     type          TEXT,                        -- ERC-20, DEX, NFT, etc.
//     description   TEXT,
//     logo_url      TEXT,                        -- uploaded to R2/S3
//     website       TEXT,
//     twitter       TEXT,
//     github        TEXT,
//     audit_url     TEXT,
//     source_code   TEXT,
//     verified      BOOLEAN DEFAULT false,
//     flagged       BOOLEAN DEFAULT false,
//     flag_reason   TEXT,
//     verified_at   TIMESTAMPTZ,
//     created_at    TIMESTAMPTZ DEFAULT NOW(),
//     deployer      TEXT,                        -- address that deployed it
//     tx_count      BIGINT DEFAULT 0
//   );
//
//   CREATE INDEX idx_contracts_name ON contracts (name);
//   CREATE INDEX idx_contracts_verified ON contracts (verified);
//
//   -- Name cache: pre-loaded for fast tx row lookups
//   CREATE TABLE contract_names_cache (
//     address TEXT PRIMARY KEY,
//     name    TEXT NOT NULL,
//     logo    TEXT,
//     verified BOOLEAN,
//     flagged  BOOLEAN,
//     updated_at TIMESTAMPTZ DEFAULT NOW()
//   );

import { Pool } from "pg"

// Singleton connection pool
let _pool: Pool | null = null

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    })
  }
  return _pool
}

// â”€â”€â”€ TYPES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ContractIdentity {
  address:     string
  name:        string
  type?:       string
  description?: string
  logo_url?:   string
  website?:    string
  twitter?:    string
  github?:     string
  audit_url?:  string
  verified:    boolean
  flagged:     boolean
  flag_reason?: string
  verified_at?: Date
  created_at:  Date
  deployer?:   string
  tx_count:    number
}

export interface ContractNameResult {
  address:  string
  name:     string
  logo?:    string
  verified: boolean
  flagged:  boolean
}

// â”€â”€â”€ READS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Look up a contract by address.
 * Returns null if not in registry (unverified / unclaimed).
 */
export async function getContractIdentity(
  address: string
): Promise<ContractIdentity | null> {
  const pool   = getPool()
  const result = await pool.query<ContractIdentity>(
    "SELECT * FROM contracts WHERE address = $1",
    [address.toLowerCase()]
  )
  return result.rows[0] ?? null
}

/**
 * Bulk name lookup for a list of addresses.
 * Used by the transaction feed to label every "to" address.
 * Fast â€” hits the names_cache table, not the full contracts table.
 *
 * Returns a Map<address, ContractNameResult> for O(1) lookups.
 */
export async function getContractNames(
  addresses: string[]
): Promise<Map<string, ContractNameResult>> {
  if (!addresses.length) return new Map()

  const pool   = getPool()
  const lower  = addresses.map(a => a.toLowerCase())
  const result = await pool.query<ContractNameResult>(
    `SELECT address, name, logo, verified, flagged
     FROM contract_names_cache
     WHERE address = ANY($1)`,
    [lower]
  )

  const map = new Map<string, ContractNameResult>()
  result.rows.forEach(row => map.set(row.address, row))
  return map
}

/**
 * Search contracts by name (fuzzy, case-insensitive).
 * Used by the search bar for name-based lookups.
 */
export async function searchContractsByName(
  query: string,
  limit = 10
): Promise<ContractIdentity[]> {
  const pool   = getPool()
  const result = await pool.query<ContractIdentity>(
    `SELECT * FROM contracts
     WHERE name ILIKE $1 AND NOT flagged
     ORDER BY tx_count DESC
     LIMIT $2`,
    [`%${query}%`, limit]
  )
  return result.rows
}

/**
 * Get all verified contracts for the Ecosystem page.
 */
export async function getAllVerifiedContracts(
  category?: string
): Promise<ContractIdentity[]> {
  const pool = getPool()
  const query = category
    ? `SELECT * FROM contracts WHERE verified = true AND type = $1 ORDER BY tx_count DESC LIMIT 100`
    : `SELECT * FROM contracts WHERE verified = true ORDER BY tx_count DESC LIMIT 100`
  const result = await pool.query<ContractIdentity>(
    query,
    category ? [category] : []
  )
  return result.rows
}

// â”€â”€â”€ WRITES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Save a new contract identity claim.
 * Verification status starts as false â€” set to true after bytecode check.
 */
export async function saveContractClaim(data: {
  address:     string
  name:        string
  type?:       string
  description?: string
  logo_url?:   string
  website?:    string
  twitter?:    string
  github?:     string
  audit_url?:  string
  source_code?: string
  deployer?:   string
}): Promise<ContractIdentity> {
  const pool   = getPool()
  const result = await pool.query<ContractIdentity>(
    `INSERT INTO contracts
       (address, name, type, description, logo_url, website, twitter, github, audit_url, source_code, deployer)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (address) DO UPDATE SET
       name        = EXCLUDED.name,
       type        = EXCLUDED.type,
       description = EXCLUDED.description,
       logo_url    = COALESCE(EXCLUDED.logo_url, contracts.logo_url),
       website     = EXCLUDED.website,
       twitter     = EXCLUDED.twitter,
       github      = EXCLUDED.github,
       audit_url   = EXCLUDED.audit_url,
       source_code = COALESCE(EXCLUDED.source_code, contracts.source_code)
     RETURNING *`,
    [
      data.address.toLowerCase(),
      data.name,
      data.type ?? null,
      data.description ?? null,
      data.logo_url ?? null,
      data.website ?? null,
      data.twitter ?? null,
      data.github ?? null,
      data.audit_url ?? null,
      data.source_code ?? null,
      data.deployer ?? null,
    ]
  )
  return result.rows[0]
}

/**
 * Mark a contract as verified (called after bytecode check passes).
 * Also updates the fast names_cache.
 */
export async function markVerified(address: string): Promise<void> {
  const pool  = getPool()
  const lower = address.toLowerCase()

  await pool.query(
    `UPDATE contracts
     SET verified = true, verified_at = NOW()
     WHERE address = $1`,
    [lower]
  )

  // Keep the fast lookup cache in sync
  await pool.query(
    `INSERT INTO contract_names_cache (address, name, logo, verified, flagged)
     SELECT address, name, logo_url, verified, flagged FROM contracts WHERE address = $1
     ON CONFLICT (address) DO UPDATE SET
       verified   = true,
       updated_at = NOW()`,
    [lower]
  )
}

/**
 * Flag a contract as malicious/suspicious.
 */
export async function flagContract(
  address: string,
  reason: string
): Promise<void> {
  const pool  = getPool()
  const lower = address.toLowerCase()

  await pool.query(
    `UPDATE contracts SET flagged = true, flag_reason = $2 WHERE address = $1`,
    [lower, reason]
  )

  await pool.query(
    `UPDATE contract_names_cache SET flagged = true WHERE address = $1`,
    [lower]
  )
}

/**
 * Increment tx count for a contract â€” called by the indexer.
 * Batched via a queue in production; here it's a simple upsert.
 */
export async function incrementTxCount(address: string): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE contracts SET tx_count = tx_count + 1 WHERE address = $1`,
    [address.toLowerCase()]
  )
}

