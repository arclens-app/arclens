import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Find by slug first, then by numeric id
    const result = await pool.query(
      `SELECT id, name, slug, tagline, description, category, logo_url,
              website, twitter, github, discord, contract,
              featured, badge, color, created_at,
              COALESCE(view_count, 0) as view_count,
              city, country, lat, lng
       FROM projects
       WHERE approved = true AND live = true
         AND (slug = $1 OR id::text = $1)
       LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      // Debug: check without approved/live filter
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const project = result.rows[0]

    // Fetch tx count for contract if available
    let txCount: string | null = null
    if (project.contract) {
      try {
        const res = await fetch(
          `https://testnet.arcscan.app/api/v2/addresses/${project.contract}/counters`,
          { next: { revalidate: 60 } }
        )
        const data = await res.json()
        if (data?.transactions_count) txCount = data.transactions_count
      } catch { }
    }

    // Related projects — same category, excluding this one
    const related = await pool.query(
      `SELECT id, name, slug, tagline, category, logo_url, badge, color
       FROM projects
       WHERE approved = true AND live = true
         AND category = $1 AND id != $2
       ORDER BY featured DESC, COALESCE(view_count, 0) DESC
       LIMIT 4`,
      [project.category, project.id]
    )

    // All-time leaderboard for this project. Aggregates across every campaign.
    // Builder-rated reviewed entries only (no unrated spam).
    //
    // XP-aware ranking: if any of this project's campaigns has max_xp set,
    // the board sorts by SUM(xp_earned). Otherwise we fall back to the legacy
    // quality_score sum so projects that opted out keep their existing behavior.
    let leaderboard: any[] = []
    let campaignsRun  = 0
    let usingXp       = false
    try {
      const xpFlag = await pool.query(
        `SELECT 1 FROM campaigns WHERE project_id = $1 AND max_xp_per_completion IS NOT NULL LIMIT 1`,
        [project.id]
      )
      usingXp = xpFlag.rowCount > 0

      const lbRes = await pool.query(
        `SELECT
           cc.tester_wallet,
           COUNT(*)::int                                AS campaigns_completed,
           AVG(cc.quality_score)::numeric(6,2)          AS avg_quality,
           AVG(cc.builder_rating)::numeric(4,2)         AS avg_rating,
           SUM(cc.quality_score)::int                   AS total_score,
           SUM(cc.xp_earned)::int                       AS total_xp,
           MAX(cc.created_at)                           AS last_active,
           -- Join the tester's platform-wide reputation so the project
           -- leaderboard can show ArcLens rank + avg_score next to their
           -- project XP. Same star rating powers both, so a tester high
           -- on Tower XP is naturally already climbing the ArcLens ladder.
           COALESCE(tr.rank, 0)::int                    AS platform_rank,
           COALESCE(tr.avg_score, 0)::numeric(4,2)      AS platform_avg
         FROM campaign_completions cc
         JOIN campaigns c ON c.id = cc.campaign_id
         LEFT JOIN tester_reputation tr ON tr.wallet = cc.tester_wallet
         WHERE c.project_id = $1
           AND cc.status = 'reviewed'
           AND cc.builder_rating IS NOT NULL
         GROUP BY cc.tester_wallet, tr.rank, tr.avg_score
         ORDER BY ${usingXp ? "total_xp DESC, " : ""}total_score DESC, avg_quality DESC
         LIMIT 20`,
        [project.id]
      )
      leaderboard = lbRes.rows
      const campCount = await pool.query(
        `SELECT COUNT(*)::int AS n FROM campaigns WHERE project_id = $1 AND status IN ('active','ended')`,
        [project.id]
      )
      campaignsRun = campCount.rows[0]?.n || 0
    } catch (e) {
      // Don't fail the page if the leaderboard query has a hiccup
      console.error("[Ecosystem GET id] leaderboard query failed", e)
    }

    return NextResponse.json(
      { project: { ...project, txCount }, related: related.rows, leaderboard, campaignsRun, usingXp },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    )
  } catch (err) {
    console.error("[Ecosystem GET id]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json()
    const { deviceId } = body
    if (!deviceId) return NextResponse.json({ ok: true })

    const proj = await pool.query(
      `SELECT id FROM projects WHERE (slug = $1 OR id::text = $1) AND approved = true AND live = true LIMIT 1`,
      [id]
    )
    if (proj.rows.length === 0) return NextResponse.json({ ok: true })

    const projectId = proj.rows[0].id
    const weekNum   = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))

    await pool.query(
      `INSERT INTO project_views (project_id, device_id, week_num)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, device_id, week_num) DO NOTHING`,
      [projectId, deviceId, weekNum]
    )
    await pool.query(
      `UPDATE projects SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1`,
      [projectId]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[Ecosystem POST id]", err)
    return NextResponse.json({ ok: true })
  }
}
