// src/app/api/names/route.ts
// Returns registered contract names for a list of addresses
// Used by tx feeds, address pages, approval manager

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function POST(req: NextRequest) {
  try {
    const { addresses } = await req.json()
    if (!addresses?.length) return NextResponse.json({})

    const lower = addresses.map((a: string) => a.toLowerCase())
    const result = await pool.query(
      `SELECT address, name, badge, type FROM contracts
       WHERE address = ANY($1) AND verified = true`,
      [lower]
    )

    const map: Record<string, { name: string; badge: string; type: string }> = {}
    for (const row of result.rows) {
      map[row.address] = { name: row.name, badge: row.badge, type: row.type }
    }
    return NextResponse.json(map)
  } catch {
    return NextResponse.json({})
  }
}