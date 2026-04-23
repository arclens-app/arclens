import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// POST /api/forge/[id]/rate — founder rates a tester's submission
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const body = await req.json()
    const { tester_wallet, rating, founder_wallet, impact_credited } = body

    if (!tester_wallet || !founder_wallet) {
      return NextResponse.json({ error: "Wallets required" }, { status: 400 })
    }
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 })
    }

    // Resolve slug or numeric id → numeric campaign id
    const isNumeric = /^\d+$/.test(id)
    const campaignRes = await pool.query(
      `SELECT id, creator_wallet FROM campaigns WHERE ${isNumeric ? "id = $1" : "slug = $1"}`,
      [isNumeric ? Number(id) : id]
    )
    if (!campaignRes.rows.length) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }
    if (campaignRes.rows[0].creator_wallet !== founder_wallet.toLowerCase()) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }
    const campaignId: number = campaignRes.rows[0].id

    // Get existing completion — fetch provisional_score so we can replace it accurately
    const compRes = await pool.query(
      `SELECT id, auto_score, provisional_score, builder_rating
       FROM campaign_completions
       WHERE campaign_id = $1 AND tester_wallet = $2`,
      [campaignId, tester_wallet.toLowerCase()]
    )
    if (!compRes.rows.length) {
      return NextResponse.json({ error: "Completion not found" }, { status: 404 })
    }

    const { auto_score, provisional_score, builder_rating: already_rated } = compRes.rows[0]
    if (already_rated != null) {
      return NextResponse.json({ error: "Already rated" }, { status: 409 })
    }

    // Final score: 60% auto + 40% builder rating (both on 0-5 scale)
    const quality_score = Math.round(
      ((auto_score / 100) * 5 * 0.6 + (rating / 5) * 5 * 0.4) * 100
    ) / 100

    await pool.query(
      `UPDATE campaign_completions
       SET builder_rating = $1, quality_score = $2, status = 'reviewed', reviewed_at = NOW()
       WHERE campaign_id = $3 AND tester_wallet = $4`,
      [rating, quality_score, campaignId, tester_wallet.toLowerCase()]
    )

    // Replace the provisional score with the real quality_score in reputation.
    // provisional_score is what was added at submission time — subtract it, add quality_score.
    const prevScore = Number(provisional_score ?? (auto_score / 100) * 5)
    const wallet = tester_wallet.toLowerCase()
    await pool.query(
      `UPDATE tester_reputation SET
         total_score  = GREATEST(0, total_score - $1 + $2),
         avg_score    = ROUND(GREATEST(0, total_score - $1 + $2) / NULLIF(campaigns_completed, 0), 2),
         impact_count = impact_count + $3,
         updated_at   = NOW()
       WHERE wallet = $4`,
      [prevScore, quality_score, impact_credited ? 1 : 0, wallet]
    )

    return NextResponse.json({ success: true, quality_score })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
