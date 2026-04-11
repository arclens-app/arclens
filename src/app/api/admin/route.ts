import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "arclens2588"
function checkAuth(pw: string) { return pw === ADMIN_PASSWORD }

export async function GET(req: NextRequest) {
  const action   = req.nextUrl.searchParams.get("action")
  const password = req.nextUrl.searchParams.get("password") || ""
  if (!checkAuth(password)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (action === "auth") return NextResponse.json({ ok: true })
  if (action === "list") {
    try {
      const [pending, approved] = await Promise.all([
        pool.query("SELECT * FROM projects WHERE approved = false ORDER BY created_at DESC"),
        pool.query("SELECT * FROM projects WHERE approved = true ORDER BY created_at DESC"),
      ])
      let contracts: { rows: unknown[] } = { rows: [] }
      try {
        const c = await pool.query("SELECT * FROM contracts ORDER BY created_at DESC")
        contracts = c
      } catch { }
      let pendingUpdates: unknown[] = []
      try {
        const pu = await pool.query(
          `SELECT pu.*, p.name as project_name, p.slug as project_slug
           FROM pending_updates pu
           JOIN projects p ON p.id = pu.project_id
           WHERE pu.status = 'pending'
           ORDER BY pu.submitted_at DESC`
        )
        pendingUpdates = pu.rows
      } catch { }
      let events: unknown[] = []
      try {
        const ev = await pool.query("SELECT * FROM events ORDER BY created_at DESC")
        events = ev.rows
      } catch { }
      return NextResponse.json({
        submissions: pending.rows,
        projects: approved.rows,
        contracts: contracts.rows,
        pendingUpdates,
        events,
      })
    } catch (e) {
      console.error("[Admin] list error:", e)
      return NextResponse.json({ error: String(e), submissions: [], projects: [], contracts: [], pendingUpdates: [], events: [] })
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { id, action, password, table, data } = body
  if (!checkAuth(password)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!id || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  try {
    if (action === "approve") {
      if (table === "contracts") {
        await pool.query("UPDATE contracts SET verified = true WHERE address = $1", [id])
        await pool.query(
          `INSERT INTO contract_names_cache (address, name, verified, flagged)
           SELECT address, name, verified, flagged FROM contracts WHERE address = $1
           ON CONFLICT (address) DO UPDATE SET verified = true, updated_at = NOW()`,
          [id]
        )
      } else if (table === "events") {
        await pool.query("UPDATE events SET approved = true WHERE id = $1", [id])
      } else {
        await pool.query("UPDATE projects SET approved = true, live = true WHERE id = $1", [id])
      }
      return NextResponse.json({ success: true })
    }
    if (action === "reject" || action === "delete") {
      if (table === "contracts") {
        await pool.query("DELETE FROM contracts WHERE address = $1", [id])
        await pool.query("DELETE FROM contract_names_cache WHERE address = $1", [id])
      } else if (table === "events") {
        await pool.query("DELETE FROM events WHERE id = $1", [id])
      } else {
        await pool.query("DELETE FROM projects WHERE id = $1", [id])
      }
      return NextResponse.json({ success: true })
    }
    if (action === "update" && data) {
      await pool.query(
        `UPDATE projects SET
          name=$1, tagline=$2, description=$3, category=$4,
          logo_url=$5, website=$6, twitter=$7, github=$8,
          badge=$9, featured=$10, live=$11, approved=true,
          city=$12, country=$13,
          lat=CASE WHEN $14::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN $14::numeric ELSE lat END,
          lng=CASE WHEN $15::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN $15::numeric ELSE lng END
         WHERE id=$16`,
        [
          data.name || null, data.tagline || null, data.description || null,
          data.category || null, data.logo_url || null, data.website || null,
          data.twitter || null, data.github || null, data.badge || null,
          data.featured ? true : false, data.live !== false,
          data.city?.trim() || null, data.country?.trim() || null,
          data.lat !== undefined && data.lat !== null && data.lat !== "" ? String(data.lat) : null,
          data.lng !== undefined && data.lng !== null && data.lng !== "" ? String(data.lng) : null,
          id
        ]
      )
      return NextResponse.json({ success: true })
    }
    if (action === "approve-update") {
      const upd = await pool.query(`SELECT * FROM pending_updates WHERE id = $1`, [id])
      if (upd.rows.length > 0) {
        const u = upd.rows[0] as any
        await pool.query(`UPDATE projects SET ${u.field} = $1 WHERE id = $2`, [u.new_value, u.project_id])
        await pool.query(`UPDATE pending_updates SET status = 'approved' WHERE id = $1`, [id])
      }
      return NextResponse.json({ success: true })
    }
    if (action === "reject-update") {
      await pool.query(`UPDATE pending_updates SET status = 'rejected' WHERE id = $1`, [id])
      return NextResponse.json({ success: true })
    }
    if (action === "feature-event") {
      await pool.query("UPDATE events SET featured = NOT featured WHERE id = $1", [id])
      return NextResponse.json({ success: true })
    }
    if (action === "badge-event") {
      await pool.query("UPDATE events SET badge = $1 WHERE id = $2", [data?.badge || "community", id])
      return NextResponse.json({ success: true })
    }
    if (action === "geocode" && data?.city) {
      const q = encodeURIComponent(`${data.city.trim()}${data.country ? ", " + data.country.trim() : ""}`)
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
          { headers: { "User-Agent": "ArcLens/1.0 (arclens.xyz)" } }
        )
        const geoData = await geoRes.json()
        if (!geoData?.[0]) return NextResponse.json({ error: "Location not found — try a more specific city name" }, { status: 404 })
        const lat = parseFloat(geoData[0].lat)
        const lng = parseFloat(geoData[0].lon)
        await pool.query(
          "UPDATE projects SET lat = $1, lng = $2, city = $3, country = $4 WHERE id = $5",
          [lat, lng, data.city.trim(), data.country?.trim() || null, id]
        )
        return NextResponse.json({ success: true, lat, lng })
      } catch {
        return NextResponse.json({ error: "Geocoding failed" }, { status: 500 })
      }
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[Admin] post error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}