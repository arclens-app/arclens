import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Update project details — only by verified owner
export async function POST(req: NextRequest) {
  try {
    const { token, slug, wallet, updates } = await req.json()

    if (!slug || !updates) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    let projectId: number | null = null

    // Auth by token
    if (token) {
      const result = await pool.query(
        `SELECT id, claim_token_expires FROM projects
         WHERE (slug = $1 OR id::text = $1) AND claim_token = $2`,
        [slug, token]
      )
      if (result.rows.length > 0 && new Date(result.rows[0].claim_token_expires) >= new Date()) {
        projectId = result.rows[0].id
      }
    }

    // Auth by wallet
    if (!projectId && wallet) {
      const result = await pool.query(
        `SELECT id FROM projects WHERE (slug = $1 OR id::text = $1) AND owner_wallet = $2`,
        [slug, wallet.toLowerCase()]
      )
      if (result.rows.length > 0) {
        projectId = result.rows[0].id
      }
    }

    if (!projectId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Only allow safe fields to be updated
    const allowed = ["tagline", "description", "website", "twitter", "github", "discord", "contract", "color"]
    const setClauses: string[] = []
    const values: any[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key) && typeof value === "string") {
        values.push(value.trim())
        setClauses.push(`${key} = $${values.length}`)
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    values.push(projectId)
    await pool.query(
      `UPDATE projects SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
      values
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[Update Project]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
