// src/app/api/admin/ai-reembed/route.ts
//
// Generates embeddings for knowledge-base rows that don't have one — run from
// PRODUCTION, where the Gemini key lives, so the freshness workflow never needs
// secrets on anyone's laptop. The flow is:
//   1. edit FACTS + run scripts/sync-ai-knowledge.mjs   (reconciles rows, nulls
//      the embedding of anything whose text changed — needs only DATABASE_URL)
//   2. POST here from the admin Trust/AI panel             (embeds the NULL rows)
//
// GET  → { total, embedded, missing }   (status, for the admin button)
// POST → embeds NULL-embedding rows, time-bounded, returns how many it did.

import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getGeminiKey } from "@/lib/aiContext"
import { getPool } from "@/lib/dbPool"

export const runtime = "nodejs"
export const maxDuration = 60

const pool = getPool()
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

async function status() {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
       FROM ai_knowledge_base`,
  )
  const total = r.rows[0]?.total ?? 0
  const embedded = r.rows[0]?.embedded ?? 0
  return { total, embedded, missing: total - embedded }
}

export async function GET(req: NextRequest) {
  if (!checkAuth(resolvePw(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return NextResponse.json({ configured: !!getGeminiKey(), ...(await status()) })
  } catch (e: any) {
    console.error("[admin/ai-reembed GET]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(resolvePw(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apiKey = getGeminiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini key in this environment — set GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) in Vercel Production." },
      { status: 503 },
    )
  }

  try {
    const { embed } = await import("ai")
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
    const google = createGoogleGenerativeAI({ apiKey })
    const model = google.textEmbeddingModel("gemini-embedding-001")

    // Time-bounded so we never hit the function ceiling; the admin can click
    // again to finish a large batch (each click resumes where it left off).
    const DEADLINE = Date.now() + 45_000
    const rows = await pool.query<{ id: number; topic: string; fact: string }>(
      `SELECT id, topic, fact FROM ai_knowledge_base WHERE embedding IS NULL ORDER BY id LIMIT 500`,
    )

    let done = 0, failed = 0
    for (const row of rows.rows) {
      if (Date.now() > DEADLINE) break
      try {
        const { embedding } = await embed({ model, value: `[${row.topic}] ${row.fact}` })
        await pool.query(`UPDATE ai_knowledge_base SET embedding = $2::jsonb WHERE id = $1`, [row.id, JSON.stringify(embedding)])
        done++
      } catch (e: any) {
        failed++
        console.error(`[admin/ai-reembed] id ${row.id}:`, e?.message || e)
      }
    }

    const st = await status()
    return NextResponse.json({ embedded_now: done, failed, ...st, complete: st.missing === 0 })
  } catch (e: any) {
    console.error("[admin/ai-reembed POST]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
