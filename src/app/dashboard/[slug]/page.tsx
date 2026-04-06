"use client"
import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"

interface Project {
  id: number; name: string; slug: string; tagline: string; description: string
  category: string; logo_url: string | null; website: string | null
  twitter: string | null; github: string | null; discord: string | null
  contract: string | null; featured: boolean; badge: string | null
  color: string | null; email: string; claimed_at: string | null
  view_count: number; owner_wallet: string | null
}

interface Review {
  id: number; wallet: string; category: string; rating: number
  review_text: string; is_public: boolean; contact: string | null
  badge: string; created_at: string
}

export default function DashboardPage() {
  const { slug }      = useParams<{ slug: string }>()
  const searchParams  = useSearchParams()
  const token         = searchParams.get("token")

  const [project, setProject]     = useState<Project | null>(null)
  const [reviews, setReviews]     = useState<Review[]>([])
  const [weekViews, setWeekViews] = useState(0)
  const [hasWallet, setHasWallet] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState("")
  const [mounted, setMounted]     = useState(false)
  const [activeTab, setActiveTab] = useState<"overview"|"reviews"|"private"|"edit">("overview")
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null)
  const [savingWallet, setSavingWallet]       = useState(false)
  const [walletSaved, setWalletSaved]         = useState(false)

  // Edit form
  const [editForm, setEditForm]   = useState({ tagline: "", description: "", website: "", twitter: "", github: "", discord: "", contract: "", color: "" })
  const [saving, setSaving]       = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState("")

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return

    async function tryWalletAuth() { await new Promise(r => setTimeout(r, 500))
      try {
        if (typeof window !== "undefined" && (window as any).ethereum) {
          const accounts = await (window as any).ethereum.request({ method: "eth_accounts" })
          if (accounts?.[0]) {
            setConnectedWallet(accounts[0])
            // Try wallet-based auth
            const res = await fetch("/api/claim", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ wallet: accounts[0] }),
            })
            const data = await res.json()
            const match = data.projects?.[0]
            if (match) {
              // Wallet auth success — load full dashboard
              await loadDashboardWithToken(null, accounts[0])
              return true
            }
          }
        }
      } catch { }
      return false
    }

    async function loadDashboardWithToken(tok: string | null, wallet?: string) {
      try {
        const params = new URLSearchParams()
        if (slug) params.set("slug", slug)
        if (tok)  params.set("token", tok)
        if (wallet) params.set("wallet", wallet)
        const res = await fetch(`/api/claim?${params}`)
        const data = await res.json()
        if (!res.ok) { setError(data.error || "Access denied"); return }
        setProject(data.project)
        setReviews(data.reviews || [])
        setWeekViews(data.weekViews || 0)
        setHasWallet(data.hasWallet || false)
        setEditForm({
          tagline:     data.project.tagline || "",
          description: data.project.description || "",
          website:     data.project.website || "",
          twitter:     data.project.twitter || "",
          github:      data.project.github || "",
          discord:     data.project.discord || "",
          contract:    data.project.contract || "",
          color:       data.project.color || "",
        })
      } catch { setError("Failed to load dashboard") }
      finally { setLoading(false) }
    }

    async function init() {
      if (token) {
        await loadDashboardWithToken(token)
        // Try to get wallet too for display
        try {
          if ((window as any).ethereum) {
            const accounts = await (window as any).ethereum.request({ method: "eth_accounts" })
            if (accounts?.[0]) setConnectedWallet(accounts[0])
          }
        } catch { }
      } else {
        const walletAuthed = await tryWalletAuth()
        if (!walletAuthed) setLoading(false)
      }
    }

    init()
  }, [mounted, slug, token])

  async function saveWallet() {
    if (!connectedWallet || !token) return
    setSavingWallet(true)
    try {
      const res = await fetch("/api/claim", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, slug, wallet: connectedWallet }),
      })
      if (res.ok) { setWalletSaved(true); setHasWallet(true) }
    } catch { }
    finally { setSavingWallet(false) }
  }

  async function saveEdit() {
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      const res = await fetch("/api/update-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, slug, wallet: connectedWallet, updates: editForm }),
      })
      const data = await res.json()
      if (data.success) {
        setSaveSuccess(true)
        setProject(p => p ? { ...p, ...editForm } : p)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setSaveError(data.error || "Failed to save")
      }
    } catch { setSaveError("Network error") }
    finally { setSaving(false) }
  }

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#060812" }} />

  const mono  = "'DM Mono', monospace"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const usdc  = "#00b87a"

  // No token and wallet auth failed — show claim form
  if (!token && !project && !loading) return (
    <ArcLayout active="ecosystem">
      <ClaimForm slug={slug} mono={mono} bdr={bdr} surf={surf} surf2={surf2} t1={t1} t2={t2} t3={t3} />
    </ArcLayout>
  )

  if (loading) return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "80px", textAlign: "center", fontFamily: mono, fontSize: "12px", color: t3 }}>
        Loading your dashboard...
      </div>
    </ArcLayout>
  )

  if (error) return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "80px", textAlign: "center" }}>
        <div style={{ fontSize: "14px", color: "#e03348", marginBottom: "16px" }}>{error}</div>
        <button onClick={() => window.location.href = `/dashboard/${slug}`}
          style={{ height: "36px", padding: "0 20px", background: "#1a56ff", color: "#fff", fontSize: "12px", border: "none", borderRadius: "7px", cursor: "pointer", fontFamily: mono }}>
          Request new link
        </button>
      </div>
    </ArcLayout>
  )

  if (!project) return null

  const publicReviews  = reviews.filter(r => r.is_public)
  const privateReviews = reviews.filter(r => !r.is_public)
  const avgRating      = reviews.length > 0 ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) : "—"
  const categoryBreakdown = reviews.reduce((acc: Record<string, number>, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1
    return acc
  }, {})

  const inputStyle = { width: "100%", height: "38px", background: surf2, border: "1px solid " + bdr, borderRadius: "7px", padding: "0 12px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none" } as React.CSSProperties

  return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "24px 20px 60px", maxWidth: "900px", margin: "0 auto" }}>

        {/* HEADER */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Founder Dashboard</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em", color: t1, margin: 0 }}>{project.name}</h1>
            <button onClick={() => window.location.href = `/ecosystem/${project.slug || project.id}`}
              style={{ height: "34px", padding: "0 16px", background: "transparent", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", cursor: "pointer" }}>
              View public page
            </button>
          </div>
          <div style={{ fontSize: "13px", color: t2, marginTop: "6px" }}>{project.tagline}</div>
        </div>

        {/* WALLET CONNECT PROMPT — optional, only show if token auth and no wallet saved */}
        {token && !hasWallet && !walletSaved && (
          <div style={{ background: "rgba(26,86,255,0.06)", border: "1px solid rgba(26,86,255,0.2)", borderRadius: "12px", padding: "16px 20px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "13px", color: t1, marginBottom: "4px" }}>Skip the magic link next time</div>
              <div style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>Save {connectedWallet.slice(0,6)}...{connectedWallet.slice(-4)} as your login wallet — optional</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveWallet} disabled={savingWallet}
                style={{ height: "34px", padding: "0 16px", background: "#1a56ff", color: "#fff", fontSize: "12px", fontFamily: mono, border: "none", borderRadius: "7px", cursor: "pointer", opacity: savingWallet ? 0.7 : 1 }}>
                {savingWallet ? "Saving..." : "Save wallet"}
              </button>
              <button onClick={() => setHasWallet(true)}
                style={{ height: "34px", padding: "0 16px", background: "transparent", color: t3, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", cursor: "pointer" }}>
                Skip
              </button>
            </div>
          </div>
        )}

        {walletSaved && (
          <div style={{ background: "rgba(0,184,122,0.06)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", fontSize: "12px", fontFamily: mono, color: usdc }}>
            ✓ Wallet saved — you can now log in directly without a magic link
          </div>
        )}

        {/* STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "Views this week", value: weekViews.toString(), color: "#1a56ff" },
            { label: "Total reviews",   value: reviews.length.toString(), color: usdc },
            { label: "Avg rating",      value: avgRating + (reviews.length > 0 ? " / 5" : ""), color: "#e08810" },
            { label: "Private reviews", value: privateReviews.length.toString(), color: "#a855f7" },
          ].map(stat => (
            <div key={stat.label} style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "18px 20px" }}>
              <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>{stat.label}</div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: stat.color, letterSpacing: "-0.04em" }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" }}>
          {([
            { key: "overview", label: "Overview" },
            { key: "reviews",  label: `Public (${publicReviews.length})` },
            { key: "private",  label: `Private (${privateReviews.length})` },
            { key: "edit",     label: "Edit Listing" },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ height: "32px", padding: "0 16px", background: activeTab === tab.key ? "rgba(26,86,255,0.12)" : "transparent", color: activeTab === tab.key ? "#8aaeff" : t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + (activeTab === tab.key ? "rgba(26,86,255,0.35)" : bdr), borderRadius: "6px", cursor: "pointer", fontWeight: activeTab === tab.key ? 600 : 400 }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {reviews.length > 0 ? (
              <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "24px 28px" }}>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Feedback by category</div>
                {Object.entries(categoryBreakdown).sort((a,b) => b[1]-a[1]).map(([cat, count]) => (
                  <div key={cat} style={{ marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontFamily: mono, color: t2 }}>{cat}</span>
                      <span style={{ fontSize: "12px", fontFamily: mono, color: t3 }}>{count as number}</span>
                    </div>
                    <div style={{ height: "4px", background: bdr, borderRadius: "2px" }}>
                      <div style={{ height: "4px", background: "#1a56ff", borderRadius: "2px", width: `${((count as number) / reviews.length) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "40px", textAlign: "center", color: t3, fontFamily: mono, fontSize: "12px" }}>
                No reviews yet. Share your project to get feedback.
              </div>
            )}
            <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "24px 28px" }}>
              <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Your listing</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {[
                  { label: "Category",  value: project.category },
                  { label: "Badge",     value: project.badge || "None" },
                  { label: "Featured",  value: project.featured ? "Yes" : "No" },
                  { label: "Contract",  value: project.contract ? project.contract.slice(0,10) + "..." : "Not set" },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{item.label}</div>
                    <div style={{ fontSize: "13px", fontFamily: mono, color: t2 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PUBLIC REVIEWS */}
        {activeTab === "reviews" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {publicReviews.length === 0
              ? <div style={{ padding: "40px", textAlign: "center", color: t3, fontFamily: mono, fontSize: "12px" }}>No public reviews yet</div>
              : publicReviews.map(r => <ReviewCard key={r.id} r={r} surf={surf} bdr={bdr} t2={t2} t3={t3} mono={mono} usdc={usdc} showContact={false} />)
            }
          </div>
        )}

        {/* PRIVATE REVIEWS */}
        {activeTab === "private" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {privateReviews.length === 0
              ? <div style={{ padding: "40px", textAlign: "center", color: t3, fontFamily: mono, fontSize: "12px" }}>No private reviews yet</div>
              : privateReviews.map(r => <ReviewCard key={r.id} r={r} surf={surf} bdr={bdr} t2={t2} t3={t3} mono={mono} usdc={usdc} showContact={true} />)
            }
          </div>
        )}

        {/* EDIT LISTING */}
        {activeTab === "edit" && (
          <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "24px 28px" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>Edit your listing</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[
                { key: "tagline",     label: "Tagline",          ph: "One-line description" },
                { key: "website",     label: "Website",          ph: "https://..." },
                { key: "twitter",     label: "X / Twitter",      ph: "@handle or https://x.com/..." },
                { key: "github",      label: "GitHub",           ph: "https://github.com/..." },
                { key: "discord",     label: "Discord",          ph: "https://discord.gg/..." },
                { key: "contract",    label: "Contract Address", ph: "0x..." },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>{f.label}</label>
                  <input
                    value={(editForm as any)[f.key]}
                    onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    style={inputStyle}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What does your project do?"
                  style={{ ...inputStyle, height: "100px", padding: "10px 12px", resize: "vertical", lineHeight: 1.6 } as React.CSSProperties}
                />
              </div>

              {saveError && <div style={{ fontSize: "12px", color: "#e03348", fontFamily: mono }}>{saveError}</div>}
              {saveSuccess && <div style={{ fontSize: "12px", color: usdc, fontFamily: mono }}>✓ Listing updated successfully</div>}

              <button onClick={saveEdit} disabled={saving}
                style={{ height: "42px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: saving ? "not-allowed" : "pointer", fontFamily: mono, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        )}

      </div>
    </ArcLayout>
  )
}

function ReviewCard({ r, surf, bdr, t2, t3, mono, usdc, showContact }: any) {
  return (
    <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>{r.wallet.slice(0,6)}...{r.wallet.slice(-4)}</span>
          {r.badge === "verified" && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(0,184,122,0.1)", color: usdc, border: "1px solid rgba(0,184,122,0.2)" }}>✓ VERIFIED USER</span>}
          {r.badge === "arc_user" && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(26,86,255,0.1)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)" }}>◆ ARC USER</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "#e08810" }}>{"★".repeat(Math.max(0,Math.min(5,r.rating||0)))}{"☆".repeat(Math.max(0,5-Math.min(5,r.rating||0)))}</span>
          <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>{r.category}</span>
        </div>
      </div>
      <p style={{ fontSize: "13px", color: t2, lineHeight: 1.7, margin: 0 }}>{r.review_text}</p>
      {showContact && r.contact && (
        <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "7px", fontSize: "12px", fontFamily: mono, color: "#a855f7" }}>
          Contact: {r.contact}
        </div>
      )}
      <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "10px" }}>
        {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  )
}

function ClaimForm({ slug, mono, bdr, surf, surf2, t1, t2, t3 }: any) {
  const [email, setEmail]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState("")
  const [debugUrl, setDebugUrl] = useState("")

  async function claim() {
    if (!email.trim()) { setError("Enter your email"); return }
    setLoading(true); setError("")
    try {
      const res  = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, slug }),
      })
      const data = await res.json()
      if (data.success) { setSuccess(true); if (data.debug_url) setDebugUrl(data.debug_url) }
      else setError(data.error || "Failed")
    } catch { setError("Network error") }
    finally { setLoading(false) }
  }

  return (
    <div style={{ padding: "80px 20px", maxWidth: "480px", margin: "0 auto" }}>
      <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>Founder Access</div>
      <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.04em", color: t1, margin: "0 0 8px" }}>Claim your dashboard</h1>
      <p style={{ fontSize: "13px", color: t2, lineHeight: 1.7, marginBottom: "28px" }}>Enter the email you used when submitting your project. We'll send you a magic link — no password needed.</p>
      {success ? (
        <div>
          <div style={{ padding: "16px", background: "rgba(0,184,122,0.06)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: "8px", fontSize: "13px", color: "#00b87a", marginBottom: "16px" }}>
            ✓ Check your email for the dashboard link
          </div>
          {debugUrl && (
            <div style={{ padding: "12px", background: surf, border: "1px solid " + bdr, borderRadius: "8px", fontSize: "11px", fontFamily: mono, color: t3, wordBreak: "break-all" }}>
              Dev link: <a href={debugUrl} style={{ color: "#8aaeff" }}>{debugUrl}</a>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && claim()}
            placeholder="you@email.com"
            style={{ height: "42px", background: surf, border: "1px solid " + bdr, borderRadius: "8px", padding: "0 14px", fontSize: "13px", fontFamily: mono, color: t1, outline: "none", width: "100%" }} />
          {error && <div style={{ fontSize: "12px", color: "#e03348" }}>{error}</div>}
          <button onClick={claim} disabled={loading}
            style={{ height: "42px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", fontFamily: mono, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Sending..." : "Send magic link"}
          </button>
        </div>
      )}
    </div>
  )
}
