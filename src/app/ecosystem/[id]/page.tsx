"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import TvlCards from "./TvlCards"
import { TrustBadge } from "@/components/TrustBadge"
import { trustBadge } from "@/lib/trustBadge"

function imgSrc(url: string | null): string | null {
  if (!url) return null
  if (/\.blob\.vercel-storage\.com\//i.test(url)) return url
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

interface Project {
  id: number
  name: string
  tagline: string
  description: string
  category: string
  logo_url: string | null
  website: string | null
  twitter: string | null
  github: string | null
  discord: string | null
  contract: string | null
  founder_social: string | null
  founder_profile: { address: string; display_name: string | null; avatar_url: string | null; verified: boolean; claimed: boolean } | null
  recognition: string | null
  trust_level: string | null
  trust_profile: { hard_risk?: boolean; caution?: boolean; caution_note?: string | null } | null
  established: boolean
  auditor: string | null
  audit_url: string | null
  featured: boolean
  badge: string | null
  color: string | null
  created_at: string
  txCount: string | null
  view_count?: number
  tvl_tracking_enabled?: boolean
  tvl_usd_e6?: string | null
  tvl_ath_usd_e6?: string | null
  tvl_ath_block?: number | null
  tvl_ath_at?: string | null
  revenue_cum_usd_e6?: string | null
  revenue_ath_day_usd_e6?: string | null
  revenue_ath_day?: string | null
  tvl_last_indexed_at?: string | null
}

interface RelatedProject {
  id: number
  name: string
  tagline: string
  category: string
  logo_url: string | null
  badge: string | null
  color: string | null
  slug: string | null
}

interface Review {
  id: number
  wallet: string
  category: string
  rating: number
  review_text: string
  badge: string
  created_at: string
}

interface LeaderboardRow {
  tester_wallet:        string
  campaigns_completed:  number
  avg_quality:          string | number
  avg_rating:           string | number
  total_score:          number
  total_xp:             number | string | null
  last_active:          string
  platform_rank:        number   // 0-4: Scout/Builder/Verified/Trusted/Arc Proven
  platform_avg:         string | number
}

const PLATFORM_RANK_LABELS = ["Scout", "Builder", "Verified", "Trusted", "Arc Proven"]
const PLATFORM_RANK_COLORS = ["#6b7da8", "#8aaeff", "#00d990", "#c08828", "#d4a447"]

const CAT_COLOR: Record<string, string> = {
  Infrastructure: "#1a56ff", DeFi: "#00d990", NFT: "#c08828",
  Payments: "#00d990", Gaming: "#a855f7", Social: "#ec4899",
  AI: "#8aaeff", Bridge: "#e08810",
  Finance: "#0ea5e9", Trading: "#f59e0b", Custody: "#6366f1",
}

function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0
  }
  return Math.abs(h).toString(36)
}

function getFingerprint(): string {
  if (typeof window === "undefined") return ""
  const nav = window.navigator
  const scr = window.screen
  const parts = [
    nav.language || "",
    nav.platform || "",
    (nav.hardwareConcurrency || 0).toString(),
    scr.colorDepth.toString(),
    scr.width + "x" + scr.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    (!!nav.cookieEnabled).toString(),
    nav.maxTouchPoints.toString(),
  ]
  return hashStr(parts.join("|"))
}

function getDeviceId(): string {
  if (typeof window === "undefined") return ""
  let stored = localStorage.getItem("arclens-device-id")
  if (!stored) {
    stored = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem("arclens-device-id", stored)
  }
  const fingerprint = getFingerprint()
  return stored + "_" + fingerprint
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject]     = useState<Project | null>(null)
  const [related, setRelated]     = useState<RelatedProject[]>([])
  const [loading, setLoading]     = useState(true)
  const [notFound, setNotFound]   = useState(false)
  const [copied, setCopied]       = useState(false)
  const [mounted, setMounted]     = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [reviews, setReviews]     = useState<Review[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [campaignsRun, setCampaignsRun] = useState<number>(0)
  const [usingXp, setUsingXp]         = useState<boolean>(false)
  const [lbShowAll, setLbShowAll]     = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({ category: "Product Experience", rating: 5, text: "", isPublic: true, contact: "" })
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const [reviewSuccess, setReviewSuccess] = useState(false)
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null)
  const [tvl, setTvl] = useState<any>(null)
  // ONE flag for the whole page — a category picks what's wrong (the listing, or
  // a specific number). Everything routes to /api/disputes so there's a single
  // report path and a single admin queue.
  const [showReport, setShowReport]   = useState(false)
  const [reportCategory, setReportCategory] = useState<"listing" | "tvl" | "revenue" | "volume">("listing")
  const [reportText, setReportText]   = useState("")
  const [reportEvidence, setReportEvidence] = useState("")
  const [reportContact, setReportContact] = useState("")
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [reportErr, setReportErr]     = useState("")

  async function submitReport() {
    if (reportText.trim().length < 10) { setReportErr("Please explain in at least 10 characters"); return }
    setReportState("sending"); setReportErr("")
    try {
      const res = await fetch("/api/disputes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: String(id), metric: reportCategory, reason: reportText,
          evidence_url: reportEvidence.trim() || undefined,
          reporter_email: reportContact.trim() || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setReportState("sent")
      else { setReportErr(d.error || "Could not submit"); setReportState("error") }
    } catch { setReportErr("Network error — try again"); setReportState("error") }
  }

  useEffect(() => {
    setMounted(true)
    const dismissed = localStorage.getItem("arclens-arc101-dismissed")
    if (!dismissed) setShowBanner(true)
  }, [])

  useEffect(() => {
    if (!mounted || !id) return
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/ecosystem/${id}`)
        if (!res.ok) { setNotFound(true); return }
        const data = await res.json()
        setProject(data.project)
        setRelated(data.related || [])
        setLeaderboard(data.leaderboard || [])
        setCampaignsRun(data.campaignsRun || 0)
        setUsingXp(!!data.usingXp)
        setTvl(data.tvl || null)

        // Record view
        const deviceId = getDeviceId()
        if (deviceId) {
          fetch(`/api/ecosystem/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId }),
          }).catch(() => {})
        }

        // Fetch reviews non-blocking
        fetch(`/api/reviews?project_id=${data.project.id}`)
          .then(r => r.json())
          .then(d => setReviews(d.reviews || []))
          .catch(() => {})

        // Get connected wallet
        try {
          if (typeof window !== "undefined" && (window as any).ethereum) {
            const accounts = await (window as any).ethereum.request({ method: "eth_accounts" })
            if (accounts?.[0]) setConnectedWallet(accounts[0])
          }
        } catch { }

      } catch { setNotFound(true) }
      finally { setLoading(false) }
    }
    load()
  }, [mounted, id])

  async function submitReview() {
    if (!connectedWallet) { setReviewError("Connect your wallet first"); return }
    if (!reviewForm.text.trim() || reviewForm.text.trim().length < 10) { setReviewError("Review must be at least 10 characters"); return }
    setSubmittingReview(true)
    setReviewError("")
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project?.id,
          wallet: connectedWallet,
          category: reviewForm.category,
          rating: reviewForm.rating,
          review_text: reviewForm.text,
          is_public: reviewForm.isPublic,
          contact: reviewForm.contact,
        })
      })
      const data = await res.json()
      if (data.success) {
        setReviewSuccess(true)
        setShowReviewForm(false)
        fetch(`/api/reviews?project_id=${project?.id}`)
          .then(r => r.json())
          .then(d => setReviews(d.reviews || []))
          .catch(() => {})
      } else {
        setReviewError(data.error || "Submission failed")
      }
    } catch { setReviewError("Network error — try again") }
    finally { setSubmittingReview(false) }
  }

  function share() {
    const url = `https://arclenz.xyz/ecosystem/${id}`
    // If the project has an X handle, lead with the @ (it's their brand on X).
    // Otherwise lead with the project name. Either way, mention Arc Testnet
    // (the chain they're listed on) and tag @arclens_app for the platform.
    const raw = project?.twitter || ""
    let ph = String(raw).trim()
    const m = ph.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)/i)
    if (m) ph = m[1]
    ph = ph.replace(/^@+/, "").trim()
    const lead = ph ? `@${ph}` : project?.name
    const text = `${lead} on Arc Testnet, listed in the @arclens_app ecosystem — ${project?.tagline}\n\n${url}`
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank")
  }

  function copyLink() {
    navigator.clipboard.writeText(`https://arclenz.xyz/ecosystem/${id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!mounted) return <div style={{ minHeight: "100vh", background: "var(--bg, #060812)" }} />

  const mono  = "'DM Mono', monospace"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const usdc  = "#00b87a"

  if (loading) return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "80px", textAlign: "center", fontFamily: mono, fontSize: "12px", color: t3 }}>
        Loading project...
      </div>
    </ArcLayout>
  )

  if (notFound || !project) return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "80px", textAlign: "center" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔍</div>
        <div style={{ fontSize: "16px", fontWeight: 600, color: t1, marginBottom: "8px" }}>Project not found</div>
        <div style={{ fontSize: "13px", color: t2, marginBottom: "24px" }}>This project may have been removed or the link is incorrect.</div>
        <button onClick={() => window.location.href = "/ecosystem"}
          style={{ height: "40px", padding: "0 24px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: "pointer" }}>
          Browse Ecosystem
        </button>
      </div>
    </ArcLayout>
  )

  const color       = project.color || CAT_COLOR[project.category] || "#1a56ff"
  const twitterUrl  = project.twitter
    ? project.twitter.startsWith("http") ? project.twitter : "https://x.com/" + project.twitter.replace("@", "")
    : null
  const proxiedLogo = imgSrc(project.logo_url)

  // Founder = the person behind the project, kept distinct from the project's
  // own links. Priority:
  //   1) Claimed project → its owner_wallet IS a builder profile. Link there:
  //      wallet-proven, shows their whole Arc track record. (internal)
  //   2) Otherwise → the self-disclosed social typed on the listing. (external,
  //      unverified) Normalize @handle / domain / URL into a safe link.
  const founder = (() => {
    const fp = project.founder_profile
    const s  = (project.founder_social || "").trim()

    // Open disclosure — no badge, no identity stamp. We show who the team says
    // they are and link to their profile/socials; people rarely misrepresent
    // their own public accounts, and the quiet report link handles the rest.
    // 1) Claimed project → its owner's builder profile (wallet-proven ownership).
    if (fp?.address && fp.display_name) {
      return { internal: true, url: `/builder/${fp.address}`, label: fp.display_name, note: "builder profile" }
    }
    // 2) Self-disclosed handle typed on the listing (taken at face value).
    if (s) {
      let url: string, label: string
      if (/^https?:\/\//i.test(s)) { url = s; label = s.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") }
      else if (s.startsWith("@"))  { url = "https://x.com/" + s.slice(1); label = s }
      else if (/\.[a-z]{2,}/i.test(s)) { url = "https://" + s; label = s.replace(/\/$/, "") }
      else { url = "https://x.com/" + s; label = "@" + s }
      return { internal: false, url, label, note: "self-disclosed" }
    }
    // 3) Owner wallet with no name or handle — link to the profile (track record
    //    still shows), but never present a raw hex as the founder's name.
    if (fp?.address) {
      return { internal: true, url: `/builder/${fp.address}`, label: "Builder profile", note: "project owner" }
    }
    return null
  })()

  return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "24px 20px 60px", maxWidth: "860px", margin: "0 auto" }}>

        {/* NEW TO ARC BANNER */}
        {showBanner && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 16px", background: "rgba(26,86,255,0.07)", border: "1px solid rgba(26,86,255,0.2)", borderRadius: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00b87a", flexShrink: 0 }} />
              <span style={{ fontSize: "12px", color: "var(--t2,#6b7da8)" }}>New to Arc? Learn what it is, how to get started, and where to go.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <a href="/start" style={{ fontSize: "12px", fontFamily: "'DM Mono',monospace", color: "#8aaeff", textDecoration: "none", padding: "4px 12px", border: "1px solid rgba(26,86,255,0.3)", borderRadius: "6px" }}>
                Arc 101 →
              </a>
              <button onClick={() => { setShowBanner(false); localStorage.setItem("arclens-arc101-dismissed", "1") }}
                style={{ background: "none", border: "none", color: "var(--t3,#2e3a5c)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "2px 4px" }}>
                ×
              </button>
            </div>
          </div>
        )}

        {/* BACK */}
        <button onClick={() => window.location.href = "/ecosystem"}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: t3, cursor: "pointer", fontSize: "12px", fontFamily: mono, marginBottom: "24px", padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = t2)}
          onMouseLeave={e => (e.currentTarget.style.color = t3)}>
          ← Back to Ecosystem
        </button>

        {/* HERO CARD */}
        <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "16px", overflow: "hidden", marginBottom: "16px" }}>
          <div style={{ height: "3px", background: `linear-gradient(90deg, ${color}, transparent)` }} />
          <div style={{ padding: "28px 28px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
              <div style={{ width: "80px", height: "80px", borderRadius: "18px", overflow: "hidden", background: color + "18", border: "1px solid " + color + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", fontWeight: 700, fontFamily: mono, color, flexShrink: 0 }}>
                {proxiedLogo
                  ? <img src={proxiedLogo} alt={project.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none" }} />
                  : project.name[0]
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.04em", color: t1, margin: 0 }}>{project.name}</h1>
                  {(() => {
                    // Same single-badge model as the cards: green only on
                    // recognition (Arc Official / Arc Partner), red on a confirmed
                    // risk. Listed/Claimed/Vetted carry no chip here.
                    const tb = trustBadge({ trust_level: project.trust_level, recognition: project.recognition, risk_flagged: project.trust_profile?.hard_risk, legacy_badge: project.badge })
                    return (tb.mark === "check" || tb.mark === "risk") ? <TrustBadge spec={tb} /> : null
                  })()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "9px", fontFamily: mono, padding: "3px 10px", borderRadius: "99px", background: color + "14", color, border: "1px solid " + color + "28" }}>{project.category}</span>
                  <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>Listed {new Date(project.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                  {project.trust_level === "verified" && project.auditor && (
                    <a href={project.audit_url || "#"} {...(project.audit_url ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      style={{ fontSize: "9px", fontFamily: mono, padding: "3px 10px", borderRadius: "99px", background: "rgba(0,200,150,0.1)", color: "#00c896", border: "1px solid rgba(0,200,150,0.25)", textDecoration: "none" }}>
                      ✓ Audited by {project.auditor}{project.audit_url ? " ↗" : ""}
                    </a>
                  )}
                  {project.established && (
                    <span title="Claimed, established a while, and actively used on-chain"
                      style={{ fontSize: "9px", fontFamily: mono, padding: "3px 10px", borderRadius: "99px", background: "rgba(91,140,255,0.1)", color: "#8aaeff", border: "1px solid rgba(91,140,255,0.25)" }}>
                      ◆ Established
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "15px", color: t2, fontWeight: 400, lineHeight: 1.6, margin: 0 }}>{project.tagline}</p>
              </div>
            </div>
          </div>
          <div style={{ height: "1px", background: bdr }} />
          <div style={{ padding: "16px 28px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {project.website  && <a href={project.website}  target="_blank" rel="noopener noreferrer" style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "rgba(26,86,255,0.08)", color: "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "7px", textDecoration: "none", gap: "6px" }}>🌐 Website</a>}
            {twitterUrl       && <a href={twitterUrl}       target="_blank" rel="noopener noreferrer" style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "transparent", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", textDecoration: "none", gap: "6px" }}>𝕏 Twitter</a>}
            {project.github   && <a href={project.github}   target="_blank" rel="noopener noreferrer" style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "transparent", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", textDecoration: "none", gap: "6px" }}>⌥ GitHub</a>}
            {project.discord  && <a href={project.discord}  target="_blank" rel="noopener noreferrer" style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "transparent", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", textDecoration: "none", gap: "6px" }}>Discord</a>}
            {project.contract && <button onClick={() => window.location.href = "/address/" + project.contract} style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "transparent", color: "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "7px", cursor: "pointer", gap: "6px" }}>✦ Contract ↗</button>}
            <div style={{ flex: 1 }} />
            <button onClick={share} style={{ height: "34px", padding: "0 16px", background: "#1a56ff", color: "#fff", fontSize: "12px", fontFamily: mono, border: "none", borderRadius: "7px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>Share on 𝕏</button>
            <button onClick={copyLink} style={{ height: "34px", padding: "0 16px", background: "transparent", color: copied ? usdc : t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + (copied ? "rgba(0,184,122,0.3)" : bdr), borderRadius: "7px", cursor: "pointer" }}>
              {copied ? "✓ Copied" : "Copy Link"}
            </button>
          </div>
          {/* FOUNDER — the person behind the project, separated from the
              project's own links above so the two are never confused. */}
          {founder && (
            <>
              <div style={{ height: "1px", background: bdr }} />
              <div style={{ padding: "13px 28px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Founder</span>
                <a href={founder.url} {...(founder.internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                  style={{ fontSize: "12px", fontFamily: mono, color: "#8aaeff", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  {founder.label} <span style={{ color: t3 }}>{founder.internal ? "→" : "↗"}</span>
                </a>
                <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>· {founder.note}</span>
              </div>
            </>
          )}
        </div>

        {/* DESCRIPTION */}
        {project.description && (
          <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "24px 28px", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>About</div>
            <p style={{ fontSize: "14px", color: t2, lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>{project.description}</p>
          </div>
        )}

        {/* TVL & REVENUE CARDS */}
        <TvlCards
          project={project as any}
          tvl={tvl}
          theme={{ mono, surf, surf2, bdr, t1, t2, t3 }}
          slug={String(id ?? (project as any).slug ?? "")}
        />

        {/* CONTRACT INFO */}
        {project.contract && (
          <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "20px 28px", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>On-Chain</div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Contract Address</div>
                <div style={{ fontSize: "12px", fontFamily: mono, color: "#8aaeff", wordBreak: "break-all" }}>{project.contract}</div>
              </div>
              {project.txCount && (
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Transactions</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: mono, color: usdc }}>{Number(project.txCount).toLocaleString()}</div>
                </div>
              )}
            </div>
            <button onClick={() => window.location.href = "/address/" + project.contract}
              style={{ marginTop: "14px", height: "34px", padding: "0 16px", background: "rgba(26,86,255,0.06)", color: "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "7px", cursor: "pointer" }}>
              View on ArcLens Explorer ↗
            </button>
          </div>
        )}

        {/* EMBED BADGE */}
        <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "20px 28px", marginBottom: "16px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>Embed on your site</div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", background: "#04060f", border: "1px solid rgba(26,86,255,0.3)", borderRadius: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: usdc }} />
              <span style={{ fontSize: "12px", fontFamily: mono, color: "#e8ecff", fontWeight: 600 }}>{project.name}</span>
              <span style={{ fontSize: "10px", fontFamily: mono, color: "#6b7da8" }}>on ArcLens</span>
            </div>
          </div>
          <div style={{ background: surf2, borderRadius: "8px", padding: "12px 14px", fontFamily: mono, fontSize: "11px", color: t3, wordBreak: "break-all" }}>
            {`<a href="https://arclenz.xyz/ecosystem/${id}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#04060f;border:1px solid rgba(26,86,255,0.3);border-radius:8px;text-decoration:none;font-family:monospace"><span style="width:8px;height:8px;border-radius:50%;background:#00b87a;display:inline-block"></span><span style="color:#e8ecff;font-weight:600">${project.name}</span><span style="color:#6b7da8">on ArcLens</span></a>`}
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(`<a href="https://arclenz.xyz/ecosystem/${id}">on ArcLens</a>`); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            style={{ marginTop: "10px", height: "30px", padding: "0 14px", background: "transparent", color: t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "6px", cursor: "pointer" }}>
            Copy embed code
          </button>
        </div>

        {/* REVIEWS */}
        <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "24px 28px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Reviews</div>
              <div style={{ fontSize: "13px", color: t2 }}>
                {reviews.length === 0 ? "No reviews yet — be the first" : `${reviews.length} review${reviews.length !== 1 ? "s" : ""}`}
              </div>
            </div>
            {!reviewSuccess && (
              <button onClick={() => { setShowReviewForm(!showReviewForm); setReviewError("") }}
                style={{ height: "36px", padding: "0 18px", background: showReviewForm ? "transparent" : "rgba(26,86,255,0.08)", color: "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.25)", borderRadius: "7px", cursor: "pointer" }}>
                {showReviewForm ? "Cancel" : "Leave a Review"}
              </button>
            )}
          </div>

          {reviewSuccess && (
            <div style={{ padding: "16px", background: "rgba(0,184,122,0.06)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: "8px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <span style={{ fontSize: "13px", color: usdc }}>✓ Review submitted successfully</span>
              <button onClick={() => {
                const raw = project?.twitter || ""
                let ph = String(raw).trim()
                const m = ph.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)/i)
                if (m) ph = m[1]
                ph = ph.replace(/^@+/, "").trim()
                const subject = ph ? `@${ph}` : project?.name
                const text = `Just reviewed ${subject} on Arc Testnet via @arclens_app — arclenz.xyz/ecosystem/${id}`
                window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank")
              }} style={{ height: "32px", padding: "0 14px", background: "#1a56ff", color: "#fff", fontSize: "12px", fontFamily: mono, border: "none", borderRadius: "6px", cursor: "pointer" }}>
                Share on 𝕏
              </button>
            </div>
          )}

          {showReviewForm && (
            <div style={{ background: surf2, borderRadius: "10px", padding: "20px", marginBottom: "20px" }}>
              {!connectedWallet ? (
                <div style={{ fontSize: "13px", color: t2, textAlign: "center", padding: "20px 0" }}>
                  Connect your wallet using the "+ Add Arc" button in the top bar to leave a review.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Category</label>
                    <select value={reviewForm.category} onChange={e => setReviewForm(p => ({ ...p, category: e.target.value }))}
                      style={{ width: "100%", height: "36px", background: surf, border: "1px solid " + bdr, borderRadius: "7px", padding: "0 12px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none" }}>
                      {["Product Experience","Performance","UI/UX","Customer Support","Security","Feature Request"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Rating</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {[1,2,3,4,5].map(n => (
                        <button key={n} onClick={() => setReviewForm(p => ({ ...p, rating: n }))}
                          style={{ width: "36px", height: "36px", borderRadius: "7px", border: "1px solid " + (reviewForm.rating >= n ? "#e08810" : bdr), background: reviewForm.rating >= n ? "rgba(224,136,16,0.12)" : "transparent", color: reviewForm.rating >= n ? "#e08810" : t3, fontSize: "16px", cursor: "pointer" }}>
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Your Review</label>
                    <textarea value={reviewForm.text} onChange={e => setReviewForm(p => ({ ...p, text: e.target.value }))}
                      placeholder="Share your experience with this project..."
                      style={{ width: "100%", height: "90px", background: surf, border: "1px solid " + bdr, borderRadius: "7px", padding: "10px 12px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none", resize: "vertical", lineHeight: 1.6 } as React.CSSProperties} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input type="checkbox" checked={reviewForm.isPublic} onChange={e => setReviewForm(p => ({ ...p, isPublic: e.target.checked }))} id="isPublic" />
                    <label htmlFor="isPublic" style={{ fontSize: "12px", fontFamily: mono, color: t2, cursor: "pointer" }}>Make this review public</label>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Contact (optional)</label>
                    <input value={reviewForm.contact} onChange={e => setReviewForm(p => ({ ...p, contact: e.target.value }))}
                      placeholder="Email or @handle — only visible to the builder"
                      style={{ width: "100%", height: "36px", background: surf, border: "1px solid " + bdr, borderRadius: "7px", padding: "0 12px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none" }} />
                  </div>
                  {reviewError && (
                    <div style={{ padding: "10px 13px", background: "rgba(224,51,72,0.08)", border: "1px solid rgba(224,51,72,0.2)", borderRadius: "7px", fontSize: "12px", color: "#e03348" }}>
                      {reviewError}
                    </div>
                  )}
                  <button onClick={submitReview} disabled={submittingReview}
                    style={{ height: "40px", background: "#1a56ff", color: "#fff", fontSize: "12.5px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: submittingReview ? "not-allowed" : "pointer", fontFamily: mono, opacity: submittingReview ? 0.7 : 1 }}>
                    {submittingReview ? "Submitting..." : "Submit Review"}
                  </button>
                </div>
              )}
            </div>
          )}

          {reviews.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {reviews.map(r => (
                <div key={r.id} style={{ padding: "16px", background: surf2, borderRadius: "10px", border: "1px solid " + bdr }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>{r.wallet.slice(0,6)}...{r.wallet.slice(-4)}</span>
                      {r.badge === "verified" && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(0,184,122,0.1)", color: usdc, border: "1px solid rgba(0,184,122,0.2)" }}>✓ VERIFIED USER</span>}
                      {r.badge === "arc_user" && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(26,86,255,0.1)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)" }}>◆ ARC USER</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "9.5px", fontFamily: mono, color: "#e08810" }}>{"★".repeat(Math.max(0, Math.min(5, r.rating || 0)))}{"☆".repeat(Math.max(0, 5 - Math.min(5, r.rating || 0)))}</span>
                      <span style={{ fontSize: "9px", fontFamily: mono, color: t3 }}>{r.category}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: "13px", color: t2, lineHeight: 1.7, margin: 0 }}>{r.review_text}</p>
                  <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "8px" }}>
                    {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ALL-TIME TOP TESTERS — aggregated across every campaign this project
            has run. Only renders if there's at least one rated submission. */}
        {leaderboard.length > 0 && (() => {
          const SHOW_LIMIT = 10
          const visible = lbShowAll ? leaderboard : leaderboard.slice(0, SHOW_LIMIT)
          const hasMore = leaderboard.length > SHOW_LIMIT
          return (
            <div id="leaderboard" style={{ marginTop: "32px", padding: "0 4px", scrollMarginTop: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  All-Time Top Testers
                </div>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>
                  {leaderboard.length} contributor{leaderboard.length === 1 ? "" : "s"}{campaignsRun > 0 ? ` · across ${campaignsRun} campaign${campaignsRun === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", overflow: "hidden" }}>
                {visible.map((row, i) => {
                  const rank       = i + 1
                  const avgQ       = Math.round(Number(row.avg_quality) || 0)
                  const avgR       = Number(row.avg_rating) || 0
                  const scoreColor = avgQ > 70 ? usdc : avgQ > 40 ? "#e08810" : t2
                  const rkColor    = rank === 1 ? "#d4a447" : rank === 2 ? "#a5b0c5" : rank === 3 ? "#b88762" : t3
                  return (
                    <a key={row.tester_wallet} href={`/tester/${row.tester_wallet}`}
                      style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 20px",
                        borderBottom: (i < visible.length - 1 || hasMore) ? "1px solid " + bdr : "none",
                        textDecoration: "none", transition: "background 0.12s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = surf2)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ width: "36px", fontSize: "12px", fontFamily: mono, fontWeight: 700, color: rkColor, flexShrink: 0, letterSpacing: "0.04em" }}>
                        {"#" + rank}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontFamily: mono, color: t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.tester_wallet.slice(0, 8)}…{row.tester_wallet.slice(-4)}
                        </span>
                        {/* ArcLens rank chip — small, neutral. Tester is climbing
                            the platform-wide ladder naturally as they earn project XP
                            here. The two systems remain separate but visibly correlate. */}
                        {(() => {
                          const pr = Number(row.platform_rank) || 0
                          if (pr === 0) return null
                          const label = PLATFORM_RANK_LABELS[pr] || "Scout"
                          const color = PLATFORM_RANK_COLORS[pr] || t3
                          return (
                            <span title={`ArcLens rank · ${label} · avg ${Number(row.platform_avg).toFixed(2)}`}
                              style={{ fontSize: "9px", fontFamily: mono, padding: "2px 6px", borderRadius: "4px",
                                background: color + "12", color, border: `1px solid ${color}30`, flexShrink: 0,
                                letterSpacing: "0.04em", textTransform: "uppercase" }}>
                              {label}
                            </span>
                          )
                        })()}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
                        <div style={{ textAlign: "right", minWidth: "60px" }}>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: t1, fontFamily: mono }}>{row.campaigns_completed}</div>
                          <div style={{ fontSize: "8.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>tested</div>
                        </div>
                        <div style={{ textAlign: "right", minWidth: "70px" }}>
                          <div style={{ fontSize: "11px", color: "#c08828", fontFamily: mono, fontWeight: 600 }}>{avgR.toFixed(1)}★</div>
                          <div style={{ fontSize: "8.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>avg rating</div>
                        </div>
                        {/* XP column when the project opted in to XP, otherwise avg quality. */}
                        {usingXp ? (
                          <div style={{ textAlign: "right", minWidth: "60px" }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#8aaeff", fontFamily: mono }}>
                              {Number(row.total_xp || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: "8.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>total xp</div>
                          </div>
                        ) : (
                          <div style={{ textAlign: "right", minWidth: "60px" }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: scoreColor, fontFamily: mono }}>{avgQ}</div>
                            <div style={{ fontSize: "8.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>avg quality</div>
                          </div>
                        )}
                      </div>
                    </a>
                  )
                })}
                {hasMore && (
                  <button onClick={() => setLbShowAll(s => !s)}
                    style={{ width: "100%", padding: "12px 20px", background: surf2, border: "none",
                             color: "#8aaeff", fontSize: "11px", fontFamily: mono, cursor: "pointer", letterSpacing: "0.04em",
                             transition: "background 0.12s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(26,86,255,0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.background = surf2)}>
                    {lbShowAll ? "Show less" : `View all ${leaderboard.length} contributors →`}
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {/* RELATED PROJECTS */}
        {related.length > 0 && (
          <div>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>
              More in {project.category}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
              {related.map(r => {
                const rc    = r.color || CAT_COLOR[r.category] || "#1a56ff"
                const rLogo = imgSrc(r.logo_url)
                return (
                  <div key={r.id}
                    onClick={() => window.location.href = `/ecosystem/${(r as any).slug || r.id}`}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = rc + "50"; e.currentTarget.style.transform = "translateY(-2px)" }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.transform = "none" }}
                    style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "16px", cursor: "pointer", transition: "all .15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "10px", overflow: "hidden", background: rc + "18", border: "1px solid " + rc + "28", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, fontFamily: mono, color: rc, flexShrink: 0 }}>
                        {rLogo ? <img src={rLogo} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none" }} /> : r.name[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: t1, marginBottom: "2px" }}>{r.name}</div>
                        {r.badge === "verified" && <span style={{ fontSize: "8px", fontFamily: mono, padding: "1px 5px", borderRadius: "3px", background: "rgba(0,184,122,0.1)", color: "#00b87a", border: "1px solid rgba(0,184,122,0.2)" }}>✓ VERIFIED</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: "11.5px", color: t2, lineHeight: 1.5 }}>{r.tagline?.slice(0, 80)}{(r.tagline?.length || 0) > 80 ? "..." : ""}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* FOUNDER CLAIM LINK */}
        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <a href={`/dashboard/${id}`}
            style={{ fontSize: "12px", fontFamily: mono, color: t2, textDecoration: "none", cursor: "pointer", borderBottom: "1px solid " + t3, paddingBottom: "1px" }}
            onMouseEnter={e => (e.currentTarget.style.color = t2)}
            onMouseLeave={e => (e.currentTarget.style.color = t3)}>
            Are you the founder? Claim this project →
          </a>
        </div>

        {/* QUIET DISPUTE — deliberately low-key: a safety valve, not a feature.
            Anyone can flag a listing; the team reviews and acts. */}
        <div style={{ textAlign: "center", marginTop: "12px" }}>
          {reportState === "sent" ? (
            <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>Thanks — we'll take a look.</span>
          ) : !showReport ? (
            <button onClick={() => setShowReport(true)}
              style={{ background: "none", border: "none", color: t3, fontSize: "10px", fontFamily: mono, cursor: "pointer", opacity: 0.6 }}
              onMouseEnter={e => (e.currentTarget.style.color = t2, e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.color = t3, e.currentTarget.style.opacity = "0.6")}>
              Report a problem with this listing
            </button>
          ) : (
            <div style={{ maxWidth: "440px", margin: "0 auto", textAlign: "left", background: surf, border: "1px solid " + bdr, borderRadius: "10px", padding: "14px" }}>
              <label style={{ display: "block", fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>What's the problem?</label>
              <select value={reportCategory} onChange={e => setReportCategory(e.target.value as any)}
                style={{ width: "100%", height: "34px", background: surf2, border: "1px solid " + bdr, borderRadius: "7px", padding: "0 10px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none", marginBottom: "8px", boxSizing: "border-box" }}>
                <option value="listing">The listing (impersonation, false claim, scam…)</option>
                <option value="tvl">TVL number looks wrong</option>
                <option value="revenue">Revenue number looks wrong</option>
                <option value="volume">Volume number looks wrong</option>
              </select>
              <textarea value={reportText} onChange={e => setReportText(e.target.value)}
                placeholder="Explain the issue (at least one sentence)…"
                style={{ width: "100%", height: "62px", background: surf2, border: "1px solid " + bdr, borderRadius: "7px", padding: "8px 10px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" } as React.CSSProperties} />
              <input value={reportEvidence} onChange={e => setReportEvidence(e.target.value)}
                placeholder="Link to evidence (optional)"
                style={{ width: "100%", height: "32px", background: surf2, border: "1px solid " + bdr, borderRadius: "7px", padding: "0 10px", fontSize: "11px", fontFamily: mono, color: t1, outline: "none", marginTop: "8px", boxSizing: "border-box" }} />
              <input value={reportContact} onChange={e => setReportContact(e.target.value)}
                placeholder="Your email (optional)"
                style={{ width: "100%", height: "32px", background: surf2, border: "1px solid " + bdr, borderRadius: "7px", padding: "0 10px", fontSize: "11px", fontFamily: mono, color: t1, outline: "none", marginTop: "8px", boxSizing: "border-box" }} />
              {reportErr && <div style={{ fontSize: "10px", color: "#e03348", fontFamily: mono, marginTop: "6px" }}>{reportErr}</div>}
              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <button onClick={submitReport} disabled={reportState === "sending"}
                  style={{ height: "30px", padding: "0 14px", background: "#1a56ff", color: "#fff", fontSize: "11px", fontFamily: mono, border: "none", borderRadius: "6px", cursor: "pointer" }}>
                  {reportState === "sending" ? "Sending…" : "Submit report"}
                </button>
                <button onClick={() => { setShowReport(false); setReportErr("") }}
                  style={{ height: "30px", padding: "0 12px", background: "transparent", color: t3, fontSize: "11px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "6px", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </ArcLayout>
  )
}
