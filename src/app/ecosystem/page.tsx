"use client"
import { useEffect, useState, useRef } from "react"
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
  slug: string | null
  created_at?: string
  view_count?: number
}

interface TrendingProject {
  id: number
  name: string
  slug: string | null
  category: string
  logo_url: string | null
  color: string | null
  view_count: number
  tx_count: number
}

function imgSrc(url: string | null): string | null {
  if (!url) return null
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

const CATEGORIES = ["All", "Infrastructure", "DeFi", "AI", "Payments", "NFT", "Gaming", "Social", "Developer Tools", "Bridge", "Identity", "Wallet", "Exchange", "Lending", "Prediction Market", "RWA", "DAO", "Stablecoin", "Derivatives", "Insurance", "Launchpad", "Oracle", "Analytics", "Finance", "Trading", "Custody", "Other"]
const CAT_COLOR: Record<string, string> = {
  Infrastructure: "#1a56ff", DeFi: "#00d990", NFT: "#c08828",
  Payments: "#00d990", Gaming: "#a855f7", Social: "#ec4899",
  Finance: "#0ea5e9", Trading: "#f59e0b", Custody: "#6366f1",
}

export default function EcosystemPage() {
  const [mounted, setMounted]         = useState(false)
  const [projects, setProjects]       = useState<Project[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState("All")
  const [search, setSearch]           = useState("")
  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState({ name: "", tagline: "", description: "", category: "DeFi", website: "", twitter: "", github: "", discord: "", contract: "", email: "", city: "", country: "" })
  const [extraContracts, setExtraContracts] = useState<string[]>([])
  const [logoUrl, setLogoUrl]         = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [isUpdate, setIsUpdate]       = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [nameWarn, setNameWarn]       = useState("")
  const [contractErr, setContractErr] = useState("")
  const fileRef             = useRef<HTMLInputElement>(null)
  const existingNames       = useRef<Set<string>>(new Set())
  const existingContracts   = useRef<Set<string>>(new Set())
  const [trending, setTrending] = useState<TrendingProject[]>([])
  const [sortBy, setSortBy] = useState<"all"|"trending"|"new"|"official"|"verified"|"featured">("all")
  const [page, setPage] = useState(1)
  const [cols, setCols] = useState(4)
  const gridWrapRef = useRef<HTMLDivElement>(null)

  // Observe content area width → exact column count → always 6 complete rows
  useEffect(() => {
    if (!mounted) return
    const el = gridWrapRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      const w = el.clientWidth
      const c = Math.max(1, Math.floor((w + 12) / (280 + 12)))
      setCols(c)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [mounted])

  // Reset page when column count changes (window resize)
  useEffect(() => { setPage(1) }, [cols])

  const pageSize = cols * 6  // always exactly 6 full rows

  useEffect(() => {
    setMounted(true)
    // Deep-link support: /ecosystem?submit=1 opens the submission form
    // straight away (used by the "no project yet" empty state on /trials/create).
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      if (params.get("submit") === "1") {
        setShowForm(true)
        setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50)
      }
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    async function load() {
      setLoading(true)
      try {
        const res  = await fetch("/api/ecosystem")
        const data = await res.json()
        const loaded: Project[] = data.projects || []
        setProjects(loaded)
        setTrending(data.trending || [])
        // Build lookup sets for duplicate detection — done once, checked instantly
        existingNames.current     = new Set(loaded.map(p => p.name.toLowerCase().trim()))
        existingContracts.current = new Set(loaded.filter(p => p.contract).map(p => p.contract!.toLowerCase().trim()))
      } catch { setProjects([]) }
      finally { setLoading(false) }
    }
    load()
  }, [mounted])

  async function handleLogoUpload(file: File) {
    setUploading(true)
    const reader = new FileReader()
    reader.onload = e => setLogoPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res  = await fetch("/api/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (data.url) setLogoUrl(data.url)
      else { alert("Upload failed"); setLogoPreview(null) }
    } catch { alert("Upload failed"); setLogoPreview(null) }
    finally { setUploading(false) }
  }

  function checkName(val: string) {
    if (val.trim() && existingNames.current.has(val.toLowerCase().trim())) {
      setNameWarn("A project with this name already exists. If this is an update, use the same email you registered with.")
    } else {
      setNameWarn("")
    }
  }

  function checkContract(val: string) {
    if (val.trim() && existingContracts.current.has(val.toLowerCase().trim())) {
      setContractErr("This contract address is already registered. Use the same email to submit an update.")
    } else {
      setContractErr("")
    }
  }

  async function submitProject() {
    if (!form.name.trim())    { setSubmitError("Project name is required"); return }
    if (!form.tagline.trim()) { setSubmitError("Tagline is required"); return }
    if (!form.email.trim())   { setSubmitError("Contact email is required"); return }
    if (contractErr)          { setSubmitError(contractErr); return }
    setSubmitting(true)
    setSubmitError("")
    try {
      const res  = await fetch("/api/ecosystem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, logo_url: logoUrl, contracts: extraContracts.map(c=>c.trim()).filter(Boolean) }),
      })
      const data = await res.json()
      if (data.success) { setSubmitted(true); setIsUpdate(data.updated || false) }
      else setSubmitError(data.error || "Submission failed")
    } catch { setSubmitError("Network error — try again") }
    finally { setSubmitting(false) }
  }

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#05070f" }} />

  const mono   = "'DM Mono', monospace"
  const border = "rgba(128,128,128,0.1)"
  const surf   = "var(--surf, #080c1a)"
  const surf2  = "var(--surf2, #0c1122)"
  const t1     = "var(--t1, #e8ecff)"
  const t2     = "var(--t2, #6b7da8)"
  const t3     = "var(--t3, #2e3a5c)"
  const bdr    = "var(--bdr, rgba(255,255,255,0.06))"

  const filtered = projects.filter(p => {
    const matchCat    = filter === "All" || p.category === filter
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.tagline?.toLowerCase().includes(search.toLowerCase())
    const matchSort   = sortBy === "all" ? true
      : sortBy === "trending"  ? true
      : sortBy === "new"       ? (Date.now() - new Date(p.created_at || 0).getTime() < 90 * 24 * 60 * 60 * 1000)
      : sortBy === "official"  ? p.badge === "official"
      : sortBy === "verified"  ? p.badge === "verified"
      : sortBy === "featured"  ? p.featured
      : true
    return matchCat && matchSearch && matchSort
  }).sort((a, b) => {
    if (sortBy === "new") return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    if (sortBy === "trending") return (b.view_count || 0) - (a.view_count || 0)
    return 0
  })

  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated   = filtered.slice((page - 1) * pageSize, page * pageSize)

  function setFilterAndReset(val: string) { setFilter(val); setPage(1) }
  function setSortAndReset(val: typeof sortBy) { setSortBy(val); setPage(1) }
  function setSearchAndReset(val: string) { setSearch(val); setPage(1) }

  function LogoImg({ p, size }: { p: Project; size: number }) {
    const color = p.color || CAT_COLOR[p.category] || "#1a56ff"
    const [err, setErr] = useState(false)
    const proxied = imgSrc(p.logo_url)
    return (
      <div style={{ width: size, height: size, borderRadius: "12px", overflow: "hidden", background: (!proxied || err) ? color + "18" : "transparent", border: "1px solid " + color + "28", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, fontFamily: mono, color, flexShrink: 0 }}>
        {proxied && !err
          ? <img src={proxied} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setErr(true)} />
          : p.name[0]
        }
      </div>
    )
  }

  function ProjectCard({ p }: { p: Project }) {
    const color = p.color || CAT_COLOR[p.category] || "#1a56ff"
    const twitterUrl = p.twitter
      ? p.twitter.startsWith("http") ? p.twitter : "https://x.com/" + p.twitter.replace("@", "")
      : null

    return (
      <div
        onClick={() => window.location.href = `/ecosystem/${p.slug || p.id}`}
        onMouseEnter={e => { e.currentTarget.style.borderColor = color + "50"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)" }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none" }}
        style={{ background: surf, border: "1px solid " + border, borderRadius: "14px", overflow: "hidden", transition: "all .15s", display: "flex", flexDirection: "column", cursor: "pointer" }}>

        <div style={{ padding: "16px 16px 10px", display: "flex", alignItems: "center", gap: "12px" }}>
          <LogoImg p={p} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "-0.025em", color: t1 }}>{p.name}</div>
              {p.badge === "official"  && <span style={{ fontSize: "7px", fontFamily: mono, padding: "1px 5px", borderRadius: "3px", background: "rgba(26,86,255,0.12)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.25)", flexShrink: 0 }}>OFFICIAL</span>}
              {p.badge === "verified"  && <span style={{ fontSize: "7px", fontFamily: mono, padding: "1px 5px", borderRadius: "3px", background: "rgba(0,184,122,0.1)", color: "#00b87a", border: "1px solid rgba(0,184,122,0.25)", flexShrink: 0 }}>✓ VERIFIED</span>}
              {p.featured && <span style={{ fontSize: "7px", fontFamily: mono, padding: "1px 5px", borderRadius: "3px", background: "rgba(192,136,40,0.1)", color: "#c08828", border: "1px solid rgba(192,136,40,0.25)", flexShrink: 0 }}>FEATURED</span>}
            </div>
            <span style={{ fontSize: "8.5px", fontFamily: mono, padding: "2px 7px", borderRadius: "99px", background: color + "14", color, border: "1px solid " + color + "28" }}>{p.category}</span>
          </div>
        </div>

        <div style={{ padding: "0 16px 6px", fontSize: "12.5px", color: t1, fontWeight: 500, lineHeight: 1.5 }}>
          {p.tagline}
        </div>
        {p.description && (
          <div style={{ padding: "0 16px 14px", fontSize: "11.5px", color: "#6b7da8", lineHeight: 1.6, fontWeight: 300, flex: 1 }}>
            {p.description.slice(0, 120)}{p.description.length > 120 ? "..." : ""}
          </div>
        )}



        <div style={{ padding: "10px 12px", borderTop: "1px solid " + border, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {p.website  && <a href={p.website}  target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", fontFamily: mono, padding: "3px 9px", borderRadius: "5px", border: "1px solid " + border, color: t2, textDecoration: "none" }}>Website</a>}
          {twitterUrl && <a href={twitterUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", fontFamily: mono, padding: "3px 9px", borderRadius: "5px", border: "1px solid " + border, color: t2, textDecoration: "none" }}>𝕏</a>}
          {p.github   && <a href={p.github}   target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", fontFamily: mono, padding: "3px 9px", borderRadius: "5px", border: "1px solid " + border, color: t2, textDecoration: "none" }}>GitHub</a>}
          {p.discord  && <a href={p.discord}  target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", fontFamily: mono, padding: "3px 9px", borderRadius: "5px", border: "1px solid " + border, color: t2, textDecoration: "none" }}>Discord</a>}
          {p.contract && <span onClick={() => window.location.href = "/address/" + p.contract} style={{ fontSize: "10px", fontFamily: mono, padding: "3px 9px", borderRadius: "5px", border: "1px solid rgba(26,86,255,0.2)", color: "#8aaeff", cursor: "pointer" }}>Contract ↗</span>}
        </div>
      </div>
    )
  }

  function TrendingCard({ t, i }: { t: TrendingProject; i: number }) {
    const tc = t.color || CAT_COLOR[t.category] || "#1a56ff"
    const proxied = imgSrc(t.logo_url)
    const [imgErr, setImgErr] = useState(false)
    return (
      <div
        onClick={() => window.location.href = `/ecosystem/${t.slug || t.id}`}
        onMouseEnter={e => { e.currentTarget.style.borderColor = tc + "60"; e.currentTarget.style.transform = "translateY(-1px)" }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(224,136,16,0.2)"; e.currentTarget.style.transform = "none" }}
        style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "rgba(224,136,16,0.04)", border: "1px solid rgba(224,136,16,0.2)", borderRadius: "10px", cursor: "pointer", flexShrink: 0, transition: "all .13s", minWidth: "140px", maxWidth: "200px" }}>
        <div style={{ fontSize: "10px", fontFamily: mono, color: "rgba(224,136,16,0.5)", fontWeight: 700, width: "14px", flexShrink: 0 }}>#{i + 1}</div>
        <div style={{ width: "26px", height: "26px", borderRadius: "7px", overflow: "hidden", background: tc + "18", border: "1px solid " + tc + "28", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, fontFamily: mono, color: tc, flexShrink: 0 }}>
          {proxied && !imgErr
            ? <img src={proxied} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setImgErr(true)} />
            : t.name[0]
          }
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
          <div style={{ fontSize: "9.5px", fontFamily: mono, color: "#e08810", opacity: 0.7 }}>
            
          </div>
        </div>
      </div>
    )
  }

  const inputStyle = { width: "100%", height: "36px", background: surf2, border: "1px solid " + border, borderRadius: "7px", padding: "0 12px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none" } as React.CSSProperties

  return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "20px 16px 60px", maxWidth: "100%" }}>

        {/* HEADER */}
        <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Discover</div>
            <div style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.04em", marginBottom: "6px", color: t1 }}>Arc Ecosystem</div>
            <div style={{ fontSize: "13px", color: t2, fontWeight: 300, maxWidth: "520px", lineHeight: 1.65 }}>
              Every project building on Arc. DeFi, NFTs, payments, and infrastructure running on USDC gas with sub-second finality.
            </div>
          </div>
          <button onClick={() => { setShowForm(!showForm); setSubmitted(false); setSubmitError(""); setNameWarn(""); setContractErr("") }}
            style={{ height: "40px", padding: "0 20px", background: showForm ? "transparent" : "#1a56ff", color: showForm ? t2 : "#fff", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (showForm ? border : "#1a56ff"), borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif", whiteSpace: "nowrap", transition: "all .13s", flexShrink: 0 }}>
            {showForm ? "Cancel" : "+ Submit Project"}
          </button>
        </div>

        {/* SUBMIT FORM */}
        {showForm && (
          <div style={{ background: surf, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "14px", overflow: "hidden", marginBottom: "28px", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, #1a56ff, #4070ff 40%, transparent)" }} />
            <div style={{ padding: "18px 20px", borderBottom: "1px solid " + border }}>
              <div style={{ fontSize: "14px", fontWeight: 600, letterSpacing: "-0.025em", marginBottom: "4px", color: t1 }}>Submit your project</div>
              <div style={{ fontSize: "12px", color: t2, fontWeight: 300 }}>Reviewed before going live · Usually 24 hours</div>
            </div>

            {submitted ? (
              <div style={{ padding: "48px", textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "14px" }}>{isUpdate ? "✏️" : "🎉"}</div>
                <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "6px", color: t1 }}>{isUpdate ? "Update submitted!" : "Submission received!"}</div>
                <div style={{ fontSize: "13px", color: t2, fontWeight: 300 }}>Your project will appear after review.</div>
              </div>
            ) : (
              <div style={{ padding: "20px" }}>
                {/* Logo upload */}
                <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Logo</label>
                    <div onClick={() => fileRef.current?.click()}
                      style={{ width: "80px", height: "80px", borderRadius: "12px", border: "2px dashed rgba(26,86,255,0.3)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: logoPreview ? "transparent" : "rgba(26,86,255,0.04)" }}>
                      {logoPreview
                        ? <img src={logoPreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <><div style={{ fontSize: "20px", color: t3 }}>+</div><div style={{ fontSize: "8px", fontFamily: mono, color: t3, textAlign: "center", padding: "0 4px" }}>{uploading ? "..." : "Upload"}</div></>
                      }
                    </div>
                    <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]) }} />
                    {logoUrl && <div style={{ fontSize: "9px", fontFamily: mono, color: "#00d990", marginTop: "4px" }}>✓ Uploaded</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Project Name *</label>
                      <input style={{ ...inputStyle, borderColor: nameWarn ? "rgba(224,136,16,0.5)" : undefined }} value={form.name} onChange={e => { setForm(p => ({ ...p, name: e.target.value })); checkName(e.target.value) }} placeholder="e.g. ArcSwap" />
                      {nameWarn && <div style={{ fontSize: "10px", fontFamily: mono, color: "#e08810", marginTop: "4px", lineHeight: 1.5 }}>⚠ {nameWarn}</div>}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Tagline *</label>
                      <input style={inputStyle} value={form.tagline} onChange={e => setForm(p => ({ ...p, tagline: e.target.value }))} placeholder="One-line description" />
                    </div>
                  </div>
                </div>

                {/* Fields grid — single column on mobile */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "10px" }}>
                  {[
                    { k: "website",  l: "Website",      p: "https://..." },
                    { k: "twitter",  l: "Twitter / X",  p: "@handle" },
                    { k: "github",   l: "GitHub",        p: "https://github.com/..." },
                    { k: "discord",  l: "Discord",       p: "https://discord.gg/..." },
                    { k: "email",    l: "Contact Email *", p: "you@email.com" },
                    { k: "city",     l: "City",          p: "e.g. Lagos" },
                    { k: "country",  l: "Country",       p: "e.g. Nigeria" },
                  ].map((f: any) => (
                    <div key={f.k}>
                      <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{f.l}</label>
                      <input style={inputStyle} value={(form as any)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.p} spellCheck={false} />
                    </div>
                  ))}
                  {/* Contract — separate so we can show inline duplicate error */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Contract Address</label>
                    <input style={{ ...inputStyle, borderColor: contractErr ? "rgba(224,51,72,0.5)" : undefined }} value={form.contract} onChange={e => { setForm(p => ({ ...p, contract: e.target.value })); checkContract(e.target.value) }} placeholder="0x... (primary contract)" spellCheck={false} />
                    {contractErr && <div style={{ fontSize: "10px", fontFamily: mono, color: "#e03348", marginTop: "4px", lineHeight: 1.5 }}>✗ {contractErr}</div>}
                    {/* Extra contracts */}
                    {extraContracts.map((addr, i) => (
                      <div key={i} style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                        <input style={{ ...inputStyle, flex: 1 }} value={addr} onChange={e => setExtraContracts(p => p.map((c, j) => j===i ? e.target.value : c))} placeholder={`0x... (contract ${i+2})`} spellCheck={false} />
                        <button type="button" onClick={() => setExtraContracts(p => p.filter((_,j) => j!==i))}
                          style={{ height: "36px", padding: "0 10px", background: "rgba(224,51,72,0.08)", color: "#e03348", border: "1px solid rgba(224,51,72,0.2)", borderRadius: "7px", cursor: "pointer", fontSize: "13px", flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setExtraContracts(p => [...p, ""])}
                      style={{ marginTop: "8px", height: "28px", padding: "0 12px", background: "rgba(26,86,255,0.07)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)", borderRadius: "6px", cursor: "pointer", fontSize: "10px", fontFamily: mono }}>
                      + Add another contract
                    </button>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Category</label>
                    <select style={{ ...inputStyle }} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                      {["Infrastructure","DeFi","AI","Payments","NFT","Gaming","Social","Developer Tools","Bridge","Identity","Wallet","Exchange","Lending","Prediction Market","RWA","DAO","Stablecoin","Derivatives","Insurance","Launchpad","Oracle","Analytics","Finance","Trading","Custody","Other"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Description</label>
                  <textarea style={{ ...inputStyle, height: "70px", padding: "8px 12px", resize: "vertical", lineHeight: 1.65 } as React.CSSProperties} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What does your project do?" />
                </div>

                {submitError && (
                  <div style={{ padding: "10px 13px", background: "rgba(224,51,72,0.08)", border: "1px solid rgba(224,51,72,0.2)", borderRadius: "7px", fontSize: "12px", color: "#e03348", marginBottom: "12px" }}>
                    {submitError}
                  </div>
                )}

                <button onClick={submitProject} disabled={submitting || uploading}
                  style={{ width: "100%", height: "42px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: (submitting || uploading) ? "not-allowed" : "pointer", fontFamily: "'Geist', sans-serif", opacity: (submitting || uploading) ? .7 : 1 }}>
                  {submitting ? "Submitting..." : "Submit Project"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TRENDING STRIP */}
        {trending.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span style={{ fontSize: "11px", fontFamily: mono, color: "#e08810", letterSpacing: "0.06em" }}>TRENDING</span>
              <div style={{ flex: 1, height: "1px", background: "rgba(224,136,16,0.15)" }} />
            </div>
            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px", WebkitOverflowScrolling: "touch" as any }}>
              {trending.map((t, i) => <TrendingCard key={t.id} t={t} i={i} />)}
            </div>
          </div>
        )}

        {/* SORT TABS */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          {([
            { key: "all",      label: "All" },
            { key: "trending", label: "Trending" },
            { key: "new",      label: "New" },
            { key: "featured", label: "Featured" },
            { key: "verified", label: "Verified" },
            { key: "official", label: "Official" },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setSortAndReset(tab.key)}
              style={{ height: "28px", padding: "0 14px", background: sortBy === tab.key ? "rgba(26,86,255,0.12)" : "transparent", color: sortBy === tab.key ? "#8aaeff" : t2, fontSize: "11.5px", fontFamily: mono, border: "1px solid " + (sortBy === tab.key ? "rgba(26,86,255,0.35)" : border), borderRadius: "6px", cursor: "pointer", transition: "all .12s", whiteSpace: "nowrap", fontWeight: sortBy === tab.key ? 600 : 400 }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* CATEGORY FILTERS — horizontal scroll on mobile */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "8px", WebkitOverflowScrolling: "touch" as any }}>
            {CATEGORIES.map((cat: any) => (
              <button key={cat} onClick={() => setFilterAndReset(cat)}
                style={{ height: "30px", padding: "0 14px", background: filter === cat ? "#1a56ff" : "transparent", color: filter === cat ? "#fff" : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + (filter === cat ? "#1a56ff" : border), borderRadius: "99px", cursor: "pointer", transition: "all .12s", whiteSpace: "nowrap", flexShrink: 0 }}>
                {cat}
              </button>
            ))}
          </div>
          {/* Search */}
          <div style={{ position: "relative", marginTop: "8px" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: t3, pointerEvents: "none", lineHeight: 1 }}>⌕</span>
            <input
              style={{ width: "100%", height: "38px", background: surf, border: "1px solid " + border, borderRadius: "8px", padding: "0 36px 0 32px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none", boxSizing: "border-box" }}
              value={search} onChange={e => setSearchAndReset(e.target.value)} placeholder="Search projects by name or description..."
            />
            {search && (
              <button onClick={() => setSearchAndReset("")}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t3, cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: "2px 4px" }}>
                ×
              </button>
            )}
          </div>
        </div>

        {/* PROJECT GRID — ref wrapper always rendered so ResizeObserver can measure width */}
        <div ref={gridWrapRef}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: t3 }}>Loading Arc Ecosystem...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px", color: t1 }}>No projects found</div>
            <div style={{ fontSize: "12px", color: t2, fontWeight: 300 }}>Try a different filter or be the first to submit.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
              {paginated.map(p => <ProjectCard key={p.id} p={p} />)}
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "24px", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>
                  {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} projects
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ height: "30px", padding: "0 14px", background: "transparent", color: page === 1 ? t3 : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + border, borderRadius: "6px", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? .4 : 1 }}>
                    ← Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1).reduce<(number|"…")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("…")
                    acc.push(n)
                    return acc
                  }, []).map((n, i) => (
                    n === "…"
                      ? <span key={"ellipsis-" + i} style={{ fontSize: "11px", fontFamily: mono, color: t3, padding: "0 4px" }}>…</span>
                      : <button key={n} onClick={() => setPage(n as number)}
                          style={{ width: "30px", height: "30px", background: page === n ? "rgba(26,86,255,0.15)" : "transparent", color: page === n ? "#8aaeff" : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + (page === n ? "rgba(26,86,255,0.35)" : border), borderRadius: "6px", cursor: "pointer", fontWeight: page === n ? 600 : 400 }}>
                          {n}
                        </button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ height: "30px", padding: "0 14px", background: "transparent", color: page === totalPages ? t3 : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + border, borderRadius: "6px", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? .4 : 1 }}>
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>{/* end gridWrapRef */}

        {/* CTA */}
        <div style={{ marginTop: "36px", background: "linear-gradient(135deg, rgba(26,86,255,0.08) 0%, rgba(0,184,122,0.06) 100%)", border: "1px solid rgba(26,86,255,0.18)", borderRadius: "14px", padding: "24px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "-0.03em", marginBottom: "6px", color: t1 }}>Building on Arc?</div>
            <div style={{ fontSize: "13px", color: t2, fontWeight: 300, maxWidth: "400px", lineHeight: 1.65 }}>List your project and get discovered by every Arc user and builder. Free, takes 2 minutes.</div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexShrink: 0, flexWrap: "wrap" }}>
            <button onClick={() => { setShowForm(true); setSubmitted(false); setSubmitError(""); setNameWarn(""); setContractErr(""); window.scrollTo({ top: 0, behavior: "smooth" }) }}
              style={{ height: "40px", padding: "0 20px", background: "#1a56ff", color: "#fff", fontSize: "12.5px", fontWeight: 600, border: "none", borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif", whiteSpace: "nowrap" }}>
              Submit Project
            </button>
            <button onClick={() => window.location.href = "/registry"}
              style={{ height: "40px", padding: "0 20px", background: "transparent", color: "#8aaeff", fontSize: "12.5px", fontWeight: 600, border: "1px solid rgba(26,86,255,0.3)", borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif", whiteSpace: "nowrap" }}>
              Verify Contract
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 480px) {
          /* Hide scrollbar on category pills but keep scrolling */
          div::-webkit-scrollbar { display: none; }
        }
      `}</style>
    </ArcLayout>
  )
}
