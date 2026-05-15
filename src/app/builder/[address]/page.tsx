"use client"
import { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import { useArcStore } from "@/store/arc"

interface BuilderProfile {
  address: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  twitter: string | null
  github: string | null
  website: string | null
  telegram: string | null
  verified: boolean
  claimed_at: string | null
  updated_at: string
}

interface Project {
  id: number
  name: string
  slug: string
  tagline: string
  category: string
  logo_url: string | null
  website: string | null
  featured: boolean
  badge: string | null
  view_count: number
}

interface Stats {
  contractsDeployed: number
  projectsShipped:   number
  contractActivity:  number
  firstSeen:         string | null
}

function dicebear(address: string) {
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${address}&backgroundColor=0e1224&radius=50`
}

function shortAddr(addr: string) {
  return addr.slice(0, 8) + "…" + addr.slice(-6)
}

function cleanHandle(val: string) {
  return val.replace(/^[@\s]+/, "").trim()
}

function fmtNum(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return (n / 1000).toFixed(1) + "K"
  return n.toLocaleString()
}

export default function BuilderPage() {
  const params  = useParams()
  const address = (params.address as string).toLowerCase()

  const walletAddr = useArcStore(s => s.walletAddr)
  const isOwner    = !!walletAddr && walletAddr.toLowerCase() === address

  const [profile,           setProfile]           = useState<BuilderProfile | null>(null)
  const [projects,          setProjects]          = useState<Project[]>([])
  const [pendingProjects,   setPendingProjects]   = useState<{ id: number; name: string; slug: string }[]>([])
  const [hasSubmissionEmail,setHasSubmissionEmail]= useState(false)
  const [stats,             setStats]             = useState<Stats>({ contractsDeployed: 0, projectsShipped: 0, contractActivity: 0, firstSeen: null })
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  // Avatar states
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUrl,     setAvatarUrl]     = useState<string | null>(null)
  const [uploading,     setUploading]     = useState(false)
  const [avatarErr,     setAvatarErr]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    display_name: "",
    bio:          "",
    twitter:      "",
    github:       "",
    website:      "",
    telegram:     "",
    email:        "",
  })

  useEffect(() => {
    fetch(`/api/builder?address=${address}`)
      .then(r => r.json())
      .then(d => {
        setProfile(d.profile)
        setProjects(d.projects || [])
        setPendingProjects(d.pendingProjects || [])
        setHasSubmissionEmail(!!d.hasSubmissionEmail)
        setStats(d.stats || { contractsDeployed: 0, projectsShipped: 0, contractActivity: 0, firstSeen: null })
        if (d.profile) {
          setForm({
            display_name: d.profile.display_name || "",
            bio:          d.profile.bio          || "",
            twitter:      d.profile.twitter      || "",
            github:       d.profile.github       || "",
            website:      d.profile.website      || "",
            telegram:     d.profile.telegram     || "",
            email:        "",
          })
          setAvatarUrl(d.profile.avatar_url || null)
          if (d.profile.avatar_url) setAvatarPreview(d.profile.avatar_url)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  async function handleAvatarUpload(file: File) {
    setUploading(true)
    // Show local preview immediately
    const reader = new FileReader()
    reader.onload = e => setAvatarPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res  = await fetch("/api/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (data.url) {
        setAvatarUrl(data.url)
        setAvatarErr(false)
      } else {
        setAvatarPreview(avatarUrl)
      }
    } catch {
      setAvatarPreview(avatarUrl)
    } finally {
      setUploading(false)
    }
  }

  async function saveProfile() {
    setSaving(true)
    try {
      const res = await fetch("/api/builder", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          ...form,
          avatar_url: avatarUrl || "",
          twitter:    cleanHandle(form.twitter),
          github:     cleanHandle(form.github),
          telegram:   cleanHandle(form.telegram),
          email:      form.email.trim() || "",
        }),
      })
      if (res.ok) {
        const updated: BuilderProfile = {
          address,
          display_name: form.display_name || null,
          bio:          form.bio          || null,
          avatar_url:   avatarUrl         || null,
          twitter:      cleanHandle(form.twitter)  || null,
          github:       cleanHandle(form.github)   || null,
          website:      form.website               || null,
          telegram:     cleanHandle(form.telegram) || null,
          verified:     profile?.verified || false,
          claimed_at:   profile?.claimed_at || new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }
        setProfile(updated)
        setAvatarErr(false)
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

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

  const displayName = profile?.display_name || shortAddr(address)
  const isClaimed   = !!profile?.claimed_at

  // Displayed avatar: local preview during edit, profile avatar or dicebear otherwise
  const shownAvatar = editing
    ? (avatarPreview || (avatarErr ? dicebear(address) : (profile?.avatar_url || dicebear(address))))
    : (avatarErr ? dicebear(address) : (profile?.avatar_url || dicebear(address)))

  const inputStyle: React.CSSProperties = {
    width: "100%", height: "38px", background: surf2, border: "1px solid " + bdr,
    borderRadius: "8px", padding: "0 12px", fontSize: "13px", fontFamily: mono,
    color: t1, outline: "none",
  }
  const textareaStyle: React.CSSProperties = {
    width: "100%", background: surf2, border: "1px solid " + bdr,
    borderRadius: "8px", padding: "10px 12px", fontSize: "13px", fontFamily: sans,
    color: t1, outline: "none", resize: "vertical", minHeight: "80px", lineHeight: 1.6,
  }
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "10px", fontFamily: mono, color: t3,
    letterSpacing: "0.08em", marginBottom: "6px",
  }

  const BUILDER_STATS = [
    { label: "Contracts Deployed", value: fmtNum(stats.contractsDeployed), color: "#8aaeff", sub: "Smart contracts on Arc" },
    { label: "Projects Shipped",   value: fmtNum(stats.projectsShipped),   color: usdc,      sub: "Live on Arc Ecosystem" },
    { label: "Contract Activity",  value: fmtNum(stats.contractActivity),   color: arc,       sub: "Txns on their contracts" },
  ]

  return (
    <ArcLayout active="">
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "32px 20px 60px" }}>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "260px", color: t3, fontFamily: mono, fontSize: "12px" }}>
            Loading profile…
          </div>
        ) : (
          <>
            {/* PROFILE HERO */}
            <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "16px", padding: "32px", marginBottom: "20px", position: "relative" }}>

              {isClaimed && (
                <div style={{ position: "absolute", top: "20px", right: "20px", display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: "20px" }}>
                  <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: usdc }} />
                  <span style={{ fontSize: "10px", fontFamily: mono, color: usdc, letterSpacing: "0.06em" }}>CLAIMED PROFILE</span>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "flex-start", gap: "24px", flexWrap: "wrap" }}>
                {/* AVATAR */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    onClick={editing ? () => fileRef.current?.click() : undefined}
                    style={{ position: "relative", width: "80px", height: "80px", cursor: editing ? "pointer" : "default" }}
                  >
                    <img
                      src={shownAvatar}
                      onError={() => setAvatarErr(true)}
                      alt="avatar"
                      style={{ width: "80px", height: "80px", borderRadius: "50%", border: "2px solid " + bdr, background: surf2, display: "block", objectFit: "cover" }}
                    />
                    {editing && (
                      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px" }}>
                        {uploading
                          ? <span style={{ fontSize: "9px", fontFamily: mono, color: "#fff" }}>…</span>
                          : <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              <span style={{ fontSize: "8px", fontFamily: mono, color: "#fff" }}>Upload</span>
                            </>
                        }
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={e => { if (e.target.files?.[0]) handleAvatarUpload(e.target.files[0]) }}
                  />
                  {profile?.verified && !editing && (
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: "22px", height: "22px", borderRadius: "50%", background: arc, border: "2px solid " + surf, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#fff" }}>
                      ✓
                    </div>
                  )}
                </div>

                {/* INFO */}
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700, color: t1, letterSpacing: "-0.02em" }}>
                    {displayName}
                  </h1>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                    <span style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>{address}</span>
                    {stats.firstSeen && (
                      <span style={{ fontSize: "10px", fontFamily: mono, color: t3, padding: "2px 8px", background: "rgba(26,86,255,0.06)", border: "1px solid rgba(26,86,255,0.1)", borderRadius: "99px" }}>
                        Building since {new Date(stats.firstSeen).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                  {profile?.bio && (
                    <p style={{ margin: "0 0 14px", fontSize: "14px", color: t2, lineHeight: 1.7, maxWidth: "520px" }}>
                      {profile.bio}
                    </p>
                  )}
                  {!isClaimed && !isOwner && (
                    <p style={{ margin: "0 0 14px", fontSize: "13px", color: t3, fontStyle: "italic" }}>
                      This builder hasn't claimed their profile yet.
                    </p>
                  )}

                  {/* SOCIAL LINKS */}
                  {(profile?.twitter || profile?.github || profile?.website || profile?.telegram) && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {profile?.twitter && (
                        <a href={`https://x.com/${profile.twitter}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "rgba(26,86,255,0.06)", border: "1px solid " + bdr, borderRadius: "6px", textDecoration: "none", fontSize: "11px", fontFamily: mono, color: t2, transition: "color .12s" }}
                          onMouseEnter={e => e.currentTarget.style.color = t1}
                          onMouseLeave={e => e.currentTarget.style.color = t2}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.635 5.903-5.635Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                          @{profile.twitter}
                        </a>
                      )}
                      {profile?.github && (
                        <a href={`https://github.com/${profile.github}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "rgba(26,86,255,0.06)", border: "1px solid " + bdr, borderRadius: "6px", textDecoration: "none", fontSize: "11px", fontFamily: mono, color: t2, transition: "color .12s" }}
                          onMouseEnter={e => e.currentTarget.style.color = t1}
                          onMouseLeave={e => e.currentTarget.style.color = t2}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
                          {profile.github}
                        </a>
                      )}
                      {profile?.website && (
                        <a href={profile.website.startsWith("http") ? profile.website : "https://" + profile.website} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "rgba(26,86,255,0.06)", border: "1px solid " + bdr, borderRadius: "6px", textDecoration: "none", fontSize: "11px", fontFamily: mono, color: t2, transition: "color .12s" }}
                          onMouseEnter={e => e.currentTarget.style.color = t1}
                          onMouseLeave={e => e.currentTarget.style.color = t2}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          {profile.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {profile?.telegram && (
                        <a href={`https://t.me/${profile.telegram}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "rgba(26,86,255,0.06)", border: "1px solid " + bdr, borderRadius: "6px", textDecoration: "none", fontSize: "11px", fontFamily: mono, color: t2, transition: "color .12s" }}
                          onMouseEnter={e => e.currentTarget.style.color = t1}
                          onMouseLeave={e => e.currentTarget.style.color = t2}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/></svg>
                          @{profile.telegram}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* OWNER ACTIONS */}
              {isOwner && (
                <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid " + bdr, display: "flex", gap: "8px", alignItems: "center" }}>
                  {!editing ? (
                    <>
                      <button onClick={() => setEditing(true)}
                        style={{ height: "32px", padding: "0 16px", background: "rgba(26,86,255,0.08)", color: "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "7px", cursor: "pointer" }}>
                        {isClaimed ? "Edit Profile" : "Claim Profile"}
                      </button>
                      {saved && <span style={{ fontSize: "11px", fontFamily: mono, color: usdc }}>✓ Saved</span>}
                    </>
                  ) : (
                    <>
                      <button onClick={saveProfile} disabled={saving || uploading}
                        style={{ height: "32px", padding: "0 16px", background: arc, color: "#fff", fontSize: "12px", fontFamily: mono, border: "none", borderRadius: "7px", cursor: (saving || uploading) ? "wait" : "pointer", opacity: (saving || uploading) ? .7 : 1 }}>
                        {saving ? "Saving…" : uploading ? "Uploading photo…" : "Save Profile"}
                      </button>
                      <button onClick={() => { setEditing(false); setAvatarPreview(profile?.avatar_url || null); setAvatarUrl(profile?.avatar_url || null) }}
                        style={{ height: "32px", padding: "0 12px", background: "transparent", color: t3, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "7px", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* EDIT FORM */}
            {editing && isOwner && (
              <div style={{ background: surf, border: "1px solid rgba(26,86,255,0.15)", borderRadius: "16px", padding: "28px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", fontFamily: mono, color: "#8aaeff", letterSpacing: "0.08em", marginBottom: "20px" }}>
                  EDIT PROFILE
                </div>

                {/* PHOTO UPLOAD */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>PROFILE PHOTO</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div
                      onClick={() => fileRef.current?.click()}
                      style={{ width: "72px", height: "72px", borderRadius: "50%", border: "2px dashed rgba(26,86,255,0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: avatarPreview ? "transparent" : "rgba(26,86,255,0.04)", flexShrink: 0, position: "relative" }}>
                      {avatarPreview
                        ? <img src={avatarPreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setAvatarPreview(null)} />
                        : <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t3} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            <span style={{ fontSize: "8px", fontFamily: mono, color: t3, marginTop: "3px" }}>{uploading ? "..." : "Upload"}</span>
                          </>
                      }
                      {uploading && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontFamily: mono, color: "#fff" }}>...</div>
                      )}
                    </div>
                    <div>
                      <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        style={{ height: "32px", padding: "0 14px", background: "rgba(26,86,255,0.08)", color: "#8aaeff", fontSize: "11px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "7px", cursor: uploading ? "wait" : "pointer", display: "block", marginBottom: "6px" }}>
                        {uploading ? "Uploading…" : "Choose Photo"}
                      </button>
                      <div style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>PNG, JPG, WebP · max 5 MB</div>
                      {avatarUrl && !uploading && <div style={{ fontSize: "10px", fontFamily: mono, color: usdc, marginTop: "4px" }}>✓ Photo uploaded</div>}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>DISPLAY NAME</label>
                    <input style={inputStyle} value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Your name or handle" maxLength={60} />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>BIO <span style={{ color: t3, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({form.bio.length}/300)</span></label>
                    <textarea style={textareaStyle} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Tell the Arc ecosystem about yourself…" maxLength={300} rows={3} />
                  </div>

                  <div>
                    <label style={labelStyle}>X / TWITTER</label>
                    <input style={inputStyle} value={form.twitter} onChange={e => setForm(f => ({ ...f, twitter: e.target.value }))} placeholder="@handle" />
                  </div>

                  <div>
                    <label style={labelStyle}>GITHUB</label>
                    <input style={inputStyle} value={form.github} onChange={e => setForm(f => ({ ...f, github: e.target.value }))} placeholder="username" />
                  </div>

                  <div>
                    <label style={labelStyle}>WEBSITE</label>
                    <input style={inputStyle} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://yoursite.com" />
                  </div>

                  <div>
                    <label style={labelStyle}>TELEGRAM</label>
                    <input style={inputStyle} value={form.telegram} onChange={e => setForm(f => ({ ...f, telegram: e.target.value }))} placeholder="@username" />
                  </div>

                  {/* Email — full width, private, only used to match project submissions */}
                  <div style={{ gridColumn: "1 / -1", paddingTop: "4px", borderTop: "1px solid var(--bdr, rgba(255,255,255,0.06))", marginTop: "4px" }}>
                    <label style={labelStyle}>
                      PROJECT SUBMISSION EMAIL
                      <span style={{ marginLeft: "8px", textTransform: "none", letterSpacing: 0, color: "var(--t3, #2e3a5c)", fontWeight: 400 }}>— private, never shown publicly</span>
                    </label>
                    <input
                      style={inputStyle}
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder={hasSubmissionEmail ? "Email on file — enter to update" : "email@example.com"}
                    />
                    <div style={{ fontSize: "10px", fontFamily: mono, color: "var(--t3, #2e3a5c)", marginTop: "6px", lineHeight: 1.6 }}>
                      {hasSubmissionEmail
                        ? "✓ Submission email on file. Your approved projects are already linked to this profile."
                        : "The email you used to submit projects to Arc Ecosystem. Used only to detect approved projects pending activation — never displayed."
                      }
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "20px", display: "flex", gap: "8px" }}>
                  <button onClick={saveProfile} disabled={saving || uploading}
                    style={{ height: "36px", padding: "0 20px", background: arc, color: "#fff", fontSize: "13px", fontFamily: mono, border: "none", borderRadius: "8px", cursor: (saving || uploading) ? "wait" : "pointer", opacity: (saving || uploading) ? .7 : 1, fontWeight: 600 }}>
                    {saving ? "Saving…" : uploading ? "Upload in progress…" : "Save Profile"}
                  </button>
                  <button onClick={() => { setEditing(false); setAvatarPreview(profile?.avatar_url || null); setAvatarUrl(profile?.avatar_url || null) }}
                    style={{ height: "36px", padding: "0 16px", background: "transparent", color: t3, fontSize: "13px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "8px", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* BUILDER STATS */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
              {BUILDER_STATS.map(s => (
                <div key={s.label} style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "20px 18px" }}>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: s.color, letterSpacing: "-0.03em", marginBottom: "4px" }}>{s.value}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: t1, marginBottom: "2px" }}>{s.label}</div>
                  <div style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* PROJECTS */}
            {projects.length > 0 && (
              <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "16px", padding: "24px", marginBottom: "20px" }}>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, letterSpacing: "0.1em", marginBottom: "16px" }}>PROJECTS BUILT</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
                  {projects.map(p => (
                    <a key={p.id} href={`/ecosystem/${p.slug || p.id}`}
                      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", background: surf2, borderRadius: "10px", textDecoration: "none", border: "1px solid " + bdr, transition: "border-color .12s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(26,86,255,0.3)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = bdr}>
                      {p.logo_url ? (
                        <img src={p.logo_url} alt={p.name} style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                      ) : (
                        <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(26,86,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0, color: "#8aaeff" }}>◎</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: t1, marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        <div style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>{p.category}</div>
                      </div>
                      {p.featured && (
                        <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 6px", background: "rgba(26,86,255,0.12)", color: "#8aaeff", borderRadius: "3px", flexShrink: 0 }}>FEATURED</span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* PENDING PROJECTS NUDGE — only shown to owner */}
            {isOwner && pendingProjects.length > 0 && (
              <div style={{ background: "rgba(224,136,16,0.05)", border: "1px solid rgba(224,136,16,0.2)", borderRadius: "14px", padding: "18px 20px", marginBottom: "20px", display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div style={{ fontSize: "18px", flexShrink: 0, marginTop: "1px" }}>⚠</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#e08810", marginBottom: "4px" }}>
                    {pendingProjects.length === 1
                      ? "1 project pending activation"
                      : `${pendingProjects.length} projects pending activation`}
                  </div>
                  <div style={{ fontSize: "12px", color: t2, lineHeight: 1.6, marginBottom: "10px" }}>
                    {pendingProjects.length === 1
                      ? `"${pendingProjects[0].name}" was approved but hasn't been linked to your wallet yet.`
                      : `These projects were approved but haven't been linked to your wallet yet.`}
                    {" "}Check your submission email for the activation link.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {pendingProjects.map(p => (
                      <a key={p.id} href={`/ecosystem/${p.slug || p.id}`}
                        style={{ fontSize: "11px", fontFamily: mono, color: "#e08810", padding: "3px 10px", background: "rgba(224,136,16,0.08)", border: "1px solid rgba(224,136,16,0.2)", borderRadius: "5px", textDecoration: "none", transition: "background .12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(224,136,16,0.14)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(224,136,16,0.08)"}>
                        {p.name} →
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* UNCLAIMED CTA — only for wallet owner who hasn't claimed */}
            {!isClaimed && isOwner && !editing && (
              <div style={{ background: "rgba(26,86,255,0.04)", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>◎</div>
                <h2 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, color: t1 }}>Claim your builder profile</h2>
                <p style={{ margin: "0 0 20px", fontSize: "13px", color: t2, lineHeight: 1.7 }}>
                  Add your photo, name, bio and socials so the Arc community knows who built what.
                  <br />Your profile is permanently tied to this wallet address.
                </p>
                <button onClick={() => setEditing(true)}
                  style={{ height: "40px", padding: "0 24px", background: arc, color: "#fff", fontSize: "13px", fontFamily: mono, border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
                  Claim Profile →
                </button>
              </div>
            )}

            {/* ON-CHAIN ACTIVITY LINK */}
            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <a href={`/address/${address}`}
                style={{ fontSize: "11px", fontFamily: mono, color: t3, textDecoration: "none", transition: "color .12s" }}
                onMouseEnter={e => e.currentTarget.style.color = t2}
                onMouseLeave={e => e.currentTarget.style.color = t3}>
                View on-chain activity →
              </a>
            </div>
          </>
        )}
      </div>
    </ArcLayout>
  )
}
