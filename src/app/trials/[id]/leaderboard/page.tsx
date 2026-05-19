"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import { WalletAvatar } from "@/components/WalletAvatar"

interface Completion {
  tester_wallet:   string
  auto_score:      number
  builder_rating:  number | null
  quality_score:   number | null
  status:          string
  created_at:      string
}

interface Campaign {
  id:           number
  slug:         string | null
  title:        string
  project_name: string | null
  type:         string
  reward_type:  string
}

const TYPE_COLOR: Record<string, string> = {
  beta_test:    "#1a56ff",
  stress_test:  "#e08810",
  edge_case:    "#a855f7",
  ux_review:    "#00b87a",
  onboarding:   "#06b6d4",
  integration:  "#6366f1",
  builder_audit:"#ec4899",
  payment_flow: "#00d990",
}

function rankColor(rank: number, fallback: string): string {
  if (rank === 1) return "#d4a447"
  if (rank === 2) return "#a5b0c5"
  if (rank === 3) return "#b88762"
  return fallback
}

export default function CampaignLeaderboardPage() {
  const { id }      = useParams<{ id: string }>()
  const router      = useRouter()
  const [loading, setLoading]       = useState(true)
  const [campaign, setCampaign]     = useState<Campaign | null>(null)
  const [completions, setCompletions] = useState<Completion[]>([])
  const [error, setError]           = useState<string>("")

  const mono  = "'DM Mono', monospace"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"

  useEffect(() => {
    if (!id) return
    fetch(`/api/trials/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setCampaign(d.campaign); setCompletions(d.completions || []) })
      .catch(() => setError("Campaign not found"))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <ArcLayout active="trials">
        <div style={{ padding: "80px 28px", textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: t3, letterSpacing: "0.08em" }}>Loading leaderboard...</div>
        </div>
      </ArcLayout>
    )
  }
  if (error || !campaign) {
    return (
      <ArcLayout active="trials">
        <div style={{ padding: "80px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: t1, marginBottom: 12 }}>{error || "Campaign not found"}</div>
          <button onClick={() => router.push("/trials")}
            style={{ height: 38, padding: "0 18px", background: "transparent", border: "1px solid " + bdr, borderRadius: 8, fontSize: 12, color: t2, cursor: "pointer", fontFamily: mono }}>
            ← Back to Arc Trials
          </button>
        </div>
      </ArcLayout>
    )
  }

  const tmColor = TYPE_COLOR[campaign.type] || "#1a56ff"

  const ranked = completions
    .filter(c => c.builder_rating != null && c.status === "reviewed")
    .slice()
    .sort((a, b) => {
      const qa = Number(a.quality_score) || 0
      const qb = Number(b.quality_score) || 0
      if (qb !== qa) return qb - qa
      return (Number(b.builder_rating) || 0) - (Number(a.builder_rating) || 0)
    })

  const total       = ranked.length
  const avgQuality  = total > 0
    ? Math.round(ranked.reduce((s, c) => s + (Number(c.quality_score) || 0), 0) / total)
    : 0
  const topScore    = total > 0 ? Math.round(Number(ranked[0].quality_score) || 0) : 0

  return (
    <ArcLayout active="trials">
      <div style={{ padding: "32px 24px 60px", maxWidth: 920, margin: "0 auto" }}>

        {/* Breadcrumb back to campaign */}
        <button onClick={() => router.push(`/trials/${campaign.slug || campaign.id}`)}
          style={{ fontSize: 12, color: t3, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18, fontFamily: mono, display: "flex", alignItems: "center", gap: 6 }}>
          ← {campaign.title}
        </button>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: tmColor, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
            Leaderboard · {campaign.project_name || "Campaign"}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.035em", color: t1, margin: "0 0 8px", lineHeight: 1.15 }}>
            Top Contributors
          </h1>
          <p style={{ fontSize: 13, color: t2, margin: 0, lineHeight: 1.7, maxWidth: 560 }}>
            Builder-rated submissions ranked by quality score. Only reviewed entries count — unrated noise can't claim a spot.
          </p>
        </div>

        {/* Stat bar */}
        {total > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 22 }}>
            {[
              { label: "Contributors", value: total.toString(), color: tmColor },
              { label: "Avg quality",  value: avgQuality + "/100", color: avgQuality > 70 ? "#00b87a" : avgQuality > 40 ? "#e08810" : t2 },
              { label: "Top score",    value: topScore + "/100",   color: "#d4a447" },
            ].map(s => (
              <div key={s.label} style={{ background: surf, border: "1px solid " + bdr, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 9, fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: mono }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard table */}
        {total === 0 ? (
          <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: 12, padding: "48px 24px", textAlign: "center", color: t3, fontFamily: mono, fontSize: 12 }}>
            No rated contributions yet — the leaderboard fills up as the founder reviews submissions.
          </div>
        ) : (
          <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: 12, overflow: "hidden" }}>
            {/* Column header row */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr auto auto", gap: 12, padding: "10px 18px", borderBottom: "1px solid " + bdr, background: surf2 }}>
              <div style={{ fontSize: 9, fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Rank</div>
              <div style={{ fontSize: 9, fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tester</div>
              <div style={{ fontSize: 9, fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>Rating</div>
              <div style={{ fontSize: 9, fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right", minWidth: 60 }}>Score</div>
            </div>
            {ranked.map((c, i) => {
              const rank       = i + 1
              const qs         = Math.round(Number(c.quality_score) || 0)
              const scoreColor = qs > 70 ? "#00b87a" : qs > 40 ? "#e08810" : t2
              const rkColor    = rankColor(rank, t3)
              return (
                <a key={c.tester_wallet} href={`/tester/${c.tester_wallet}`}
                  style={{ display: "grid", gridTemplateColumns: "44px 1fr auto auto", gap: 12, padding: "12px 18px",
                           borderBottom: i < ranked.length - 1 ? "1px solid " + bdr : "none",
                           textDecoration: "none", alignItems: "center", transition: "background 0.12s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = surf2)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ fontSize: 13, fontFamily: mono, color: rkColor, fontWeight: 700, letterSpacing: "0.04em" }}>
                    {"#" + rank}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <WalletAvatar wallet={c.tester_wallet} size={28} />
                    <span style={{ fontSize: 12, fontFamily: mono, color: t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.tester_wallet.slice(0, 10)}…{c.tester_wallet.slice(-4)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: mono, color: "#c08828", textAlign: "right" }}>
                    {"★".repeat(c.builder_rating || 0)}<span style={{ opacity: 0.25 }}>{"★".repeat(5 - (c.builder_rating || 0))}</span>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 60 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor, fontFamily: mono }}>{qs}</span>
                    <span style={{ fontSize: 9, fontFamily: mono, color: t3, marginLeft: 3 }}>/100</span>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </ArcLayout>
  )
}
