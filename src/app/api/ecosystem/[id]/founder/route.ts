import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/dbPool"

const pool = getPool()

// Founder identity is intentionally separate from the heavily cached project
// payload. A founder can switch a profile to private and have that decision
// take effect immediately, without waiting for an old CDN response to expire.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const result = await pool.query(
      `SELECT founder_social, owner_wallet,
              COALESCE((trust_profile->>'founder_social_public')::boolean, true) AS founder_social_public
         FROM projects
        WHERE approved = true AND live = true
          AND (slug = $1 OR id::text = $1)
        LIMIT 1`,
      [id],
    )
    if (!result.rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const project = result.rows[0]
    if (project.founder_social_public === false) {
      return NextResponse.json(
        { founder_social: null, founder_profile: null },
        { headers: { "Cache-Control": "private, no-store" } },
      )
    }

    let founderProfile = null
    if (project.owner_wallet) {
      const owner = String(project.owner_wallet).toLowerCase()
      try {
        const profile = await pool.query(
          `SELECT address, display_name, avatar_url, verified, claimed_at
             FROM builder_profiles WHERE address = $1 LIMIT 1`,
          [owner],
        )
        const row = profile.rows[0]
        founderProfile = {
          address: owner,
          display_name: row?.display_name || null,
          avatar_url: row?.avatar_url || null,
          verified: Boolean(row?.verified),
          claimed: Boolean(row?.claimed_at),
        }
      } catch {
        founderProfile = { address: owner, display_name: null, avatar_url: null, verified: false, claimed: false }
      }
    }

    return NextResponse.json(
      { founder_social: project.founder_social || null, founder_profile: founderProfile },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[ecosystem founder]", error)
    return NextResponse.json({ error: "Founder profile temporarily unavailable" }, { status: 502 })
  }
}
