// src/app/api/lens/board/route.ts
//
// Public read for the Lens AI showcase (/lens): headline payout totals + the
// most-cited builders board. Non-PII aggregates only. Cached at the edge.

export const runtime = "nodejs"
import { NextResponse } from "next/server"
import { getPayoutStats, getBuilderBoard, payoutsLive } from "@/lib/lensPay"

export async function GET() {
  try {
    // Show every paid builder, not a truncated top-25. The board caps at 100
    // (getBuilderBoard's own ceiling) which is well above current volume.
    const [stats, board] = await Promise.all([getPayoutStats(), getBuilderBoard(100)])
    return NextResponse.json(
      { live: payoutsLive(), ...stats, board },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" } },
    )
  } catch (e: any) {
    console.error("[lens/board]", e?.message || e)
    return NextResponse.json({ live: false, totalPaidUsd: "$0.0000", total_paid_e6: 0, payouts: 0, builders_paid: 0, recent: [], board: [] })
  }
}
