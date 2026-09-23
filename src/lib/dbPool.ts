// src/lib/dbPool.ts
//
// THE shared Postgres pool. Every API route, layout, and lib must use this
// instead of constructing its own `new Pool()` — module-level pools multiply
// per route file and eat the database's connection cap under load.
//
// Plain module (no 'use server') so it can be imported from route handlers,
// server components, and libs alike.

import { Pool } from "pg"

let _pool: Pool | null = null

function databaseConfig() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required")

  if (process.env.BLOCK_EXTERNAL_DATABASE === "true") {
    const host = new URL(connectionString).hostname.toLowerCase()
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"])
    if (!localHosts.has(host)) {
      throw new Error(`External database access is blocked for this process (${host})`)
    }
  }

  const sslSetting = process.env.DATABASE_SSL?.toLowerCase()
  const ssl = sslSetting === "false" || sslSetting === "disable"
    ? false
    : { rejectUnauthorized: false }

  return { connectionString, ssl }
}

export function getPool(): Pool {
  if (!_pool) {
    const { connectionString, ssl } = databaseConfig()
    _pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl,
    })
  }
  return _pool
}
