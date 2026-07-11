"use client"
//
// TVL & Revenue cards for the per-project page. Renders only when the
// project has `tvl_tracking_enabled = true` and at least one verified
// project_contracts row. Designed to slot directly after the description
// card on /ecosystem/[slug].
//
// Source of truth is the `/api/ecosystem/[id]` endpoint, which now returns
// a `tvl` field with: { latest, series, revenue_series, contracts }.

import { useEffect, useMemo, useState } from "react"

interface Contract {
  id: number
  address: string
  role: "tvl" | "revenue" | "treasury" | "volume"
  label: string | null
  start_block: number
  deployer_address: string | null
  verified_at: string
  revoked_at: string | null
  volume_method?: "swap_event" | "outflow_transfer" | null
}

interface SnapshotPoint {
  block_number: number
  block_time: string
  total_usd_e6: string
}

interface RevenuePoint {
  day: string
  total_usd_e6: string
  event_count: number
}

interface TvlData {
  latest: {
    id: number
    block_number: number
    block_time: string
    total_usd_e6: string
    breakdown: Array<{
      contract_id: number
      contract_address: string
      contract_label: string | null
      stablecoin_id: number
      symbol: string
      balance_raw: string
      usd_e6: string
    }>
  } | null
  series: SnapshotPoint[]
  revenue_series: RevenuePoint[]
  volume_series: RevenuePoint[]
  contracts: Contract[]
}

interface ProjectLike {
  tvl_tracking_enabled?: boolean
  tvl_usd_e6?: string | null
  tvl_ath_usd_e6?: string | null
  tvl_ath_block?: number | null
  tvl_ath_at?: string | null
  revenue_cum_usd_e6?: string | null
  revenue_ath_day_usd_e6?: string | null
  revenue_ath_day?: string | null
  volume_cum_usd_e6?: string | null
  volume_ath_day_usd_e6?: string | null
  volume_ath_day?: string | null
  tvl_last_indexed_at?: string | null
  // Protocol-reported (from the project's own subgraph) — never verified on-chain.
  subgraph_tvl_usd_e6?: string | null
  subgraph_volume_usd_e6?: string | null
  subgraph_updated_at?: string | null
  // The subgraph's OWN last-indexed unix time (data freshness), and a daily
  // TVL history [{ t: unixSeconds, usd }] for the trend line.
  subgraph_source_ts?: string | number | null
  subgraph_series?: Array<{ t: number; usd: number }> | null
}

interface Theme {
  mono: string
  surf: string
  surf2: string
  bdr: string
  t1: string
  t2: string
  t3: string
}

interface Props {
  project: ProjectLike
  tvl: TvlData | null
  theme: Theme
  slug: string
}

const USDC_GREEN = "#00b87a"
const ACCENT = "#1a56ff"
const ACCENT_S = "#8aaeff"

// USD-e6 (bigint string) → human formatted "$1.23M" / "$4,567.89".
function fmt(raw: string | null | undefined, opts: { precise?: boolean } = {}): string | null {
  if (raw == null) return null
  let n: bigint
  try { n = BigInt(raw) } catch { return null }
  if (n === BigInt(0)) return null
  const usd = Number(n) / 1e6
  if (!Number.isFinite(usd)) return null
  if (opts.precise) {
    return "$" + usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (usd >= 1e9) return "$" + (usd / 1e9).toFixed(2) + "B"
  if (usd >= 1e6) return "$" + (usd / 1e6).toFixed(2) + "M"
  if (usd >= 1e3) return "$" + (usd / 1e3).toFixed(1) + "K"
  return "$" + usd.toFixed(2)
}

// Format a raw token amount in its native decimals: "1,234.567890 USDC".
function fmtRaw(raw: string, decimals: number, symbol: string): string {
  let n: bigint
  try { n = BigInt(raw) } catch { return "—" }
  const divisor = BigInt(10) ** BigInt(decimals)
  const whole = n / divisor
  const frac = (n % divisor).toString().padStart(decimals, "0").slice(0, Math.min(6, decimals))
  return `${Number(whole).toLocaleString()}.${frac} ${symbol}`
}

// Stablecoin id → decimals & symbol. v1 has only USDC (id=1, 6 decimals); the
// breakdown JSONB already carries `symbol`, so we use that. We need decimals
// just to render the raw amount inline — hardcoded 6 because every stablecoin
// in the registry today is 6-decimal. When EURC/USDT (also 6) come in this
// stays correct. When a non-6-decimal stable lands, swap to a lookup map.
const STABLE_DECIMALS = 6

// Tiny inline sparkline. No external chart lib — keeps the page bundle thin.
function Sparkline({ points, color, height = 38, width = 220 }: {
  points: number[]
  color: string
  height?: number
  width?: number
}) {
  if (points.length < 2) {
    return <div style={{ width, height, opacity: 0.35, fontSize: "10px", color }}>—</div>
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const dx = width / (points.length - 1)
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * dx).toFixed(2)} ${(height - ((p - min) / range) * (height - 4) - 2).toFixed(2)}`)
    .join(" ")
  const fill = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * dx).toFixed(2)} ${(height - ((p - min) / range) * (height - 4) - 2).toFixed(2)}`)
    .join(" ") + ` L ${width} ${height} L 0 ${height} Z`
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#spark-${color.replace("#", "")})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function TvlCards({ project, tvl, theme, slug }: Props) {
  const { mono, surf, surf2, bdr, t1, t2, t3 } = theme
  const [showBreakdown, setShowBreakdown] = useState(false)

  // Open-dispute counts per metric. Public read; no auth required.
  // Used to show an "under review" badge on the card header.
  const [openDisputes, setOpenDisputes] = useState<{ tvl: number; volume: number; revenue: number }>({
    tvl: 0, volume: 0, revenue: 0,
  })

  // Fetch open-dispute counts when the component mounts / slug changes, to show
  // the read-only "under review" badge on each metric card. Flagging itself
  // lives in the single "Report a problem" form at the bottom of the page.
  // Server cache is 30s so this is cheap.
  useEffect(() => {
    fetch(`/api/disputes?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : { open: {} })
      .then(d => setOpenDisputes({
        tvl:     Number(d?.open?.tvl ?? 0),
        volume:  Number(d?.open?.volume ?? 0),
        revenue: Number(d?.open?.revenue ?? 0),
      }))
      .catch(() => {})
  }, [slug])

  // Sparkline series — declared before any early return (Rules of Hooks).
  const series    = useMemo(() => (tvl?.series ?? []).map(p => Number(BigInt(p.total_usd_e6)) / 1e6), [tvl?.series])
  const revSeries = useMemo(() => (tvl?.revenue_series ?? []).map(p => Number(BigInt(p.total_usd_e6)) / 1e6), [tvl?.revenue_series])
  const volSeries = useMemo(() => (tvl?.volume_series ?? []).map(p => Number(BigInt(p.total_usd_e6)) / 1e6), [tvl?.volume_series])
  // Daily TVL history from the subgraph → sparkline points (USD).
  const sgSeries  = useMemo(
    () => (project.subgraph_series ?? []).map(p => p.usd).filter(n => Number.isFinite(n)),
    [project.subgraph_series],
  )

  const tvlFmt        = fmt(project.tvl_usd_e6)
  const tvlAthFmt     = fmt(project.tvl_ath_usd_e6)
  const revCumFmt     = fmt(project.revenue_cum_usd_e6)
  const revAthDayFmt  = fmt(project.revenue_ath_day_usd_e6)
  const volCumFmt     = fmt(project.volume_cum_usd_e6)
  const volAthDayFmt  = fmt(project.volume_ath_day_usd_e6)
  // Protocol-reported (from the project's own subgraph) — labelled, never verified.
  const sgTvlFmt      = fmt(project.subgraph_tvl_usd_e6)
  const sgVolFmt      = fmt(project.subgraph_volume_usd_e6)
  const hasSubgraph   = !!(sgTvlFmt || sgVolFmt)
  const hasVerified   = !!(tvlFmt || volCumFmt || revCumFmt)

  // Nothing opted-in and nothing reported → render nothing.
  if (!project.tvl_tracking_enabled && !hasSubgraph) return null

  // Tracking on but nothing indexed yet, and no reported metrics → soft empty state.
  if (!hasVerified && !hasSubgraph) {
    return (
      <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "20px 28px", marginBottom: "16px" }}>
        <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>
          TVL & Revenue
        </div>
        <div style={{ fontSize: "13px", color: t2, lineHeight: 1.6 }}>
          Tracking enabled — first measurement should land within 5 minutes.
        </div>
      </div>
    )
  }

  const tvlContracts = (tvl?.contracts ?? []).filter(c => c.role === "tvl")
  const revContracts = (tvl?.contracts ?? []).filter(c => c.role === "revenue")
  const volContracts = (tvl?.contracts ?? []).filter(c => c.role === "volume")

  // One panel; only reported metrics get a cell. Hairline dividers via a 1px
  // grid gap over the border color. Stacks to a single column on mobile.
  const presentCount = [tvlFmt || sgTvlFmt, volCumFmt || sgVolFmt, revCumFmt].filter(Boolean).length

  // Badge styles: green = verified on-chain by us; amber = self-reported via the
  // project's own subgraph (never independently verified).
  const badgeV = { fontSize: "8.5px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(0,184,122,0.08)", color: USDC_GREEN, border: "1px solid rgba(0,184,122,0.25)" }
  const badgeR = { fontSize: "8.5px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(224,136,16,0.08)", color: "#e08810", border: "1px solid rgba(224,136,16,0.25)" }
  const REPORTED_TITLE = "Self-reported by the project via its own subgraph. Not independently verified on-chain by ArcLens."

  // Freshness = the subgraph's OWN last-indexed time (when the number is true
  // as of), with our sync time as the secondary signal. Falls back gracefully.
  const sourceTsMs = project.subgraph_source_ts != null ? Number(project.subgraph_source_ts) * 1000 : null
  const freshness =
    sourceTsMs && Number.isFinite(sourceTsMs)
      ? `Protocol data as of ${new Date(sourceTsMs).toLocaleString()}.`
      : project.subgraph_updated_at
      ? `Synced ${new Date(project.subgraph_updated_at).toLocaleTimeString()}.`
      : ""

  // One number, one honest badge. When a metric comes from the project's own
  // subgraph we show THAT single figure with the amber "reported" badge, in
  // place of the verified card, never two competing numbers. TVL also gets the
  // daily history sparkline when we have it.
  const subgraphCard = (label: string, value: string | null, color: string, sparkPoints?: number[]) => (
    <div style={{ background: surf, padding: "22px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
        <span style={badgeR} title={REPORTED_TITLE}>reported · via subgraph</span>
      </div>
      <div style={{ fontSize: "34px", fontWeight: 700, color, letterSpacing: "-0.03em", fontFamily: mono, lineHeight: 1.1 }}>{value}</div>
      {sparkPoints && sparkPoints.length >= 2 && <Sparkline points={sparkPoints} color={color === t1 ? ACCENT : color} width={300} height={42} />}
      <div style={{ fontSize: "10px", fontFamily: mono, color: t3, lineHeight: 1.6 }}>
        Self-reported via the project&apos;s own subgraph. Not verified on-chain by ArcLens.{freshness ? " " + freshness : ""}
      </div>
    </div>
  )

  return (
    <div style={{ marginBottom: "16px", background: surf, border: "1px solid " + bdr, borderRadius: "16px", overflow: "hidden" }}>
      <style>{`.al-metric-cells{display:grid;gap:1px;background:${bdr};grid-template-columns:repeat(${presentCount || 1},minmax(0,1fr))}@media(max-width:680px){.al-metric-cells{grid-template-columns:1fr}}`}</style>
      <div style={{ padding: "14px 22px", borderBottom: "1px solid " + bdr, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <span style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em" }}>Protocol Metrics</span>
        <span style={hasSubgraph ? badgeR : badgeV} title={hasSubgraph ? REPORTED_TITLE : undefined}>{hasSubgraph ? "protocol-reported" : "✓ verified on-chain"}</span>
      </div>
      <div className="al-metric-cells">

      {/* ── TVL CARD ── */}
      {sgTvlFmt ? subgraphCard("Total Value Locked", fmt(project.subgraph_tvl_usd_e6, { precise: true }), t1, sgSeries) : tvlFmt && (
        <div style={{ background: surf, padding: "22px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Total Value Locked
            </div>
            <span style={{
              fontSize: "8.5px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px",
              background: "rgba(0,184,122,0.08)", color: USDC_GREEN,
              border: "1px solid rgba(0,184,122,0.25)",
            }}>
              ✓ verified on-chain
            </span>
          </div>

          <div>
            <div style={{ fontSize: "34px", fontWeight: 700, color: t1, letterSpacing: "-0.03em", fontFamily: mono, lineHeight: 1.1 }}>
              {fmt(project.tvl_usd_e6, { precise: true })}
            </div>
            {tvlAthFmt && project.tvl_ath_usd_e6 !== project.tvl_usd_e6 && (
              <div style={{ fontSize: "11px", fontFamily: mono, color: t3, marginTop: "4px" }}>
                ATH {tvlAthFmt}
                {project.tvl_ath_at && (
                  <span style={{ opacity: 0.7 }}> · {new Date(project.tvl_ath_at).toLocaleDateString()}</span>
                )}
              </div>
            )}
            {tvlAthFmt && project.tvl_ath_usd_e6 === project.tvl_usd_e6 && (
              <div style={{ fontSize: "11px", fontFamily: mono, color: USDC_GREEN, marginTop: "4px" }}>
                new ATH today
              </div>
            )}
          </div>

          <Sparkline points={series} color={ACCENT} width={300} height={42} />

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {tvl?.latest && (
              <button
                onClick={() => setShowBreakdown(v => !v)}
                style={{
                  height: "30px", padding: "0 12px", background: "rgba(26,86,255,0.06)",
                  color: ACCENT_S, fontSize: "11px", fontFamily: mono,
                  border: "1px solid rgba(26,86,255,0.2)", borderRadius: "6px", cursor: "pointer",
                }}>
                {showBreakdown ? "Hide breakdown" : `Per-contract breakdown (${tvl.latest.breakdown.length})`}
              </button>
            )}
            {project.tvl_last_indexed_at && (
              <span style={{ fontSize: "10px", fontFamily: mono, color: t3, alignSelf: "center" }}>
                last indexed {new Date(project.tvl_last_indexed_at).toLocaleTimeString()}
              </span>
            )}
          </div>

          {showBreakdown && tvl?.latest && (
            <div style={{ background: surf2, border: "1px solid " + bdr, borderRadius: "8px", overflow: "hidden" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 110px 90px",
                padding: "8px 12px", borderBottom: "1px solid " + bdr,
                fontSize: "9px", fontFamily: mono, color: t3, letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}>
                <span>Contract</span>
                <span style={{ textAlign: "right" }}>Balance</span>
                <span style={{ textAlign: "right" }}>USD</span>
              </div>
              {tvl.latest.breakdown.map((b, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 110px 90px",
                  padding: "9px 12px",
                  borderBottom: i < tvl.latest!.breakdown.length - 1 ? "1px solid " + bdr : "none",
                  fontSize: "11px", fontFamily: mono, alignItems: "center",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <a href={`/address/${b.contract_address}`}
                       style={{ color: ACCENT_S, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.contract_label || `${b.contract_address.slice(0, 8)}…${b.contract_address.slice(-6)}`}
                    </a>
                    <div style={{ color: t3, fontSize: "9px", marginTop: "2px" }}>
                      {b.contract_address.slice(0, 12)}…{b.contract_address.slice(-8)}
                    </div>
                  </div>
                  <span style={{ color: t2, textAlign: "right" }}>
                    {fmtRaw(b.balance_raw, STABLE_DECIMALS, b.symbol)}
                  </span>
                  <span style={{ color: t1, textAlign: "right", fontWeight: 600 }}>
                    {fmt(b.usd_e6)}
                  </span>
                </div>
              ))}
              <div style={{
                padding: "8px 12px", background: surf,
                fontSize: "10px", fontFamily: mono, color: t3, lineHeight: 1.5,
              }}>
                Snapshot at block {tvl.latest.block_number.toLocaleString()} ·
                {" "}{new Date(tvl.latest.block_time).toLocaleString()}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", fontSize: "10px", fontFamily: mono, color: t3 }}>
            <span>{tvlContracts.length} contract{tvlContracts.length === 1 ? "" : "s"} tracked</span>
            {openDisputes.tvl > 0 && (
              <span style={{ fontSize: "9px", fontFamily: mono, padding: "1px 6px", borderRadius: "3px", background: "rgba(224,136,16,0.1)", color: "#e08810", border: "1px solid rgba(224,136,16,0.25)" }}>
                {openDisputes.tvl} under review
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── VOLUME CARD ── */}
      {sgVolFmt ? subgraphCard("Volume (cumulative)", fmt(project.subgraph_volume_usd_e6, { precise: true }), ACCENT_S) : volCumFmt && (() => {
        // The honesty badge depends on HOW we computed this number. If any
        // of the volume contracts use outflow_transfer, we mark the whole
        // number as approximate so analysts can adjust confidence.
        const hasOutflow = volContracts.some(c => c.volume_method === "outflow_transfer")
        const hasSwapEvent = volContracts.some(c => c.volume_method !== "outflow_transfer")
        const mixed = hasOutflow && hasSwapEvent
        const badge = hasOutflow && !hasSwapEvent
          ? { label: "Outflow method · approximate", bg: "rgba(224,136,16,0.08)", color: "#e08810", border: "rgba(224,136,16,0.3)",
              title: "Computed by summing stablecoin Transfer events FROM the contract. Over-counts internal hops; designed for aggregators / routers without on-chain Swap events." }
          : mixed
          ? { label: "Mixed methods · partly approximate", bg: "rgba(224,136,16,0.08)", color: "#e08810", border: "rgba(224,136,16,0.3)",
              title: "Some contracts use Swap events (precise), others use the outflow-transfer method (approximate). Click breakdown for per-contract method." }
          : { label: "✓ swap-event precise", bg: "rgba(0,184,122,0.08)", color: USDC_GREEN, border: "rgba(0,184,122,0.25)",
              title: "Counted from the protocol's own Swap event — exact ABI-decoded amounts." }
        return (
        <div style={{ background: surf, padding: "22px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Volume (cumulative)
            </div>
            <span style={{
              fontSize: "8.5px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px",
              background: badge.bg, color: badge.color,
              border: "1px solid " + badge.border,
            }} title={badge.title}>
              {badge.label}
            </span>
          </div>

          <div>
            <div style={{ fontSize: "34px", fontWeight: 700, color: ACCENT_S, letterSpacing: "-0.03em", fontFamily: mono, lineHeight: 1.1 }}>
              {fmt(project.volume_cum_usd_e6, { precise: true })}
            </div>
            {volAthDayFmt && (
              <div style={{ fontSize: "11px", fontFamily: mono, color: t3, marginTop: "4px" }}>
                ATH single day {volAthDayFmt}
                {project.volume_ath_day && (
                  <span style={{ opacity: 0.7 }}> · {new Date(project.volume_ath_day).toLocaleDateString()}</span>
                )}
              </div>
            )}
          </div>

          <Sparkline points={volSeries} color={ACCENT_S} width={300} height={42} />

          <div style={{ display: "flex", gap: "10px", fontSize: "10px", fontFamily: mono, color: t3 }}>
            <span>{volContracts.length} swap contract{volContracts.length === 1 ? "" : "s"}</span>
            {openDisputes.volume > 0 && (
              <span style={{ fontSize: "9px", fontFamily: mono, padding: "1px 6px", borderRadius: "3px", background: "rgba(224,136,16,0.1)", color: "#e08810", border: "1px solid rgba(224,136,16,0.25)" }}>
                {openDisputes.volume} under review
              </span>
            )}
          </div>
        </div>
        )
      })()}

      {/* ── REVENUE CARD ── */}
      {revCumFmt && (
        <div style={{ background: surf, padding: "22px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Revenue (cumulative)
            </div>
            <span style={{
              fontSize: "8.5px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px",
              background: "rgba(0,184,122,0.08)", color: USDC_GREEN,
              border: "1px solid rgba(0,184,122,0.25)",
            }}>
              ✓ verified on-chain
            </span>
          </div>

          <div>
            <div style={{ fontSize: "34px", fontWeight: 700, color: USDC_GREEN, letterSpacing: "-0.03em", fontFamily: mono, lineHeight: 1.1 }}>
              {fmt(project.revenue_cum_usd_e6, { precise: true })}
            </div>
            {revAthDayFmt && (
              <div style={{ fontSize: "11px", fontFamily: mono, color: t3, marginTop: "4px" }}>
                ATH single day {revAthDayFmt}
                {project.revenue_ath_day && (
                  <span style={{ opacity: 0.7 }}> · {new Date(project.revenue_ath_day).toLocaleDateString()}</span>
                )}
              </div>
            )}
          </div>

          <Sparkline points={revSeries} color={USDC_GREEN} width={300} height={42} />

          <div style={{ display: "flex", gap: "10px", fontSize: "10px", fontFamily: mono, color: t3 }}>
            <span>{revContracts.length} fee collector{revContracts.length === 1 ? "" : "s"}</span>
            {openDisputes.revenue > 0 && (
              <span style={{ fontSize: "9px", fontFamily: mono, padding: "1px 6px", borderRadius: "3px", background: "rgba(224,136,16,0.1)", color: "#e08810", border: "1px solid rgba(224,136,16,0.25)" }}>
                {openDisputes.revenue} under review
              </span>
            )}
          </div>
        </div>
      )}

      {/* Flagging a number lives in the single "Report a problem" form at the
          bottom of the page (one flag for the whole listing). The "under review"
          counts above are read-only signals. */}
      </div>
    </div>
  )
}
