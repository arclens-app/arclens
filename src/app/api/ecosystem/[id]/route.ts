import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
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

    return NextResponse.json(
      { project: { ...project, txCount }, related: related.rows },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    )
  } catch (err) {
    console.error("[Ecosystem GET id]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
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
