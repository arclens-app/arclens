// src/app/api/stablecoins/route.ts
// Public read-only list of the active stablecoin registry. Used by the
// founder TVL Tracking panel to populate the volume denomination dropdown.
// CDN-cached aggressively — the registry changes rarely.

import { NextResponse } from "next/server"
import { getPool } from "@/lib/dbPool"
import { ARC_CHAIN_ID } from "@/lib/constants"

const pool = getPool()

export async function GET() {
  try {
    const r = await pool.query(
      `SELECT id, symbol, name, LOWER(address) AS address,
              decimals, peg_currency
       FROM stablecoins WHERE active = true AND chain_id = $1 ORDER BY id`,
      [ARC_CHAIN_ID],
    )
    return NextResponse.json(
      { stablecoins: r.rows },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    )
  } catch (e) {
    console.error("[stablecoins GET]", e)
    return NextResponse.json({ stablecoins: [] })
  }
}
