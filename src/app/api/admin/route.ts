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
      } catch { /* contracts table may not exist */ }

      return NextResponse.json({
        submissions: pending.rows,
        projects: approved.rows,
        contracts: contracts.rows,
      })
    } catch (e) {
      console.error("[Admin] list error:", e)
      return NextResponse.json({ error: String(e), submissions: [], projects: [], contracts: [] })
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
        await pool.query("UPDATE contracts SET verified = true WHERE id = $1", [id])
      } else {
        await pool.query("UPDATE projects SET approved = true, live = true WHERE id = $1", [id])
      }
      return NextResponse.json({ success: true })
    }

    if (action === "reject" || action === "delete") {
      const tbl = table === "contracts" ? "contracts" : "projects"
      await pool.query(`DELETE FROM ${tbl} WHERE id = $1`, [id])
      return NextResponse.json({ success: true })
    }

    if (action === "update" && data) {
      await pool.query(
        `UPDATE projects SET
          name=$1, tagline=$2, description=$3, category=$4,
          logo_url=$5, website=$6, twitter=$7, github=$8,
          badge=$9, featured=$10, live=$11, approved=$12
         WHERE id=$13`,
        [
          data.name || null,
          data.tagline || null,
          data.description || null,
          data.category || null,
          data.logo_url || null,
          data.website || null,
          data.twitter || null,
          data.github || null,
          data.badge || null,
          data.featured ? true : false,
          data.live !== false,
          true,
          id
        ]
      )
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[Admin] post error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}