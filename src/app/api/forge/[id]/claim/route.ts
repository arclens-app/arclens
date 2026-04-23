import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tester_wallet } = await req.json()
    const { id } = await params

    if (!tester_wallet?.trim()) return NextResponse.json({ error: "Wallet required" }, { status: 400 })

    // Resolve slug or numeric id
    const isNumeric = /^\d+$/.test(id)
    const campRes = await pool.query(
      `SELECT id, status, reward_type, reward_usdc_amount, deposit_tx_hash FROM campaigns WHERE ${isNumeric ? "id = $1" : "slug = $1"}`,
      [isNumeric ? Number(id) : id]
    )
    const campaignId: number = campRes.rows[0]?.id
    if (!campRes.rows.length)              return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    const campaign = campRes.rows[0]
    if (campaign.status !== "active")      return NextResponse.json({ error: "Campaign is not active" }, { status: 400 })
    if (campaign.reward_type !== "usdc")   return NextResponse.json({ error: "This campaign does not offer USDC rewards" }, { status: 400 })
    if (!campaign.reward_usdc_amount)      return NextResponse.json({ error: "USDC reward amount not set" }, { status: 400 })
    if (!campaign.deposit_tx_hash)         return NextResponse.json({ error: "Campaign has not been funded by the founder yet" }, { status: 400 })

    // Fetch completion
    const compRes = await pool.query(
      `SELECT id, auto_score, reward_delivered
       FROM campaign_completions WHERE campaign_id = $1 AND tester_wallet = $2`,
      [campaignId, tester_wallet.toLowerCase()]
    )
    if (!compRes.rows.length)        return NextResponse.json({ error: "No completion found for this wallet" }, { status: 404 })
    const completion = compRes.rows[0]
    if (completion.reward_delivered) return NextResponse.json({ error: "Reward already claimed" }, { status: 400 })
    if (completion.auto_score < 1)   return NextResponse.json({ error: "Completion not scored yet" }, { status: 400 })

    const payoutKey = process.env.PAYOUT_WALLET_PRIVATE_KEY
    if (!payoutKey) {
      return NextResponse.json({ error: "USDC payouts not yet configured — contact the campaign builder directly" }, { status: 503 })
    }

    // Arc App Kit — server-side USDC send on Arc Testnet
    const { createAdapterFromPrivateKey } = await import("@circle-fin/adapter-viem-v2")
    const { AppKit }                      = await import("@circle-fin/app-kit")

    const adapter = await createAdapterFromPrivateKey({
      privateKey: payoutKey as `0x${string}`,
    } as any)

    const kit    = new AppKit()
    const result = await kit.send({
      from:   { adapter, chain: "Arc_Testnet" },
      to:     tester_wallet.toLowerCase(),
      amount: String(campaign.reward_usdc_amount),
      token:  "USDC",
    })

    const txHash = (result as any).txHash || (result as any).hash || ""

    // Mark as delivered
    await pool.query(
      `UPDATE campaign_completions SET reward_delivered = true WHERE id = $1`,
      [completion.id]
    )

    return NextResponse.json({ success: true, tx_hash: txHash, amount: campaign.reward_usdc_amount })
  } catch (e) {
    console.error("[Claim]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
