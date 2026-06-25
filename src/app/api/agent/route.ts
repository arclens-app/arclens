// src/app/api/agent/route.ts
//
// Lens AI as an AGENT other agents pay. An x402-priced trust & ecosystem oracle
// for Arc: another agent asks "is this project legit?", "find verified DeFi",
// "give me X's metrics" — pays a nanopayment in USDC — and gets a structured
// answer. The twist that keeps it on-mission: that payment funds the verified
// builders whose data answered it. Agents pay Lens AI → Lens AI pays builders.
//
// GET  → a self-describing manifest (agent-discoverable).
// POST → pay-per-call (x402). 402 with the price until a payment proof is sent.

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { enforce, getIp } from "@/lib/ratelimit"
import { verifyPremiumPayment, recordPremiumCall, premiumPriceE6, premiumPriceUsd, payoutForAnswer } from "@/lib/lensPay"
import { gatewayConfigured, verifyAndSettle, paymentRequiredHeader, paymentResponseHeader } from "@/lib/gateway"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const TRUST_COLS = `trust_level, recognition, established, COALESCE((trust_profile->>'hard_risk')::bool, false) AS hard_risk`
function trustLabel(p: any): string {
  if (p.hard_risk) return "Risk flagged"
  const base =
    p.recognition === "official" ? "Arc Official" :
    p.recognition === "partner"  ? "Arc Partner"  :
    p.trust_level === "verified" ? "Verified" :
    p.trust_level === "claimed"  ? "Claimed"  : "Listed"
  return p.established ? (base === "Claimed" || base === "Listed" ? "Established" : `${base} · Established`) : base
}
function fmtUsd(e6: string | null): string {
  if (e6 == null) return "$0"
  const n = Number(BigInt(e6)) / 1e6
  if (!Number.isFinite(n) || n === 0) return "$0"
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

const MANIFEST = {
  name: "Lens AI",
  summary: "Pay-per-call trust & ecosystem intelligence for Arc, settled in USDC. Ask who's legit, who's building what, or for a project's live metrics — and your call pays the verified builders whose data answers it.",
  protocol: "x402",
  network: "Arc",
  token: "USDC",
  price: premiumPriceUsd,
  price_e6: premiumPriceE6,
  pay_header: "x-lens-pay",
  actions: {
    trust:    { description: "Trust verdict for a project on Arc.", params: { target: "project name or slug" } },
    discover: { description: "Find Arc projects, optionally trusted-only.", params: { category: "optional", trusted_only: "optional bool", limit: "1-20 (default 8)" } },
    project:  { description: "A project's live metrics + trust standing.", params: { name: "project name or slug" } },
  },
}

export async function GET() {
  return NextResponse.json(MANIFEST, { headers: { "Cache-Control": "public, s-maxage=300" } })
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "agent-api", { limit: 30, windowMs: 60_000 })
  if (blocked) return blocked

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }) }
  const action = String(body?.action || "").toLowerCase()
  if (!["trust", "discover", "project"].includes(action)) {
    return NextResponse.json({ error: "Unknown action — see manifest.", ...MANIFEST }, { status: 400 })
  }

  // x402 — pay per call. Real Circle Gateway settlement when a standard
  // `payment-signature` header is present (and SELLER_ADDRESS configured);
  // otherwise the `x-lens-pay` demo proof. No payment → 402 with the price.
  const sig = req.headers.get("payment-signature") || ""
  let paid = false
  let settledTx: string | null = null
  if (sig && gatewayConfigured()) {
    const st = await verifyAndSettle(sig, premiumPriceE6)
    paid = st.ok
    settledTx = st.tx ?? null
  } else {
    const proof = req.headers.get("x-lens-pay") || ""
    paid = proof ? await verifyPremiumPayment(proof) : false
  }
  if (!paid) {
    return NextResponse.json(
      { error: "Payment required — this is a pay-per-call service.", code: "payment_required", ...MANIFEST },
      {
        status: 402,
        headers: {
          "x-payment-price": premiumPriceUsd,
          "x-payment-token": "USDC",
          "x-payment-network": "Arc",
          "PAYMENT-REQUIRED": paymentRequiredHeader(premiumPriceE6, "/api/agent"),
        },
      },
    )
  }

  const agentId = "agent:" + (req.headers.get("x-agent-id") || getIp(req))
  const slugs: string[] = []
  let result: any = {}

  try {
    if (action === "trust" || action === "project") {
      const q = String(body?.target || body?.name || "").trim()
      if (!q) return NextResponse.json({ error: "target/name required" }, { status: 400 })
      const r = await pool.query(
        `SELECT name, slug, category, tagline, ${TRUST_COLS},
                tvl_usd_e6::text tvl, volume_cum_usd_e6::text volume, revenue_cum_usd_e6::text revenue
           FROM projects WHERE approved AND live AND (slug ILIKE $1 OR name ILIKE $1)
          ORDER BY (slug = LOWER($2)) DESC LIMIT 1`,
        [`%${q}%`, q.toLowerCase()],
      )
      if (!r.rows[0]) result = { found: false, note: `No live Arc project matching "${q}".` }
      else {
        const p = r.rows[0]; slugs.push(p.slug)
        result = action === "trust"
          ? { found: true, name: p.name, slug: p.slug, trust: trustLabel(p) }
          : { found: true, name: p.name, slug: p.slug, category: p.category, trust: trustLabel(p), tvl: fmtUsd(p.tvl), volume: fmtUsd(p.volume), revenue: fmtUsd(p.revenue) }
      }
    } else {
      const lim = Math.min(Math.max(Number(body?.limit) || 8, 1), 20)
      const params: any[] = []
      const where = ["approved", "live"]
      if (body?.category) { params.push(body.category); where.push(`category ILIKE $${params.length}`) }
      if (body?.trusted_only) where.push(`(recognition IN ('official','partner') OR trust_level='verified' OR established=true) AND COALESCE((trust_profile->>'hard_risk')::bool, false) = false`)
      params.push(lim)
      const r = await pool.query(
        `SELECT name, slug, category, tagline, ${TRUST_COLS} FROM projects
          WHERE ${where.join(" AND ")} ORDER BY featured DESC, view_count DESC NULLS LAST LIMIT $${params.length}`,
        params,
      )
      for (const p of r.rows) slugs.push(p.slug)
      result = { count: r.rows.length, projects: r.rows.map((p: any) => ({ name: p.name, slug: p.slug, category: p.category, tagline: p.tagline, trust: trustLabel(p) })) }
    }
  } catch (e: any) {
    console.error("[agent]", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }

  // The agent's payment funds the builders whose data answered it, then we log
  // the premium. Never block the response on the money plumbing.
  let payout: any = null
  try { if (slugs.length) payout = await payoutForAnswer({ conversationId: null, askerId: agentId, askerWallet: null, slugs }) } catch {}
  recordPremiumCall(agentId, premiumPriceE6, settledTx).catch(() => {})

  return NextResponse.json(
    {
      action,
      result,
      paid_to_builders: payout?.paid?.map((b: any) => ({ project: b.name, amount: b.amountUsd, trust: b.trust, tx: b.txHash })) ?? [],
      settled_on: "Arc",
    },
    settledTx ? { headers: { "PAYMENT-RESPONSE": paymentResponseHeader(settledTx) } } : undefined,
  )
}
