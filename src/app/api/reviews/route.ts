import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { enforce } from "@/lib/ratelimit"
import { getSession } from "@/lib/session"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const CATEGORIES = ["Product Experience", "Performance", "UI/UX", "Customer Support", "Security", "Feature Request"]

async function getWalletBadge(wallet: string, contract: string | null): Promise<string> {
  try {
    if (contract) {
      const res = await fetch(
        `https://testnet.arcscan.app/api/v2/addresses/${wallet}/transactions?filter=to&limit=10`,
        { signal: AbortSignal.timeout(4000) }
      )
      const data = await res.json()
      const txs = data?.items || []
      const usedContract = txs.some((tx: any) =>
        tx.to?.hash?.toLowerCase() === contract.toLowerCase()
      )
      if (usedContract) return "verified"
    }

    const res2 = await fetch(
      `https://testnet.arcscan.app/api/v2/addresses/${wallet}/counters`,
      { signal: AbortSignal.timeout(4000) }
    )
    const data2 = await res2.json()
    const txCount = parseInt(data2?.transactions_count || "0")
    if (txCount > 0) return "arc_user"

    return "unverified"
  } catch {
    return "unverified"
  }
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id")
  if (!projectId) return NextResponse.json({ reviews: [] })

  try {
    const result = await pool.query(
      `SELECT id, wallet, category, rating, review_text, badge, contact, created_at
       FROM reviews
       WHERE project_id = $1 AND is_public = true
       ORDER BY created_at DESC
       LIMIT 50`,
      [projectId]
    )
    return NextResponse.json({ reviews: result.rows }, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    })
  } catch {
    return NextResponse.json({ reviews: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const blocked = await enforce(req, "review-submit", { limit: 10, windowMs: 60_000 })
    if (blocked) return blocked

    const body = await req.json()
    const { project_id, wallet, category, rating, review_text, is_public, contact } = body

    if (!project_id || !wallet || !category || !rating || !review_text?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Session check: only the wallet owner can submit reviews as themselves.
    // Without this, anyone who knew a wallet that had used the contract could
    // submit a fake review under that wallet, capped by the duplicate check.
    const sess = getSession(req)
    if (!sess || sess.addr !== String(wallet).toLowerCase()) {
      return NextResponse.json({ error: "Sign in with the reviewing wallet to leave a review" }, { status: 401 })
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 })
    }
    if (review_text.trim().length < 10) {
      return NextResponse.json({ error: "Review too short — minimum 10 characters" }, { status: 400 })
    }

    // Check if wallet already reviewed this project
    const existing = await pool.query(
      `SELECT id FROM reviews WHERE project_id = $1 AND wallet = $2`,
      [project_id, wallet.toLowerCase()]
    )
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "You have already reviewed this project" }, { status: 400 })
    }

    // Get project contract for badge check
    const proj = await pool.query(`SELECT contract FROM projects WHERE id = $1`, [project_id])
    const contract = proj.rows[0]?.contract || null

    // Determine badge
    const badge = await getWalletBadge(wallet, contract)

    if (badge === "unverified") {
      return NextResponse.json({ error: "You need at least one transaction on Arc testnet to leave a review. Make any transaction on Arc first." }, { status: 400 })
    }

    await pool.query(
      `INSERT INTO reviews (project_id, wallet, category, rating, review_text, is_public, contact, badge)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [project_id, wallet.toLowerCase(), category, rating, review_text.trim(), is_public ?? true, contact || null, badge]
    )

    return NextResponse.json({ success: true, badge })
  } catch (err) {
    console.error("[Reviews API]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
