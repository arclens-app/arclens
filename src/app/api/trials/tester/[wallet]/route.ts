import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// PATCH /api/trials/tester/[wallet] — update pfp_url
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params
  const w = wallet.toLowerCase()
  try {
    const { pfp_url } = await req.json()
    if (!pfp_url || typeof pfp_url !== "string") {
      return NextResponse.json({ error: "pfp_url required" }, { status: 400 })
    }
    // Upsert: create reputation row if not exists, then set pfp_url
    await pool.query(
      `INSERT INTO tester_reputation (wallet, pfp_url)
       VALUES ($1, $2)
       ON CONFLICT (wallet) DO UPDATE SET pfp_url = EXCLUDED.pfp_url`,
      [w, pfp_url]
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params
  const w = wallet.toLowerCase()
  try {
    const [repRes, historyRes] = await Promise.all([
      pool.query(`SELECT * FROM tester_reputation WHERE wallet = $1`, [w]),
      pool.query(`
        SELECT
          cc.campaign_id, cc.auto_score, cc.builder_rating, cc.quality_score,
          cc.contract_verified, cc.created_at, cc.status, cc.reward_delivered,
          c.title, c.type, c.project_name, c.project_logo,
          c.reward_type, c.reward_usdc_amount
        FROM campaign_completions cc
        JOIN campaigns c ON c.id = cc.campaign_id
        WHERE cc.tester_wallet = $1
        ORDER BY cc.created_at DESC
        LIMIT 50
      `, [w]),
    ])
    return NextResponse.json({
      reputation: repRes.rows[0] || null,
      history:    historyRes.rows,
    }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
