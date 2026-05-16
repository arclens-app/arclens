export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""
const PAYOUT_ADDR    = (process.env.PAYOUT_WALLET_ADDRESS || "").toLowerCase()
const ARCSCAN        = "https://testnet.arcscan.app/api/v2"

// USDC is the native gas + payout token on Arc, so a single threshold covers both.
// "Low" = comfortable buffer for a typical small campaign; "Critical" = topup-now.
const USDC_LOW_THRESHOLD  = 25
const USDC_CRIT_THRESHOLD = 5

function checkAuth(pw: string): boolean {
  if (!ADMIN_PASSWORD || !pw) return false
  const a = Buffer.from(pw)
  const b = Buffer.from(ADMIN_PASSWORD)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readPassword(req: NextRequest): string {
  const auth = req.headers.get("authorization") || ""
  return auth.startsWith("Bearer ") ? auth.slice(7) : ""
}

export async function GET(req: NextRequest) {
  if (!checkAuth(readPassword(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!PAYOUT_ADDR) {
    return NextResponse.json({ error: "PAYOUT_WALLET_ADDRESS not configured" }, { status: 500 })
  }

  try {
    // Fetch on-chain balance + committed-but-unpaid liability in parallel.
    // On Arc, USDC IS the native gas+payout token, so coin_balance (18 decimals)
    // is the single number we care about. We do NOT also sum the ERC20 view —
    // it's the same balance under a different lens and double-counts.
    const [coinRes, commitRes] = await Promise.all([
      fetch(`${ARCSCAN}/addresses/${PAYOUT_ADDR}`, { headers: { Accept: "application/json" } }),
      pool.query(`
        SELECT COALESCE(SUM(
          (c.total_slots - (
            SELECT COUNT(*) FROM campaign_completions cc
            WHERE cc.campaign_id = c.id AND cc.reward_delivered = true
          )) * c.reward_usdc_amount
        ), 0)::numeric AS committed
        FROM campaigns c
        WHERE c.status = 'active'
          AND c.reward_type = 'usdc'
          AND c.deposit_tx_hash IS NOT NULL
      `),
    ])

    let usdc = 0
    if (coinRes.ok) {
      const data = await coinRes.json()
      usdc = Number(data.coin_balance || 0) / 1e18
    }

    const committed = Number(commitRes.rows[0]?.committed || 0)
    const free      = usdc - committed

    return NextResponse.json({
      address:    PAYOUT_ADDR,
      usdc,
      committed,
      free,
      alerts: {
        critical:   usdc < USDC_CRIT_THRESHOLD,
        low:        usdc < USDC_LOW_THRESHOLD,
        underwater: free < 0,
      },
      thresholds: {
        low:  USDC_LOW_THRESHOLD,
        crit: USDC_CRIT_THRESHOLD,
      },
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[payout-balance]", e)
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 502 })
  }
}
