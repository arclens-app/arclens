import { NextResponse } from "next/server"
import { getPool } from "@/lib/dbPool"

const pool = getPool()

// This deliberately bypasses the long-lived directory cache. The main
// directory payload can remain inexpensive to serve, while moderation changes
// (hide/restore) take effect within five minutes instead of hours later.
export async function GET() {
  try {
    const result = await pool.query(
      "SELECT id::text AS id FROM projects WHERE approved = true AND live = true",
    )
    return NextResponse.json(
      { liveProjectIds: result.rows.map(row => String(row.id)) },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } },
    )
  } catch (error) {
    console.error("[ecosystem/visibility]", error)
    return NextResponse.json({ error: "Unable to verify listing visibility" }, { status: 500 })
  }
}

export const dynamic = "force-dynamic"
