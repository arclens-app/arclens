// src/app/api/admin/spotlight/route.ts
//
// Admin management for the Ecosystem Spotlight slot:
//   GET    → every item (live, pending applications, rejected) for the panel
//   POST   → create an item (admin-authored: event / project / campaign / custom)
//   PATCH  → approve | reject | activate | deactivate | edit fields | reorder
//   DELETE → remove an item
// Auth: Bearer ${ADMIN_PASSWORD}, constant-time compared.

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getPool } from "@/lib/dbPool"

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

const KINDS = ["campaign", "event", "project", "custom"]
function clean(v: any, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null
}

export async function GET(req: NextRequest) {
  if (!checkAuth(resolvePw(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const r = await pool.query(
      `SELECT s.*, p.name AS project_name, p.slug AS project_slug
         FROM spotlight_items s LEFT JOIN projects p ON p.id = s.project_id
        ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
                 s.priority DESC, s.created_at DESC`,
    )
    const counts = {
      pending: r.rows.filter(x => x.status === "pending").length,
      active:  r.rows.filter(x => x.status === "active").length,
    }
    return NextResponse.json({ items: r.rows, counts })
  } catch (e: any) {
    console.error("[admin/spotlight GET]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(resolvePw(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const d = await req.json().catch(() => ({}))
  const title = clean(d?.title, 80)
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 })
  const kind = KINDS.includes(d?.kind) ? d.kind : "custom"
  try {
    let projectId: number | null = null
    if (d?.project) {
      const p = (await pool.query(`SELECT id FROM projects WHERE slug = $1 OR id::text = $1 LIMIT 1`, [String(d.project)])).rows[0]
      projectId = p?.id ?? null
    }
    const r = await pool.query(
      `INSERT INTO spotlight_items (kind, title, subtitle, image_url, image_pos, link_url, cta_text, accent, project_id, status, priority, starts_at, ends_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'admin') RETURNING id`,
      [
        kind, title, clean(d?.subtitle, 160), clean(d?.image_url, 500), clean(d?.image_pos, 16),
        clean(d?.link_url, 500), clean(d?.cta_text, 24), clean(d?.accent, 9),
        projectId, "active", // admin-created items go live immediately
        Number.isFinite(Number(d?.priority)) ? Number(d.priority) : 0,
        d?.starts_at || null, d?.ends_at || null,
      ],
    )
    return NextResponse.json({ ok: true, id: r.rows[0].id })
  } catch (e: any) {
    console.error("[admin/spotlight POST]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(resolvePw(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const d = await req.json().catch(() => ({}))
  const id = Number(d?.id)
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  const action = d?.action as string
  try {
    if (action === "approve" || action === "activate") {
      await pool.query(`UPDATE spotlight_items SET status = 'active' WHERE id = $1`, [id])
    } else if (action === "reject") {
      await pool.query(`UPDATE spotlight_items SET status = 'rejected' WHERE id = $1`, [id])
    } else if (action === "deactivate") {
      await pool.query(`UPDATE spotlight_items SET status = 'pending' WHERE id = $1`, [id])
    } else if (action === "edit") {
      await pool.query(
        `UPDATE spotlight_items SET
           title = COALESCE($2, title), subtitle = $3, image_url = $4, link_url = $5,
           cta_text = $6, accent = $7, priority = COALESCE($8, priority),
           starts_at = $9, ends_at = $10, image_pos = $11
         WHERE id = $1`,
        [id, clean(d?.title, 80), clean(d?.subtitle, 160), clean(d?.image_url, 500),
         clean(d?.link_url, 500), clean(d?.cta_text, 24), clean(d?.accent, 9),
         Number.isFinite(Number(d?.priority)) ? Number(d.priority) : null,
         d?.starts_at || null, d?.ends_at || null, clean(d?.image_pos, 16)],
      )
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[admin/spotlight PATCH]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(resolvePw(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get("id"))
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  try {
    await pool.query(`DELETE FROM spotlight_items WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[admin/spotlight DELETE]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
