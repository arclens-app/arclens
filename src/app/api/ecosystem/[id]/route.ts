import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, name, tagline, description, category, logo_url,
              website, twitter, github, discord, contract,
              featured, badge, color, launched_at, city, country, lat, lng
       FROM projects
       WHERE approved = true AND live = true
       ORDER BY featured DESC, created_at DESC
       LIMIT 100`
    )
    return NextResponse.json(
      { projects: result.rows },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    )
  } catch {
    return NextResponse.json({ projects: [] })
  }
}

async function geocode(city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q   = encodeURIComponent(`${city}, ${country}`)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "User-Agent": "ArcLens/1.0 (arclens.xyz)" } }
    )
    const data = await res.json()
    if (!data?.[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    name, tagline, description, category,
    website, twitter, github, discord, contract,
    logo_url, email, city, country,
  } = body

  if (!name?.trim())    return NextResponse.json({ error: "Project name required" }, { status: 400 })
  if (!tagline?.trim()) return NextResponse.json({ error: "Tagline required" }, { status: 400 })
  if (!email?.trim())   return NextResponse.json({ error: "Email is required so we can notify you" }, { status: 400 })

  // Geocode city/country if provided
  let lat: number | null = null
  let lng: number | null = null
  if (city?.trim() && country?.trim()) {
    const coords = await geocode(city.trim(), country.trim())
    if (coords) { lat = coords.lat; lng = coords.lng }
  }

  try {
    // Check for existing by contract
    if (contract?.trim()) {
      const existing = await pool.query(
        "SELECT id, email FROM projects WHERE contract = $1 LIMIT 1",
        [contract.trim().toLowerCase()]
      )
      if (existing.rows.length > 0) {
        const existingEmail  = existing.rows[0].email?.toLowerCase()
        const submittedEmail = email.trim().toLowerCase()
        if (existingEmail === submittedEmail) {
          await pool.query(
            `UPDATE projects SET
               name=$1, tagline=$2, description=$3, category=$4,
               logo_url=COALESCE($5,logo_url), website=$6, twitter=$7,
               github=$8, discord=$9, approved=false, live=false,
               city=COALESCE($10,city), country=COALESCE($11,country),
               lat=COALESCE($12,lat), lng=COALESCE($13,lng)
             WHERE contract=$14`,
            [
              name.trim(), tagline.trim(), description?.trim()||null, category||"DeFi",
              logo_url||null, website?.trim()||null, twitter?.trim()||null,
              github?.trim()||null, discord?.trim()||null,
              city?.trim()||null, country?.trim()||null, lat, lng,
              contract.trim().toLowerCase(),
            ]
          )
          return NextResponse.json({ success: true, updated: true })
        } else {
          return NextResponse.json({ error: "A project with this contract already exists. Use the same email you registered with to update it." }, { status: 409 })
        }
      }
    }

    // New submission
    await pool.query(
      `INSERT INTO projects
        (name, tagline, description, category, logo_url, website, twitter,
         github, discord, contract, email, city, country, lat, lng, approved, live)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false,false)`,
      [
        name.trim(), tagline.trim(), description?.trim()||null, category||"DeFi",
        logo_url||null, website?.trim()||null, twitter?.trim()||null,
        github?.trim()||null, discord?.trim()||null,
        contract?.trim()?.toLowerCase()||null, email.trim(),
        city?.trim()||null, country?.trim()||null, lat, lng,
      ]
    )
    return NextResponse.json({ success: true, updated: false })
  } catch (err) {
    console.error("[Ecosystem POST]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}