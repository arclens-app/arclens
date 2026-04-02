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
}

const CATEGORIES = ["All", "Infrastructure", "DeFi", "AI", "Payments", "NFT", "Gaming", "Social", "Developer Tools", "Bridge", "Identity", "Wallet", "Exchange", "Lending", "Analytics", "Other"]
const CAT_COLOR: Record<string, string> = {
  Infrastructure: "#1a56ff", DeFi: "#00d990", NFT: "#c08828",
  Payments: "#00d990", Gaming: "#a855f7", Social: "#ec4899",
}

export default function EcosystemPage() {
  const [mounted, setMounted]         = useState(false)
  const [projects, setProjects]       = useState<Project[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState("All")
  const [search, setSearch]           = useState("")
  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState({ name: "", tagline: "", description: "", category: "DeFi", website: "", twitter: "", github: "", discord: "", contract: "", email: "" })
  const [logoUrl, setLogoUrl]         = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [isUpdate, setIsUpdate]       = useState(false)
  const [submitError, setSubmitError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    async function load() {
      setLoading(true)
      try {
        const res  = await fetch("/api/ecosystem")
        const data = await res.json()
        setProjects(data.projects || [])
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

  async function submitProject() {
    if (!form.name.trim())    { setSubmitError("Project name is required"); return }
    if (!form.tagline.trim()) { setSubmitError("Tagline is required"); return }
    setSubmitting(true)
    setSubmitError("")
    try {
      const res  = await fetch("/api/ecosystem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, logo_url: logoUrl }),
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
    return matchCat && matchSearch
  })

  function LogoImg({ p, size }: { p: Project; size: number }) {
    const color = p.color || CAT_COLOR[p.category] || "#1a56ff"
    const [err, setErr] = useState(false)
    const proxied = p.logo_url ? `/api/image-proxy?url=${encodeURIComponent(p.logo_url)}` : null
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
        onMouseEnter={e => { e.currentTarget.style.borderColor = color + "50"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)" }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none" }}
        style={{ background: surf, border: "1px solid " + border, borderRadius: "14px", overflow: "hidden", transition: "all .15s", display: "flex", flexDirection: "column" }}>

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

        <div style={{ padding: "0 16px 8px", fontSize: "12.5px", color: t1, fontWeight: 500, lineHeight: 1.5 }}>
          {p.tagline}
        </div>

        {p.description && (
          <div style={{ padding: "0 16px 14px", fontSize: "11.5px", color: t2, lineHeight: 1.65, fontWeight: 300, flex: 1 }}>
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
          <button onClick={() => { setShowForm(!showForm); setSubmitted(false); setSubmitError("") }}
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
                      <input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. ArcSwap" />
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
                    { k: "website",  l: "Website",          p: "https://..." },
                    { k: "twitter",  l: "Twitter / X",      p: "@handle" },
                    { k: "github",   l: "GitHub",           p: "https://github.com/..." },
                    { k: "discord",  l: "Discord",          p: "https://discord.gg/..." },
                    { k: "contract", l: "Contract Address", p: "0x... on Arc" },
                    { k: "email",    l: "Contact Email",    p: "you@email.com" },
                  ].map((f: any) => (
                    <div key={f.k}>
                      <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{f.l}</label>
                      <input style={inputStyle} value={(form as any)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.p} spellCheck={false} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Category</label>
                    <select style={{ ...inputStyle }} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                      {["Infrastructure","DeFi","AI","Payments","NFT","Gaming","Social","Developer Tools","Bridge","Identity","Wallet","Exchange","Lending","Analytics","Other"].map(c => <option key={c} value={c}>{c}</option>)}
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

        {/* CATEGORY FILTERS — horizontal scroll on mobile */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "8px", WebkitOverflowScrolling: "touch" as any }}>
            {CATEGORIES.map((cat: any) => (
              <button key={cat} onClick={() => setFilter(cat)}
                style={{ height: "30px", padding: "0 14px", background: filter === cat ? "#1a56ff" : "transparent", color: filter === cat ? "#fff" : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + (filter === cat ? "#1a56ff" : border), borderRadius: "99px", cursor: "pointer", transition: "all .12s", whiteSpace: "nowrap", flexShrink: 0 }}>
                {cat}
              </button>
            ))}
          </div>
          {/* Search */}
          <input
            style={{ width: "100%", height: "36px", background: surf, border: "1px solid " + border, borderRadius: "8px", padding: "0 12px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none", marginTop: "8px" }}
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..."
          />
        </div>

        {/* PROJECT GRID — responsive: 1 col mobile, 2 col tablet, 3-4 col desktop */}
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: t3 }}>Loading Arc Ecosystem...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px", color: t1 }}>No projects yet</div>
            <div style={{ fontSize: "12px", color: t2, fontWeight: 300 }}>Be the first to submit a project on Arc.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
            {filtered.map(p => <ProjectCard key={p.id} p={p} />)}
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: "36px", background: "linear-gradient(135deg, rgba(26,86,255,0.08) 0%, rgba(0,184,122,0.06) 100%)", border: "1px solid rgba(26,86,255,0.18)", borderRadius: "14px", padding: "24px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "-0.03em", marginBottom: "6px", color: t1 }}>Building on Arc?</div>
            <div style={{ fontSize: "13px", color: t2, fontWeight: 300, maxWidth: "400px", lineHeight: 1.65 }}>List your project and get discovered by every Arc user and builder. Free, takes 2 minutes.</div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexShrink: 0, flexWrap: "wrap" }}>
            <button onClick={() => { setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }) }}
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