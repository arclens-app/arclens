import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, name, tagline, description, category, logo_url,
              website, twitter, github, discord, contract,
              featured, color, launched_at, slug, badge,
              city, country, lat, lng,
              COALESCE(view_count, 0) as view_count,
              created_at
       FROM projects
       WHERE approved = true AND live = true
       ORDER BY featured DESC, COALESCE(view_count, 0) DESC, created_at DESC
       LIMIT 200`
    )

    // Trending: purely by views — no external API calls
    const trending = [...result.rows]
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 5)
      .map(p => ({ ...p, tx_count: 0 }))

    return NextResponse.json({ projects: result.rows, trending }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    })
  } catch {
    return NextResponse.json({ projects: [], trending: [] })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, tagline, description, category, website, twitter, github, discord, contract, logo_url, email, city, country } = body

  if (!name?.trim())    return NextResponse.json({ error: "Project name required" }, { status: 400 })
  if (!tagline?.trim()) return NextResponse.json({ error: "Tagline required" }, { status: 400 })
  if (!email?.trim())   return NextResponse.json({ error: "Email is required so we can notify you" }, { status: 400 })

  // Generate slug from name
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  try {
    if (contract?.trim()) {
      const existing = await pool.query(
        "SELECT id, email FROM projects WHERE contract = $1 LIMIT 1",
        [contract.trim().toLowerCase()]
      )

      if (existing.rows.length > 0) {
        const existingEmail = existing.rows[0].email?.toLowerCase()
        const submittedEmail = email.trim().toLowerCase()

        if (existingEmail === submittedEmail) {
          await pool.query(
            `UPDATE projects SET
               name = $1, tagline = $2, description = $3, category = $4,
               logo_url = COALESCE($5, logo_url),
               website = $6, twitter = $7, github = $8, discord = $9,
               approved = false, live = false
             WHERE contract = $10`,
            [name.trim(), tagline.trim(), description?.trim()||null, category||"DeFi",
             logo_url||null, website?.trim()||null, twitter?.trim()||null,
             github?.trim()||null, discord?.trim()||null, contract.trim().toLowerCase()]
          )
          return NextResponse.json({ success: true, updated: true })
        } else {
          return NextResponse.json({ error: "A project with this contract address already exists. Use the same email you registered with to update it." }, { status: 409 })
        }
      }
    }

    // New submission — generate unique slug if taken
    let finalSlug = slug
    const slugCheck = await pool.query(
      "SELECT id FROM projects WHERE slug = $1 LIMIT 1",
      [slug]
    )
    if (slugCheck.rows.length > 0) {
      finalSlug = slug + "-" + Date.now().toString(36)
    }

    await pool.query(
      `INSERT INTO projects (name, tagline, description, category, logo_url, website, twitter, github, discord, contract, email, city, country, approved, live, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,false,$14)`,
      [name.trim(), tagline.trim(), description?.trim()||null, category||"DeFi",
       logo_url||null, website?.trim()||null, twitter?.trim()||null,
       github?.trim()||null, discord?.trim()||null,
       contract?.trim()?.toLowerCase()||null, email.trim(),
       city?.trim()||null, country?.trim()||null, finalSlug]
    )
    return NextResponse.json({ success: true, updated: false })
  } catch (err) {
    console.error("[Ecosystem POST]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
