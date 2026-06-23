// src/app/api/lens/earnings/route.ts
//
// One project's Lens AI earnings — powers the builder-facing card on the
// founder dashboard. Public, non-PII aggregate (the same numbers appear on the
// public board), so no auth needed.

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { getProjectEarnings } from "@/lib/lensPay"

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") || "").trim()
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 })
  try {
    return NextResponse.json(await getProjectEarnings(slug), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" },
    })
  } catch (e: any) {
    console.error("[lens/earnings]", e?.message || e)
    return NextResponse.json({ cites: 0, earned_e6: 0, earnedUsd: "$0.0000", last_cited: null })
  }
}
