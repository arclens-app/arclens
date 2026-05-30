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

  // Which metric (if any) has the dispute form open right now.
  const [flagOpen, setFlagOpen] = useState<"tvl" | "volume" | "revenue" | null>(null)
  const [flagReason, setFlagReason] = useState("")
  const [flagEvidence, setFlagEvidence] = useState("")
  const [flagEmail, setFlagEmail] = useState("")
  const [flagSubmitting, setFlagSubmitting] = useState(false)
  const [flagMessage, setFlagMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Fetch open-dispute counts when the component mounts / slug changes.
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

  async function submitFlag(metric: "tvl" | "volume" | "revenue") {
    setFlagMessage(null)
    if (flagReason.trim().length < 10) {
      setFlagMessage({ ok: false, text: "Please give us at least one full sentence (10+ chars)." })
      return
    }
    setFlagSubmitting(true)
    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, metric,
          reason: flagReason.trim(),
          evidence_url: flagEvidence.trim() || undefined,
          reporter_email: flagEmail.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFlagMessage({ ok: false, text: data.error || "Could not submit" })
        return
      }
      setFlagMessage({ ok: true, text: "Thanks — flagged for admin review." })
      setFlagReason(""); setFlagEvidence(""); setFlagEmail("")
      setOpenDisputes(o => ({ ...o, [metric]: o[metric] + 1 }))
      setTimeout(() => { setFlagOpen(null); setFlagMessage(null) }, 1800)
    } catch {
      setFlagMessage({ ok: false, text: "Network error. Try again." })
    } finally {
      setFlagSubmitting(false)
    }
  }

  // Sparkline series — declared before any early return (Rules of Hooks).
  const series    = useMemo(() => (tvl?.series ?? []).map(p => Number(BigInt(p.total_usd_e6)) / 1e6), [tvl?.series])
  const revSeries = useMemo(() => (tvl?.revenue_series ?? []).map(p => Number(BigInt(p.total_usd_e6)) / 1e6), [tvl?.revenue_series])
  const volSeries = useMemo(() => (tvl?.volume_series ?? []).map(p => Number(BigInt(p.total_usd_e6)) / 1e6), [tvl?.volume_series])

  // Don't render anything if the founder hasn't opted in.
  if (!project.tvl_tracking_enabled) return null

  const tvlFmt        = fmt(project.tvl_usd_e6)
  const tvlAthFmt     = fmt(project.tvl_ath_usd_e6)
  const revCumFmt     = fmt(project.revenue_cum_usd_e6)
  const revAthDayFmt  = fmt(project.revenue_ath_day_usd_e6)
  const volCumFmt     = fmt(project.volume_cum_usd_e6)
  const volAthDayFmt  = fmt(project.volume_ath_day_usd_e6)

  // If literally nothing has been indexed yet, render a soft empty state so
  // visitors know tracking exists and is just warming up.
  const nothingYet = !tvlFmt && !revCumFmt && !volCumFmt
  if (nothingYet) {
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
  const presentCount = [tvlFmt, volCumFmt, revCumFmt].filter(Boolean).length

  return (
    <div style={{ marginBottom: "16px", background: surf, border: "1px solid " + bdr, borderRadius: "16px", overflow: "hidden" }}>
      <style>{`.al-metric-cells{display:grid;gap:1px;background:${bdr};grid-template-columns:repeat(${presentCount || 1},minmax(0,1fr))}@media(max-width:680px){.al-metric-cells{grid-template-columns:1fr}}`}</style>
      <div style={{ padding: "14px 22px", borderBottom: "1px solid " + bdr, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <span style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em" }}>Protocol Metrics</span>
        <span style={{ fontSize: "8.5px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(0,184,122,0.08)", color: USDC_GREEN, border: "1px solid rgba(0,184,122,0.25)" }}>✓ verified on-chain</span>
      </div>
      <div className="al-metric-cells">

      {/* ── TVL CARD ── */}
      {tvlFmt && (
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
            <span style={{ opacity: 0.5 }}>·</span>
            <button type="button" onClick={() => setFlagOpen(flagOpen === "tvl" ? null : "tvl")}
              style={{ background: "none", border: "none", padding: 0, color: t3, textDecoration: "underline", fontSize: "10px", fontFamily: mono, cursor: "pointer" }}>
              {flagOpen === "tvl" ? "Cancel" : "Flag a problem"}
            </button>
            {openDisputes.tvl > 0 && (
              <span style={{ fontSize: "9px", fontFamily: mono, padding: "1px 6px", borderRadius: "3px", background: "rgba(224,136,16,0.1)", color: "#e08810", border: "1px solid rgba(224,136,16,0.25)" }}>
                {openDisputes.tvl} under review
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── VOLUME CARD ── */}
      {volCumFmt && (() => {
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
            <span style={{ opacity: 0.5 }}>·</span>
            <button type="button" onClick={() => setFlagOpen(flagOpen === "volume" ? null : "volume")}
              style={{ background: "none", border: "none", padding: 0, color: t3, textDecoration: "underline", fontSize: "10px", fontFamily: mono, cursor: "pointer" }}>
              {flagOpen === "volume" ? "Cancel" : "Flag a problem"}
            </button>
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
            <span style={{ opacity: 0.5 }}>·</span>
            <button type="button" onClick={() => setFlagOpen(flagOpen === "revenue" ? null : "revenue")}
              style={{ background: "none", border: "none", padding: 0, color: t3, textDecoration: "underline", fontSize: "10px", fontFamily: mono, cursor: "pointer" }}>
              {flagOpen === "revenue" ? "Cancel" : "Flag a problem"}
            </button>
            {openDisputes.revenue > 0 && (
              <span style={{ fontSize: "9px", fontFamily: mono, padding: "1px 6px", borderRadius: "3px", background: "rgba(224,136,16,0.1)", color: "#e08810", border: "1px solid rgba(224,136,16,0.25)" }}>
                {openDisputes.revenue} under review
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── DISPUTE FORM ── Full-width row when any "Flag a problem" is open. */}
      {flagOpen && (
        <div style={{
          gridColumn: "1 / -1",
          background: surf2,
          border: "1px solid rgba(224,136,16,0.25)",
          borderRadius: "12px",
          padding: "18px 22px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: "#e08810", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Flag a problem with this project&apos;s {flagOpen.toUpperCase()}
          </div>
          <div style={{ fontSize: "12px", fontFamily: mono, color: t2, lineHeight: 1.7 }}>
            Anyone can flag a number. Admin reviews each report and can mark it acknowledged, resolved, or
            dismissed. Counts of open flags appear on the metric card so visitors can judge confidence.
            No login required — just be specific.
          </div>
          <textarea
            value={flagReason}
            onChange={e => setFlagReason(e.target.value)}
            placeholder="What's wrong with this number? Be specific — link a block, a tx hash, or a screenshot."
            style={{
              width: "100%", minHeight: "84px",
              background: surf, border: "1px solid " + bdr, borderRadius: "8px",
              padding: "10px 14px",
              fontFamily: mono, fontSize: "12px", color: t1, lineHeight: 1.6,
              outline: "none", resize: "vertical",
            } as React.CSSProperties}
            disabled={flagSubmitting}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <input
              value={flagEvidence}
              onChange={e => setFlagEvidence(e.target.value)}
              placeholder="Evidence URL (optional)"
              style={{
                height: "36px", background: surf, border: "1px solid " + bdr,
                borderRadius: "8px", padding: "0 12px",
                fontFamily: mono, fontSize: "12px", color: t1, outline: "none",
              }}
              disabled={flagSubmitting}
            />
            <input
              value={flagEmail}
              onChange={e => setFlagEmail(e.target.value)}
              placeholder="Your email (optional, for follow-up)"
              style={{
                height: "36px", background: surf, border: "1px solid " + bdr,
                borderRadius: "8px", padding: "0 12px",
                fontFamily: mono, fontSize: "12px", color: t1, outline: "none",
              }}
              disabled={flagSubmitting}
            />
          </div>
          {flagMessage && (
            <div style={{
              fontSize: "12px", fontFamily: mono, lineHeight: 1.6,
              color: flagMessage.ok ? USDC_GREEN : "#e03348",
            }}>
              {flagMessage.text}
            </div>
          )}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => submitFlag(flagOpen!)}
              disabled={flagSubmitting || flagReason.trim().length < 10}
              style={{
                height: "38px", padding: "0 18px",
                background: "#e08810", color: "#1a0e02",
                fontSize: "12.5px", fontWeight: 700,
                border: "none", borderRadius: "8px",
                cursor: (flagSubmitting || flagReason.trim().length < 10) ? "not-allowed" : "pointer",
                fontFamily: mono,
                opacity: (flagSubmitting || flagReason.trim().length < 10) ? 0.6 : 1,
              }}>
              {flagSubmitting ? "Submitting…" : "Submit flag"}
            </button>
            <button
              onClick={() => { setFlagOpen(null); setFlagMessage(null) }}
              disabled={flagSubmitting}
              style={{
                height: "38px", padding: "0 16px",
                background: "transparent", color: t2,
                fontSize: "12px", fontFamily: mono,
                border: "1px solid " + bdr, borderRadius: "8px",
                cursor: flagSubmitting ? "not-allowed" : "pointer",
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
