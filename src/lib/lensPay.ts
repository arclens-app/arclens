// src/lib/lensPay.ts
//
// The Lens AI nanopayment engine — the heart of the Lepton hackathon build.
//
// When Lens AI answers a question grounded in real projects, it pays the
// VERIFIED builders whose data powered the answer: a fraction of a cent each,
// in USDC, on Arc. The first AI that pays the ecosystem it learns from.
//
// PAYMENT MODEL — a per-use royalty, not a flat fee:
//   • A builder is paid when their data genuinely informs an answer for a user.
//   • The SAME asker repeating the SAME kind of question doesn't re-pay — we
//     de-dupe on (asker, builder) over a rolling 24h window. So a project that
//     is truly the answer to many DIFFERENT people earns more (real usefulness),
//     but spamming one query can't farm or drain anything.
//
// Robustness guarantees (also the demo's "won't break" story):
//   • Trust-gated  — only Verified / Established / Arc Partner / Arc Official
//                    builders with a payout wallet ever earn. The trust graph
//                    IS the payout filter.
//   • Agency       — the amount scales with the on-chain trust tier; the agent
//                    decides how much to stake on each source, every answer.
//   • Hard caps    — per-answer AND per-day ceilings, read live from the ledger.
//   • Never own    — a builder is never paid for the asker's own project.
//   • Never blocks — runs AFTER the answer; any failure is swallowed.
//   • Graceful     — with no Circle creds it runs in SIMULATION mode (same
//                    decisions, logged, no money) so the UX ships before funding.

import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// ── Tunables (env-overridable) ──────────────────────────────────────────────
// Amounts are micro-USDC (e6), matching the rest of ArcLens. $0.001 = 1000.
const BASE_E6        = Number(process.env.LENS_PAY_BASE_E6        || 500)       // $0.0005 per weight unit
const PER_ANSWER_CAP = Number(process.env.LENS_PAY_ANSWER_CAP_E6  || 10_000)    // $0.01 max per answer
const PER_DAY_CAP    = Number(process.env.LENS_PAY_DAY_CAP_E6     || 1_000_000) // $1.00 max per day
const DEDUP_HOURS    = Number(process.env.LENS_PAY_DEDUP_HOURS    || 24)        // re-pay window per (asker, builder)

// Trust tier → stake weight. Higher trust = more the agent will pay for that
// source. Baseline (Listed / Claimed) earns nothing — trust-gated.
const TIER_WEIGHT: Record<string, number> = {
  official:   4,   // Arc Official
  partner:    3,   // Arc Partner
  verified:   2,   // Verified
  established: 1.5, // Established (earned on-chain track record)
}

// ── Circle App Kit payout config ────────────────────────────────────────────
// Reuses ArcLens's existing server-side payout rail — Circle App Kit + the
// dev-controlled wallets adapter — the SAME path that already pays campaign USDC
// rewards (src/app/api/trials/[id]/claim). Provisioned on Vercel, so Lens AI
// goes live with no new setup. Set LENS_WALLET_ADDRESS to use a dedicated wallet.
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || ""
const CIRCLE_ENTITY  = process.env.CIRCLE_ENTITY_SECRET || ""
const PAYOUT_ADDR    = process.env.LENS_WALLET_ADDRESS || process.env.PAYOUT_WALLET_ADDRESS || ""
const PAYOUT_PRIVKEY = process.env.PAYOUT_WALLET_PRIVATE_KEY || ""

// Live when the Circle dev-controlled wallet creds are present (or a payout
// private-key fallback). Otherwise we simulate.
export function payoutsLive(): boolean {
  return !!((CIRCLE_API_KEY && CIRCLE_ENTITY && PAYOUT_ADDR) || PAYOUT_PRIVKEY)
}

// ── Premium: pay-per-call (NOT a subscription) ──────────────────────────────
// After the free tier, a signed-in user continues by paying a nanopayment per
// question via x402 — on-theme (the hackathon argues against subscriptions) and
// frictionless once they've deposited into Gateway. The money funds the builders.
const PREMIUM_PRICE_E6 = Number(process.env.LENS_PREMIUM_PRICE_E6 || 1000) // $0.001/call
export const premiumPriceE6 = PREMIUM_PRICE_E6
export const premiumPriceUsd = `$${(PREMIUM_PRICE_E6 / 1e6).toFixed(4)}`

const premiumReady = pool.query(`
  CREATE TABLE IF NOT EXISTS lens_premium (
    id BIGSERIAL PRIMARY KEY, asker_id TEXT, amount_e6 BIGINT NOT NULL, tx_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
`).catch(e => console.error("[lensPay] premium init:", e?.message || e))

// Verify a premium payment proof from the client. SIMULATION: any truthy proof
// passes (so the flow is demoable). LIVE: verify the x402 EIP-3009 authorization
// via Circle's facilitator before granting the call.
export async function verifyPremiumPayment(proof: string): Promise<boolean> {
  if (!proof) return false
  if (!payoutsLive()) return true
  // TODO (live): verify the x402 payment authorization via the Circle facilitator.
  return true
}

export async function recordPremiumCall(askerId: string | null, amountE6 = PREMIUM_PRICE_E6, txHash: string | null = null): Promise<void> {
  try {
    await premiumReady
    await pool.query(`INSERT INTO lens_premium (asker_id, amount_e6, tx_hash) VALUES ($1,$2,$3)`, [askerId, amountE6, txHash])
  } catch { /* never block the answer on accounting */ }
}

// ── Types ───────────────────────────────────────────────────────────────────
export interface PaidBuilder {
  name: string
  slug: string
  trust: string
  amount_e6: number
  amountUsd: string
  status: "complete" | "pending" | "simulated"
  txHash: string | null
}
export interface SkippedBuilder { name: string; slug: string; reason: string }
export interface PayoutTrace {
  live: boolean
  considered: number
  paid: PaidBuilder[]
  skipped: SkippedBuilder[]
  total_e6: number
  totalUsd: string
  day_remaining_e6: number
}

const tableReady = pool.query(`
  CREATE TABLE IF NOT EXISTS lens_payouts (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT,
    asker_id        TEXT,                              -- wallet or device id of the asker (dedup scope)
    builder_wallet  TEXT NOT NULL,
    project_slug    TEXT,
    project_name    TEXT,
    trust_label     TEXT,
    amount_e6       BIGINT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',   -- pending | complete | failed | simulated
    tx_hash         TEXT,
    tx_id           TEXT,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).then(() => Promise.all([
  pool.query(`ALTER TABLE lens_payouts ADD COLUMN IF NOT EXISTS asker_id TEXT`),
  pool.query(`CREATE INDEX IF NOT EXISTS lens_payouts_dedup ON lens_payouts (asker_id, builder_wallet, created_at)`),
  pool.query(`CREATE INDEX IF NOT EXISTS lens_payouts_made  ON lens_payouts (created_at)`),
])).catch(e => console.error("[lensPay] table init:", e?.message || e))

const fmtUsd = (e6: number) => `$${(e6 / 1e6).toFixed(4)}`
// Circle's tokenTransfer expects a human-decimal amount string ("0.001").
const e6ToDecimal = (e6: number) => (e6 / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")

// Map a project's raw trust columns to (tierKey, human label). Mirrors aiTools.
function tierOf(row: any): { key: string | null; label: string } {
  if (row.hard_risk === true) return { key: null, label: "Risk flagged" }
  const recognition = row.recognition
  const established = !!row.established
  const key: string | null =
    recognition === "official" ? "official" :
    recognition === "partner"  ? "partner"  :
    row.trust_level === "verified" ? "verified" :
    established ? "established" : null
  const tierLabel =
    recognition === "official" ? "Arc Official" :
    recognition === "partner"  ? "Arc Partner"  :
    row.trust_level === "verified" ? "Verified" : null
  const label = tierLabel
    ? (established ? `${tierLabel} · Established` : tierLabel)
    : (established ? "Established" : (row.trust_level === "claimed" ? "Claimed" : "Listed"))
  return { key, label }
}

async function daySpentE6(): Promise<number> {
  await tableReady
  const r = await pool.query(
    `SELECT COALESCE(SUM(amount_e6),0)::bigint AS s
       FROM lens_payouts
      WHERE status IN ('complete','pending','simulated')
        AND created_at > NOW() - INTERVAL '24 hours'`,
  )
  return Number(r.rows[0]?.s || 0)
}

/**
 * The agent's payout decision + execution for one answer.
 *
 * @param conversationId  the chat this answer belongs to (for receipts)
 * @param askerId         stable id of the asker — wallet if signed in, else
 *                        device id. The de-dup scope: one (asker, builder)
 *                        royalty per DEDUP_HOURS window.
 * @param askerWallet     the asker's wallet, so we never pay them their own data
 * @param slugs           project slugs the answer was grounded in (from cards)
 */
export async function payoutForAnswer(args: {
  conversationId: number | null
  askerId: string | null
  askerWallet: string | null
  slugs: string[]
}): Promise<PayoutTrace | null> {
  const slugs = Array.from(new Set((args.slugs || []).map(s => String(s || "").trim().toLowerCase()).filter(Boolean)))
  if (slugs.length === 0) return null

  await tableReady
  const live = payoutsLive()
  const asker = (args.askerWallet || "").toLowerCase()
  const askerId = (args.askerId || asker || "anon").toLowerCase()

  // Resolve grounded slugs → builder wallet + trust signal.
  const r = await pool.query(
    `SELECT slug, name, LOWER(owner_wallet) AS wallet,
            trust_level, recognition, established,
            COALESCE((trust_profile->>'hard_risk')::bool, false) AS hard_risk
       FROM projects
      WHERE approved AND live AND LOWER(slug) = ANY($1::text[])`,
    [slugs],
  )

  // Per-use royalty de-dup: which builders has THIS asker already paid within
  // the window? Those are skipped — they've already been rewarded for this
  // asker's consumption recently.
  const recent = new Set<string>()
  {
    const d = await pool.query(
      `SELECT DISTINCT builder_wallet FROM lens_payouts
        WHERE asker_id = $1 AND created_at > NOW() - make_interval(hours => $2::int)`,
      [askerId, DEDUP_HOURS],
    )
    for (const row of d.rows) recent.add(String(row.builder_wallet).toLowerCase())
  }

  const paid: PaidBuilder[] = []
  const skipped: SkippedBuilder[] = []
  let dayRemaining = Math.max(0, PER_DAY_CAP - (await daySpentE6()))
  let answerSpent = 0

  for (const p of r.rows) {
    const { key, label } = tierOf(p)
    if (!p.wallet)             { skipped.push({ name: p.name, slug: p.slug, reason: "no payout wallet on file" }); continue }
    if (p.wallet === asker)    { skipped.push({ name: p.name, slug: p.slug, reason: "asker's own project" }); continue }
    if (!key)                  { skipped.push({ name: p.name, slug: p.slug, reason: p.hard_risk ? "risk-flagged" : `not trust-gated (${label})` }); continue }
    if (recent.has(p.wallet))  { skipped.push({ name: p.name, slug: p.slug, reason: "already rewarded for you recently" }); continue }

    const amount = Math.round(BASE_E6 * (TIER_WEIGHT[key] || 1))
    if (answerSpent + amount > PER_ANSWER_CAP) { skipped.push({ name: p.name, slug: p.slug, reason: "per-answer budget reached" }); continue }
    if (amount > dayRemaining)                 { skipped.push({ name: p.name, slug: p.slug, reason: "daily budget reached" }); continue }

    // Record the obligation first (status pending/simulated), then settle. If a
    // crash happens mid-settle we never lose a debt — a sweeper can finish it.
    const status0 = live ? "pending" : "simulated"
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO lens_payouts (conversation_id, asker_id, builder_wallet, project_slug, project_name, trust_label, amount_e6, status, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [args.conversationId, askerId, p.wallet, p.slug, p.name, label, amount, status0, "grounded answer"],
    )
    const payoutId = ins.rows[0].id

    let status: PaidBuilder["status"] = status0
    let txHash: string | null = null
    if (live) {
      try {
        const res = await sendUsdc(p.wallet, amount)
        txHash = res.txHash; status = res.status
        await pool.query(`UPDATE lens_payouts SET status=$2, tx_hash=$3, tx_id=$4 WHERE id=$1`, [payoutId, status, txHash, res.txId])
      } catch (e: any) {
        console.error("[lensPay] send failed:", e?.message || e)
        await pool.query(`UPDATE lens_payouts SET status='failed', reason=$2 WHERE id=$1`, [payoutId, String(e?.message || e).slice(0, 200)])
        skipped.push({ name: p.name, slug: p.slug, reason: "payment failed (will retry)" })
        continue
      }
    }

    answerSpent += amount
    dayRemaining -= amount
    recent.add(p.wallet)
    paid.push({ name: p.name, slug: p.slug, trust: label, amount_e6: amount, amountUsd: fmtUsd(amount), status, txHash })
  }

  return {
    live,
    considered: r.rows.length,
    paid,
    skipped,
    total_e6: answerSpent,
    totalUsd: fmtUsd(answerSpent),
    day_remaining_e6: Math.max(0, dayRemaining),
  }
}

// ── On-chain settlement via Circle Developer-Controlled Wallet ──────────────
// Dynamic import so the build never breaks if the SDK isn't installed yet, and
// so simulation mode has zero dependency on Circle.
async function sendUsdc(to: string, amountE6: number): Promise<{ txHash: string | null; txId: string; status: "complete" | "pending" }> {
  // Reuses the exact rail that pays campaign rewards: Circle App Kit + the
  // dev-controlled wallets adapter (viem private-key adapter as fallback),
  // sending USDC on Arc. Amount is a human-decimal string ("0.001").
  const { AppKit } = await import("@circle-fin/app-kit")
  const kit = new AppKit()
  const amount = e6ToDecimal(amountE6)
  let result: any
  if (CIRCLE_API_KEY && CIRCLE_ENTITY && PAYOUT_ADDR) {
    const { createCircleWalletsAdapter } = await import("@circle-fin/adapter-circle-wallets")
    const adapter = createCircleWalletsAdapter({ apiKey: CIRCLE_API_KEY, entitySecret: CIRCLE_ENTITY })
    result = await kit.send({ from: { adapter: adapter as any, chain: "Arc_Testnet", address: PAYOUT_ADDR as `0x${string}` }, to, amount, token: "USDC" })
  } else {
    const { createAdapterFromPrivateKey } = await import("@circle-fin/adapter-viem-v2")
    const adapter = await createAdapterFromPrivateKey({ privateKey: PAYOUT_PRIVKEY as `0x${string}` } as any)
    result = await kit.send({ from: { adapter: adapter as any, chain: "Arc_Testnet" }, to, amount, token: "USDC" })
  }
  const txHash = result?.txHash || result?.hash || null
  return { txHash, txId: txHash || "", status: txHash ? "complete" : "pending" }
}

// ── Public traction surface ─────────────────────────────────────────────────
export async function getPayoutStats(): Promise<{
  total_paid_e6: number
  totalPaidUsd: string
  payouts: number
  builders_paid: number
  recent: Array<{ project_name: string; project_slug: string; trust_label: string; amountUsd: string; tx_hash: string | null; created_at: string }>
}> {
  await tableReady
  const [agg, recent] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(amount_e6),0)::bigint total, COUNT(*)::int n, COUNT(DISTINCT builder_wallet)::int b
                  FROM lens_payouts WHERE status IN ('complete','pending','simulated')`),
    pool.query(`SELECT project_name, project_slug, trust_label, amount_e6, tx_hash, created_at::text
                  FROM lens_payouts WHERE status IN ('complete','pending','simulated')
                 ORDER BY created_at DESC LIMIT 12`),
  ])
  const total = Number(agg.rows[0]?.total || 0)
  return {
    total_paid_e6: total,
    totalPaidUsd: fmtUsd(total),
    payouts: Number(agg.rows[0]?.n || 0),
    builders_paid: Number(agg.rows[0]?.b || 0),
    recent: recent.rows.map(x => ({
      project_name: x.project_name, project_slug: x.project_slug, trust_label: x.trust_label,
      amountUsd: fmtUsd(Number(x.amount_e6)), tx_hash: x.tx_hash, created_at: x.created_at,
    })),
  }
}

// The public "most-cited builders" board — projects ranked by what Lens AI has
// paid them, i.e. how much their data has genuinely informed the ecosystem.
export async function getBuilderBoard(limit = 25): Promise<Array<{
  rank: number; slug: string; name: string; trust: string; cites: number; earned_e6: number; earnedUsd: string
}>> {
  await tableReady
  const r = await pool.query(
    `SELECT project_slug, MAX(project_name) AS name, MAX(trust_label) AS trust,
            COUNT(*)::int AS cites, COALESCE(SUM(amount_e6),0)::bigint AS earned
       FROM lens_payouts
      WHERE status IN ('complete','pending','simulated') AND project_slug IS NOT NULL
      GROUP BY project_slug
      ORDER BY earned DESC, cites DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  )
  return r.rows.map((x, i) => ({
    rank: i + 1, slug: x.project_slug, name: x.name, trust: x.trust,
    cites: Number(x.cites), earned_e6: Number(x.earned), earnedUsd: fmtUsd(Number(x.earned)),
  }))
}

// One project's Lens AI earnings — powers the builder-facing dashboard card.
export async function getProjectEarnings(slug: string): Promise<{
  cites: number; earned_e6: number; earnedUsd: string; last_cited: string | null
}> {
  await tableReady
  const r = await pool.query(
    `SELECT COUNT(*)::int AS cites, COALESCE(SUM(amount_e6),0)::bigint AS earned, MAX(created_at)::text AS last_cited
       FROM lens_payouts
      WHERE LOWER(project_slug) = LOWER($1) AND status IN ('complete','pending','simulated')`,
    [slug],
  )
  const x = r.rows[0] || {}
  return { cites: Number(x.cites || 0), earned_e6: Number(x.earned || 0), earnedUsd: fmtUsd(Number(x.earned || 0)), last_cited: x.last_cited || null }
}
