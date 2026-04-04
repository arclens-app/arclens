$content = @'
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
}

const CAT_COLOR: Record<string, string> = {
  Infrastructure: "#1a56ff", DeFi: "#00d990", NFT: "#c08828",
  Payments: "#00d990", Gaming: "#a855f7", Social: "#ec4899",
  AI: "#8aaeff", Bridge: "#e08810",
}

// Simple device ID using localStorage
function getDeviceId(): string {
  if (typeof window === "undefined") return ""
  let id = localStorage.getItem("arclens-device-id")
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem("arclens-device-id", id)
  }
  return id
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject]   = useState<Project | null>(null)
  const [related, setRelated]   = useState<RelatedProject[]>([])
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [viewCount, setViewCount] = useState(0)
  const [copied, setCopied]     = useState(false)
  const [mounted, setMounted]   = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || !id) return

    async function load() {
      setLoading(true)
      try {
        const res  = await fetch(`/api/ecosystem/${id}`)
        if (!res.ok) { setNotFound(true); return }
        const data = await res.json()
        setProject(data.project)
        setRelated(data.related || [])
        setViewCount(data.project.view_count || 0)

        // Record view
        const deviceId = getDeviceId()
        if (deviceId) {
          const viewRes  = await fetch(`/api/ecosystem/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId }),
          })
          const viewData = await viewRes.json()
          setViewCount(viewData.viewCount || 0)
        }
      } catch { setNotFound(true) }
      finally { setLoading(false) }
    }

    load()
  }, [mounted, id])

  function share() {
    const url  = `https://arclenz.xyz/ecosystem/${id}`
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
          style={{ height: "40px", padding: "0 24px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "'Geist', sans-serif" }}>
          Browse Ecosystem
        </button>
      </div>
    </ArcLayout>
  )

  const color      = project.color || CAT_COLOR[project.category] || "#1a56ff"
  const twitterUrl = project.twitter
    ? project.twitter.startsWith("http") ? project.twitter : "https://x.com/" + project.twitter.replace("@", "")
    : null
  const proxiedLogo = project.logo_url ? `/api/image-proxy?url=${encodeURIComponent(project.logo_url)}` : null

  return (
    <ArcLayout active="ecosystem">
      <div style={{ padding: "24px 20px 60px", maxWidth: "860px", margin: "0 auto" }}>

        {/* BACK */}
        <button onClick={() => window.location.href = "/ecosystem"}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: t3, cursor: "pointer", fontSize: "12px", fontFamily: mono, marginBottom: "24px", padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = t2)}
          onMouseLeave={e => (e.currentTarget.style.color = t3)}>
          ← Back to Ecosystem
        </button>

        {/* HERO CARD */}
        <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "16px", overflow: "hidden", marginBottom: "16px", position: "relative" }}>
          {/* color accent top bar */}
          <div style={{ height: "3px", background: `linear-gradient(90deg, ${color}, transparent)` }} />

          <div style={{ padding: "28px 28px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>

              {/* LOGO */}
              <div style={{ width: "80px", height: "80px", borderRadius: "18px", overflow: "hidden", background: color + "18", border: "1px solid " + color + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", fontWeight: 700, fontFamily: mono, color, flexShrink: 0 }}>
                {proxiedLogo
                  ? <img src={proxiedLogo} alt={project.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none" }} />
                  : project.name[0]
                }
              </div>

              {/* NAME + BADGES */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.04em", color: t1, margin: 0 }}>{project.name}</h1>
                  {project.badge === "official"  && <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(26,86,255,0.12)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.25)" }}>OFFICIAL</span>}
                  {project.badge === "verified"  && <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(0,184,122,0.1)", color: "#00b87a", border: "1px solid rgba(0,184,122,0.25)" }}>✓ VERIFIED</span>}
                  {project.featured && <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 8px", borderRadius: "4px", background: "rgba(192,136,40,0.1)", color: "#c08828", border: "1px solid rgba(192,136,40,0.25)" }}>FEATURED</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "9px", fontFamily: mono, padding: "3px 10px", borderRadius: "99px", background: color + "14", color, border: "1px solid " + color + "28" }}>{project.category}</span>
                  <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>Listed {new Date(project.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                </div>
                <p style={{ fontSize: "15px", color: t2, fontWeight: 400, lineHeight: 1.6, margin: 0 }}>{project.tagline}</p>
              </div>

              {/* STATS */}
              <div style={{ display: "flex", gap: "16px", flexShrink: 0, flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#8aaeff", fontFamily: mono }}>{viewCount.toLocaleString()}</div>
                  <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Views</div>
                </div>
                {project.txCount && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: usdc, fontFamily: mono }}>{Number(project.txCount).toLocaleString()}</div>
                    <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Txns</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DIVIDER */}
          <div style={{ height: "1px", background: bdr }} />

          {/* LINKS ROW */}
          <div style={{ padding: "16px 28px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {project.website  && <a href={project.website}  target="_blank" rel="noopener noreferrer" style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "rgba(26,86,255,0.08)", color: "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "7px", textDecoration: "none", gap: "6px" }}>🌐 Website</a>}
            {twitterUrl        && <a href={twitterUrl}       target="_blank" rel="noopener noreferrer" style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "transparent", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", textDecoration: "none", gap: "6px" }}>𝕏 Twitter</a>}
            {project.github    && <a href={project.github}   target="_blank" rel="noopener noreferrer" style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "transparent", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", textDecoration: "none", gap: "6px" }}>⌥ GitHub</a>}
            {project.discord   && <a href={project.discord}  target="_blank" rel="noopener noreferrer" style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "transparent", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", textDecoration: "none", gap: "6px" }}>Discord</a>}
            {project.contract  && <button onClick={() => window.location.href = "/address/" + project.contract} style={{ height: "34px", padding: "0 16px", display: "flex", alignItems: "center", background: "transparent", color: "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "7px", cursor: "pointer", gap: "6px" }}>✦ Contract ↗</button>}

            {/* spacer */}
            <div style={{ flex: 1 }} />

            {/* share buttons */}
            <button onClick={share}
              style={{ height: "34px", padding: "0 16px", background: "#1a56ff", color: "#fff", fontSize: "12px", fontFamily: mono, border: "none", borderRadius: "7px", cursor: "pointer", gap: "6px", display: "flex", alignItems: "center" }}>
              Share on 𝕏
            </button>
            <button onClick={copyLink}
              style={{ height: "34px", padding: "0 16px", background: "transparent", color: copied ? usdc : t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + (copied ? "rgba(0,184,122,0.3)" : bdr), borderRadius: "7px", cursor: "pointer" }}>
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
            <button
              onClick={() => window.location.href = "/address/" + project.contract}
              style={{ marginTop: "14px", height: "34px", padding: "0 16px", background: "rgba(26,86,255,0.06)", color: "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "7px", cursor: "pointer" }}>
              View on ArcLens Explorer ↗
            </button>
          </div>
        )}

        {/* EMBED BADGE */}
        <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", padding: "20px 28px", marginBottom: "16px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>Embed on your site</div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
            {/* preview badge */}
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
            onClick={() => { navigator.clipboard.writeText(`<a href="https://arclenz.xyz/ecosystem/${id}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#04060f;border:1px solid rgba(26,86,255,0.3);border-radius:8px;text-decoration:none;font-family:monospace"><span style="width:8px;height:8px;border-radius:50%;background:#00b87a;display:inline-block"></span><span style="color:#e8ecff;font-weight:600">${project.name}</span><span style="color:#6b7da8">on ArcLens</span></a>`); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            style={{ marginTop: "10px", height: "30px", padding: "0 14px", background: "transparent", color: t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "6px", cursor: "pointer" }}>
            Copy embed code
          </button>
        </div>

        {/* RELATED PROJECTS */}
        {related.length > 0 && (
          <div>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>
              More in {project.category}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
              {related.map(r => {
                const rc = r.color || CAT_COLOR[r.category] || "#1a56ff"
                const rLogo = r.logo_url ? `/api/image-proxy?url=${encodeURIComponent(r.logo_url)}` : null
                return (
                  <div key={r.id}
                    onClick={() => window.location.href = `/ecosystem/${r.id}`}
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
      </div>
    </ArcLayout>
  )
}

'@
[System.IO.File]::WriteAllText(
    (Join-Path (Get-Location).Path "src\app\ecosystem\[id]\page.tsx"),
    $content,
    [System.Text.Encoding]::UTF8
)
Write-Host "Done - file written"
