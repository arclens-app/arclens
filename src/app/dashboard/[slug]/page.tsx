"use client"
import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import { WalletAvatar } from "@/components/WalletAvatar"
import { useArcStore } from "@/store/arc"

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
  const { slug }     = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const token        = searchParams.get("token")

  const [project, setProject]       = useState<Project | null>(null)
  const [reviews, setReviews]       = useState<Review[]>([])
  const [weekViews, setWeekViews]   = useState(0)
  const [hasWallet, setHasWallet]   = useState(false)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState("")
  const [mounted, setMounted]       = useState(false)
  const [activeTab, setActiveTab]   = useState<"overview"|"reviews"|"private"|"forge"|"edit">("overview")
  const [forgeCampaigns, setForgeCampaigns]   = useState<any[]>([])
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null)

  // Forge inline detail state
  const [selectedCampaignId, setSelectedCampaignId]     = useState<number | null>(null)
  const [campaignDetail, setCampaignDetail]             = useState<{ campaign: any; completions: any[] } | null>(null)
  const [campaignDetailLoading, setCampaignDetailLoading] = useState(false)
  const [expandedTesters, setExpandedTesters]           = useState<Set<string>>(new Set())
  const [dashRatingWallet, setDashRatingWallet]         = useState("")
  const [dashRatingVal, setDashRatingVal]               = useState(0)
  const [dashRatingImpact, setDashRatingImpact]         = useState(false)
  const [dashRatingLoading, setDashRatingLoading]       = useState(false)
  const [dashRatingMsg, setDashRatingMsg]               = useState<string | null>(null)
  const [fundingCampaign, setFundingCampaign]           = useState(false)
  const [fundMsg, setFundMsg]                           = useState<string | null>(null)
  const [savingWallet, setSavingWallet]                 = useState(false)
  const [walletSaved, setWalletSaved]                   = useState(false)

  // Edit form
  const [editForm, setEditForm]   = useState({ tagline: "", description: "", website: "", twitter: "", github: "", discord: "", contract: "", color: "", city: "", country: "" })
  const [extraContracts, setExtraContracts] = useState<string[]>([])
  const [saving, setSaving]       = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState("")

  const mono  = "'DM Mono', monospace"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const green = "#00b87a"

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return

    async function tryWalletAuth() {
      await new Promise(r => setTimeout(r, 500))

      // Source of truth is localStorage — ArcLayout sets it on connect for
      // both Circle and browser wallets. If a wallet is saved, the backend
      // will accept/reject it; we don't need MetaMask to be unlocked to
      // authenticate (that was the old bug — locked extension → claim form).
      const savedAddr = localStorage.getItem("arclens-wallet")
      if (savedAddr) {
        setConnectedWallet(savedAddr)
        useArcStore.getState().setWallet(savedAddr)
        await loadDashboardWithToken(null, savedAddr)
        return true
      }

      // No saved wallet — last-ditch attempt via window.ethereum (covers
      // first-time visitors who connected MetaMask elsewhere and arrived
      // here cold). PATCH first to confirm ownership before showing data.
      try {
        if (typeof window !== "undefined" && (window as any).ethereum) {
          const accounts = await (window as any).ethereum.request({ method: "eth_accounts" })
          if (accounts?.[0]) {
            setConnectedWallet(accounts[0])
            const res  = await fetch("/api/claim", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: accounts[0] }) })
            const data = await res.json()
            const match = data.projects?.[0]
            if (match) {
              localStorage.setItem("arclens-wallet", accounts[0].toLowerCase())
              useArcStore.getState().setWallet(accounts[0].toLowerCase())
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
        if (slug)   params.set("slug", slug)
        if (tok)    params.set("token", tok)
        if (wallet) params.set("wallet", wallet)
        const res  = await fetch(`/api/claim?${params}`)
        const data = await res.json()
        if (!res.ok) { setError(data.error || "Access denied"); return }
        setProject(data.project)
        setReviews(data.reviews || [])
        setWeekViews(data.weekViews || 0)
        setHasWallet(data.hasWallet || false)
        if (wallet) {
          fetch(`/api/trials?creator=${wallet}`)
            .then(r => r.json())
            .then(d => setForgeCampaigns(d.campaigns || []))
            .catch(() => {})
        }
        setEditForm({
          tagline: data.project.tagline || "", description: data.project.description || "",
          website: data.project.website || "", twitter: data.project.twitter || "",
          github: data.project.github || "", discord: data.project.discord || "",
          contract: data.project.contract || "", color: data.project.color || "",
          city: data.project.city || "", country: data.project.country || "",
        })
        setExtraContracts(Array.isArray(data.project.contracts) ? data.project.contracts : [])
      } catch { setError("Failed to load dashboard") }
      finally { setLoading(false) }
    }

    async function init() {
      if (token) {
        await loadDashboardWithToken(token)
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

  async function openCampaign(id: number) {
    setSelectedCampaignId(id)
    setCampaignDetail(null)
    setCampaignDetailLoading(true)
    setDashRatingWallet("")
    setDashRatingVal(0)
    setDashRatingMsg(null)
    setExpandedTesters(new Set())
    setFundMsg(null)
    try {
      const res  = await fetch(`/api/trials/${id}`)
      const data = await res.json()
      if (data.campaign) setCampaignDetail(data)
    } finally { setCampaignDetailLoading(false) }
  }

  function toggleTester(wallet: string) {
    setExpandedTesters(prev => {
      const next = new Set(prev)
      if (next.has(wallet)) next.delete(wallet); else next.add(wallet)
      return next
    })
  }

  async function submitDashRating() {
    if (!dashRatingWallet || !dashRatingVal || !selectedCampaignId) return
    setDashRatingLoading(true)
    setDashRatingMsg(null)
    try {
      const res = await fetch(`/api/trials/${selectedCampaignId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tester_wallet: dashRatingWallet, rating: dashRatingVal, founder_wallet: connectedWallet, impact_credited: dashRatingImpact }),
      })
      if (res.ok) {
        setDashRatingMsg("✓ Rating saved")
        setDashRatingWallet("")
        setDashRatingVal(0)
        setDashRatingImpact(false)
        openCampaign(selectedCampaignId)
        if (connectedWallet) {
          fetch(`/api/trials?creator=${connectedWallet}`).then(r => r.json()).then(d => setForgeCampaigns(d.campaigns || [])).catch(() => {})
        }
      }
    } finally { setDashRatingLoading(false) }
  }

  async function fundCampaign(campaign: any) {
    if (!connectedWallet || !(window as any).ethereum) return
    const slots       = campaign.total_slots || 10
    const totalAmount = (campaign.reward_usdc_amount * slots).toFixed(2)
    const payoutAddr  = process.env.NEXT_PUBLIC_ARCLENS_PAYOUT_ADDRESS
    if (!payoutAddr) { setFundMsg("Payout address not configured — contact support"); return }
    setFundingCampaign(true)
    setFundMsg(null)
    try {
      const { createAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2")
      const { AppKit } = await import("@circle-fin/app-kit")
      const adapter = await createAdapterFromProvider({ provider: (window as any).ethereum })
      const kit     = new AppKit()
      const result  = await kit.send({
        from:   { adapter: adapter as any, chain: "Arc_Testnet" },
        to:     payoutAddr,
        amount: totalAmount,
        token:  "USDC",
      })
      const txHash = (result as any).txHash || (result as any).hash || ""
      await fetch(`/api/trials/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit_tx_hash: txHash, creator_wallet: connectedWallet }),
      })
      setFundMsg(`✓ $${totalAmount} USDC deposited — testers can claim immediately after completing`)
      if (connectedWallet) {
        fetch(`/api/trials?creator=${connectedWallet}`).then(r => r.json()).then(d => setForgeCampaigns(d.campaigns || [])).catch(() => {})
      }
      openCampaign(campaign.id)
    } catch (e: any) {
      if (e?.code !== 4001 && !String(e).includes("user rejected")) {
        setFundMsg("Transaction failed: " + (e?.message || "Unknown error"))
      }
    } finally { setFundingCampaign(false) }
  }

  async function saveWallet() {
    if (!connectedWallet || !token || !project?.name) return
    setSavingWallet(true)
    try {
      const addr        = connectedWallet.toLowerCase()
      const walletType  = localStorage.getItem("arclens-wallet-type")
      const circleEmail = localStorage.getItem("arclens-circle-email")
      let auth: any = null

      if (walletType === "circle" && circleEmail) {
        // Circle: backend verifies email→wallet mapping in circle_wallet_users
        auth = { type: "circle", email: circleEmail }
      } else if ((window as any).ethereum) {
        // Browser wallet: sign canonical activation message (mirrors /api/claim PUT)
        const timestamp = Date.now()
        const message   = `ArcLens Founder Dashboard Activation\nProject: ${project.name}\nWallet: ${addr}\nTimestamp: ${timestamp}`
        const signature: string = await (window as any).ethereum.request({
          method: "personal_sign",
          params: [message, addr],
        })
        if (!signature) { setSavingWallet(false); return }
        auth = { type: "wallet", signature, timestamp }
      } else {
        setSavingWallet(false)
        return
      }

      const res = await fetch("/api/claim", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, slug, wallet: addr, auth }),
      })
      if (res.ok) { setWalletSaved(true); setHasWallet(true) }
    } catch {}
    finally { setSavingWallet(false) }
  }

  async function saveEdit() {
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      const res  = await fetch("/api/update-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, slug, wallet: connectedWallet, updates: { ...editForm, contracts: extraContracts.map(c=>c.trim()).filter(Boolean) } }),
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

  const inputStyle = { width: "100%", height: "38px", background: surf2, border: "1px solid " + bdr, borderRadius: "7px", padding: "0 12px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none" } as React.CSSProperties

  if (!token && !project && !loading) return (
    <ArcLayout active="ecosystem">
      <ClaimForm slug={slug} mono={mono} bdr={bdr} surf={surf} surf2={surf2} t1={t1} t2={t2} t3={t3} />
    </ArcLayout>
  )

  if (loading) return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "80px", textAlign: "center", fontFamily: mono, fontSize: "12px", color: t3 }}>Loading your dashboard...</div>
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
  const activeCampaigns = forgeCampaigns.filter(c => c.status === "active").length
  const categoryBreakdown = reviews.reduce((acc: Record<string, number>, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1
    return acc
  }, {})
  const accentColor = project.color || "#1a56ff"

  return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "0 0 60px", maxWidth: "900px", margin: "0 auto" }}>

        {/* ── HERO HEADER ── */}
        <div style={{ padding: "28px 20px 24px", borderBottom: "1px solid " + bdr, marginBottom: "28px" }}>
          <div style={{ fontSize: "9px", fontFamily: mono, color: t3, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "14px" }}>Founder Dashboard</div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            {/* Logo */}
            <div style={{ width: "56px", height: "56px", borderRadius: "12px", overflow: "hidden", flexShrink: 0, background: `${accentColor}12`, border: `1px solid ${accentColor}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {project.logo_url
                ? <img src={project.logo_url} alt={project.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => (e.currentTarget.style.display = "none")} />
                : <span style={{ fontSize: "22px", fontWeight: 700, color: accentColor }}>{project.name?.[0]}</span>
              }
            </div>
            {/* Name + tagline */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.04em", color: t1, margin: 0 }}>{project.name}</h1>
                {project.badge && (
                  <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(26,86,255,0.1)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)", textTransform: "uppercase" }}>
                    {project.badge}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "13px", color: t2, marginTop: "3px" }}>{project.tagline}</div>
            </div>
            {/* Actions */}
            <button onClick={() => window.location.href = `/ecosystem/${project.slug || project.id}`}
              style={{ height: "32px", padding: "0 14px", background: "transparent", color: t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", cursor: "pointer", flexShrink: 0 }}>
              View public page ↗
            </button>
          </div>
        </div>

        <div style={{ padding: "0 20px" }}>

          {/* Wallet connect prompt */}
          {token && !hasWallet && !walletSaved && connectedWallet && (
            <div style={{ background: "rgba(26,86,255,0.05)", border: "1px solid rgba(26,86,255,0.18)", borderRadius: "10px", padding: "14px 18px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "12px", color: t1, marginBottom: "3px", fontWeight: 500 }}>Skip the magic link next time</div>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>Save {connectedWallet.slice(0,6)}...{connectedWallet.slice(-4)} as your login wallet</div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={saveWallet} disabled={savingWallet}
                  style={{ height: "32px", padding: "0 14px", background: "#1a56ff", color: "#fff", fontSize: "11px", fontFamily: mono, border: "none", borderRadius: "6px", cursor: "pointer", opacity: savingWallet ? 0.7 : 1 }}>
                  {savingWallet ? "Saving..." : "Save wallet"}
                </button>
                <button onClick={() => setHasWallet(true)}
                  style={{ height: "32px", padding: "0 12px", background: "transparent", color: t3, fontSize: "11px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "6px", cursor: "pointer" }}>
                  Skip
                </button>
              </div>
            </div>
          )}

          {walletSaved && (
            <div style={{ background: "rgba(0,184,122,0.06)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "11px", fontFamily: mono, color: green }}>
              ✓ Wallet saved — log in directly next time without a magic link
            </div>
          )}

          {/* ── STATS ROW ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginBottom: "24px" }}>
            {[
              { label: "Views this week",    value: weekViews.toString(), color: "#1a56ff" },
              { label: "Total reviews",      value: reviews.length.toString(), color: green },
              { label: "Avg rating",         value: avgRating + (reviews.length > 0 ? " / 5" : ""), color: "#e08810" },
              ...(connectedWallet ? [
                { label: "Active campaigns", value: activeCampaigns.toString(), color: "#8aaeff" },
                { label: "Private reviews",  value: privateReviews.length.toString(), color: "#a855f7" },
              ] : []),
            ].map(stat => (
              <div key={stat.label} style={{ background: surf, border: "1px solid " + bdr, borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>{stat.label}</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: stat.color, letterSpacing: "-0.04em" }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* ── TABS ── */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" }}>
            {([
              { key: "overview", label: "Overview" },
              { key: "reviews",  label: `Reviews (${publicReviews.length})` },
              ...(connectedWallet ? [
                { key: "private", label: `Private (${privateReviews.length})` },
                { key: "forge",   label: `Campaigns (${forgeCampaigns.length})` },
              ] : []),
              ...((connectedWallet || token) ? [
                { key: "edit",    label: "Edit Listing" },
              ] : []),
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
                style={{ height: "32px", padding: "0 16px", background: activeTab === tab.key ? "rgba(26,86,255,0.12)" : "transparent", color: activeTab === tab.key ? "#8aaeff" : t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + (activeTab === tab.key ? "rgba(26,86,255,0.35)" : bdr), borderRadius: "6px", cursor: "pointer", fontWeight: activeTab === tab.key ? 600 : 400 }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {reviews.length > 0 ? (
                <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "22px 24px" }}>
                  <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Feedback by category</div>
                  {Object.entries(categoryBreakdown).sort((a,b) => b[1]-a[1]).map(([cat, count]) => (
                    <div key={cat} style={{ marginBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "12px", fontFamily: mono, color: t2 }}>{cat}</span>
                        <span style={{ fontSize: "12px", fontFamily: mono, color: t3 }}>{count as number}</span>
                      </div>
                      <div style={{ height: "3px", background: bdr, borderRadius: "2px" }}>
                        <div style={{ height: "3px", background: accentColor, borderRadius: "2px", width: `${((count as number) / reviews.length) * 100}%`, opacity: 0.7 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "48px", textAlign: "center" }}>
                  <div style={{ fontSize: "28px", marginBottom: "10px" }}>◎</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: t1, marginBottom: "6px" }}>No reviews yet</div>
                  <div style={{ fontSize: "12px", fontFamily: mono, color: t3 }}>Share your project page to start collecting feedback from the Arc community</div>
                </div>
              )}
              <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "22px 24px" }}>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Your listing</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
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

          {/* ── PUBLIC REVIEWS ── */}
          {activeTab === "reviews" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {publicReviews.length === 0
                ? <div style={{ padding: "48px", textAlign: "center", color: t3, fontFamily: mono, fontSize: "12px" }}>No public reviews yet</div>
                : publicReviews.map(r => <ReviewCard key={r.id} r={r} surf={surf} bdr={bdr} t2={t2} t3={t3} mono={mono} green={green} showContact={false} />)
              }
            </div>
          )}

          {/* ── PRIVATE REVIEWS ── */}
          {activeTab === "private" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {privateReviews.length === 0
                ? <div style={{ padding: "48px", textAlign: "center", color: t3, fontFamily: mono, fontSize: "12px" }}>No private reviews yet</div>
                : privateReviews.map(r => <ReviewCard key={r.id} r={r} surf={surf} bdr={bdr} t2={t2} t3={t3} mono={mono} green={green} showContact={true} />)
              }
            </div>
          )}

          {/* ── CAMPAIGNS (Arc Trials) ── */}
          {activeTab === "forge" && (
            <div>
              {selectedCampaignId === null ? (
                /* Campaign list */
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: t1 }}>Arc Trials</div>
                      <div style={{ fontSize: "11px", fontFamily: mono, color: t3, marginTop: "2px" }}>Collect verified feedback from real Arc testers</div>
                    </div>
                    <button onClick={() => window.location.href = "/trials/create"}
                      style={{ height: "32px", padding: "0 14px", background: "#1a56ff", color: "#fff", fontSize: "11px", fontFamily: mono, border: "none", borderRadius: "6px", cursor: "pointer" }}>
                      + New Campaign
                    </button>
                  </div>

                  {forgeCampaigns.length === 0 ? (
                    <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "52px", textAlign: "center" }}>
                      <div style={{ fontSize: "28px", marginBottom: "12px" }}>✦</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: t1, marginBottom: "6px" }}>No campaigns yet</div>
                      <div style={{ fontSize: "11px", fontFamily: mono, color: t3, marginBottom: "20px", lineHeight: 1.6 }}>Create a campaign to get structured, scored feedback from the Arc community</div>
                      <button onClick={() => window.location.href = "/trials/create"}
                        style={{ height: "36px", padding: "0 20px", background: "#1a56ff", color: "#fff", fontSize: "12px", fontFamily: mono, border: "none", borderRadius: "7px", cursor: "pointer" }}>
                        Create your first campaign
                      </button>
                    </div>
                  ) : forgeCampaigns.map((c: any) => {
                    const statusColor  = c.status === "active" ? "#00b87a" : c.status === "approved" ? "#8aaeff" : c.status === "pending_approval" ? "#e08810" : c.status === "rejected" ? "#e03348" : t3
                    const statusBg     = c.status === "active" ? "rgba(0,184,122,0.1)" : c.status === "approved" ? "rgba(26,86,255,0.1)" : c.status === "pending_approval" ? "rgba(224,136,16,0.1)" : c.status === "rejected" ? "rgba(224,51,72,0.08)" : "rgba(107,125,168,0.1)"
                    const statusBdr    = c.status === "active" ? "rgba(0,184,122,0.25)" : c.status === "approved" ? "rgba(26,86,255,0.25)" : c.status === "pending_approval" ? "rgba(224,136,16,0.25)" : c.status === "rejected" ? "rgba(224,51,72,0.2)" : bdr
                    const statusLabel  = c.status === "pending_approval" ? "Pending Review" : c.status === "approved" ? "Fund to Activate" : c.status
                    const slotFill     = c.total_slots ? Math.min((c.completion_count || 0) / c.total_slots, 1) : 0

                    return (
                      <div key={c.id} style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", overflow: "hidden" }}>
                        <div style={{ padding: "16px 20px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "14px", fontWeight: 600, color: t1, marginBottom: "2px" }}>{c.title}</div>
                              <div style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>
                                {c.type?.replace(/_/g, " ")} · {c.reward_type === "usdc" && c.reward_usdc_amount ? `$${c.reward_usdc_amount} USDC / tester` : c.reward_type?.replace(/_/g, " ")}
                              </div>
                            </div>
                            <span style={{ fontSize: "9px", fontFamily: mono, padding: "3px 8px", borderRadius: "4px", flexShrink: 0, textTransform: "uppercase", background: statusBg, color: statusColor, border: `1px solid ${statusBdr}` }}>
                              {statusLabel}
                            </span>
                          </div>

                          {/* Slot progress bar */}
                          {c.total_slots > 0 && (
                            <div style={{ marginBottom: "12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>Tester slots</span>
                                <span style={{ fontSize: "10px", fontFamily: mono, color: t2 }}>{c.completion_count || 0} / {c.total_slots}</span>
                              </div>
                              <div style={{ height: "3px", background: bdr, borderRadius: "2px" }}>
                                <div style={{ height: "3px", background: c.status === "active" ? "#00b87a" : t3, borderRadius: "2px", width: `${slotFill * 100}%`, transition: "width 0.3s" }} />
                              </div>
                            </div>
                          )}

                          {/* Rejection reason */}
                          {c.status === "rejected" && c.rejection_reason && (
                            <div style={{ padding: "8px 12px", background: "rgba(224,51,72,0.05)", border: "1px solid rgba(224,51,72,0.15)", borderRadius: "6px", marginBottom: "10px" }}>
                              <div style={{ fontSize: "9px", fontFamily: mono, color: "#e03348", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>Rejection reason</div>
                              <div style={{ fontSize: "11px", color: "#e03348", opacity: 0.8, lineHeight: 1.5 }}>{c.rejection_reason}</div>
                            </div>
                          )}

                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: "18px", fontWeight: 700, color: t1 }}>
                              {c.completion_count || 0}
                              <span style={{ fontSize: "10px", fontFamily: mono, color: t3, fontWeight: 400, marginLeft: "5px" }}>submissions</span>
                            </div>
                            {c.status !== "rejected" && (
                              <button onClick={() => openCampaign(c.id)}
                                style={{ height: "30px", padding: "0 14px", background: "transparent", color: "#8aaeff", fontSize: "11px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.25)", borderRadius: "6px", cursor: "pointer" }}>
                                View Feedback & Progress →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Campaign detail */
                <div>
                  <button onClick={() => { setSelectedCampaignId(null); setCampaignDetail(null); setFundMsg(null) }}
                    style={{ fontSize: "11px", color: t2, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "16px", fontFamily: mono, display: "flex", alignItems: "center", gap: "4px" }}>
                    ← All Campaigns
                  </button>

                  {campaignDetailLoading || !campaignDetail ? (
                    <div style={{ padding: "60px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: t3 }}>Loading campaign data...</div>
                  ) : (() => {
                    const camp        = campaignDetail.campaign
                    const completions = campaignDetail.completions || []
                    const unrated     = completions.filter((c: any) => !c.builder_rating)

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                        {/* Campaign header card */}
                        <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "20px 22px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
                            <div>
                              <div style={{ fontSize: "16px", fontWeight: 700, color: t1, marginBottom: "3px" }}>{camp.title}</div>
                              {camp.tagline && <div style={{ fontSize: "12px", color: t2 }}>{camp.tagline}</div>}
                            </div>
                            <span style={{ fontSize: "9px", fontFamily: mono, padding: "3px 9px", borderRadius: "4px", flexShrink: 0, textTransform: "uppercase",
                              background: camp.status === "active" ? "rgba(0,184,122,0.1)" : camp.status === "approved" ? "rgba(26,86,255,0.1)" : camp.status === "pending_approval" ? "rgba(224,136,16,0.1)" : "rgba(107,125,168,0.1)",
                              color: camp.status === "active" ? green : camp.status === "approved" ? "#8aaeff" : camp.status === "pending_approval" ? "#e08810" : t3,
                              border: `1px solid ${camp.status === "active" ? "rgba(0,184,122,0.25)" : camp.status === "approved" ? "rgba(26,86,255,0.25)" : camp.status === "pending_approval" ? "rgba(224,136,16,0.25)" : bdr}` }}>
                              {camp.status === "pending_approval" ? "Pending Review" : camp.status === "approved" ? "Fund to Activate" : camp.status}
                            </span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "10px" }}>
                            {[
                              { label: "Submissions", value: completions.length.toString(), color: "#8aaeff" },
                              { label: "Unrated",     value: unrated.length.toString(), color: unrated.length > 0 ? "#e08810" : t3 },
                              { label: "Slots",       value: camp.total_slots ? `${camp.filled_slots || 0} / ${camp.total_slots}` : "Open", color: t1 },
                              { label: "Reward",      value: camp.reward_type === "usdc" && camp.reward_usdc_amount ? `$${camp.reward_usdc_amount} USDC` : camp.reward_type?.replace(/_/g," "), color: camp.reward_type === "usdc" ? green : t2 },
                            ].map(s => (
                              <div key={s.label} style={{ background: surf2, borderRadius: "8px", padding: "10px 12px", border: "1px solid " + bdr }}>
                                <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{s.label}</div>
                                <div style={{ fontSize: "15px", fontWeight: 700, color: s.color }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Fund msg banner */}
                        {fundMsg && (
                          <div style={{ padding: "12px 16px", borderRadius: "8px", fontSize: "12px", fontFamily: mono,
                            background: fundMsg.startsWith("✓") ? "rgba(0,184,122,0.06)" : "rgba(224,51,72,0.06)",
                            border: `1px solid ${fundMsg.startsWith("✓") ? "rgba(0,184,122,0.2)" : "rgba(224,51,72,0.2)"}`,
                            color: fundMsg.startsWith("✓") ? "#00d990" : "#e03348" }}>
                            {fundMsg}
                          </div>
                        )}

                        {/* USDC fund banner */}
                        {camp.reward_type === "usdc" && camp.reward_usdc_amount && (camp.status === "approved" || camp.status === "active") && !camp.deposit_tx_hash && !fundMsg?.startsWith("✓") && (
                          <div style={{ background: "rgba(0,184,122,0.04)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: "10px", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: "12px", fontWeight: 600, color: green, marginBottom: "2px" }}>Fund this campaign</div>
                              <div style={{ fontSize: "11px", fontFamily: mono, color: t3, lineHeight: 1.5 }}>
                                Deposit ${(camp.reward_usdc_amount * (camp.total_slots || 10)).toFixed(2)} USDC so testers can claim immediately on completion
                              </div>
                            </div>
                            <button onClick={() => fundCampaign(camp)} disabled={fundingCampaign}
                              style={{ height: "34px", padding: "0 16px", background: green, color: "#fff", fontSize: "12px", fontFamily: mono, border: "none", borderRadius: "7px", cursor: fundingCampaign ? "default" : "pointer", opacity: fundingCampaign ? 0.6 : 1, flexShrink: 0, fontWeight: 600 }}>
                              {fundingCampaign ? "Depositing..." : `Deposit $${(camp.reward_usdc_amount * (camp.total_slots || 10)).toFixed(2)} USDC →`}
                            </button>
                          </div>
                        )}

                        {/* Tester submissions */}
                        <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", overflow: "hidden" }}>
                          <div style={{ padding: "14px 20px", borderBottom: "1px solid " + bdr, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: "11px", fontFamily: mono, color: t2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              Tester Submissions · {completions.length}
                            </div>
                            {unrated.length > 0 && (
                              <div style={{ fontSize: "10px", fontFamily: mono, color: "#e08810", background: "rgba(224,136,16,0.08)", border: "1px solid rgba(224,136,16,0.2)", padding: "2px 8px", borderRadius: "4px" }}>
                                {unrated.length} awaiting your rating
                              </div>
                            )}
                          </div>

                          {completions.length === 0 ? (
                            <div style={{ padding: "48px", textAlign: "center", color: t3, fontFamily: mono, fontSize: "11px" }}>
                              No submissions yet — share your campaign link to get testers
                            </div>
                          ) : completions.map((comp: any, i: number) => {
                            const expanded    = expandedTesters.has(comp.tester_wallet)
                            const hasAnswers  = comp.review_answers && Object.keys(comp.review_answers).length > 0
                            const isRating    = dashRatingWallet === comp.tester_wallet
                            const scoreColor  = comp.auto_score > 70 ? "#00b87a" : comp.auto_score > 40 ? "#e08810" : "#e03348"

                            return (
                              <div key={comp.tester_wallet} style={{ borderBottom: i < completions.length - 1 ? "1px solid " + bdr : "none" }}>
                                {/* Tester row */}
                                <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                  {/* Avatar + score */}
                                  <div style={{ position: "relative", flexShrink: 0 }}>
                                    <WalletAvatar wallet={comp.tester_wallet} size={36} />
                                    <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: scoreColor, border: "2px solid var(--surf,#0a0e1a)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <span style={{ fontSize: "7px", fontFamily: mono, color: "#fff", fontWeight: 800, lineHeight: 1 }}>{comp.auto_score}</span>
                                    </div>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <a href={`/tester/${comp.tester_wallet}`}
                                      style={{ fontSize: "11px", fontFamily: mono, color: t1, marginBottom: "3px", display: "block", textDecoration: "none" }}
                                      onMouseEnter={e => (e.currentTarget.style.color = "#8aaeff")}
                                      onMouseLeave={e => (e.currentTarget.style.color = t1)}>
                                      {comp.tester_wallet.slice(0, 10)}...{comp.tester_wallet.slice(-6)}
                                    </a>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                      {comp.quality_score && <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>Quality: <span style={{ color: t2 }}>{Number(comp.quality_score).toFixed(1)}/5</span></span>}
                                      {comp.builder_rating && <span style={{ fontSize: "11px", color: "#c08828" }}>{"★".repeat(comp.builder_rating)}{"☆".repeat(5 - comp.builder_rating)}</span>}
                                      {comp.contract_verified !== null && comp.contract_verified !== undefined && (
                                        <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 6px", borderRadius: "4px",
                                          background: comp.contract_verified ? "rgba(0,184,122,0.08)" : "rgba(107,125,168,0.06)",
                                          color: comp.contract_verified ? green : t3,
                                          border: `1px solid ${comp.contract_verified ? "rgba(0,184,122,0.2)" : bdr}` }}>
                                          {comp.contract_verified ? "✓ on-chain" : "no on-chain"}
                                        </span>
                                      )}
                                      {camp.reward_type === "usdc" && camp.reward_usdc_amount && (
                                        <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 6px", borderRadius: "4px",
                                          background: comp.reward_delivered ? "rgba(0,184,122,0.1)" : "rgba(107,125,168,0.06)",
                                          color: comp.reward_delivered ? green : t3,
                                          border: `1px solid ${comp.reward_delivered ? "rgba(0,184,122,0.2)" : bdr}` }}>
                                          {comp.reward_delivered ? `✓ $${camp.reward_usdc_amount} claimed` : `$${camp.reward_usdc_amount} pending`}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                                    {hasAnswers && (
                                      <button onClick={() => toggleTester(comp.tester_wallet)}
                                        style={{ height: "28px", padding: "0 10px", background: expanded ? "rgba(26,86,255,0.1)" : "transparent", color: expanded ? "#8aaeff" : t2, fontSize: "10px", fontFamily: mono, border: "1px solid " + (expanded ? "rgba(26,86,255,0.25)" : bdr), borderRadius: "5px", cursor: "pointer" }}>
                                        {expanded ? "Hide ↑" : "Feedback ↓"}
                                      </button>
                                    )}
                                    {!comp.builder_rating && (
                                      <button onClick={() => { setDashRatingWallet(isRating ? "" : comp.tester_wallet); setDashRatingVal(0) }}
                                        style={{ height: "28px", padding: "0 10px", background: isRating ? "rgba(192,136,40,0.12)" : "transparent", color: isRating ? "#c08828" : t2, fontSize: "10px", fontFamily: mono, border: "1px solid " + (isRating ? "rgba(192,136,40,0.25)" : bdr), borderRadius: "5px", cursor: "pointer" }}>
                                        {isRating ? "Cancel" : "Rate ★"}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Feedback answers */}
                                {expanded && hasAnswers && (
                                  <div style={{ padding: "14px 20px 16px", borderTop: "1px solid " + bdr, background: surf2 }}>
                                    {camp.review_questions?.map((q: any) => {
                                      const ans = comp.review_answers?.[q.id]
                                      if (!ans) return null
                                      return (
                                        <div key={q.id} style={{ marginBottom: "12px" }}>
                                          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{q.label}</div>
                                          <div style={{ fontSize: "12px", color: t2, lineHeight: 1.7, whiteSpace: "pre-wrap", background: surf, border: "1px solid " + bdr, borderRadius: "7px", padding: "10px 12px" }}>{ans}</div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}

                                {/* Rating panel */}
                                {isRating && (
                                  <div style={{ padding: "14px 20px", borderTop: "1px solid " + bdr, background: "rgba(192,136,40,0.03)" }}>
                                    <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rate this tester's contribution</div>
                                    <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                                      {[1, 2, 3, 4, 5].map(n => (
                                        <button key={n} onClick={() => setDashRatingVal(n)}
                                          style={{ width: "36px", height: "36px", borderRadius: "8px", background: dashRatingVal >= n ? "rgba(192,136,40,0.2)" : surf2, border: `1px solid ${dashRatingVal >= n ? "rgba(192,136,40,0.4)" : bdr}`, color: dashRatingVal >= n ? "#c08828" : t3, fontSize: "16px", cursor: "pointer", flexShrink: 0 }}>
                                          ★
                                        </button>
                                      ))}
                                      <span style={{ fontSize: "12px", color: t3, fontFamily: mono, lineHeight: "36px", marginLeft: "4px" }}>
                                        {dashRatingVal > 0 ? ["","Poor","Fair","Good","Great","Excellent"][dashRatingVal] : ""}
                                      </span>
                                    </div>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: t2, cursor: "pointer", marginBottom: "10px" }}>
                                      <input type="checkbox" checked={dashRatingImpact} onChange={e => setDashRatingImpact(e.target.checked)} />
                                      Credit this tester — their feedback shaped a real product change
                                    </label>
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                      <button onClick={submitDashRating} disabled={!dashRatingVal || dashRatingLoading}
                                        style={{ height: "32px", padding: "0 16px", background: dashRatingVal ? "#1a56ff" : surf2, color: dashRatingVal ? "#fff" : t3, border: "none", borderRadius: "6px", fontSize: "12px", fontFamily: mono, cursor: dashRatingVal ? "pointer" : "default", fontWeight: 600 }}>
                                        {dashRatingLoading ? "Saving..." : "Save Rating"}
                                      </button>
                                      {dashRatingMsg && <span style={{ fontSize: "11px", color: green, fontFamily: mono }}>{dashRatingMsg}</span>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── EDIT LISTING ── */}
          {activeTab === "edit" && (
            <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "24px 26px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: t1, marginBottom: "4px" }}>Edit your listing</div>
              <div style={{ fontSize: "11px", fontFamily: mono, color: t3, marginBottom: "22px" }}>Changes go through admin review before going live</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {[
                  { key: "tagline",     label: "Tagline",          ph: "One-line description" },
                  { key: "website",     label: "Website",          ph: "https://..." },
                  { key: "twitter",     label: "X / Twitter",      ph: "@handle or https://x.com/..." },
                  { key: "github",      label: "GitHub",           ph: "https://github.com/..." },
                  { key: "discord",     label: "Discord",          ph: "https://discord.gg/..." },
                  { key: "contract",    label: "Primary Contract Address", ph: "0x..." },
                  { key: "city",        label: "City",             ph: "e.g. Lagos, Singapore, New York" },
                  { key: "country",     label: "Country",          ph: "e.g. Nigeria, Singapore, USA" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{f.label}</label>
                    <input
                      value={(editForm as any)[f.key]}
                      onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.ph}
                      style={inputStyle}
                    />
                  </div>
                ))}
                {/* Additional contracts */}
                <div>
                  <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Additional Contract Addresses</label>
                  {extraContracts.map((addr, i) => (
                    <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                      <input value={addr} onChange={e => setExtraContracts(p => p.map((c,j) => j===i ? e.target.value : c))} placeholder={`0x... (contract ${i+2})`} style={{ ...inputStyle, flex: 1 }} />
                      <button type="button" onClick={() => setExtraContracts(p => p.filter((_,j) => j!==i))}
                        style={{ height: "38px", padding: "0 12px", background: "rgba(224,51,72,0.08)", color: "#e03348", border: "1px solid rgba(224,51,72,0.2)", borderRadius: "7px", cursor: "pointer", fontSize: "13px", flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setExtraContracts(p => [...p, ""])}
                    style={{ height: "30px", padding: "0 14px", background: "rgba(26,86,255,0.07)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)", borderRadius: "6px", cursor: "pointer", fontSize: "10px", fontFamily: mono }}>
                    + Add another contract
                  </button>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="What does your project do?"
                    style={{ ...inputStyle, height: "100px", padding: "10px 12px", resize: "vertical", lineHeight: 1.6 } as React.CSSProperties}
                  />
                </div>
                <div style={{ padding: "10px 14px", background: "rgba(26,86,255,0.05)", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "7px", fontSize: "11px", fontFamily: mono, color: t3, lineHeight: 1.6 }}>
                  Location fields (city, country) are used to place your project on the Arc globe. Updates are reviewed within 24h.
                </div>
                {saveError    && <div style={{ fontSize: "12px", color: "#e03348", fontFamily: mono }}>{saveError}</div>}
                {saveSuccess  && <div style={{ fontSize: "12px", color: green, fontFamily: mono }}>✓ Changes submitted — pending admin approval</div>}
                <button onClick={saveEdit} disabled={saving}
                  style={{ height: "42px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: saving ? "not-allowed" : "pointer", fontFamily: mono, opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </ArcLayout>
  )
}

function ReviewCard({ r, surf, bdr, t2, t3, mono, green, showContact }: any) {
  return (
    <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "10px", padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>{r.wallet.slice(0,6)}...{r.wallet.slice(-4)}</span>
          {r.badge === "verified"  && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(0,184,122,0.1)", color: green, border: "1px solid rgba(0,184,122,0.2)" }}>✓ VERIFIED</span>}
          {r.badge === "arc_user"  && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(26,86,255,0.1)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)" }}>◆ ARC USER</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "#e08810" }}>{"★".repeat(Math.max(0,Math.min(5,r.rating||0)))}{"☆".repeat(Math.max(0,5-Math.min(5,r.rating||0)))}</span>
          <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>{r.category}</span>
        </div>
      </div>
      <p style={{ fontSize: "13px", color: t2, lineHeight: 1.7, margin: 0 }}>{r.review_text}</p>
      {showContact && r.contact && (
        <div style={{ marginTop: "10px", padding: "8px 12px", background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "6px", fontSize: "11px", fontFamily: mono, color: "#a855f7" }}>
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
      const res  = await fetch("/api/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, slug }) })
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
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && claim()} placeholder="you@email.com"
            style={{ height: "42px", background: surf, border: "1px solid " + bdr, borderRadius: "8px", padding: "0 14px", fontSize: "13px", fontFamily: mono, color: t1, outline: "none", width: "100%" }} />
          {error && <div style={{ fontSize: "12px", color: "#e03348" }}>{error}</div>}
          <button onClick={claim} disabled={loading}
            style={{ height: "42px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", fontFamily: mono, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Sending..." : "Send magic link →"}
          </button>
        </div>
      )}
    </div>
  )
}
