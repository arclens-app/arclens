"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import { WalletAvatar } from "@/components/WalletAvatar"

interface Campaign {
  id: number
  slug: string | null
  title: string
  tagline: string | null
  type: string
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
  creator_wallet: string
  tasks: { id: string; title: string; requires_tx: boolean }[]
  created_at: string
  expires_at: string | null
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

const TYPE_META: Record<string, { abbr: string; label: string; color: string }> = {
  beta_test:     { abbr: "BT", label: "Beta Test",     color: "#1a56ff" },
  stress_test:   { abbr: "ST", label: "Stress Test",   color: "#e08810" },
  edge_case:     { abbr: "EC", label: "Edge Cases",    color: "#a855f7" },
  ux_review:     { abbr: "UX", label: "UX Review",     color: "#00b87a" },
  onboarding:    { abbr: "OB", label: "Onboarding",    color: "#06b6d4" },
  integration:   { abbr: "IT", label: "Integration",   color: "#6366f1" },
  builder_audit: { abbr: "BA", label: "Builder Audit", color: "#ec4899" },
  payment_flow:  { abbr: "PF", label: "Payment Flow",  color: "#00d990" },
}

const REWARD_META: Record<string, { label: string; color: string }> = {
  usdc:             { label: "USDC",          color: "#00d990" },
  whitelist:        { label: "Whitelist",      color: "#00d990" },
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
  const [mounted, setMounted]       = useState(false)
  const [campaigns, setCampaigns]   = useState<Campaign[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [reputation, setReputation] = useState<Reputation | null>(null)
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState("all")
  const [wallet, setWallet]         = useState<string | null>(null)
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)
    const w = localStorage.getItem("arclens-wallet")
    if (w) setWallet(w)
  }, [])

  useEffect(() => {
    if (!mounted) return
    load()
  }, [mounted, filter, wallet])

  async function load() {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter !== "all") qs.set("type", filter)
      if (wallet) qs.set("wallet", wallet)
      const res  = await fetch(`/api/forge?${qs}`)
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
    { id: "all", label: "All", abbr: "All", color: "#e8ecff" },
    ...Object.entries(TYPE_META).map(([id, m]) => ({ id, label: m.label, abbr: m.abbr, color: m.color })),
  ]

  return (
    <ArcLayout active="forge">
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
      <div style={{ padding: "32px 28px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#1a56ff", letterSpacing: 2, textTransform: "uppercase" }}>Arc Trials</span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#1a56ff", display: "inline-block" }} />
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7da8", letterSpacing: 1 }}>Verified Testing Platform</span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "#e8ecff", margin: 0, letterSpacing: -0.5 }}>
              Arc Trials
            </h1>
            <p style={{ fontSize: 13, color: "#6b7da8", marginTop: 6, maxWidth: 440 }}>
              Where builders get real feedback. Testers build reputation.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "flex-start" }}>
            {wallet ? (
              <button
                onClick={() => router.push("/forge/create")}
                style={{ height: 38, padding: "0 18px", background: "#1a56ff", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                + Create Campaign
              </button>
            ) : mounted && (
              <div style={{ fontSize: 12, color: "#6b7da8", fontFamily: "monospace", height: 38, display: "flex", alignItems: "center", padding: "0 14px", background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
                Connect wallet via sidebar →
              </div>
            )}
          </div>
        </div>

        {/* ── Stats Row ── */}
        {mounted && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Active Campaigns",    value: stats?.active_campaigns        ?? "—", color: "#1a56ff" },
              { label: "Total Testers",        value: stats?.total_testers           ?? "—", color: "#00b87a" },
              { label: "Total Completions",    value: stats?.total_completions       ?? "—", color: "#a855f7" },
              { label: "This Week",            value: stats?.completions_this_week   ?? "—", color: "#e08810" },
            ].map(s => (
              <div key={s.label} style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#6b7da8", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Reputation Card ── */}
        {wallet && mounted && (
          <div style={{ background: "#0a0e1a", border: `1px solid ${rankColor}30`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div
              onClick={() => router.push(`/tester/${wallet}`)}
              style={{ cursor: "pointer", flexShrink: 0 }}
            >
              <WalletAvatar wallet={wallet} size={44} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#6b7da8", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1 }}>Your Rank</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: rankColor }}>{rankLabel}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", flex: 1 }}>
              {[
                { label: "Campaigns",   value: reputation?.campaigns_completed ?? 0 },
                { label: "Avg Score",   value: reputation ? `${Number(reputation.avg_score).toFixed(1)}/5` : "—" },
                { label: "Impact",      value: reputation?.impact_count ?? 0 },
                { label: "Rank Points", value: reputation?.rank_points ?? 0 },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#e8ecff" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#6b7da8" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => router.push(`/tester/${wallet}`)}
                style={{ height: 34, padding: "0 14px", background: `${rankColor}15`, border: `1px solid ${rankColor}30`, borderRadius: 8, fontSize: 12, color: rankColor, cursor: "pointer", fontWeight: 600 }}
              >
                View Profile →
              </button>
              <button
                onClick={() => router.push("/forge/create")}
                style={{ height: 34, padding: "0 14px", background: "#0e1224", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "#6b7da8", cursor: "pointer" }}
              >
                Host a Campaign →
              </button>
            </div>
          </div>
        )}

        {/* ── Filter Pills ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
          {filterButtons.map(f => {
            const active = filter === f.id
            const color  = active ? (f.id === "all" ? "#1a56ff" : f.color) : undefined
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  height: 32, padding: "0 14px", whiteSpace: "nowrap", flexShrink: 0,
                  background: active ? (color + "20") : "#0a0e1a",
                  color: active ? color : "#6b7da8",
                  border: `1px solid ${active ? (color + "50") : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {f.id !== "all" && (
                  <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: active ? color : "#2e3a5c" }}>{f.abbr}</span>
                )}
                {f.label}
              </button>
            )
          })}
        </div>

        {/* ── Campaign Grid ── */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, height: 210, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 48, fontFamily: "monospace", fontWeight: 700, color: "#2e3a5c", marginBottom: 12, letterSpacing: -2 }}>
              {filter !== "all" ? (TYPE_META[filter]?.abbr ?? "—") : "—"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e8ecff", marginBottom: 6 }}>No campaigns found</div>
            <div style={{ fontSize: 13, color: "#6b7da8", marginBottom: 20 }}>
              {filter !== "all" ? `No ${TYPE_META[filter]?.label ?? filter} campaigns right now.` : "Be the first builder to create one."}
            </div>
            {wallet && (
              <button onClick={() => router.push("/forge/create")} style={{ height: 38, padding: "0 20px", background: "#1a56ff", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Create Campaign
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {campaigns.map(c => {
              const tm        = TYPE_META[c.type] || TYPE_META.beta_test
              const rm        = REWARD_META[c.reward_type] || REWARD_META.other
              const left      = slotsLeft(c)
              const full      = left !== null && left === 0
              const logoUrl   = imgSrc(c.campaign_logo || c.project_logo)
              const isHovered = hoveredCard === c.id
              const expiresIn = c.expires_at ? daysLeft(c.expires_at) : null
              const endingSoon = expiresIn !== null && expiresIn <= 1 && expiresIn > 0
              const daysLeftNum = expiresIn !== null && expiresIn > 0 && expiresIn <= 7 ? Math.ceil(expiresIn) : null
              const initials  = (c.project_name || c.title || "").slice(0, 2).toUpperCase()

              return (
                <div
                  key={c.id}
                  onClick={() => !full && router.push(`/forge/${c.slug || c.id}`)}
                  onMouseEnter={() => { if (!full) setHoveredCard(c.id) }}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    background: isHovered ? `${tm.color}05` : "#0a0e1a",
                    border: `1px solid ${isHovered && !full ? tm.color + "40" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 12, padding: "18px 20px",
                    cursor: full ? "default" : "pointer",
                    opacity: full ? 0.5 : 1,
                    transition: "border-color 0.15s, background 0.15s",
                    display: "flex", flexDirection: "column", gap: 12,
                  }}
                >
                  {/* Top bar: abbr badge + logo/initials + title */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    {/* Type abbr badge */}
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: `${tm.color}15`, border: `1px solid ${tm.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: tm.color, fontFamily: "monospace" }}>{tm.abbr}</span>
                    </div>
                    {/* Logo or initials */}
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#0e1224", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                      {logoUrl
                        ? <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7da8" }}>{initials}</span>
                      }
                    </div>
                    {/* Title block */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#e8ecff", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                      {c.project_name && <div style={{ fontSize: 11, color: "#6b7da8", marginTop: 1 }}>{c.project_name}</div>}
                    </div>
                    {/* Badges top-right */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                      {full && (
                        <span style={{ fontSize: 9, fontFamily: "monospace", background: "#e0334815", color: "#e03348", border: "1px solid #e0334830", padding: "2px 6px", borderRadius: 3 }}>Full</span>
                      )}
                      {endingSoon && (
                        <span style={{ fontSize: 9, fontFamily: "monospace", background: "#e0334815", color: "#e03348", border: "1px solid #e0334830", padding: "2px 6px", borderRadius: 3 }}>Ending soon</span>
                      )}
                      {!endingSoon && daysLeftNum !== null && (
                        <span style={{ fontSize: 9, fontFamily: "monospace", background: "#e0881015", color: "#e08810", border: "1px solid #e0881030", padding: "2px 6px", borderRadius: 3 }}>{daysLeftNum}d left</span>
                      )}
                      {c.contract_address && (
                        <span style={{ fontSize: 9, fontFamily: "monospace", background: "#00b87a15", color: "#00d990", border: "1px solid #00b87a30", padding: "2px 6px", borderRadius: 3 }}>✓ on-chain</span>
                      )}
                    </div>
                  </div>

                  {/* Tagline */}
                  {c.tagline && (
                    <p style={{
                      fontSize: 12, color: "#6b7da8", margin: 0, lineHeight: 1.5,
                      overflow: "hidden", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    }}>{c.tagline}</p>
                  )}

                  {/* Reward section */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    {c.reward_type === "usdc" && c.reward_usdc_amount != null ? (
                      <div>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "#00d990", fontFamily: "monospace" }}>${c.reward_usdc_amount}</span>
                        <span style={{ fontSize: 11, color: "#6b7da8", marginLeft: 5 }}>USDC per tester</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, background: `${rm.color}15`, color: rm.color, border: `1px solid ${rm.color}30`, padding: "3px 8px", borderRadius: 4, fontFamily: "monospace" }}>
                        {rm.label}
                      </div>
                    )}
                  </div>

                  {/* Slot progress bar */}
                  {c.total_slots && c.total_slots > 0 && (
                    <div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, (c.filled_slots / c.total_slots) * 100)}%`, background: full ? "#e03348" : tm.color, borderRadius: 2, transition: "width 0.3s ease" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "#6b7da8" }}>{c.filled_slots}/{c.total_slots} filled</span>
                        {left !== null && left > 0 && (
                          <span style={{ fontSize: 10, color: left <= 3 ? "#e03348" : "#6b7da8", fontWeight: left <= 3 ? 700 : 400 }}>{left} left</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: 11, color: "#2e3a5c", fontFamily: "monospace" }}>
                      {c.tasks?.length || 0} task{c.tasks?.length !== 1 ? "s" : ""} · {Number(c.completion_count)} done
                    </span>
                    <span style={{ fontSize: 11, color: "#2e3a5c" }}>{timeAgo(c.created_at)}</span>
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
