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
//   • Trust-gated  — earning is by ARC-NATIVE signal: Verified, Established, or a
//                    team that claimed its Arc project with a wallet. Big protocols
//                    listed as partners simply haven't claimed a wallet here yet —
//                    they become eligible if/when they do; nothing moves until then.
//                    Only the chain itself is hard-excluded. The trust graph IS
//                    the payout filter.
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
// Never pay these — not real builders (e.g. "arc" is the chain itself).
const PAYOUT_EXCLUDE = new Set((process.env.LENS_PAYOUT_EXCLUDE || "arc").split(",").map(s => s.trim().toLowerCase()).filter(Boolean))

// Trust tier → stake weight. Higher trust = more the agent will pay for that
// source. Baseline (Listed / Claimed) earns nothing — trust-gated.
// Earn rates by ARC-NATIVE builder signal. Infra partners / the chain are NOT
// here — they don't earn. A team that claimed their Arc project earns the base;
// ArcLens-verified / established earn more.
const TIER_WEIGHT: Record<string, number> = {
  verified:    2,
  established: 1.5,
  claimed:     1,
}

// ── Circle App Kit payout config ────────────────────────────────────────────
// Reuses ArcLens's existing server-side payout rail — Circle App Kit + the
// dev-controlled wallets adapter — the SAME path that already pays campaign USDC
// rewards (src/app/api/trials/[id]/claim). Provisioned on Vercel, so Lens AI
// goes live with no new setup. Set LENS_WALLET_ADDRESS to use a dedicated wallet.
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || ""
const CIRCLE_ENTITY  = process.env.CIRCLE_ENTITY_SECRET || ""
const LENS_WALLET_ID = process.env.LENS_WALLET_ID || ""              // Lens AI's own dev-controlled wallet id
const PAYOUT_ADDR    = process.env.LENS_WALLET_ADDRESS || process.env.PAYOUT_WALLET_ADDRESS || ""
const PAYOUT_PRIVKEY = process.env.PAYOUT_WALLET_PRIVATE_KEY || ""
const USDC_TOKEN_ID  = process.env.CIRCLE_USDC_TOKEN_ID || ""        // Circle USDC token id on Arc
const USDC_ADDRESS   = process.env.USDC_ARC_ADDRESS || ""            // …or the USDC contract address on Arc
let _usdcTokenId = USDC_TOKEN_ID                                     // resolved lazily from the wallet's balances

// Live when the Circle dev-controlled wallet creds are present (own wallet id or
// a payout address), or a payout private-key fallback. Otherwise we simulate.
export function payoutsLive(): boolean {
  return !!((CIRCLE_API_KEY && CIRCLE_ENTITY && (LENS_WALLET_ID || PAYOUT_ADDR)) || PAYOUT_PRIVKEY)
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
  status: "complete" | "pending" | "simulated" | "accrued"
  txHash: string | null
}
export interface SkippedBuilder { name: string; slug: string; reason: string }
export interface PayoutTrace {
  live: boolean
  considered: number
  paid: PaidBuilder[]
  accrued: PaidBuilder[]   // trusted builders with no wallet yet — credited, pending claim
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
  const accrued: PaidBuilder[] = []
  const skipped: SkippedBuilder[] = []
  let dayRemaining = Math.max(0, PER_DAY_CAP - (await daySpentE6()))
  let answerSpent = 0

  for (const p of r.rows) {
    if (PAYOUT_EXCLUDE.has(String(p.slug || "").toLowerCase())) { skipped.push({ name: p.name, slug: p.slug, reason: "excluded — the chain, not a builder" }); continue }
    const { label } = tierOf(p)
    // STANDARD: only ARC-NATIVE builders earn — a team that claimed their Arc
    // project, or one ArcLens verified/established. Infra partners (admin-added,
    // e.g. MetaMask) and the chain itself are NOT builders and earn nothing.
    const earnKey =
      p.hard_risk ? null :
      p.trust_level === "verified" ? "verified" :
      p.established ? "established" :
      p.wallet ? "claimed" : null
    if (!earnKey)                      { skipped.push({ name: p.name, slug: p.slug, reason: p.hard_risk ? "risk-flagged" : "not an Arc-native builder" }); continue }
    if (p.wallet && p.wallet === asker){ skipped.push({ name: p.name, slug: p.slug, reason: "asker's own project" }); continue }

    const amount = Math.round(BASE_E6 * (TIER_WEIGHT[earnKey] || 1))
    const dedupKey = p.wallet || `unclaimed:${p.slug}`
    if (recent.has(dedupKey))          { skipped.push({ name: p.name, slug: p.slug, reason: "already rewarded for you recently" }); continue }

    // Trusted but NO wallet yet → ACCRUE (pending claim). No money moves, no
    // budget consumed; the builder collects when they connect a wallet.
    if (!p.wallet) {
      await pool.query(
        `INSERT INTO lens_payouts (conversation_id, asker_id, builder_wallet, project_slug, project_name, trust_label, amount_e6, status, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'accrued','accrued — pending claim')`,
        [args.conversationId, askerId, dedupKey, p.slug, p.name, label, amount],
      )
      recent.add(dedupKey)
      accrued.push({ name: p.name, slug: p.slug, trust: label, amount_e6: amount, amountUsd: fmtUsd(amount), status: "accrued", txHash: null })
      continue
    }

    // Trusted WITH a wallet → real on-chain payout (USD caps apply).
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
    recent.add(dedupKey)
    paid.push({ name: p.name, slug: p.slug, trust: label, amount_e6: amount, amountUsd: fmtUsd(amount), status, txHash })
  }

  return {
    live,
    considered: r.rows.length,
    paid,
    accrued,
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
  const amount = e6ToDecimal(amountE6)

  // PRIMARY — the textbook Circle Developer-Controlled Wallets flow:
  // initiate the client, then createTransaction FROM Lens AI's own wallet
  // (walletId). This is the canonical, documented way Circle expects.
  if (CIRCLE_API_KEY && CIRCLE_ENTITY && LENS_WALLET_ID) {
    try {
      const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets")
      const client = initiateDeveloperControlledWalletsClient({ apiKey: CIRCLE_API_KEY, entitySecret: CIRCLE_ENTITY })
      // Circle needs the USDC token id; resolve it once from the wallet's
      // balances if it wasn't configured ("No account exist" = unresolved token).
      if (!_usdcTokenId && !USDC_ADDRESS) {
        try {
          const b: any = await client.getWalletTokenBalance({ id: LENS_WALLET_ID })
          const u = (b?.data?.tokenBalances || []).find((t: any) => /^usdc$/i.test(t?.token?.symbol || ""))
          _usdcTokenId = u?.token?.id || ""
        } catch { /* leave empty → tokenAddress path */ }
      }
      const tx: any = await client.createTransaction({
        walletId: LENS_WALLET_ID,
        ...(_usdcTokenId ? { tokenId: _usdcTokenId } : { tokenAddress: USDC_ADDRESS, blockchain: "ARC-TESTNET" }),
        destinationAddress: to,
        amounts: [amount],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        idempotencyKey: (globalThis.crypto as any).randomUUID(),
      } as any)
      const txId = tx?.data?.id
      if (!txId) throw new Error("createTransaction returned no id: " + JSON.stringify(tx?.data ?? tx))
      // Poll briefly for the on-chain hash (Arc settles in ~2-4s). This runs
      // AFTER the answer in chat, so the wait never delays a reply.
      let txHash: string | null = null
      for (let i = 0; i < 6 && !txHash; i++) {
        try { const g: any = await client.getTransaction({ id: txId }); txHash = g?.data?.transaction?.txHash || null } catch { /* keep trying */ }
        if (!txHash) await new Promise(r => setTimeout(r, 1000))
      }
      return { txHash, txId, status: txHash ? "complete" : "pending" }
    } catch (e: any) {
      console.error("[lensPay] dev-controlled send failed, falling back to App Kit:", e?.message || e)
      // fall through to the App Kit path below
    }
  }

  // SAFETY NET — Circle App Kit + the dev-controlled wallets adapter (the proven
  // campaign-rewards rail; resolves USDC by name). viem private-key as last resort.
  const { AppKit } = await import("@circle-fin/app-kit")
  const kit = new AppKit()
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
  total_paid_e6: number; totalPaidUsd: string; payouts: number; builders_paid: number
  credited_e6: number; creditedUsd: string; builders_credited: number; builders_total: number
  recent: Array<{ project_name: string; project_slug: string; amountUsd: string; kind: string; tx_hash: string | null; created_at: string }>
}> {
  await tableReady
  const [agg, recent] = await Promise.all([
    pool.query(`SELECT
        COALESCE(SUM(amount_e6) FILTER (WHERE status IN ('complete','pending','simulated')),0)::bigint paid_total,
        COUNT(*) FILTER (WHERE status IN ('complete','pending','simulated'))::int payouts,
        COUNT(DISTINCT builder_wallet) FILTER (WHERE status IN ('complete','pending','simulated'))::int builders_paid,
        COALESCE(SUM(amount_e6) FILTER (WHERE status='accrued'),0)::bigint credited_total,
        COUNT(DISTINCT builder_wallet) FILTER (WHERE status='accrued')::int builders_credited,
        COUNT(DISTINCT project_slug)::int builders_total
      FROM lens_payouts WHERE status IN ('complete','pending','simulated','accrued')`),
    pool.query(`SELECT project_name, project_slug, amount_e6, tx_hash, status, created_at::text
                  FROM lens_payouts WHERE status IN ('complete','pending','simulated','accrued')
                 ORDER BY created_at DESC LIMIT 14`),
  ])
  const a = agg.rows[0] || {}
  const paidTotal = Number(a.paid_total || 0), creditedTotal = Number(a.credited_total || 0)
  return {
    total_paid_e6: paidTotal,
    totalPaidUsd: fmtUsd(paidTotal),
    payouts: Number(a.payouts || 0),
    builders_paid: Number(a.builders_paid || 0),
    credited_e6: creditedTotal,
    creditedUsd: fmtUsd(creditedTotal),
    builders_credited: Number(a.builders_credited || 0),
    builders_total: Number(a.builders_total || 0),
    recent: recent.rows.map(x => ({
      project_name: x.project_name, project_slug: x.project_slug,
      amountUsd: fmtUsd(Number(x.amount_e6)), kind: x.status === "accrued" ? "credited" : "paid",
      tx_hash: x.tx_hash, created_at: x.created_at,
    })),
  }
}

// The public "most-cited builders" board — projects ranked by what Lens AI has
// paid them, i.e. how much their data has genuinely informed the ecosystem.
export async function getBuilderBoard(limit = 25): Promise<Array<{
  rank: number; slug: string; name: string; trust: string; logo: string | null; cites: number; earned_e6: number; earnedUsd: string; unclaimed: boolean
}>> {
  await tableReady
  const r = await pool.query(
    `SELECT lp.project_slug, MAX(lp.project_name) AS name, MAX(lp.trust_label) AS trust,
            MAX(p.logo_url) AS logo, COUNT(*)::int AS cites, COALESCE(SUM(lp.amount_e6),0)::bigint AS earned,
            BOOL_AND(lp.status = 'accrued') AS unclaimed
       FROM lens_payouts lp
       LEFT JOIN projects p ON p.slug = lp.project_slug
      WHERE lp.status IN ('complete','pending','simulated','accrued') AND lp.project_slug IS NOT NULL
      GROUP BY lp.project_slug
      ORDER BY earned DESC, cites DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  )
  return r.rows.map((x, i) => ({
    rank: i + 1, slug: x.project_slug, name: x.name, trust: x.trust, logo: x.logo || null,
    cites: Number(x.cites), earned_e6: Number(x.earned), earnedUsd: fmtUsd(Number(x.earned)), unclaimed: !!x.unclaimed,
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
