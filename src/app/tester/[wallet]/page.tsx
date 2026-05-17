"use client"
import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import { WalletAvatar } from "@/components/WalletAvatar"
import { useArcStore } from "@/store/arc"

interface Reputation {
  wallet: string
  rank: number
  rank_points: number
  campaigns_completed: number
  avg_score: number
  impact_count: number
  pfp_url?: string | null
}

interface HistoryItem {
  campaign_id: number
  auto_score: number | null
  builder_rating: number | null
  quality_score: number | null
  contract_verified: boolean
  created_at: string
  status: string
  reward_delivered: boolean
  title: string
  type: string
  project_name: string | null
  project_logo: string | null
  reward_type: string
  reward_usdc_amount: number | null
}

const RANK_LABELS = ["Scout", "Builder", "Verified", "Trusted", "Arc Proven"]
const RANK_COLORS = ["#6b7da8", "#1a56ff", "#00b87a", "#c08828", "#ec4899"]

const RANK_REQ = [
  { campaigns: 3,  avg: 3.0 },
  { campaigns: 10, avg: 3.5 },
  { campaigns: 25, avg: 4.0 },
  { campaigns: 50, avg: 4.5 },
]

const TYPE_META: Record<string, { abbr: string; color: string; label: string }> = {
  beta_test:     { abbr: "BT", color: "#1a56ff", label: "Beta Test" },
  stress_test:   { abbr: "ST", color: "#e08810", label: "Stress Test" },
  edge_case:     { abbr: "EC", color: "#a855f7", label: "Edge Cases" },
  ux_review:     { abbr: "UX", color: "#00b87a", label: "UX Review" },
  onboarding:    { abbr: "OB", color: "#06b6d4", label: "Onboarding" },
  integration:   { abbr: "IT", color: "#6366f1", label: "Integration" },
  builder_audit: { abbr: "BA", color: "#ec4899", label: "Builder Audit" },
  payment_flow:  { abbr: "PF", color: "#00d990", label: "Payment Flow" },
}

function truncateWallet(w: string) {
  if (w.length < 16) return w
  return `${w.slice(0, 8)}...${w.slice(-6)}`
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1)  return "just now"
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function imgSrc(url: string | null) {
  if (!url) return null
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

function ScoreRing({ score, size = 36 }: { score: number; size?: number }) {
  const pct = score / 5
  const r = (size - 4) / 2
  const circ = 2 * Math.PI * r
  const dash = pct * circ
  const color = score >= 4 ? "#00b87a" : score >= 3 ? "#1a56ff" : "#e08810"
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fill={color} fontSize={10} fontWeight={700} fontFamily="monospace">
        {score.toFixed(1)}
      </text>
    </svg>
  )
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: 10, color: i <= rating ? "#c08828" : "rgba(255,255,255,0.1)" }}>★</span>
      ))}
    </div>
  )
}

export default function TesterProfilePage() {
  const params = useParams()
  const router = useRouter()
  const walletParam = (params?.wallet as string) || ""

  const [reputation, setReputation] = useState<Reputation | null>(null)
  const [history, setHistory]       = useState<HistoryItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)

  // PFP upload state
  const [pfpUrl, setPfpUrl]         = useState<string | null>(null)
  const [pfpUploading, setPfpUploading] = useState(false)
  const [pfpError,     setPfpError]     = useState("")
  const [pfpHover, setPfpHover]     = useState(false)
  const fileInputRef                = useRef<HTMLInputElement>(null)

  const connectedWallet = useArcStore(s => s.walletAddr)
  const isOwn = connectedWallet?.toLowerCase() === walletParam?.toLowerCase()

  useEffect(() => {
    if (!walletParam) return
    async function load() {
      setLoading(true)
      try {
        const res  = await fetch(`/api/trials/tester/${walletParam}`)
        const data = await res.json()
        setReputation(data.reputation || null)
        setHistory(data.history || [])
        setPfpUrl(data.reputation?.pfp_url || null)
        if (!data.reputation && (!data.history || data.history.length === 0)) {
          setNotFound(true)
        }
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [walletParam])

  async function handlePfpUpload(file: File) {
    if (!file) return
    setPfpError("")
    setPfpUploading(true)
    try {
      // 1. Upload to image host
      const fd = new FormData()
      fd.append("image", file)
      const up = await fetch("/api/upload", { method: "POST", body: fd })
      const upJson = await up.json().catch(() => ({} as any))
      if (!up.ok || !upJson?.url) {
        setPfpError(upJson?.error || "Image upload failed. Try a different file.")
        return
      }

      // 2. Save the URL to your tester profile (requires session for your own wallet)
      const save = await fetch(`/api/trials/tester/${walletParam}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pfp_url: upJson.url }),
      })
      const saveJson = await save.json().catch(() => ({} as any))
      if (!save.ok) {
        setPfpError(saveJson?.error || "Couldn't save your profile photo. Try again.")
        return
      }

      setPfpUrl(upJson.url)
    } catch (e: any) {
      setPfpError(e?.message || "Network error. Try again.")
    } finally {
      setPfpUploading(false)
    }
  }

  const rank      = reputation?.rank ?? 0
  const rankLabel = RANK_LABELS[rank] ?? "Scout"
  const rankColor = RANK_COLORS[rank] ?? "#6b7da8"
  const nextReq   = RANK_REQ[rank]

  const verifiedCount = history.filter(h => h.contract_verified).length
  const verifyRate    = history.length > 0 ? Math.round((verifiedCount / history.length) * 100) : 0

  return (
    <ArcLayout active="trials">
      <div style={{ padding: "32px 24px", maxWidth: 720, margin: "0 auto" }}>

        {/* Back button */}
        <button
          onClick={() => router.push("/trials")}
          style={{ background: "none", border: "none", color: "#6b7da8", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Arc Trials
        </button>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, height: 80, opacity: 0.6 }} />
            ))}
          </div>
        ) : notFound && !reputation && history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 40, fontFamily: "monospace", color: "#2e3a5c", marginBottom: 16 }}>—</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e8ecff", marginBottom: 8 }}>No tester activity yet</div>
            <div style={{ fontSize: 13, color: "#6b7da8" }}>This wallet has not completed any campaigns.</div>
          </div>
        ) : (
          <>
            {/* Profile header */}
            <div style={{ background: "#0a0e1a", border: `1px solid ${rankColor}30`, borderRadius: 14, padding: "24px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>

              {/* Avatar with upload overlay for own profile */}
              <div
                style={{ position: "relative", flexShrink: 0, cursor: isOwn ? "pointer" : "default" }}
                onClick={() => isOwn && fileInputRef.current?.click()}
                onMouseEnter={() => isOwn && setPfpHover(true)}
                onMouseLeave={() => setPfpHover(false)}
              >
                <WalletAvatar wallet={walletParam} size={64} pfpUrl={pfpUrl} />
                {/* Upload overlay */}
                {isOwn && (pfpHover || pfpUploading) && (
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    background: "rgba(0,0,0,0.6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    pointerEvents: "none",
                  }}>
                    {pfpUploading
                      ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #1a56ff", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
                      : <span style={{ fontSize: 18, color: "#e8ecff" }}>+</span>
                    }
                  </div>
                )}
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePfpUpload(f) }}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#6b7da8", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Tester Profile</div>
                <div style={{ fontSize: 14, fontFamily: "monospace", color: "#e8ecff", letterSpacing: 0.5, marginBottom: 6 }}>{truncateWallet(walletParam)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: rankColor, background: `${rankColor}15`, border: `1px solid ${rankColor}30`, padding: "3px 10px", borderRadius: 6 }}>
                    {rankLabel}
                  </div>
                  {isOwn && (
                    <div style={{ fontSize: 11, color: "#2e3a5c" }}>
                      {pfpUploading ? "Uploading..." : "Click avatar to update photo"}
                    </div>
                  )}
                </div>
                {isOwn && pfpError && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#e03348", fontFamily: "monospace" }}>
                    {pfpError}
                  </div>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Campaigns",   value: reputation?.campaigns_completed ?? 0, color: "#1a56ff" },
                { label: "Avg Score",   value: reputation ? `${Number(reputation.avg_score).toFixed(1)}/5` : "—", color: "#00b87a" },
                { label: "Impact",      value: reputation?.impact_count ?? 0, color: "#a855f7" },
                { label: "Rank Points", value: reputation?.rank_points ?? 0, color: "#c08828" },
              ].map(s => (
                <div key={s.label} style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#6b7da8", marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* On-chain verification rate */}
            {history.length > 0 && (
              <div style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#6b7da8", marginBottom: 6 }}>On-chain Verification Rate</div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${verifyRate}%`, background: "#1a56ff", borderRadius: 3, transition: "width 0.4s ease" }} />
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a56ff", fontFamily: "monospace", minWidth: 48, textAlign: "right" }}>{verifyRate}%</div>
              </div>
            )}

            {/* Next rank progress */}
            {nextReq && reputation && rank < 4 && (
              <div style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 18px", marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: "#6b7da8", marginBottom: 8 }}>
                  Progress to <span style={{ color: RANK_COLORS[rank + 1] }}>{RANK_LABELS[rank + 1]}</span>
                </div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7da8", marginBottom: 4 }}>Campaigns</div>
                    <div style={{ height: 4, width: 120, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, ((reputation.campaigns_completed || 0) / nextReq.campaigns) * 100)}%`, background: rankColor, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7da8", marginTop: 3 }}>{reputation.campaigns_completed || 0} / {nextReq.campaigns}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7da8", marginBottom: 4 }}>Avg Score</div>
                    <div style={{ height: 4, width: 120, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, ((Number(reputation.avg_score) || 0) / nextReq.avg) * 100)}%`, background: rankColor, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7da8", marginTop: 3 }}>{Number(reputation.avg_score || 0).toFixed(1)} / {nextReq.avg.toFixed(1)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Campaign history */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e8ecff", marginBottom: 12 }}>Campaign History</div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7da8", fontSize: 13 }}>No completed campaigns yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {history.map((item, idx) => {
                  const tm     = TYPE_META[item.type] || TYPE_META.beta_test
                  const logo   = imgSrc(item.project_logo)
                  return (
                    <div key={`${item.campaign_id}-${idx}`} style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                      {/* Type badge */}
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${tm.color}15`, border: `1px solid ${tm.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {logo
                          ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }} />
                          : <span style={{ fontSize: 10, fontWeight: 700, color: tm.color, fontFamily: "monospace" }}>{tm.abbr}</span>
                        }
                      </div>

                      {/* Title + project */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e8ecff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                        {item.project_name && <div style={{ fontSize: 11, color: "#6b7da8", marginTop: 1 }}>{item.project_name}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                          {/* Type abbr pill */}
                          <span style={{ fontSize: 9, fontFamily: "monospace", background: `${tm.color}15`, color: tm.color, border: `1px solid ${tm.color}30`, padding: "2px 6px", borderRadius: 3 }}>{tm.abbr}</span>
                          {/* Contract verified */}
                          {item.contract_verified && (
                            <span style={{ fontSize: 9, fontFamily: "monospace", background: "#1a56ff15", color: "#1a56ff", border: "1px solid #1a56ff30", padding: "2px 6px", borderRadius: 3 }}>✓ on-chain</span>
                          )}
                          {/* Reward */}
                          {item.reward_usdc_amount != null && (
                            <span style={{ fontSize: 9, fontFamily: "monospace", background: "#00d99015", color: "#00d990", border: "1px solid #00d99030", padding: "2px 6px", borderRadius: 3 }}>${item.reward_usdc_amount} USDC</span>
                          )}
                          {/* Reward delivered */}
                          {item.reward_delivered && (
                            <span style={{ fontSize: 9, fontFamily: "monospace", background: "#00b87a15", color: "#00b87a", border: "1px solid #00b87a30", padding: "2px 6px", borderRadius: 3 }}>Delivered</span>
                          )}
                        </div>
                      </div>

                      {/* Score ring + rating */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        {item.auto_score != null && <ScoreRing score={Number(item.auto_score)} />}
                        {item.builder_rating != null && <StarRating rating={Number(item.builder_rating)} />}
                        <div style={{ fontSize: 10, color: "#2e3a5c" }}>{timeAgo(item.created_at)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </ArcLayout>
  )
}
