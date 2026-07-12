export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { privateKeyToAccount } from "viem/accounts"
import { getPool } from "@/lib/dbPool"

const pool = getPool()

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""
const ARCSCAN        = "https://testnet.arcscan.app/api/v2"

// Resolve the payout (DCW) address from any of these, in order of preference:
//   1. PAYOUT_WALLET_ADDRESS               — explicit env (preferred)
//   2. NEXT_PUBLIC_ARCLENS_PAYOUT_ADDRESS  — what some setups have under the
//      NEXT_PUBLIC_ name so the client can also display the deposit address
//   3. derived from PAYOUT_WALLET_PRIVATE_KEY — bulletproof fallback, the
//      private key uniquely determines the public address
// This way an env-name mismatch never breaks the DCW panel.
function resolvePayoutAddr(): string {
  const direct = process.env.PAYOUT_WALLET_ADDRESS || process.env.NEXT_PUBLIC_ARCLENS_PAYOUT_ADDRESS
  if (direct) return direct.toLowerCase()
  const pk = process.env.PAYOUT_WALLET_PRIVATE_KEY
  if (pk) {
    try {
      const normalized = pk.startsWith("0x") ? pk : `0x${pk}`
      return privateKeyToAccount(normalized as `0x${string}`).address.toLowerCase()
    } catch { /* invalid key shape — fall through to empty */ }
  }
  return ""
}

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
  const payoutAddr = resolvePayoutAddr()
  if (!payoutAddr) {
    return NextResponse.json({
      error: "Payout wallet not configured — set PAYOUT_WALLET_ADDRESS, or NEXT_PUBLIC_ARCLENS_PAYOUT_ADDRESS, or PAYOUT_WALLET_PRIVATE_KEY in Vercel env.",
    }, { status: 500 })
  }

  try {
    // Fetch on-chain balance + committed-but-unpaid liability in parallel.
    // On Arc, USDC IS the native gas+payout token, so coin_balance (18 decimals)
    // is the single number we care about. We do NOT also sum the ERC20 view —
    // it's the same balance under a different lens and double-counts.
    const [coinRes, commitRes] = await Promise.all([
      fetch(`${ARCSCAN}/addresses/${payoutAddr}`, { headers: { Accept: "application/json" } }),
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

    // CRITICAL: don't silently default to 0 on Arcscan failures.
    // Previously a transient 5xx from Arcscan returned usdc=0 which got
    // cached for 60s — causing the admin balance to flap between "$8" and
    // "$0" depending on whether the last fetch succeeded. Now we surface
    // null + fetchError so the UI can clearly show "—" + a "retry" hint.
    let usdc: number | null = null
    let fetchError: string | null = null
    if (coinRes.ok) {
      try {
        const data = await coinRes.json()
        usdc = Number(data.coin_balance || 0) / 1e18
      } catch {
        fetchError = "Arcscan returned malformed JSON"
      }
    } else {
      fetchError = `Arcscan responded ${coinRes.status}`
    }

    const committed = Number(commitRes.rows[0]?.committed || 0)
    const free      = usdc != null ? usdc - committed : null

    const headers: Record<string, string> = {
      // Only cache successful reads. Errors must NOT be cached or a
      // transient blip locks the UI to "0" for 60s.
      "Cache-Control": fetchError ? "no-store" : "private, max-age=60",
    }

    return NextResponse.json({
      address:     payoutAddr,
      usdc,
      committed,
      free,
      fetchError,
      alerts: {
        critical:   usdc != null && usdc < USDC_CRIT_THRESHOLD,
        low:        usdc != null && usdc < USDC_LOW_THRESHOLD,
        underwater: free != null && free < 0,
      },
      thresholds: {
        low:  USDC_LOW_THRESHOLD,
        crit: USDC_CRIT_THRESHOLD,
      },
    }, { headers })
  } catch (e) {
    console.error("[payout-balance]", e)
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 502 })
  }
}
