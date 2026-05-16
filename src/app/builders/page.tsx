"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

interface Builder {
  address: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  twitter: string | null
  github: string | null
  website: string | null
  verified: boolean
  claimed_at: string
  project_count: number
}

function dicebear(address: string) {
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${address}&backgroundColor=0e1224&radius=50`
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4)
}

export default function BuildersPage() {
  const [builders, setBuilders] = useState<Builder[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")

  useEffect(() => {
    fetch("/api/builders")
      .then(r => r.json())
      .then(d => setBuilders(d.builders || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const mono  = "'DM Mono', monospace"
  const sans  = "'Geist', system-ui, sans-serif"
  const arc   = "#1a56ff"
  const usdc  = "#00b87a"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"

  const filtered = builders.filter(b => {
    if (!search) return true
    const q = search.toLowerCase()
    return (b.display_name || b.address).toLowerCase().includes(q) || b.address.toLowerCase().includes(q)
  })

  return (
    <ArcLayout active="builders">
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 20px 60px" }}>

        {/* HEADER */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "8px" }}>
            <div>
              <div style={{ fontSize: "10px", fontFamily: mono, color: t3, letterSpacing: "0.1em", marginBottom: "6px" }}>ARC TESTNET</div>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 700, color: t1, letterSpacing: "-0.03em" }}>
                Builder Profiles
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "rgba(26,86,255,0.06)", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "8px" }}>
              <span style={{ fontSize: "18px", fontWeight: 700, color: "#8aaeff" }}>{builders.length}</span>
              <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>BUILDERS</span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: t2, lineHeight: 1.7 }}>
            Developers and builders who have claimed their profile on Arc Testnet.
          </p>
        </div>

        {/* SEARCH */}
        <div style={{ position: "relative", marginBottom: "20px" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or address…"
            style={{ width: "100%", height: "40px", background: surf, border: "1px solid " + bdr, borderRadius: "10px", padding: "0 14px 0 38px", fontSize: "13px", fontFamily: mono, color: t1, outline: "none", boxSizing: "border-box", transition: "border-color .12s" }}
            onFocus={e => e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)"}
            onBlur={e => e.currentTarget.style.borderColor = bdr}
          />
          <svg style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", opacity: .35, pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t1} strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </div>

        {/* GRID */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: "120px", background: surf, border: "1px solid " + bdr, borderRadius: "14px", opacity: .4 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: t3 }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>◎</div>
            <div style={{ fontFamily: mono, fontSize: "12px" }}>
              {search ? "No builders match your search" : "No builders have claimed a profile yet"}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
            {filtered.map(b => (
              <a key={b.address} href={`/builder/${b.address}`}
                style={{ display: "flex", flexDirection: "column", padding: "18px", background: surf, border: "1px solid " + bdr, borderRadius: "14px", textDecoration: "none", transition: "border-color .12s, transform .1s", minHeight: "180px" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.3)"; e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.transform = "translateY(0)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <img
                    src={b.avatar_url || dicebear(b.address)}
                    alt={b.display_name || b.address}
                    onError={e => { (e.target as HTMLImageElement).src = dicebear(b.address) }}
                    style={{ width: "44px", height: "44px", borderRadius: "50%", border: "1px solid " + bdr, background: surf2, flexShrink: 0, objectFit: "cover" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {b.display_name || shortAddr(b.address)}
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "2px" }}>
                      {shortAddr(b.address)}
                    </div>
                  </div>
                </div>

                {/* Bio area always reserves space — keeps every card the same height regardless of content */}
                <p style={{ margin: "0 0 12px", fontSize: "12px", color: b.bio ? t2 : "transparent", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", flex: 1, minHeight: "38px" }}>
                  {b.bio || "—"}
                </p>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {b.twitter && (
                      <span style={{ fontSize: "9px", fontFamily: mono, color: t3, padding: "2px 6px", background: surf2, border: "1px solid " + bdr, borderRadius: "4px" }}>
                        𝕏
                      </span>
                    )}
                    {b.github && (
                      <span style={{ fontSize: "9px", fontFamily: mono, color: t3, padding: "2px 6px", background: surf2, border: "1px solid " + bdr, borderRadius: "4px" }}>
                        GH
                      </span>
                    )}
                  </div>
                  {b.project_count > 0 && (
                    <span style={{ fontSize: "9px", fontFamily: mono, color: usdc, padding: "2px 7px", background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.15)", borderRadius: "4px" }}>
                      {b.project_count} {b.project_count === 1 ? "project" : "projects"}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </ArcLayout>
  )
}
