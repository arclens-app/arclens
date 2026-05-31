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

import { Pool } from "pg"
import { tool, jsonSchema } from "ai"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

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
          `SELECT name, slug, category,
                  ${col}::text AS metric_e6,
                  tvl_usd_e6::text AS tvl, volume_cum_usd_e6::text AS volume, revenue_cum_usd_e6::text AS revenue
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
            rank: i + 1, name: p.name, slug: p.slug, category: p.category,
            tvl: fmtUsd(p.tvl), volume: fmtUsd(p.volume), revenue: fmtUsd(p.revenue),
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
            `SELECT name, slug, category, tagline,
                    tvl_usd_e6::text AS tvl, volume_cum_usd_e6::text AS volume,
                    revenue_cum_usd_e6::text AS revenue, tvl_tracking_enabled
             FROM projects
             WHERE approved AND live AND (slug ILIKE $1 OR name ILIKE $1)
             ORDER BY (slug = LOWER($2)) DESC
             LIMIT 1`,
            [`%${name}%`, name.toLowerCase()],
          )
          if (r.rows[0]) {
            const p = r.rows[0]
            found.push({
              name: p.name, slug: p.slug, category: p.category, tagline: p.tagline,
              tvl: fmtUsd(p.tvl), volume: fmtUsd(p.volume), revenue: fmtUsd(p.revenue),
              tracking: p.tvl_tracking_enabled ? "enabled" : "off",
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
          `SELECT name, slug, category, tagline, featured,
                  tvl_usd_e6::text AS tvl
           FROM projects
           WHERE ${clauses.join(" AND ")}
           ORDER BY featured DESC, view_count DESC NULLS LAST
           LIMIT $${params.length}`,
          params,
        )
        return {
          count: r.rows.length,
          projects: r.rows.map(p => ({
            name: p.name, slug: p.slug, category: p.category,
            tagline: p.tagline, featured: !!p.featured,
            tvl: p.tvl && Number(p.tvl) > 0 ? fmtUsd(p.tvl) : null,
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
        const r = await pool.query(
          `SELECT name, slug, category, tagline, tvl_tracking_enabled,
                  tvl_usd_e6::text AS tvl, volume_cum_usd_e6::text AS volume,
                  revenue_cum_usd_e6::text AS revenue,
                  tvl_ath_usd_e6::text AS tvl_ath, tvl_last_indexed_at
           FROM projects
           WHERE approved AND live AND (slug ILIKE $1 OR name ILIKE $1)
           ORDER BY (slug = LOWER($2)) DESC
           LIMIT 1`,
          [`%${project}%`, project.toLowerCase()],
        )
        if (!r.rows[0]) return { found: false, note: `No live project matching "${project}".` }
        const p = r.rows[0]
        const tracking = p.tvl_tracking_enabled
        return {
          found: true,
          name: p.name, slug: p.slug, category: p.category, tagline: p.tagline,
          tracking: tracking ? "enabled" : "off",
          tvl: fmtUsd(p.tvl), volume: fmtUsd(p.volume), revenue: fmtUsd(p.revenue),
          tvl_all_time_high: fmtUsd(p.tvl_ath),
          last_indexed: p.tvl_last_indexed_at,
          note: tracking ? undefined : "This project hasn't enabled on-chain metric tracking, so figures may be zero.",
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
        "Find who built / owns a specific Arc project — use for 'who built X', 'who's behind X', 'who's the team behind X'. " +
        "Returns the builder's profile name (or wallet if no profile yet) and a link to their builder profile.",
      inputSchema: jsonSchema<{ project: string }>({
        type: "object",
        properties: { project: { type: "string", description: "Project name or slug." } },
        required: ["project"],
      }),
      execute: async ({ project }) => {
        const r = await pool.query(
          `SELECT p.name, p.slug, p.owner_wallet,
                  b.display_name, b.verified, b.twitter, b.claimed_at
           FROM projects p
           LEFT JOIN builder_profiles b ON b.address = LOWER(p.owner_wallet)
           WHERE p.approved AND p.live AND (p.slug ILIKE $1 OR p.name ILIKE $1)
           ORDER BY (p.slug = LOWER($2)) DESC
           LIMIT 1`,
          [`%${project}%`, project.toLowerCase()],
        )
        if (!r.rows[0]) return { found: false, note: `No live project matching "${project}".` }
        const p = r.rows[0]
        if (!p.owner_wallet) return { found: true, project: p.name, builder: null, note: "This project hasn't been claimed by a builder yet." }
        const addr = String(p.owner_wallet).toLowerCase()
        const claimed = !!p.display_name
        return {
          found: true,
          project: p.name,
          slug: p.slug,
          builder: {
            name: p.display_name || `${addr.slice(0, 6)}…${addr.slice(-4)}`,
            claimed,
            verified: !!p.verified,
            twitter: p.twitter || null,
            profile_url: `/builder/${addr}`,
          },
          note: claimed
            ? undefined
            : "This builder hasn't published a public profile yet. Answer briefly and professionally — say the team behind {project} hasn't set up a public builder profile yet, and link the profile page. Do NOT print the full wallet address, and don't pad the answer with extra background.",
        }
      },
    }),

    list_projects: tool({
      description:
        "List or filter Arc projects — use for 'which projects are claimed by a builder', 'projects with a verified builder', " +
        "'newest projects', 'show me Gaming projects', 'what's featured'. Filter by category / claimed-by-a-builder / verified-builder; " +
        "sort by tvl, volume, newest, or featured.",
      inputSchema: jsonSchema<{ category?: string; claimed_only?: boolean; verified_builder_only?: boolean; sort?: "tvl" | "volume" | "newest" | "featured"; limit?: number }>({
        type: "object",
        properties: {
          category:              { type: "string", description: "Optional category filter, e.g. 'DeFi', 'Gaming'." },
          claimed_only:          { type: "boolean", description: "Only projects claimed by a builder." },
          verified_builder_only: { type: "boolean", description: "Only projects whose builder is verified." },
          sort:                  { type: "string", enum: ["tvl", "volume", "newest", "featured"], description: "Default featured." },
          limit:                 { type: "number", description: "Max results (1-20). Default 10." },
        },
      }),
      execute: async ({ category, claimed_only, verified_builder_only, sort = "featured", limit = 10 }) => {
        const lim = Math.min(Math.max(Number(limit) || 10, 1), 20)
        const where = ["p.approved", "p.live"]
        const params: any[] = []
        if (category) { params.push(category); where.push(`p.category ILIKE $${params.length}`) }
        if (claimed_only) where.push(`(p.claimed_at IS NOT NULL OR b.address IS NOT NULL)`)
        if (verified_builder_only) where.push(`b.verified = true`)
        const order = sort === "tvl" ? "p.tvl_usd_e6 DESC NULLS LAST"
          : sort === "volume" ? "p.volume_cum_usd_e6 DESC NULLS LAST"
          : sort === "newest" ? "p.created_at DESC"
          : "p.featured DESC, COALESCE(p.view_count, 0) DESC"
        params.push(lim)
        const r = await pool.query(
          `SELECT p.name, p.slug, p.category, p.tagline, p.tvl_usd_e6::text AS tvl,
                  b.display_name AS builder_name, b.verified AS builder_verified
           FROM projects p LEFT JOIN builder_profiles b ON b.address = LOWER(p.owner_wallet)
           WHERE ${where.join(" AND ")}
           ORDER BY ${order}
           LIMIT $${params.length}`,
          params,
        )
        return {
          count: r.rows.length,
          projects: r.rows.map(x => ({
            name: x.name, slug: x.slug, category: x.category, tagline: x.tagline,
            tvl: x.tvl && Number(x.tvl) > 0 ? fmtUsd(x.tvl) : null,
            builder: x.builder_name || null, builder_verified: !!x.builder_verified,
          })),
          note: r.rows.length === 0 ? "No projects match that filter yet." : undefined,
        }
      },
    }),
  }
}
