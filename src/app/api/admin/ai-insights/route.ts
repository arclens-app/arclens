// src/app/api/admin/ai-insights/route.ts
// Admin view of the AI feedback loop: questions the AI couldn't answer
// (ai_knowledge_gaps) + 👍/👎 ratings on the answers it did give (ai_feedback).

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { timingSafeEqual } from "crypto"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""

function checkAuth(pw: string): boolean {
  if (!ADMIN_PASSWORD || !pw) return false
  const a = Buffer.from(pw), b = Buffer.from(ADMIN_PASSWORD)
  return a.length === b.length && timingSafeEqual(a, b)
}
function resolvePw(req: NextRequest): string {
  const auth = req.headers.get("authorization") || ""
  return auth.startsWith("Bearer ") ? auth.slice(7) : ""
}

export async function GET(req: NextRequest) {
  if (!checkAuth(resolvePw(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    // Most-asked unanswered questions (grouped) + open total.
    const topGaps = await pool.query(
      `SELECT question, COUNT(*)::int AS times, MAX(created_at) AS last_asked
       FROM ai_knowledge_gaps WHERE resolved_at IS NULL
       GROUP BY question ORDER BY times DESC, last_asked DESC LIMIT 50`,
    ).catch(() => ({ rows: [] as any[] }))
    const gapTotal = (await pool.query(
      `SELECT COUNT(*)::int total FROM ai_knowledge_gaps WHERE resolved_at IS NULL`,
    ).catch(() => ({ rows: [{ total: 0 }] }))).rows[0].total

    // Ratings summary + recent (downs first matter most to review).
    const sum = (await pool.query(
      `SELECT COUNT(*) FILTER (WHERE rating = 1)::int up, COUNT(*) FILTER (WHERE rating = -1)::int down FROM ai_feedback`,
    ).catch(() => ({ rows: [{ up: 0, down: 0 }] }))).rows[0]
    const recent = await pool.query(
      `SELECT rating, question, answer, route, created_at FROM ai_feedback ORDER BY created_at DESC LIMIT 50`,
    ).catch(() => ({ rows: [] as any[] }))

    return NextResponse.json({
      gaps:    { total: gapTotal, top: topGaps.rows },
      ratings: { up: sum.up, down: sum.down, recent: recent.rows },
    })
  } catch (e: any) {
    console.error("[admin/ai-insights]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// Resolve knowledge gaps once they're covered (a fact added, or just junk).
// body: { question }  → resolves every open gap with that exact question.
//       { all: true } → resolves all open gaps (clear the board).
export async function PATCH(req: NextRequest) {
  if (!checkAuth(resolvePw(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.all === true) {
      const r = await pool.query(`UPDATE ai_knowledge_gaps SET resolved_at = NOW() WHERE resolved_at IS NULL`)
      return NextResponse.json({ ok: true, resolved: r.rowCount ?? 0 })
    }
    const q = typeof body?.question === "string" ? body.question : ""
    if (!q.trim()) return NextResponse.json({ error: "question or all:true required" }, { status: 400 })
    const r = await pool.query(
      `UPDATE ai_knowledge_gaps SET resolved_at = NOW() WHERE resolved_at IS NULL AND question = $1`,
      [q],
    )
    return NextResponse.json({ ok: true, resolved: r.rowCount ?? 0 })
  } catch (e: any) {
    console.error("[admin/ai-insights PATCH]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
