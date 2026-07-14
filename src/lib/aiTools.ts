// src/lib/aiTools.ts
//
// Server-side tools the AI can call on demand (Vercel AI SDK v6). This is what
// lets it answer "top TVL on Arc", "compare X and Y", "find DeFi projects" with
// REAL data instead of only what was pre-loaded into context.
//
// Every tool returns plain JSON the model reads back. Metric values are stored
// as micro-USDC (e6); tools format them to human USD so the model never does
// math (and never invents). When there's no data yet, tools say so explicitly
// so the model reports "none yet" truthfully.

import { tool, jsonSchema } from "ai"
import { getPayoutStats, getBuilderBoard } from "@/lib/lensPay"
import { getPool } from "@/lib/dbPool"

const pool = getPool()

// e6 micro-USDC → "$7.4M" / "$12.3K" / "$842"
function fmtUsd(e6: string | null): string {
  if (e6 == null) return "$0"
  const n = Number(BigInt(e6)) / 1e6
  if (!Number.isFinite(n) || n === 0) return "$0"
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

const METRIC_COL: Record<string, string> = {
  tvl:     "tvl_usd_e6",
  volume:  "volume_cum_usd_e6",
  revenue: "revenue_cum_usd_e6",
}

// Fuzzy project resolver — the DB has no pg_trgm, so we handle typos in app code.
// FALLBACK ONLY: called when an exact/substring lookup found nothing, so a small
// misspelling ("omnifun" for "onmifun") still resolves instead of "not found".
function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}
const normName = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
async function fuzzyProjectSlug(query: string): Promise<string | null> {
  const q = normName(query)
  if (q.length < 3) return null
  const r = await pool.query<{ slug: string; name: string }>(
    `SELECT slug, name FROM projects WHERE approved AND live`,
  ).catch(() => ({ rows: [] as { slug: string; name: string }[] }))
  let best: string | null = null, bestD = Infinity
  for (const row of r.rows) {
    for (const cand of [normName(row.slug), normName(row.name)]) {
      if (!cand) continue
      const d = lev(q, cand)
      if (d < bestD) { bestD = d; best = row.slug }
    }
  }
  // Accept only near-misses (typos): roughly one edit per three characters.
  const maxD = Math.max(1, Math.floor(q.length * 0.34))
  return bestD <= maxD ? best : null
}

// The trust columns every project tool now selects, so the AI can see + reason
// about a project's standing (and never call a baseline-Claimed project
// "trustworthy" by accident).
const TRUST_COLS = `trust_level, recognition, established, COALESCE((trust_profile->>'hard_risk')::bool, false) AS hard_risk`

// Turn the raw trust columns into a compact, honest signal the model reads back.
// Mirrors the public badge ladder; Established is an additive marker, Risk
// overrides everything. We never expose the internal mechanics behind a tier.
function trustOf(row: any): { tier: string; established: boolean; risk: boolean; label: string } {
  const risk = row.hard_risk === true
  const tier =
    row.recognition === "official" ? "Arc Official" :
    row.recognition === "partner"  ? "Arc Partner"  :
    row.trust_level === "verified" ? "Verified" :
    row.trust_level === "claimed"  ? "Claimed"  : "Listed"
  const established = !!row.established
  // Established is the strong earned signal, so it leads for baseline tiers
  // (Claimed/Listed) rather than reading "Claimed · Established". Higher tiers
  // compose with it: "Verified · Established", "Arc Partner · Established".
  const label =
    risk ? "Risk flagged"
    : established
      ? (tier === "Claimed" || tier === "Listed" ? "Established" : `${tier} · Established`)
      : tier
  return { tier, established, risk, label }
}

// Live Arc chain reads (gas, blocks, tx, address) via JSON-RPC — so the agent can
// actually answer "how much is gas", "how fast is Arc", "explain this tx / wallet".
const ARC_RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"
async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const res = await fetch(ARC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    signal: AbortSignal.timeout(8000),
  })
  const j = await res.json().catch(() => ({} as any))
  return j.result
}
const hexToInt = (h: string | null | undefined) => (h ? parseInt(h, 16) : 0)

export function buildTools() {
  return {
    list_top_projects: tool({
      description:
        "Rank live Arc projects by a metric (TVL, cumulative volume, or cumulative revenue), highest first. " +
        "Use for questions like 'top TVL on Arc', 'biggest DEXs by volume', 'who earns the most'. " +
        "Returns an empty list with a note if no project reports that metric yet.",
      inputSchema: jsonSchema<{ metric?: "tvl" | "volume" | "revenue"; limit?: number; category?: string }>({
        type: "object",
        properties: {
          metric:   { type: "string", enum: ["tvl", "volume", "revenue"], description: "Which metric to rank by. Default tvl." },
          limit:    { type: "number", description: "How many to return (1-20). Default 5." },
          category: { type: "string", description: "Optional category filter, e.g. 'DeFi', 'Exchange'." },
        },
      }),
      execute: async ({ metric = "tvl", limit = 5, category }) => {
        const col = METRIC_COL[metric] ?? "tvl_usd_e6"
        const lim = Math.min(Math.max(Number(limit) || 5, 1), 20)
        const params: any[] = []
        let where = `approved AND live AND ${col} > 0`
        if (category) { params.push(category); where += ` AND category ILIKE $${params.length}` }
        params.push(lim)
        const r = await pool.query(
          `SELECT name, slug, category, logo_url,
                  ${col}::text AS metric_e6,
                  tvl_usd_e6::text AS tvl, volume_cum_usd_e6::text AS volume, revenue_cum_usd_e6::text AS revenue,
                  ${TRUST_COLS}
           FROM projects
           WHERE ${where}
           ORDER BY ${col} DESC
           LIMIT $${params.length}`,
          params,
        )
        if (r.rows.length === 0) {
          return { metric, projects: [], note: `No live project is reporting ${metric} yet. TVL/volume/revenue tracking is opt-in per project and only a few have onboarded their contracts so far.` }
        }
        return {
          metric,
          projects: r.rows.map((p, i) => ({
            rank: i + 1, name: p.name, slug: p.slug, category: p.category, logo: p.logo_url ?? null,
            tvl: fmtUsd(p.tvl), volume: fmtUsd(p.volume), revenue: fmtUsd(p.revenue),
            trust: trustOf(p).label,
          })),
        }
      },
    }),

    compare_projects: tool({
      description:
        "Compare specific Arc projects side by side by name or slug. Use for 'compare X and Y', 'X vs Y'. " +
        "Returns each project's live metrics, or notes which names weren't found.",
      inputSchema: jsonSchema<{ names: string[] }>({
        type: "object",
        properties: {
          names: { type: "array", items: { type: "string" }, description: "Project names or slugs to compare (2-5)." },
        },
        required: ["names"],
      }),
      execute: async ({ names }) => {
        const wanted = (names || []).slice(0, 5).filter(Boolean)
        if (wanted.length === 0) return { found: [], notFound: [], note: "No project names provided." }
        const found: any[] = []
        const notFound: string[] = []
        for (const name of wanted) {
          const r = await pool.query(
            `SELECT name, slug, category, tagline, logo_url,
                    tvl_usd_e6::text AS tvl, volume_cum_usd_e6::text AS volume,
                    revenue_cum_usd_e6::text AS revenue, tvl_tracking_enabled,
                    ${TRUST_COLS}
             FROM projects
             WHERE approved AND live AND (slug ILIKE $1 OR name ILIKE $1)
             ORDER BY (slug = LOWER($2)) DESC
             LIMIT 1`,
            [`%${name}%`, name.toLowerCase()],
          )
          if (r.rows[0]) {
            const p = r.rows[0]
            found.push({
              name: p.name, slug: p.slug, category: p.category, tagline: p.tagline, logo: p.logo_url ?? null,
              tvl: fmtUsd(p.tvl), volume: fmtUsd(p.volume), revenue: fmtUsd(p.revenue),
              tracking: p.tvl_tracking_enabled ? "enabled" : "off",
              trust: trustOf(p).label,
            })
          } else {
            notFound.push(name)
          }
        }
        return { found, notFound }
      },
    }),

    search_ecosystem: tool({
      description:
        "Search Arc projects by keyword and/or category. Use for 'find DeFi projects', 'what wallets are on Arc', " +
        "'is there a project doing X'. Returns matching projects with their tagline and category.",
      inputSchema: jsonSchema<{ query?: string; category?: string; limit?: number }>({
        type: "object",
        properties: {
          query:    { type: "string", description: "Keyword to match in name, tagline, or description." },
          category: { type: "string", description: "Optional category filter, e.g. 'DeFi', 'Gaming', 'Infrastructure'." },
          limit:    { type: "number", description: "Max results (1-15). Default 8." },
        },
      }),
      execute: async ({ query, category, limit = 8 }) => {
        const lim = Math.min(Math.max(Number(limit) || 8, 1), 15)
        const params: any[] = []
        const clauses: string[] = ["approved", "live"]
        if (query) {
          params.push(`%${query}%`)
          clauses.push(`(name ILIKE $${params.length} OR tagline ILIKE $${params.length} OR description ILIKE $${params.length})`)
        }
        if (category) { params.push(category); clauses.push(`category ILIKE $${params.length}`) }
        params.push(lim)
        const r = await pool.query(
          `SELECT name, slug, category, tagline, featured, logo_url,
                  tvl_usd_e6::text AS tvl,
                  ${TRUST_COLS}
           FROM projects
           WHERE ${clauses.join(" AND ")}
           ORDER BY featured DESC, view_count DESC NULLS LAST
           LIMIT $${params.length}`,
          params,
        )
        return {
          count: r.rows.length,
          projects: r.rows.map(p => ({
            name: p.name, slug: p.slug, category: p.category, logo: p.logo_url ?? null,
            tagline: p.tagline, featured: !!p.featured,
            tvl: p.tvl && Number(p.tvl) > 0 ? fmtUsd(p.tvl) : null,
            trust: trustOf(p).label,
          })),
        }
      },
    }),

    list_categories: tool({
      description:
        "List the project categories on Arc and how many projects each has. Use this to answer 'what categories are on Arc', " +
        "and ALWAYS before claiming a project is a specific type (lending, DEX, perps, oracle, wallet, bridge, RWA, stablecoin, etc.): " +
        "check whether that type actually exists here. A category not in this list, or with 0 projects, means Arc has none of that type yet — " +
        "say so plainly and never relabel an unrelated project as that type.",
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        const r = await pool.query(
          `SELECT COALESCE(NULLIF(TRIM(category), ''), 'Other') AS category, COUNT(*)::int AS n
             FROM projects WHERE approved AND live
             GROUP BY 1 ORDER BY n DESC`,
        ).catch(() => ({ rows: [] as any[] }))
        return {
          total_categories: r.rows.length,
          categories: r.rows.map((c: any) => ({ category: c.category, projects: c.n })),
        }
      },
    }),

    get_chain_stats: tool({
      description:
        "Live Arc chain stats: current cost to send USDC (gas is paid in USDC on Arc, not ETH), gas price, latest block, transactions per second, and average block time / finality. " +
        "Use for 'how much is gas on Arc', 'how fast is Arc', 'what block are we on', 'how many TPS'.",
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        try {
          const [blockHex, gasHex] = await Promise.all([rpc("eth_blockNumber"), rpc("eth_gasPrice")])
          const num = hexToInt(blockHex)
          const gasWei = hexToInt(gasHex)
          const blocks: { tx: number; ts: number }[] = []
          for (let i = 0; i < 5; i++) {
            const b = await rpc("eth_getBlockByNumber", ["0x" + (num - i).toString(16), false])
            if (b) blocks.push({ tx: (b.transactions || []).length, ts: hexToInt(b.timestamp) })
          }
          let tps: string | null = null, blockTime: string | null = null
          if (blocks.length >= 2) {
            const span = blocks[0].ts - blocks[blocks.length - 1].ts
            if (span > 0) tps = (blocks.reduce((s, b) => s + b.tx, 0) / span).toFixed(1)
            const avg = span / (blocks.length - 1)
            if (avg > 0 && Number.isFinite(avg)) blockTime = avg < 10 ? avg.toFixed(2) + "s" : Math.round(avg) + "s"
          }
          return {
            cost_to_send_usdc: gasWei ? "$" + (gasWei * 46000 / 1e18).toFixed(4) : null,
            gas_price_gwei: gasWei ? (gasWei / 1e9).toFixed(3) : null,
            latest_block: num ? num.toLocaleString() : null,
            tps, block_time: blockTime,
            note: "Gas on Arc is paid in USDC, not ETH.",
          }
        } catch { return { note: "Couldn't reach the Arc RPC just now." } }
      },
    }),

    get_transaction: tool({
      description:
        "Look up and explain a specific Arc transaction by hash (0x + 64 hex). Returns from, to, native USDC value, status, and block. " +
        "Use when the user pastes a tx hash or asks 'what is this transaction'.",
      inputSchema: jsonSchema<{ hash: string }>({
        type: "object",
        properties: { hash: { type: "string", description: "Transaction hash (0x + 64 hex)." } },
        required: ["hash"],
      }),
      execute: async ({ hash }) => {
        const h = String(hash || "").trim()
        if (!/^0x[0-9a-fA-F]{64}$/.test(h)) return { found: false, note: "That isn't a valid transaction hash." }
        try {
          const [tx, receipt] = await Promise.all([rpc("eth_getTransactionByHash", [h]), rpc("eth_getTransactionReceipt", [h])])
          if (!tx) return { found: false, note: "No transaction with that hash on Arc." }
          const valueUsdc = hexToInt(tx.value) / 1e18
          return {
            found: true, hash: h, from: tx.from ?? null, to: tx.to ?? null,
            value_usdc: valueUsdc > 0 ? "$" + valueUsdc.toFixed(6) : "$0 (a contract call, e.g. an ERC-20 transfer)",
            status: receipt ? (hexToInt(receipt.status) === 1 ? "success" : "failed") : "pending",
            block: tx.blockNumber ? hexToInt(tx.blockNumber).toLocaleString() : null,
            link: `/tx/${h}`,
          }
        } catch { return { found: false, note: "Couldn't reach the Arc RPC just now." } }
      },
    }),

    get_address: tool({
      description:
        "Look up an Arc address / wallet by hex address (0x + 40 hex). Returns native USDC balance and transaction count. " +
        "Use when the user pastes an address or asks about a wallet.",
      inputSchema: jsonSchema<{ address: string }>({
        type: "object",
        properties: { address: { type: "string", description: "Address (0x + 40 hex)." } },
        required: ["address"],
      }),
      execute: async ({ address }) => {
        const a = String(address || "").trim()
        if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return { found: false, note: "That isn't a valid address." }
        try {
          const [balHex, cntHex] = await Promise.all([rpc("eth_getBalance", [a, "latest"]), rpc("eth_getTransactionCount", [a, "latest"])])
          return {
            found: true, address: a,
            usdc_balance: "$" + (hexToInt(balHex) / 1e18).toFixed(4),
            tx_count: hexToInt(cntHex),
            link: `/address/${a}`,
          }
        } catch { return { found: false, note: "Couldn't reach the Arc RPC just now." } }
      },
    }),

    get_lens_activity: tool({
      description:
        "Lens AI's OWN on-chain payout activity: how much it has paid builders, how many payouts, how many builders, and the most-cited builders (ranked by what Lens AI paid them). " +
        "Use for 'who have you paid', 'how much have you paid builders', 'show your payouts', 'most-cited builders', 'how much has Lens AI given out'. " +
        "This is Lens AI paying the builders whose data grounds its answers, in test USDC on Arc.",
      inputSchema: jsonSchema<{ limit?: number }>({
        type: "object",
        properties: { limit: { type: "number", description: "How many top builders to include (1-15). Default 6." } },
      }),
      execute: async ({ limit = 6 }) => {
        try {
          const [stats, board] = await Promise.all([
            getPayoutStats(),
            getBuilderBoard(Math.min(Math.max(Number(limit) || 6, 1), 15)),
          ])
          return {
            total_paid: stats.totalPaidUsd,
            payouts: stats.payouts,
            builders_paid: stats.builders_paid,
            top_builders: board.map(b => ({ rank: b.rank, name: b.name, slug: b.slug, trust: b.trust, logo: b.logo, cites: b.cites, earned: b.earnedUsd })),
            note: "Lens AI pays the builders whose data grounds its answers, in test USDC on Arc.",
          }
        } catch { return { note: "Couldn't load payout activity right now." } }
      },
    }),

    list_events: tool({
      description:
        "Events on or around Arc — official Arc House events plus community meetups, hackathons, " +
        "AMAs, launches, online or in person. Use for 'what events are on Arc', 'any hackathons', " +
        "'whats happening this week', 'upcoming events', 'office hours'. Returns upcoming/ongoing events " +
        "with when, where, official-vs-community, and a link. Official events carry the Arc House badge.",
      inputSchema: jsonSchema<{ limit?: number; official_only?: boolean }>({
        type: "object",
        properties: {
          limit: { type: "number", description: "Max events (1-12). Default 6." },
          official_only: { type: "boolean", description: "Only official Arc House events. Default false." },
        },
      }),
      execute: async ({ limit = 6, official_only = false }) => {
        const lim = Math.min(Math.max(Number(limit) || 6, 1), 12)
        const r = await pool.query(
          `SELECT name, tagline, type, date, end_date, timezone, is_online, location, link, organizer, badge, logo_url
             FROM events
            WHERE approved = true AND (date IS NULL OR COALESCE(end_date, date) >= NOW() - INTERVAL '1 day')
              AND ($2 = false OR badge = 'official')
            ORDER BY (badge = 'official') DESC, featured DESC, date ASC
            LIMIT $1`,
          [lim, official_only],
        ).catch(() => ({ rows: [] as any[] }))
        if (!r.rows.length) return { count: 0, events: [], note: "No upcoming events listed on Arc right now." }
        const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null)
        // Time in the event's OWN timezone (e.g. "1:00 PM EDT") — matches how Arc lists it.
        const time = (d: any, tz: string) => {
          if (!d) return null
          try { return new Date(d).toLocaleTimeString("en-US", { timeZone: tz || "UTC", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) } catch { return null }
        }
        return {
          count: r.rows.length,
          // The raw UTC instant (starts_iso/ends_iso) + IANA tz are included so you can
          // convert the time into ANY timezone the user asks for. `time` is the event's
          // own local time as a convenience; `now_iso` is the current instant.
          now_iso: new Date().toISOString(),
          events: r.rows.map((e: any) => ({
            title: e.name, tagline: e.tagline || null, type: e.type || null,
            when: day(e.date), ends: day(e.end_date), time: time(e.date, e.timezone),
            starts_iso: e.date ? new Date(e.date).toISOString() : null,
            ends_iso: e.end_date ? new Date(e.end_date).toISOString() : null,
            tz: e.timezone || "UTC",
            where: e.is_online ? "Online" : (e.location || null),
            official: e.badge === "official", image: e.logo_url || null,
            organizer: e.organizer || null, link: e.link || null,
          })),
        }
      },
    }),

    list_builders: tool({
      description:
        "The builders on Arc — real people who claimed and shipped projects, ranked by track record (projects shipped + reach). " +
        "Use for 'who's building on Arc', 'top builders', 'best builders', or to look up a builder by name. Returns name, projects shipped, verified status, and a profile link.",
      inputSchema: jsonSchema<{ query?: string; limit?: number }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Optional name to look up a specific builder." },
          limit: { type: "number", description: "How many to return (1-15). Default 6." },
        },
      }),
      execute: async ({ query, limit = 6 }) => {
        const lim = Math.min(Math.max(Number(limit) || 6, 1), 15)
        const params: any[] = []
        let nameClause = ""
        if (query && String(query).trim()) { params.push(`%${String(query).trim()}%`); nameClause = `AND b.display_name ILIKE $${params.length}` }
        params.push(lim)
        const r = await pool.query(
          `SELECT b.address, b.display_name, b.verified, b.twitter,
                  COUNT(p.id)::int AS project_count,
                  ((COUNT(p.id) * 500) + LEAST(COALESCE(SUM(p.view_count), 0), 5000))::int AS score
             FROM builder_profiles b
             LEFT JOIN projects p ON p.owner_wallet = b.address AND p.approved AND p.live
            WHERE b.claimed_at IS NOT NULL AND b.display_name IS NOT NULL AND LENGTH(TRIM(b.display_name)) >= 2 ${nameClause}
            GROUP BY b.address, b.display_name, b.verified, b.twitter
            ORDER BY score DESC, b.claimed_at ASC
            LIMIT $${params.length}`,
          params,
        ).catch(() => ({ rows: [] as any[] }))
        if (!r.rows.length) return { count: 0, builders: [], note: query ? `No builder found matching "${query}".` : "No builder profiles yet." }
        return {
          count: r.rows.length,
          builders: r.rows.map((b: any, i: number) => ({
            rank: i + 1, name: b.display_name, wallet: b.address,
            projects: b.project_count, verified: !!b.verified,
            profile: `/builder/${b.address}`,
          })),
        }
      },
    }),

    get_project_metrics: tool({
      description:
        "Get one specific project's live, on-chain metrics by name or slug. Use when the user asks about a single " +
        "named project's TVL/volume/revenue and you don't already have it in page context.",
      inputSchema: jsonSchema<{ project: string }>({
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or slug." },
        },
        required: ["project"],
      }),
      execute: async ({ project }) => {
        const sql = `SELECT name, slug, category, tagline, tvl_tracking_enabled,
                  twitter, website, discord, github,
                  tvl_usd_e6::text AS tvl, volume_cum_usd_e6::text AS volume,
                  revenue_cum_usd_e6::text AS revenue,
                  tvl_ath_usd_e6::text AS tvl_ath, tvl_last_indexed_at,
                  subgraph_tvl_usd_e6::text AS sg_tvl, subgraph_volume_usd_e6::text AS sg_volume,
                  ${TRUST_COLS}
           FROM projects
           WHERE approved AND live AND (slug ILIKE $1 OR name ILIKE $1)
           ORDER BY (slug = LOWER($2)) DESC
           LIMIT 1`
        let r = await pool.query(sql, [`%${project}%`, project.toLowerCase()])
        if (!r.rows[0]) { const fz = await fuzzyProjectSlug(project); if (fz) r = await pool.query(sql, [`%${fz}%`, fz]) }
        if (!r.rows[0]) return { found: false, note: `No live project matching "${project}".` }
        const p = r.rows[0]
        const nn = (v: any) => { const s = v == null ? "" : String(v).trim(); return s ? s : null }
        const tracking = p.tvl_tracking_enabled
        // Protocol-reported metrics from the project's own subgraph, for big
        // multi-pool DEXes our per-contract indexer can't fully represent. These
        // are NOT independently on-chain-verified — always labelled as such.
        const sgTvl = p.sg_tvl && Number(p.sg_tvl) > 0 ? fmtUsd(p.sg_tvl) : null
        const sgVol = p.sg_volume && Number(p.sg_volume) > 0 ? fmtUsd(p.sg_volume) : null
        return {
          found: true,
          name: p.name, slug: p.slug, category: p.category, tagline: p.tagline,
          tracking: tracking ? "enabled" : "off",
          tvl: fmtUsd(p.tvl), volume: fmtUsd(p.volume), revenue: fmtUsd(p.revenue),
          tvl_all_time_high: fmtUsd(p.tvl_ath),
          last_indexed: p.tvl_last_indexed_at,
          trust: trustOf(p).label,
          links: { twitter: nn(p.twitter), website: nn(p.website), discord: nn(p.discord), github: nn(p.github) },
          ...((sgTvl || sgVol) ? {
            reported_by_protocol: {
              tvl: sgTvl, volume: sgVol,
              note: "These come from the project's OWN subgraph — protocol-reported, NOT independently on-chain-verified by ArcLens. When you cite them, say so plainly (e.g. 'the protocol reports ~$X via its subgraph'). For a large multi-pool DEX these are the fuller, real totals; the on-chain tvl/volume above only cover the specific contracts registered with ArcLens, so they read much lower. Lead with the reported total, labelled, and note the on-chain-verified slice.",
            },
          } : {}),
          note: tracking ? undefined : "On-chain metric tracking isn't enabled for this project, so the on-chain figures may be zero.",
        }
      },
    }),

    get_top_movers: tool({
      description:
        "Rank Arc projects by GROWTH over a recent period — use for 'who gained the most TVL this week', " +
        "'fastest-growing by volume', 'who's up this week'. For tvl it's the CHANGE in value locked vs the " +
        "start of the window; for volume/revenue it's the TOTAL over the window (those are flows).",
      inputSchema: jsonSchema<{ metric?: "tvl" | "volume" | "revenue"; period_days?: number; limit?: number }>({
        type: "object",
        properties: {
          metric:      { type: "string", enum: ["tvl", "volume", "revenue"], description: "Default tvl." },
          period_days: { type: "number", description: "Lookback window in days (1-90). Default 7 (this week)." },
          limit:       { type: "number", description: "How many to return (1-10). Default 5." },
        },
      }),
      execute: async ({ metric = "tvl", period_days = 7, limit = 5 }) => {
        const days = Math.min(Math.max(Number(period_days) || 7, 1), 90)
        const lim  = Math.min(Math.max(Number(limit) || 5, 1), 10)

        if (metric === "tvl") {
          // current TVL vs the latest snapshot at/before (now - window)
          const r = await pool.query(
            `WITH past AS (
               SELECT DISTINCT ON (project_id) project_id, total_usd_e6
               FROM tvl_snapshots
               WHERE block_time <= NOW() - make_interval(days => $1::int)
               ORDER BY project_id, block_time DESC
             )
             SELECT p.name, p.slug, p.tvl_usd_e6::text AS cur, COALESCE(past.total_usd_e6, 0)::text AS past
             FROM projects p LEFT JOIN past ON past.project_id = p.id
             WHERE p.approved AND p.live AND p.tvl_usd_e6 > 0`,
            [days],
          )
          const movers = r.rows
            .map(row => {
              const cur = BigInt(row.cur || "0"), pst = BigInt(row.past || "0")
              const change = cur - pst
              const pct = pst > BigInt(0) ? (Number(change) / Number(pst)) * 100 : null
              return {
                name: row.name, slug: row.slug, changeE6: change,
                current: fmtUsd(row.cur),
                change: (change >= BigInt(0) ? "+" : "−") + fmtUsd((change < BigInt(0) ? -change : change).toString()),
                change_pct: pct == null ? null : (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%",
              }
            })
            .filter(m => m.changeE6 !== BigInt(0))
            .sort((a, b) => (a.changeE6 < b.changeE6 ? 1 : a.changeE6 > b.changeE6 ? -1 : 0))
            .slice(0, lim)
          if (!movers.length) return { metric, period_days: days, projects: [], note: `No measurable TVL change in the last ${days} days yet.` }
          return { metric, period_days: days, projects: movers.map((m, i) => ({ rank: i + 1, name: m.name, slug: m.slug, current: m.current, change: m.change, change_pct: m.change_pct })) }
        }

        // volume / revenue — sum the daily series over the window (it's a flow)
        const tbl = metric === "revenue" ? "revenue_daily" : "volume_daily"
        const r = await pool.query(
          `SELECT p.name, p.slug, COALESCE(SUM(d.total_usd_e6), 0)::text AS period_total
           FROM projects p JOIN ${tbl} d ON d.project_id = p.id
           WHERE p.approved AND p.live AND d.day >= (CURRENT_DATE - ($1::int - 1))
           GROUP BY p.id, p.name, p.slug
           HAVING SUM(d.total_usd_e6) > 0
           ORDER BY SUM(d.total_usd_e6) DESC
           LIMIT $2`,
          [days, lim],
        )
        if (!r.rows.length) return { metric, period_days: days, projects: [], note: `No ${metric} reported in the last ${days} days yet.` }
        return { metric, period_days: days, projects: r.rows.map((row, i) => ({ rank: i + 1, name: row.name, slug: row.slug, value: fmtUsd(row.period_total) })) }
      },
    }),

    get_project_builder: tool({
      description:
        "Find who built / owns a specific Arc project and how to reach or follow them — use for 'who built X', 'who's behind X', 'what's X's Twitter/GitHub', 'how do I contact the team behind X'. " +
        "Returns the builder's name, verification, bio and socials (X, GitHub, Telegram, website), plus the project's own links (X, website, Discord, GitHub). NEVER returns a wallet address.",
      inputSchema: jsonSchema<{ project: string }>({
        type: "object",
        properties: { project: { type: "string", description: "Project name or slug." } },
        required: ["project"],
      }),
      execute: async ({ project }) => {
        const sql = `SELECT p.name, p.slug, p.owner_wallet, p.logo_url,
                  p.twitter AS proj_twitter, p.website AS proj_website, p.discord AS proj_discord, p.github AS proj_github,
                  b.display_name, b.verified, b.bio, b.avatar_url,
                  b.twitter AS b_twitter, b.github AS b_github, b.telegram AS b_telegram, b.website AS b_website
           FROM projects p
           LEFT JOIN builder_profiles b ON b.address = LOWER(p.owner_wallet)
           WHERE p.approved AND p.live AND (p.slug ILIKE $1 OR p.name ILIKE $1)
           ORDER BY (p.slug = LOWER($2)) DESC
           LIMIT 1`
        let r = await pool.query(sql, [`%${project}%`, project.toLowerCase()])
        if (!r.rows[0]) { const fz = await fuzzyProjectSlug(project); if (fz) r = await pool.query(sql, [`%${fz}%`, fz]) }
        if (!r.rows[0]) return { found: false, note: `No live project matching "${project}".` }
        const p = r.rows[0]
        const nn = (v: any) => { const s = v == null ? "" : String(v).trim(); return s ? s : null }
        // Project-level links — present for almost every project.
        const project_links = { twitter: nn(p.proj_twitter), website: nn(p.proj_website), discord: nn(p.proj_discord), github: nn(p.proj_github) }
        if (!p.owner_wallet) {
          return { found: true, project: p.name, slug: p.slug, builder: null, logo: nn(p.logo_url), project_links,
            note: "This project hasn't been claimed by a builder yet — no builder profile. Share the project's own links above." }
        }
        const claimed = !!p.display_name
        return {
          found: true,
          project: p.name,
          slug: p.slug,
          logo: nn(p.logo_url),                 // project logo — fallback avatar when the builder has none
          builder: {
            // NEVER expose the wallet — if there's no profile name, refer to "the team".
            name: p.display_name || "the team behind it (no public profile yet)",
            claimed,
            verified: !!p.verified,
            avatar: nn(p.avatar_url),
            bio: nn(p.bio),
            socials: { twitter: nn(p.b_twitter), github: nn(p.b_github), telegram: nn(p.b_telegram), website: nn(p.b_website) },
          },
          project_links,
          note: claimed
            ? "NEVER print or reveal the owner/builder wallet address. Point people to the socials + project page."
            : "The team hasn't published a public builder profile yet — point people to the project's own links above. NEVER reveal the owner/builder wallet address.",
        }
      },
    }),

    list_projects: tool({
      description:
        "List or filter Arc projects — use for 'which projects are claimed by a builder', 'projects with a verified builder', " +
        "'newest projects', 'show me Gaming projects', 'what's featured', and for TRUST questions like 'a trustworthy DeFi project', " +
        "'safe DEXs', 'which projects are Verified or Established'. Set trusted_only for trust questions. Every result includes its " +
        "trust signal (Listed / Claimed / Verified / Arc Partner / Arc Official, plus Established, or Risk flagged). " +
        "Filter by category / claimed-by-a-builder / verified-builder / trusted-only. Sort covers most listing questions: " +
        "'trending' (most-viewed this week — use for 'trending', 'hot', 'what's popular'), 'newest', 'oldest' (use for 'first project to list'), " +
        "'quiet' (least-viewed — use for 'most unknown', 'minimal activity', 'quietest project'), 'tvl', 'volume', or 'featured'.",
      inputSchema: jsonSchema<{ category?: string; claimed_only?: boolean; verified_builder_only?: boolean; trusted_only?: boolean; sort?: "tvl" | "volume" | "newest" | "oldest" | "trending" | "quiet" | "featured"; limit?: number }>({
        type: "object",
        properties: {
          category:              { type: "string", description: "Optional category filter, e.g. 'DeFi', 'Gaming'." },
          claimed_only:          { type: "boolean", description: "Only projects claimed by a builder." },
          verified_builder_only: { type: "boolean", description: "Only projects whose builder is verified." },
          trusted_only:          { type: "boolean", description: "Only projects with a meaningful trust signal — Verified, Arc Partner, Arc Official, or Established — and never risk-flagged. Use for 'trustworthy'/'safe' questions." },
          sort:                  { type: "string", enum: ["tvl", "volume", "newest", "oldest", "trending", "quiet", "featured"], description: "Default featured. 'trending' = most-viewed this week, 'oldest' = first to list, 'quiet' = least-known / minimal activity." },
          limit:                 { type: "number", description: "Max results (1-20). Default 10." },
        },
      }),
      execute: async ({ category, claimed_only, verified_builder_only, trusted_only, sort = "featured", limit = 10 }) => {
        const lim = Math.min(Math.max(Number(limit) || 10, 1), 20)
        const where = ["p.approved", "p.live"]
        const params: any[] = []
        if (category) { params.push(category); where.push(`p.category ILIKE $${params.length}`) }
        if (claimed_only) where.push(`(p.claimed_at IS NOT NULL OR b.address IS NOT NULL)`)
        if (verified_builder_only) where.push(`b.verified = true`)
        if (trusted_only) where.push(
          `(p.recognition IN ('official','partner') OR p.trust_level = 'verified' OR p.established = true)
            AND COALESCE((p.trust_profile->>'hard_risk')::bool, false) = false`)
        // 'trending' ranks by views THIS week (real momentum, not all-time);
        // 'quiet' surfaces the least-seen (for 'most unknown'/'minimal activity');
        // 'oldest' answers 'first project to list'. WEEK is a computed integer.
        const WEEK = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
        let trendingJoin = ""
        let order: string
        if (sort === "tvl") order = "p.tvl_usd_e6 DESC NULLS LAST"
        else if (sort === "volume") order = "p.volume_cum_usd_e6 DESC NULLS LAST"
        else if (sort === "newest") order = "p.created_at DESC"
        else if (sort === "oldest") order = "p.created_at ASC NULLS LAST"
        else if (sort === "trending") {
          trendingJoin = `LEFT JOIN (SELECT project_id, COUNT(*) AS wv FROM project_views WHERE week_num = ${WEEK} GROUP BY project_id) pv ON pv.project_id = p.id`
          order = "COALESCE(pv.wv, 0) DESC, COALESCE(p.view_count, 0) DESC"
        }
        else if (sort === "quiet") order = "COALESCE(p.view_count, 0) ASC, p.created_at DESC"
        else order = "p.featured DESC, COALESCE(p.view_count, 0) DESC"
        params.push(lim)
        const r = await pool.query(
          `SELECT p.name, p.slug, p.category, p.tagline, p.tvl_usd_e6::text AS tvl, p.logo_url,
                  p.trust_level, p.recognition, p.established,
                  COALESCE((p.trust_profile->>'hard_risk')::bool, false) AS hard_risk,
                  b.display_name AS builder_name, b.verified AS builder_verified
           FROM projects p LEFT JOIN builder_profiles b ON b.address = LOWER(p.owner_wallet)
           ${trendingJoin}
           WHERE ${where.join(" AND ")}
           ORDER BY ${order}
           LIMIT $${params.length}`,
          params,
        )
        return {
          count: r.rows.length,
          projects: r.rows.map(x => ({
            name: x.name, slug: x.slug, category: x.category, tagline: x.tagline, logo: x.logo_url ?? null,
            tvl: x.tvl && Number(x.tvl) > 0 ? fmtUsd(x.tvl) : null,
            trust: trustOf(x).label,
            builder: x.builder_name || null, builder_verified: !!x.builder_verified,
          })),
          note: r.rows.length === 0
            ? (trusted_only ? "No projects match that filter with a Verified/Established/recognized trust signal yet." : "No projects match that filter yet.")
            : undefined,
        }
      },
    }),

    list_open_trials: tool({
      description:
        "APPROVED trial campaigns on ArcLens with their status. Each result has a `state`: 'open' (a tester can join right now — matches the Trials page) " +
        "or 'ended' (a past campaign that has finished). Use for any campaign question, including previous/ended ones and 'which projects have a campaign'. " +
        "It only ever returns approved campaigns (open or ended) — unapproved/pending submissions are internal and never appear. Only call a campaign joinable if its state is 'open'.",
      inputSchema: jsonSchema<{ limit?: number }>({
        type: "object",
        properties: { limit: { type: "number", description: "Max results (1-15). Default 8." } },
      }),
      execute: async ({ limit = 8 }) => {
        const lim = Math.min(Math.max(Number(limit) || 8, 1), 15)
        // Only ever surface APPROVED campaigns: 'open' (active + joinable, exactly what
        // the /trials page shows) or 'ended' (finished). Pending/draft/rejected are
        // internal — status IN ('active','ended') guarantees they never leak.
        const openExpr =
          `c.status = 'active' AND c.ended_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > NOW()) ` +
          `AND (c.total_slots IS NULL OR c.filled_slots < c.total_slots)`
        // Join the owning project (creator_wallet = owner_wallet) so each trial
        // carries the PROJECT's slug + logo — the slug lets a campaign citation
        // pay that builder, and the logo gives the card a real picture.
        const r = await pool.query(
          `SELECT c.title, c.slug, c.tagline, c.project_name, c.total_slots, c.filled_slots,
                  c.reward_type, c.reward_description,
                  p.slug AS project_slug, p.logo_url AS project_logo,
                  CASE WHEN ${openExpr} THEN 'open' ELSE 'ended' END AS state
           FROM campaigns c
           LEFT JOIN projects p ON p.owner_wallet = c.creator_wallet AND p.approved = true AND p.live = true
           WHERE c.status IN ('active','ended')
           ORDER BY (CASE WHEN ${openExpr} THEN 0 ELSE 1 END), c.created_at DESC NULLS LAST
           LIMIT $1`,
          [lim],
        ).catch(() => ({ rows: [] as any[] }))
        const trials = r.rows.map((c: any) => ({
          title: c.title, slug: c.slug, project: c.project_name || null,
          project_slug: c.project_slug || null, logo: c.project_logo || null, tagline: c.tagline,
          state: c.state, // 'open' = joinable now; 'ended' = finished (never say it's joinable)
          slots: c.total_slots ? `${c.filled_slots ?? 0}/${c.total_slots} filled` : null,
          reward: c.reward_description || (c.reward_type ? String(c.reward_type).replace(/_/g, " ") : null),
        }))
        const openCount = trials.filter((t: any) => t.state === "open").length
        if (!trials.length) return { count: 0, open_count: 0, trials: [], note: "No campaigns are open right now — check the Trials page for what's next." }
        return { count: trials.length, open_count: openCount, trials }
      },
    }),

    get_ecosystem_stats: tool({
      description:
        "High-level Arc ecosystem numbers — use for 'how many projects on Arc', 'total TVL across Arc', 'ecosystem overview'.",
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        const r = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE approved AND live)::int AS projects,
             COUNT(*) FILTER (WHERE approved AND live AND tvl_tracking_enabled)::int AS tracking,
             COALESCE(SUM(tvl_usd_e6)        FILTER (WHERE approved AND live), 0)::text AS tvl,
             COALESCE(SUM(volume_cum_usd_e6) FILTER (WHERE approved AND live), 0)::text AS volume
           FROM projects`,
        )
        const b = await pool.query(`SELECT COUNT(*)::int n FROM builder_profiles`).catch(() => ({ rows: [{ n: 0 }] }))
        const s = r.rows[0]
        return {
          projects: s.projects,
          projects_reporting_metrics: s.tracking,
          total_tvl: fmtUsd(s.tvl),
          total_volume: fmtUsd(s.volume),
          builder_profiles: b.rows[0].n,
        }
      },
    }),
  }
}
