// src/app/api/track/route.ts
//
// First-party, cookieless page-visit tracking. One row per (anonymous device,
// path, day) — deduped on write, so it can't storm the DB. No cookies, no PII,
// no third-party: the device id is the same anonymous localStorage id the AI
// widget uses. Powers admin growth metrics + per-project founder analytics.

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/dbPool"
import { enforce } from "@/lib/ratelimit"

const pool = getPool()

const tableReady = pool.query(`
  CREATE TABLE IF NOT EXISTS page_visits (
    device_id  TEXT NOT NULL,
    path       TEXT NOT NULL,
    day        DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).then(() => pool.query(
  `CREATE UNIQUE INDEX IF NOT EXISTS page_visits_uniq ON page_visits (device_id, path, day)`
)).catch(e => console.error("[track] table init:", e?.message || e))

// Keep the raw table bounded — roll off visits older than 90 days. Opportunistic:
// runs on about 1 in 50 calls, with no extra query to decide.
async function pruneOld() {
  if (Math.random() >= 0.02) return
  await pool.query(`DELETE FROM page_visits WHERE day < CURRENT_DATE - 90`).catch(() => {})
}

export async function POST(req: NextRequest) {
  // One call per browsing session (the client batches paths). Flood protection only.
  const blocked = await enforce(req, "track", { limit: 80, windowMs: 60_000 })
  if (blocked) return blocked

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const device = (req.headers.get("x-arclens-device") || body?.device || "")
    .toString().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
  // The client sends a batch of paths; a single `path` is still accepted.
  const raw: unknown[] = Array.isArray(body?.paths) ? body.paths.slice(0, 20) : [body?.path]
  // Only track internal app paths; ignore anything odd/absolute.
  const paths = [...new Set(raw
    .map(p => (p ?? "").toString().trim().split(/[?#]/)[0])   // drop query/hash — the page is what matters
    .filter(p => p.startsWith("/") && p.length <= 200))]
  if (!paths.length) return NextResponse.json({ ok: false }, { status: 400 })
  if (!device) return NextResponse.json({ ok: true })   // no id yet — silently skip

  try {
    await tableReady
    await pool.query(
      `INSERT INTO page_visits (device_id, path) SELECT $1, unnest($2::text[])
       ON CONFLICT (device_id, path, day) DO NOTHING`,
      [device, paths],
    )
    void pruneOld()
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[track]", e?.message || e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
