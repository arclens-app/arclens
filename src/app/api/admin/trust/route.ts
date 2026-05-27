// src/app/api/admin/trust/route.ts
//
// Admin endpoints for the Trust tab:
//   GET    /api/admin/trust  → open alerts + open disputes (joined to projects)
//   PATCH  /api/admin/trust  → resolve an alert or dispute
//
// Auth: same `Authorization: Bearer ${ADMIN_PASSWORD}` pattern as the
// rest of /api/admin — constant-time compared.

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { timingSafeEqual } from "crypto"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""

function checkAuth(pw: string): boolean {
  if (!ADMIN_PASSWORD || !pw) return false
  const a = Buffer.from(pw)
  const b = Buffer.from(ADMIN_PASSWORD)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function resolvePassword(req: NextRequest): string {
  const auth = req.headers.get("authorization") || ""
  return auth.startsWith("Bearer ") ? auth.slice(7) : ""
}

export async function GET(req: NextRequest) {
  if (!checkAuth(resolvePassword(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const alerts = await pool.query(
      `SELECT ia.id, ia.project_id, ia.kind, ia.severity, ia.message, ia.details,
              ia.created_at, p.slug, p.name
       FROM indexer_alerts ia
       LEFT JOIN projects p ON p.id = ia.project_id
       WHERE ia.resolved_at IS NULL
       ORDER BY
         CASE ia.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
         ia.created_at DESC
       LIMIT 200`,
    )

    const disputes = await pool.query(
      `SELECT d.id, d.project_id, d.metric, d.reason, d.evidence_url,
              d.reporter_email, d.status, d.admin_notes,
              d.created_at, p.slug, p.name
       FROM disputes d
       JOIN projects p ON p.id = d.project_id
       WHERE d.status IN ('open','acknowledged')
       ORDER BY d.status ASC, d.created_at DESC
       LIMIT 200`,
    )

    return NextResponse.json({
      alerts: alerts.rows,
      disputes: disputes.rows,
      counts: {
        open_alerts:   alerts.rowCount ?? 0,
        open_disputes: disputes.rowCount ?? 0,
      },
    })
  } catch (e: any) {
    console.error("[admin/trust GET]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(resolvePassword(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { kind, id, action, notes } = body
    // kind = 'alert' | 'dispute'
    // action: alerts → 'resolve'; disputes → 'acknowledge' | 'resolve' | 'dismiss'

    if (!id || !Number.isFinite(Number(id))) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    if (kind === "alert") {
      if (action !== "resolve") {
        return NextResponse.json({ error: "alerts only support action=resolve" }, { status: 400 })
      }
      await pool.query(
        `UPDATE indexer_alerts SET resolved_at = NOW() WHERE id = $1 AND resolved_at IS NULL`,
        [Number(id)],
      )
      return NextResponse.json({ success: true })
    }

    if (kind === "dispute") {
      if (!["acknowledge", "resolve", "dismiss"].includes(action)) {
        return NextResponse.json({ error: "action must be acknowledge|resolve|dismiss" }, { status: 400 })
      }
      const statusMap: Record<string, string> = {
        acknowledge: "acknowledged",
        resolve:     "resolved",
        dismiss:     "dismissed",
      }
      const resolvedClause = action === "acknowledge"
        ? "resolved_at = NULL, resolved_by = NULL"
        : "resolved_at = NOW(), resolved_by = 'admin'"
      await pool.query(
        `UPDATE disputes SET
           status = $2,
           admin_notes = COALESCE($3, admin_notes),
           ${resolvedClause}
         WHERE id = $1`,
        [Number(id), statusMap[action], notes ?? null],
      )
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "kind must be alert or dispute" }, { status: 400 })
  } catch (e: any) {
    console.error("[admin/trust PATCH]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
