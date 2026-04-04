import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Look up by slug OR numeric id
    const result = await pool.query(
      `SELECT id, name, tagline, description, category, logo_url,
              website, twitter, github, discord, contract,
              featured, badge, color, created_at, slug,
              COALESCE(view_count, 0) as view_count
       FROM projects
       WHERE (slug = $1 OR id::text = $1) AND approved = true AND live = true`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const project = result.rows[0]

    // Related projects in same category
    const related = await pool.query(
      `SELECT id, name, tagline, category, logo_url, badge, color, slug
       FROM projects
       WHERE category = $1 AND id != $2 AND approved = true AND live = true
       ORDER BY featured DESC, COALESCE(view_count, 0) DESC, created_at DESC
       LIMIT 3`,
      [project.category, project.id]
    )

    // Contract tx count
    let txCount = null
    if (project.contract) {
      try {
        const txRes = await fetch(
          `https://testnet.arcscan.app/api/v2/addresses/${project.contract}/counters`
        )
        const txData = await txRes.json()
        txCount = txData?.transactions_count || null
      } catch { /* non-critical */ }
    }

    return NextResponse.json({
      project: { ...project, txCount },
      related: related.rows,
    })
  } catch (err) {
    console.error("[Project API]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// Record a view — one per device per project (hidden from public, powers trending)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const { deviceId } = await req.json()
    if (!deviceId) return NextResponse.json({ viewed: false })

    // Get numeric project id from slug or id
    const projRes = await pool.query(
      `SELECT id FROM projects WHERE slug = $1 OR id::text = $1 LIMIT 1`,
      [id]
    )
    if (projRes.rows.length === 0) return NextResponse.json({ viewed: false })
    const projectId = projRes.rows[0].id

    // Get current week number (resets every Monday)
    const now = new Date()
    const weekNum = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))

    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_views (
        project_id  INTEGER NOT NULL,
        device_id   TEXT NOT NULL,
        week_num    INTEGER NOT NULL DEFAULT 0,
        viewed_at   TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (project_id, device_id, week_num)
      )
    `)

    // Use fingerprint portion as dedup key if available, else full deviceId
    const dedupId = deviceId.includes("_") ? deviceId.split("_")[1] : deviceId

    const result = await pool.query(
      `INSERT INTO project_views (project_id, device_id, week_num)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, device_id, week_num) DO NOTHING`,
      [projectId, dedupId, weekNum]
    )

    const isNewView = (result.rowCount ?? 0) > 0

    if (isNewView) {
      // Update weekly view count (count only this week)
      const weekCount = await pool.query(
        `SELECT COUNT(*) as cnt FROM project_views WHERE project_id = $1 AND week_num = $2`,
        [projectId, weekNum]
      )
      await pool.query(
        `UPDATE projects SET view_count = $1 WHERE id = $2`,
        [parseInt(weekCount.rows[0].cnt), projectId]
      )
    }

    return NextResponse.json({ viewed: isNewView })
  } catch (err) {
    console.error("[View API]", err)
    return NextResponse.json({ viewed: false })
  }
}
