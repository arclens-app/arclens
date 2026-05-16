export const runtime = "nodejs"
import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

export async function GET() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS builder_profiles (
        address      TEXT PRIMARY KEY,
        display_name TEXT,
        bio          TEXT,
        avatar_url   TEXT,
        twitter      TEXT,
        github       TEXT,
        website      TEXT,
        telegram     TEXT,
        email        TEXT,
        verified     BOOLEAN DEFAULT false,
        claimed_at   TIMESTAMPTZ,
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`ALTER TABLE builder_profiles ADD COLUMN IF NOT EXISTS email TEXT`)

    const res = await pool.query(`
      SELECT
        b.address,
        b.display_name,
        b.bio,
        b.avatar_url,
        b.twitter,
        b.github,
        b.website,
        b.verified,
        b.claimed_at,
        COUNT(p.id)::int                    AS project_count,
        COALESCE(SUM(p.view_count), 0)::int AS total_views,
        (
          (COUNT(p.id) * 500)
          + LEAST(COALESCE(SUM(p.view_count), 0), 5000)
        )::int                              AS score
      FROM builder_profiles b
      LEFT JOIN projects p
        ON p.owner_wallet = b.address
       AND p.approved = true
       AND p.live = true
      WHERE b.claimed_at IS NOT NULL
      GROUP BY
        b.address, b.display_name, b.bio, b.avatar_url,
        b.twitter, b.github, b.website, b.verified, b.claimed_at
      ORDER BY
        score       DESC,  -- weighted composite: verified + projects + reach
        b.claimed_at ASC   -- ties go to the earlier builder (veteran status)
    `)

    return NextResponse.json({ builders: res.rows }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" },
    })
  } catch (err) {
    console.error("[Builders GET]", err)
    return NextResponse.json({ builders: [] })
  }
}
