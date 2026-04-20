import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Support both numeric IDs (legacy) and slugs
  const isNumeric = /^\d+$/.test(id)
  const whereClause = isNumeric ? "c.id = $1" : "c.slug = $1"

  try {
    const campaignRes = await pool.query(
      `SELECT
         c.*,
         (SELECT COUNT(*) FROM campaign_completions cc WHERE cc.campaign_id = c.id) AS completion_count,
         (SELECT COUNT(*) FROM campaign_completions cc WHERE cc.campaign_id = c.id AND cc.status = 'reviewed') AS reviewed_count
       FROM campaigns c WHERE ${whereClause}`,
      [isNumeric ? Number(id) : id]
    )

    if (!campaignRes.rows.length) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const campaignId = campaignRes.rows[0].id
    const completionsRes = await pool.query(
      `SELECT tester_wallet, auto_score, builder_rating, quality_score, status,
              reward_delivered, review_answers, contract_verified, created_at
       FROM campaign_completions WHERE campaign_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [campaignId]
    )

    return NextResponse.json({
      campaign:    campaignRes.rows[0],
      completions: completionsRes.rows,
    })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// PATCH — record deposit tx hash (called after builder funds USDC campaign)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { deposit_tx_hash, creator_wallet } = await req.json()
    if (!deposit_tx_hash || !creator_wallet) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

    const result = await pool.query(
      `UPDATE campaigns SET deposit_tx_hash = $1, status = 'active'
       WHERE id = $2 AND creator_wallet = $3 AND status = 'approved'
       RETURNING id`,
      [deposit_tx_hash, id, creator_wallet.toLowerCase()]
    )
    if (!result.rows.length) return NextResponse.json({ error: "Campaign not found, not owned by wallet, or not awaiting funding" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
