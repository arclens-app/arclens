"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"

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
  featured: boolean
  badge: string | null
  color: string | null
  created_at: string
  txCount: string | null
  view_count?: number
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

const CAT_COLOR: Record<string, string> = {
  Infrastructure: "#1a56ff", DeFi: "#00d990", NFT: "#c08828",
  Payments: "#00d990", Gaming: "#a855f7", Social: "#ec4899",
  AI: "#8aaeff", Bridge: "#e08810",
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
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({ category: "Product Experience", rating: 5, text: "", isPublic: true, contact: "" })
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const [reviewSuccess, setReviewSuccess] = useState(false)
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null)

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
    const text = `Check out ${project?.name} on ArcLens — ${project?.tagline}\n\n${url}`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank")
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
  const proxiedLogo = project.logo_url ? `/api/image-proxy?url=${encodeURIComponent(project.logo_url)}` : null

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
                  {project.badge === "official" && <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(26,86,255,0.12)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.25)" }}>OFFICIAL</span>}
                  {project.badge === "verified" && <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(0,184,122,0.1)", color: "#00b87a", border: "1px solid rgba(0,184,122,0.25)" }}>✓ VERIFIED</span>}
                  {project.featured && <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(192,136,40,0.1)", color: "#c08828", border: "1px solid rgba(192,136,40,0.25)" }}>FEATURED</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "9px", fontFamily: mono, padding: "3px 10px", borderRadius: "99px", background: color + "14", color, border: "1px solid " + color + "28" }}>{project.category}</span>
                  <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>Listed {new Date(project.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
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
        </div>

        {/* DESCRIPTION */}
        {project.description && (
          <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "24px 28px", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>About</div>
            <p style={{ fontSize: "14px", color: t2, lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>{project.description}</p>
          </div>
        )}

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
                const text = `Just reviewed ${project?.name} on ArcLens — arclenz.xyz/ecosystem/${id}`
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank")
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

        {/* RELATED PROJECTS */}
        {related.length > 0 && (
          <div>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>
              More in {project.category}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
              {related.map(r => {
                const rc    = r.color || CAT_COLOR[r.category] || "#1a56ff"
                const rLogo = r.logo_url ? `/api/image-proxy?url=${encodeURIComponent(r.logo_url)}` : null
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

      </div>
    </ArcLayout>
  )
}
