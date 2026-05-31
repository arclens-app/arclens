// src/app/api/ai/feedback/route.ts
// Stores 👍/👎 on AI answers — the per-response quality signal. Pairs with the
// knowledge-gap log: gaps tell us what it can't answer, ratings tell us how good
// the answers it DOES give are. Reviewed in the admin panel over time.

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { enforce } from "@/lib/ratelimit"
import { getSession } from "@/lib/session"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const tableReady = pool.query(`
  CREATE TABLE IF NOT EXISTS ai_feedback (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT,
    rating          SMALLINT NOT NULL,   -- 1 = up, -1 = down
    question        TEXT,
    answer          TEXT,
    route           TEXT,
    user_addr       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(e => console.error("[ai/feedback] table init:", e))

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "ai-feedback", { limit: 40, windowMs: 60_000 })
  if (blocked) return blocked

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }) }
  const rating = body?.rating === "up" ? 1 : body?.rating === "down" ? -1 : 0
  if (!rating) return NextResponse.json({ error: "rating must be 'up' or 'down'" }, { status: 400 })

  await tableReady
  const sess = getSession(req)
  try {
    await pool.query(
      `INSERT INTO ai_feedback (conversation_id, rating, question, answer, route, user_addr)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        Number.isFinite(Number(body.conversationId)) ? Number(body.conversationId) : null,
        rating,
        String(body.question || "").slice(0, 500),
        String(body.answer || "").slice(0, 2000),
        String(body.route || "").slice(0, 200),
        sess?.addr ?? null,
      ],
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[ai/feedback]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
