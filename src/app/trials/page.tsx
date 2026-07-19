"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import { WalletAvatar } from "@/components/WalletAvatar"
import { useArcStore } from "@/store/arc"
import { TYPE_META, getTypeMeta } from "@/lib/campaignTypes"

interface Campaign {
  id: number
  slug: string | null
  title: string
  tagline: string | null
  type: string
  status: string
  reward_type: string
  reward_description: string | null
  reward_usdc_amount: number | null
  contract_address: string | null
  total_slots: number | null
  filled_slots: number
  is_fcfs: boolean
  min_rank: number
  project_name: string | null
  project_logo: string | null
  campaign_logo: string | null
  banner_position: string | null
  creator_wallet: string
  tasks: { id: string; title: string; requires_tx: boolean }[]
  created_at: string
  expires_at: string | null
  ended_at: string | null
  ended_reason: "slots_filled" | "expired" | "admin_closed" | null
  completion_count: number
}

interface Stats {
  active_campaigns: number
  total_testers: number
  total_completions: number
  completions_this_week: number
}

interface Reputation {
  rank: number
  rank_points: number
  campaigns_completed: number
  avg_score: number
  impact_count: number
}


const REWARD_META: Record<string, { label: string; color: string }> = {
  usdc:             { label: "USDC",          color: "#00d990" },
  whitelist:        { label: "Whitelist",      color: "#8aaeff" },
  early_access:     { label: "Early Access",   color: "#8aaeff" },
  discord_role:     { label: "Discord Role",   color: "#a855f7" },
  credit:           { label: "Public Credit",  color: "#c08828" },
  token_allocation: { label: "Token Alloc.",   color: "#1a56ff" },
  other:            { label: "Custom Reward",  color: "#6b7da8" },
}

const RANK_LABELS = ["Scout", "Builder", "Verified", "Trusted", "Arc Proven"]
const RANK_COLORS = ["#6b7da8", "#1a56ff", "#00b87a", "#c08828", "#ec4899"]

function imgSrc(url: string | null) {
  if (!url) return null
  // Vercel Blob URLs are clean CDN links not blocked by ad-blockers — serve
  // them directly and skip the proxy round-trip. Only legacy imgbb needs it.
  if (/\.blob\.vercel-storage\.com\//i.test(url)) return url
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

function slotsLeft(c: Campaign) {
  if (!c.total_slots) return null
  return Math.max(0, c.total_slots - c.filled_slots)
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1)  return "just now"
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function daysLeft(d: string) {
  const diff = new Date(d).getTime() - Date.now()
  return diff / 3_600_000 / 24
}

export default function ForgePage() {
  const router = useRouter()
  const [mounted, setMounted]         = useState(false)
  const [campaigns, setCampaigns]     = useState<Campaign[]>([])
  const [stats, setStats]             = useState<Stats | null>(null)
  const [reputation, setReputation]   = useState<Reputation | null>(null)
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState("all")
  const [statusFilter, setStatusFilter] = useState<"active" | "ended">("active")
  const wallet = useArcStore(s => s.walletAddr)
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    load()
  }, [mounted, filter, statusFilter, wallet])

  async function load() {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter !== "all") qs.set("type", filter)
      if (wallet) qs.set("wallet", wallet)
      qs.set("status", statusFilter)
      const res  = await fetch(`/api/trials?${qs}`)
      const data = await res.json()
      setCampaigns(data.campaigns || [])
      setStats(data.stats || null)
      setReputation(data.reputation || null)
    } finally {
      setLoading(false)
    }
  }

  const rank      = reputation?.rank ?? 0
  const rankLabel = RANK_LABELS[rank] ?? "Scout"
  const rankColor = RANK_COLORS[rank] ?? "#6b7da8"

  const filterButtons = [
    { id: "all", label: "All", abbr: "All", color: "#8aaeff" },
    ...Object.entries(TYPE_META).map(([id, m]) => ({ id, label: m.label, abbr: m.abbr, color: m.color })),
  ]

  return (
    <ArcLayout active="trials">
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes trialRing {
          0%   { box-shadow: 0 0 0 0 rgba(0,217,144,0.4); }
          70%  { box-shadow: 0 0 0 14px rgba(0,217,144,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,217,144,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .trial-pulse { animation: none !important; }
        }
      `}</style>
      <div style={{ padding: "32px 28px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#1a56ff", letterSpacing: 2, textTransform: "uppercase" }}>Arc Trials</span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#1a56ff", display: "inline-block" }} />
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--t2,#6b7da8)", letterSpacing: 1 }}>Verified Testing Platform</span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--t1,#e8ecff)", margin: 0, letterSpacing: -0.5 }}>
              Arc Trials
            </h1>
            <p style={{ fontSize: 13, color: "var(--t2,#6b7da8)", marginTop: 6, maxWidth: 440 }}>
              Where builders get real feedback. Testers build reputation.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "flex-start" }}>
            {wallet ? (
              <button
                onClick={() => router.push("/trials/create")}
                style={{ height: 38, padding: "0 18px", background: "#1a56ff", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                + Create Campaign
              </button>
            ) : mounted && (
              <div style={{ fontSize: 12, color: "var(--t2,#6b7da8)", fontFamily: "monospace", height: 38, display: "flex", alignItems: "center", padding: "0 14px", background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 8 }}>
                Connect wallet via sidebar →
              </div>
            )}
          </div>
        </div>

        {/* ── Stats strip — borderless; numbers carry the weight, hairlines
               divide. No boxes competing with the campaign cards below. ── */}
        {mounted && (
          <div style={{ display: "flex", flexWrap: "wrap", rowGap: 18, marginBottom: 32 }}>
            {[
              { label: "Active Campaigns",  value: stats?.active_campaigns        ?? "—", color: "#8aaeff" },
              { label: "Total Testers",     value: stats?.total_testers           ?? "—", color: "#00d990" },
              { label: "Total Completions", value: stats?.total_completions       ?? "—", color: "#a78bfa" },
              { label: "This Week",         value: stats?.completions_this_week   ?? "—", color: "#e0a810" },
            ].map((s, i) => (
              <div key={s.label} style={{ padding: i === 0 ? "0 30px 0 0" : "0 30px", borderLeft: i > 0 ? "1px solid var(--bdr,rgba(255,255,255,0.07))" : "none" }}>
                <div style={{ fontSize: 27, fontWeight: 700, color: s.color, fontFamily: "var(--font-mono,monospace)", letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                <div style={{ fontSize: 9.5, color: "var(--t2,#6b7da8)", marginTop: 8, fontFamily: "var(--font-mono,monospace)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Identity rail — borderless, hairline-topped. Avatar + rank, then
               the tester's own numbers in the same strip language as the page
               stats. "Host a Campaign" dropped: the header already has Create. ── */}
        {wallet && mounted && (
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "16px 0", borderTop: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderBottom: "1px solid var(--bdr,rgba(255,255,255,0.06))", marginBottom: 26 }}>
            <div
              onClick={() => router.push(`/tester/${wallet}`)}
              style={{ cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}
            >
              <WalletAvatar wallet={wallet} size={38} />
              <div>
                <div style={{ fontSize: 9.5, color: "var(--t2,#6b7da8)", fontFamily: "var(--font-mono,monospace)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Your rank</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: rankColor, letterSpacing: "-0.01em" }}>{rankLabel}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 0, flexWrap: "wrap", flex: 1, rowGap: 12 }}>
              {[
                { label: "Campaigns",   value: reputation?.campaigns_completed ?? 0 },
                { label: "Avg Score",   value: reputation ? `${Number(reputation.avg_score).toFixed(1)}/5` : "—" },
                { label: "Impact",      value: reputation?.impact_count ?? 0 },
                { label: "Rank Points", value: reputation?.rank_points ?? 0 },
              ].map(s => (
                <div key={s.label} style={{ padding: "0 22px", borderLeft: "1px solid var(--bdr,rgba(255,255,255,0.07))" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1,#e8ecff)", fontFamily: "var(--font-mono,monospace)", fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{s.value}</div>
                  <div style={{ fontSize: 9.5, color: "var(--t2,#6b7da8)", fontFamily: "var(--font-mono,monospace)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push(`/tester/${wallet}`)}
              style={{ height: 32, padding: "0 14px", background: "transparent", border: "none", fontSize: 12, color: rankColor, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}
            >
              View profile →
            </button>
          </div>
        )}

        {/* ── Controls — compact status toggle + type filters, one row.
               The toggle is a control, not a section: it stopped being a
               full-width bar. Chips are quiet until active. ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
          <div style={{ display: "inline-flex", background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 8, padding: 3, flexShrink: 0 }}>
            {([
              { id: "active", label: "Active",  color: "#00d990" },
              { id: "ended",  label: "Ended",   color: "#6b7da8" },
            ] as const).map(s => (
              <button key={s.id} onClick={() => setStatusFilter(s.id)}
                style={{
                  height: 28, padding: "0 14px", borderRadius: 6, cursor: "pointer",
                  background: statusFilter === s.id ? `${s.color}14` : "transparent",
                  color: statusFilter === s.id ? s.color : "var(--t2,#6b7da8)",
                  border: "none",
                  fontSize: 12, fontWeight: statusFilter === s.id ? 650 : 400,
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.15s",
                }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusFilter === s.id ? s.color : "var(--t3,#2e3a5c)" }} />
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: "var(--bdr,rgba(255,255,255,0.07))", flexShrink: 0 }} />
          <div style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1, paddingBottom: 2 }}>
            {filterButtons.map(f => {
              const active = filter === f.id
              const color  = active ? (f.id === "all" ? "#8aaeff" : f.color) : undefined
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    height: 28, padding: "0 12px", whiteSpace: "nowrap", flexShrink: 0,
                    background: active ? (color + "16") : "transparent",
                    color: active ? color : "var(--t2,#6b7da8)",
                    border: "1px solid transparent",
                    borderRadius: 7, fontSize: 11.5, fontWeight: active ? 650 : 400, cursor: "pointer",
                    display: "flex", alignItems: "center",
                    transition: "all 0.15s",
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Campaign Grid ── */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 12, height: 210, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          statusFilter === "active" && filter === "all" ? (
            /* The stage — with zero live campaigns this is the landing
               experience, so it sells instead of shrugging. Total testers
               ground the pitch in proof; two real actions follow. */
            <div style={{ textAlign: "center", padding: "72px 24px 80px", borderRadius: 16, background: "radial-gradient(80% 100% at 50% 0%, rgba(26,86,255,0.07), transparent 70%)" }}>
              <div className="trial-pulse" style={{ width: 10, height: 10, borderRadius: "50%", background: "#00d990", margin: "0 auto 22px", animation: "trialRing 2.4s ease-out infinite" }} />
              <div style={{ fontSize: 21, fontWeight: 750, color: "var(--t1,#e8ecff)", letterSpacing: "-0.025em", marginBottom: 8 }}>The next campaign is loading</div>
              <div style={{ fontSize: 13.5, color: "var(--t2,#6b7da8)", margin: "0 auto 26px", maxWidth: 380, lineHeight: 1.65 }}>
                <strong style={{ color: "#00d990", fontVariantNumeric: "tabular-nums" }}>{stats?.total_testers ?? "—"} testers</strong> completed
                the last campaign on Arc Trials. New campaigns are reviewed and go live here — yours could be next.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => router.push("/trials/create")} style={{ height: 40, padding: "0 22px", background: "#1a56ff", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 650, cursor: "pointer" }}>
                  Create a campaign
                </button>
                <button onClick={() => setStatusFilter("ended")} style={{ height: 40, padding: "0 18px", background: "transparent", color: "var(--t2,#6b7da8)", border: "1px solid var(--bdr,rgba(255,255,255,0.1))", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  Browse ended campaigns →
                </button>
              </div>
            </div>
          ) : (
            /* Filtered / ended-tab empty — quiet, with a way back */
            <div style={{ textAlign: "center", padding: "72px 20px" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--t1,#e8ecff)", marginBottom: 6 }}>Nothing here yet</div>
              <div style={{ fontSize: 13, color: "var(--t2,#6b7da8)", marginBottom: 20 }}>
                {statusFilter === "ended"
                  ? filter !== "all"
                    ? `No ended ${TYPE_META[filter]?.label ?? filter} campaigns yet.`
                    : "No ended campaigns yet."
                  : `No active ${TYPE_META[filter]?.label ?? filter} campaigns right now.`
                }
              </div>
              {filter !== "all" && (
                <button onClick={() => setFilter("all")} style={{ height: 34, padding: "0 16px", background: "transparent", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.3)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                  Clear filter
                </button>
              )}
            </div>
          )
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {campaigns.map(c => {
              const tm        = getTypeMeta(c.type)
              const rm        = REWARD_META[c.reward_type] || REWARD_META.other
              const left      = slotsLeft(c)
              const full      = left !== null && left === 0
              const logoUrl   = imgSrc(c.campaign_logo || c.project_logo)
              const isHovered = hoveredCard === c.id
              const isEnded   = statusFilter === "ended"
              const expiresIn = c.expires_at ? daysLeft(c.expires_at) : null
              const endingSoon = expiresIn !== null && expiresIn <= 1 && expiresIn > 0
              const daysLeftNum = expiresIn !== null && expiresIn > 0 && expiresIn <= 7 ? Math.ceil(expiresIn) : null

              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/trials/${c.slug || c.id}`)}
                  onMouseEnter={() => setHoveredCard(c.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    background: "var(--surf,#0a0e1a)",
                    border: `1px solid ${isHovered && !isEnded ? tm.color + "50" : "var(--bdr,rgba(255,255,255,0.06))"}`,
                    borderRadius: 12, overflow: "hidden",
                    cursor: "pointer",
                    opacity: isEnded ? 0.65 : full ? 0.6 : 1,
                    transition: "border-color 0.15s, transform 0.15s",
                    transform: isHovered && !isEnded ? "translateY(-2px)" : "none",
                    display: "flex", flexDirection: "column",
                  }}
                >
                  {/* Banner — 16:9 aspect ratio so full uploaded banners (which
                      are 16:9 by the recommended-dimensions hint) render edge to
                      edge instead of cropping left/right at a fixed height. */}
                  <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: `linear-gradient(135deg, ${tm.color}20 0%, ${tm.color}08 60%, var(--surf,#0a0e1a) 100%)`, overflow: "hidden", flexShrink: 0 }}>
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, fontWeight: 900, fontFamily: "monospace", color: `${tm.color}15`, letterSpacing: "-0.04em", userSelect: "none" }}>{tm.abbr}</span>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${tm.color}, ${tm.color}30)` }} />
                    {logoUrl && (
                      <img src={logoUrl} alt="" onError={e => (e.currentTarget.style.display = "none")}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: (c as any).banner_position || "50% 50%" }} />
                    )}
                    {/* Gradient fade into card body */}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(0deg, var(--surf,#0a0e1a) 0%, transparent 100%)" }} />
                    {/* Status badges over banner */}
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {isEnded && <span style={{ fontSize: 9, fontFamily: "monospace", background: "rgba(0,0,0,0.6)", color: "#8896b8", border: "1px solid rgba(107,125,168,0.3)", padding: "2px 7px", borderRadius: 3, backdropFilter: "blur(4px)" }}>Ended</span>}
                      {!isEnded && full && <span style={{ fontSize: 9, fontFamily: "monospace", background: "rgba(0,0,0,0.6)", color: "#e03348", border: "1px solid #e0334840", padding: "2px 7px", borderRadius: 3, backdropFilter: "blur(4px)" }}>Full</span>}
                      {!isEnded && endingSoon && <span style={{ fontSize: 9, fontFamily: "monospace", background: "rgba(0,0,0,0.6)", color: "#e03348", border: "1px solid #e0334840", padding: "2px 7px", borderRadius: 3, backdropFilter: "blur(4px)" }}>Ending soon</span>}
                      {!isEnded && !endingSoon && daysLeftNum !== null && <span style={{ fontSize: 9, fontFamily: "monospace", background: "rgba(0,0,0,0.6)", color: "#e08810", border: "1px solid #e0881040", padding: "2px 7px", borderRadius: 3, backdropFilter: "blur(4px)" }}>{daysLeftNum}d left</span>}
                      {c.contract_address && <span style={{ fontSize: 9, fontFamily: "monospace", background: "rgba(0,0,0,0.6)", color: "#00d990", border: "1px solid #00b87a40", padding: "2px 7px", borderRadius: 3, backdropFilter: "blur(4px)" }}>on-chain</span>}
                    </div>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                    {/* Title + type badge */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1,#e8ecff)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{c.title}</div>
                        <span style={{ fontSize: 9, fontWeight: 800, color: tm.color, fontFamily: "monospace", padding: "1px 6px", borderRadius: 4, background: `${tm.color}15`, border: `1px solid ${tm.color}30`, flexShrink: 0 }}>{tm.abbr}</span>
                      </div>
                      {c.project_name && <div style={{ fontSize: 11, color: "var(--t2,#6b7da8)" }}>{c.project_name}</div>}
                    </div>

                    {/* Tagline */}
                    {c.tagline && (
                      <p style={{ fontSize: 12, color: "var(--t2,#6b7da8)", margin: 0, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{c.tagline}</p>
                    )}

                    {/* Reward */}
                    <div>
                      {c.reward_type === "usdc" && c.reward_usdc_amount != null ? (
                        <div>
                          <span style={{ fontSize: 18, fontWeight: 800, color: "#00d990", fontFamily: "monospace" }}>${c.reward_usdc_amount}</span>
                          <span style={{ fontSize: 11, color: "var(--t2,#6b7da8)", marginLeft: 5 }}>USDC per tester</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, background: `${rm.color}15`, color: rm.color, border: `1px solid ${rm.color}30`, padding: "3px 8px", borderRadius: 4, fontFamily: "monospace" }}>{rm.label}</span>
                      )}
                    </div>

                    {/* Slot bar */}
                    {c.total_slots && c.total_slots > 0 && (
                      <div>
                        <div style={{ height: 3, background: "var(--bdr,rgba(255,255,255,0.06))", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, (c.filled_slots / c.total_slots) * 100)}%`, background: full ? "#e03348" : tm.color, borderRadius: 2, transition: "width 0.3s ease" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 10, color: "var(--t3,#2e3a5c)" }}>{c.filled_slots}/{c.total_slots} filled</span>
                          {left !== null && left > 0 && <span style={{ fontSize: 10, color: left <= 3 ? "#e03348" : "var(--t3,#2e3a5c)", fontWeight: left <= 3 ? 700 : 400 }}>{left} left</span>}
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--bdr,rgba(255,255,255,0.05))", marginTop: "auto", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "var(--t3,#2e3a5c)", fontFamily: "monospace" }}>{c.tasks?.length || 0} task{c.tasks?.length !== 1 ? "s" : ""} · {Number(c.completion_count)} done</span>
                      {/* For ended campaigns, surface the ACTUAL end date + why.
                          For active campaigns, keep the "created Xd ago" hint. */}
                      {c.status === "ended" && c.ended_at ? (() => {
                        const endedDate = new Date(c.ended_at)
                        const expiresDate = c.expires_at ? new Date(c.expires_at) : null
                        // Compare CALENDAR DAYS, not 24-hour periods — "May 26 → May 28"
                        // is humanly 2 days early even when the timestamps are
                        // 1.6 days apart. UTC stripping avoids timezone surprises.
                        const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
                        const daysEarly = (c.ended_reason === "slots_filled" && expiresDate)
                          ? Math.round((utcDay(expiresDate) - utcDay(endedDate)) / 86_400_000)
                          : 0
                        const label = c.ended_reason === "slots_filled"
                          ? (daysEarly > 0
                              ? `Ended ${endedDate.toLocaleDateString(undefined,{month:"short",day:"numeric"})} · ${daysEarly}d early`
                              : `Ended ${endedDate.toLocaleDateString(undefined,{month:"short",day:"numeric"})} · full`)
                          : `Ended ${endedDate.toLocaleDateString(undefined,{month:"short",day:"numeric"})}`
                        return (
                          <span style={{ fontSize: 10, color: c.ended_reason === "slots_filled" ? "#00b87a" : "var(--t2,#6b7da8)", fontFamily: "monospace" }}>
                            {label}
                          </span>
                        )
                      })() : (
                        <span style={{ fontSize: 10, color: "var(--t3,#2e3a5c)" }}>{timeAgo(c.created_at)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </ArcLayout>
  )
}
