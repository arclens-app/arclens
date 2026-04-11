"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

const CATEGORIES = ["Infrastructure","DeFi","AI","Payments","NFT","Gaming","Social","Developer Tools","Bridge","Identity","Wallet","Exchange","Lending","Analytics","Other"]
const BADGES = ["", "official", "verified", "claimed"]

interface Project {
  id: number; name: string; tagline: string; category: string; description: string
  logo_url: string|null; email: string|null; website: string|null; twitter: string|null
  github: string|null; discord: string|null; contract: string|null; badge: string|null
  approved: boolean; live: boolean; featured: boolean; created_at: string
  city: string|null; country: string|null; lat: number|null; lng: number|null
}
interface Contract {
  id: number; address: string; name: string; type: string; email: string|null
  website: string|null; twitter: string|null; badge: string|null; deployer: string|null
  flag_reason: string|null; verified: boolean; created_at: string
  description: string|null; source_code: string|null
}
interface PendingUpdate {
  id: number; project_id: number; field: string; old_value: string; new_value: string
  submitted_at: string; status: string; project_name: string; project_slug: string
}
interface Event {
  id: number; name: string; type: string|null; date: string; location: string|null
  is_online: boolean; organizer: string|null; organizer_twitter: string|null
  email: string|null; badge: string|null; featured: boolean; approved: boolean
  link: string|null; created_at: string
}

export default function AdminPage() {
  const [mounted, setMounted]         = useState(false)
  const [authed, setAuthed]           = useState(false)
  const [pw, setPw]                   = useState("")
  const [password, setPassword]       = useState("")
  const [loading, setLoading]         = useState(false)
  const [tab, setTab]                 = useState<"pending"|"updates"|"projects"|"contracts"|"events"|"locations">("pending")
  const [submissions, setSubmissions] = useState<Project[]>([])
  const [projects, setProjects]       = useState<Project[]>([])
  const [contracts, setContracts]     = useState<Contract[]>([])
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([])
  const [events, setEvents]           = useState<Event[]>([])
  const [acting, setActing]           = useState(false)
  const [locInputs, setLocInputs]     = useState<Record<number,{city:string;country:string;status:string;result:string}>>({})
  const [msg, setMsg]                 = useState<{ok:boolean;text:string}|null>(null)
  const [editing, setEditing]         = useState<Project|null>(null)
  const [editForm, setEditForm]       = useState<Partial<Project>>({})
  const [expandedContract, setExpandedContract] = useState<string|null>(null)
  const [showEventForm, setShowEventForm] = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [eventForm, setEventForm] = useState({
    name: "", tagline: "", type: "Hackathon", description: "",
    date: "", end_date: "", timezone: "UTC",
    location: "", is_online: false,
    link: "", organizer: "", organizer_twitter: "", email: "",
  })

  const mono  = "'DM Mono', monospace"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const border = "1px solid var(--bdr, rgba(255,255,255,0.06))"

  useEffect(() => { setMounted(true) }, [])

  async function login() {
    const res  = await fetch(`/api/admin?action=auth&password=${pw}`)
    const data = await res.json()
    if (data.ok) { setPassword(pw); setAuthed(true); loadAll(pw) }
    else setMsg({ ok: false, text: "Wrong password" })
  }

  async function loadAll(p = password) {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin?action=list&password=${p}`)
      const data = await res.json()
      setSubmissions(data.submissions || [])
      setProjects(data.projects || [])
      setContracts(data.contracts || [])
      setPendingUpdates(data.pendingUpdates || [])
      setEvents(data.events || [])
    } finally { setLoading(false) }
  }

  async function act(id: number|string, action: string, table = "projects", extraData?: any) {
    setActing(true)
    setMsg(null)
    try {
      const res  = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, password, table, data: extraData }),
      })
      const data = await res.json()
      if (data.success || data.ok) {
        setMsg({ ok: true, text: action === "approve" ? "✓ Approved" : action === "approve-update" ? "✓ Update applied" : action === "reject-update" ? "✓ Update rejected" : action === "delete" || action === "reject" ? "✓ Deleted" : "✓ Done" })
        loadAll()
      } else {
        setMsg({ ok: false, text: data.error || "Failed" })
      }
    } catch { setMsg({ ok: false, text: "Network error" }) }
    finally { setActing(false) }
  }

  async function saveEdit() {
    if (!editing) return
    setActing(true)
    try {
      const res  = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, action: "update", password, data: editForm }),
      })
      const data = await res.json()
      if (data.success) { setMsg({ ok: true, text: "✓ Project updated" }); setEditing(null); loadAll() }
      else setMsg({ ok: false, text: data.error || "Update failed" })
    } catch { setMsg({ ok: false, text: "Network error" }) }
    finally { setActing(false) }
  }

  function startEdit(p: Project) {
    setEditing(p)
    setEditForm({ ...p })
    setMsg(null)
  }

  async function geocodeProject(id: number, fallback?: { city: string; country: string }) {
    const inp = locInputs[id] || { city: fallback?.city || "", country: fallback?.country || "", status: "", result: "" }
    if (!inp.city.trim()) return
    setLocInputs(p => ({ ...p, [id]: { ...inp, status: "loading", result: "" } }))
    try {
      const res  = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "geocode", password, data: { city: inp.city, country: inp.country } }),
      })
      const data = await res.json()
      if (data.success) {
        setLocInputs(p => ({ ...p, [id]: { ...inp, status: "done", result: `${data.lat?.toFixed(4)}, ${data.lng?.toFixed(4)}` } }))
        loadAll()
      } else {
        setLocInputs(p => ({ ...p, [id]: { ...inp, status: "error", result: data.error || "Not found" } }))
      }
    } catch {
      setLocInputs(p => ({ ...p, [id]: { ...inp, status: "error", result: "Network error" } }))
    }
  }

  async function createOfficialEvent() {
    if (!eventForm.name.trim()) { setMsg({ ok: false, text: "Event name required" }); return }
    if (!eventForm.date)        { setMsg({ ok: false, text: "Event date required" }); return }
    setCreatingEvent(true)
    setMsg(null)
    try {
      const res  = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...eventForm, email: eventForm.email || "admin@arclens.app" }),
      })
      const data = await res.json()
      if (data.success) {
        // Auto-approve and set as official
        const listRes  = await fetch(`/api/admin?action=list&password=${password}`)
        const listData = await listRes.json()
        const newEvent = (listData.events || []).find((e: any) => e.name === eventForm.name && !e.approved)
        if (newEvent) {
          await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: newEvent.id, action: "approve", password, table: "events" }) })
          await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: newEvent.id, action: "badge-event", password, table: "events", data: { badge: "official" } }) })
        }
        setMsg({ ok: true, text: "✓ Official event created and live" })
        setShowEventForm(false)
        setEventForm({ name: "", tagline: "", type: "Hackathon", description: "", date: "", end_date: "", timezone: "UTC", location: "", is_online: false, link: "", organizer: "", organizer_twitter: "", email: "" })
        loadAll()
      } else {
        setMsg({ ok: false, text: data.error || "Failed to create event" })
      }
    } catch { setMsg({ ok: false, text: "Network error" }) }
    finally { setCreatingEvent(false) }
  }

  if (!mounted) return <div style={{ minHeight:"100vh", background:"var(--bg,#060812)" }} />

  if (!authed) return (
    <ArcLayout active="">
      <div style={{ minHeight:"80vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:surf, border:border, borderRadius:"16px", padding:"40px", width:"360px" }}>
          <div style={{ fontSize:"20px", fontWeight:700, letterSpacing:"-0.04em", marginBottom:"6px", color:t1 }}>ArcLens Admin</div>
          <div style={{ fontSize:"12px", color:t2, marginBottom:"24px" }}>Enter admin password to continue</div>
          <input
            type="password" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key==="Enter" && login()}
            placeholder="Password"
            style={{ width:"100%", height:"40px", background:surf2, border:"1px solid "+bdr, borderRadius:"8px", padding:"0 14px", fontSize:"13px", fontFamily:mono, color:t1, outline:"none", marginBottom:"12px", boxSizing:"border-box" }}
          />
          {msg && <div style={{ fontSize:"11px", color:"#e03348", marginBottom:"10px" }}>{msg.text}</div>}
          <button onClick={login} style={{ width:"100%", height:"40px", background:"#1a56ff", color:"#fff", fontSize:"13px", fontWeight:600, border:"none", borderRadius:"8px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
            Sign In
          </button>
        </div>
      </div>
    </ArcLayout>
  )

  const pendingCount = submissions.length + contracts.filter(c => !c.verified).length
  const pendingEvents = events.filter(e => !e.approved).length

  return (
    <ArcLayout active="">
      <div style={{ padding:"24px 28px 48px" }}>

        {/* TOPBAR */}
        <div style={{ display:"flex", alignItems:"center", gap:"16px", marginBottom:"24px" }}>
          <div style={{ fontSize:"20px", fontWeight:700, letterSpacing:"-0.04em", color:t1 }}>Admin Panel</div>
          <div style={{ fontSize:"11px", fontFamily:mono, padding:"3px 10px", borderRadius:"5px", background:"rgba(224,51,72,0.08)", border:"1px solid rgba(224,51,72,0.2)", color:"#e03348" }}>
            {pendingCount + pendingUpdates.length + pendingEvents} pending
          </div>
          <button onClick={() => loadAll()} style={{ marginLeft:"auto", height:"32px", padding:"0 14px", background:"transparent", color:t2, fontSize:"11px", fontFamily:mono, border:"1px solid "+bdr, borderRadius:"6px", cursor:"pointer" }}>
            ↻ Refresh
          </button>
          <button onClick={() => setAuthed(false)} style={{ height:"32px", padding:"0 14px", background:"transparent", color:"#e03348", fontSize:"11px", fontFamily:mono, border:"1px solid rgba(224,51,72,0.2)", borderRadius:"6px", cursor:"pointer" }}>
            Sign Out
          </button>
        </div>

        {/* TABS */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"20px", flexWrap:"wrap" }}>
          {[
            { id:"pending"   as const, label:`Submissions (${pendingCount})` },
            { id:"updates"   as const, label:`Updates (${pendingUpdates.length})` },
            { id:"projects"  as const, label:`All Projects (${projects.length})` },
            { id:"contracts" as const, label:`Contracts (${contracts.length})` },
            { id:"events"    as const, label:`Events (${events.length})` },
            { id:"locations" as const, label:`Locations (${[...submissions,...projects].filter((p:any)=>!p.lat).length} missing)` },
          ].map((t: any) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ height:"34px", padding:"0 16px", background:tab===t.id?"#1a56ff":"transparent", color:tab===t.id?"#fff":t2, fontSize:"12px", fontWeight:tab===t.id?600:400, border:"1px solid "+(tab===t.id?"#1a56ff":bdr), borderRadius:"7px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* MSG */}
        {msg && (
          <div style={{ padding:"10px 16px", borderRadius:"8px", background:msg.ok?"rgba(0,184,122,0.06)":"rgba(224,51,72,0.06)", border:"1px solid "+(msg.ok?"rgba(0,184,122,0.2)":"rgba(224,51,72,0.2)"), fontSize:"12px", fontFamily:mono, color:msg.ok?"#00d990":"#e03348", marginBottom:"16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ background:"none", border:"none", color:"inherit", cursor:"pointer", fontSize:"14px" }}>×</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding:"48px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>Loading...</div>
        ) : (
          <>
            {/* PENDING SUBMISSIONS TAB */}
            {tab === "pending" && (
              <div>
                {submissions.length === 0 && contracts.filter(c=>!c.verified).length === 0 ? (
                  <div style={{ padding:"60px", textAlign:"center" }}>
                    <div style={{ fontSize:"32px", marginBottom:"10px" }}>✅</div>
                    <div style={{ fontSize:"14px", fontWeight:600, color:t1, marginBottom:"4px" }}>All caught up</div>
                    <div style={{ fontSize:"11px", color:t2 }}>No pending submissions</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                    {submissions.map((s: any) => (
                      <div key={s.id} style={{ background:surf, border:border, borderRadius:"12px", padding:"16px 20px", display:"flex", alignItems:"center", gap:"16px" }}>
                        {s.logo_url && <img src={s.logo_url} alt={s.name} style={{ width:"40px", height:"40px", borderRadius:"8px", objectFit:"cover", flexShrink:0 }} onError={e=>(e.currentTarget.style.display="none")} />}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:"14px", fontWeight:600, color:t1, marginBottom:"2px" }}>{s.name}</div>
                          <div style={{ fontSize:"11px", color:t2, marginBottom:"2px" }}>{s.tagline}</div>
                          <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{s.category} · {s.email || "No email"} · {new Date(s.created_at).toLocaleDateString()}</div>
                        </div>
                        <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                          <button onClick={() => act(s.id, "approve")} disabled={acting}
                            style={{ height:"32px", padding:"0 14px", background:"rgba(0,184,122,0.1)", color:"#00d990", fontSize:"12px", border:"1px solid rgba(0,184,122,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                            Approve
                          </button>
                          <button onClick={() => startEdit(s)}
                            style={{ height:"32px", padding:"0 14px", background:"rgba(26,86,255,0.08)", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                            Edit
                          </button>
                          <button onClick={() => act(s.id, "reject")} disabled={acting}
                            style={{ height:"32px", padding:"0 14px", background:"rgba(224,51,72,0.08)", color:"#e03348", fontSize:"12px", border:"1px solid rgba(224,51,72,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PENDING UPDATES TAB */}
            {tab === "updates" && (
              <div>
                {pendingUpdates.length === 0 ? (
                  <div style={{ padding:"60px", textAlign:"center" }}>
                    <div style={{ fontSize:"32px", marginBottom:"10px" }}>✅</div>
                    <div style={{ fontSize:"14px", fontWeight:600, color:t1, marginBottom:"4px" }}>No pending updates</div>
                    <div style={{ fontSize:"11px", color:t2 }}>Founder listing changes will appear here</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                    {pendingUpdates.map((u: any) => (
                      <div key={u.id} style={{ background:surf, border:border, borderRadius:"12px", padding:"16px 20px" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px", flexWrap:"wrap", gap:"8px" }}>
                          <div>
                            <span style={{ fontSize:"14px", fontWeight:600, color:t1 }}>{u.project_name}</span>
                            <span style={{ fontSize:"11px", fontFamily:mono, color:t3, marginLeft:"10px" }}>wants to update</span>
                            <span style={{ fontSize:"11px", fontFamily:mono, color:"#8aaeff", marginLeft:"6px", padding:"1px 8px", background:"rgba(26,86,255,0.1)", borderRadius:"4px", border:"1px solid rgba(26,86,255,0.2)" }}>{u.field}</span>
                          </div>
                          <span style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{new Date(u.submitted_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"14px" }}>
                          <div style={{ padding:"10px 14px", background:"rgba(224,51,72,0.04)", border:"1px solid rgba(224,51,72,0.12)", borderRadius:"7px" }}>
                            <div style={{ fontSize:"9px", fontFamily:mono, color:"#e03348", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"4px" }}>Current</div>
                            <div style={{ fontSize:"12px", color:t2, wordBreak:"break-all" }}>{u.old_value || "—"}</div>
                          </div>
                          <div style={{ padding:"10px 14px", background:"rgba(0,184,122,0.04)", border:"1px solid rgba(0,184,122,0.12)", borderRadius:"7px" }}>
                            <div style={{ fontSize:"9px", fontFamily:mono, color:"#00b87a", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"4px" }}>Proposed</div>
                            <div style={{ fontSize:"12px", color:t1, wordBreak:"break-all" }}>{u.new_value}</div>
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:"8px" }}>
                          <button onClick={() => act(u.id, "approve-update")} disabled={acting}
                            style={{ height:"32px", padding:"0 16px", background:"rgba(0,184,122,0.1)", color:"#00d990", fontSize:"12px", border:"1px solid rgba(0,184,122,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                            Apply Update
                          </button>
                          <button onClick={() => act(u.id, "reject-update")} disabled={acting}
                            style={{ height:"32px", padding:"0 16px", background:"rgba(224,51,72,0.08)", color:"#e03348", fontSize:"12px", border:"1px solid rgba(224,51,72,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                            Reject
                          </button>
                          <a href={`/ecosystem/${u.project_slug}`} target="_blank" rel="noopener noreferrer"
                            style={{ height:"32px", padding:"0 12px", display:"flex", alignItems:"center", background:"transparent", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", textDecoration:"none" }}>
                            View Project ↗
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ALL PROJECTS TAB */}
            {tab === "projects" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                {projects.length === 0 ? (
                  <div style={{ padding:"48px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>No approved projects yet</div>
                ) : projects.map((p: any) => (
                  <div key={p.id} style={{ background:surf, border:border, borderRadius:"12px", padding:"16px 20px", display:"flex", alignItems:"center", gap:"16px" }}>
                    {p.logo_url && <img src={p.logo_url} alt={p.name} style={{ width:"40px", height:"40px", borderRadius:"8px", objectFit:"cover", flexShrink:0 }} onError={e=>(e.currentTarget.style.display="none")} />}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"2px" }}>
                        <div style={{ fontSize:"14px", fontWeight:600, color:t1 }}>{p.name}</div>
                        {p.badge && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(26,86,255,0.1)", color:"#8aaeff", border:"1px solid rgba(26,86,255,0.2)" }}>{p.badge}</span>}
                        {p.featured && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(192,136,40,0.1)", color:"#c08828", border:"1px solid rgba(192,136,40,0.2)" }}>Featured</span>}
                        {p.live && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(0,184,122,0.08)", color:"#00b87a", border:"1px solid rgba(0,184,122,0.2)" }}>Live</span>}
                      </div>
                      <div style={{ fontSize:"11px", color:t2, marginBottom:"2px" }}>{p.tagline}</div>
                      <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{p.category} · {p.website || "No website"}</div>
                    </div>
                    <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                      <button onClick={() => startEdit(p)}
                        style={{ height:"32px", padding:"0 16px", background:"rgba(26,86,255,0.08)", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                        Edit
                      </button>
                      <button onClick={() => act(p.id, "delete")} disabled={acting}
                        style={{ height:"32px", padding:"0 14px", background:"rgba(224,51,72,0.06)", color:"#e03348", fontSize:"12px", border:"1px solid rgba(224,51,72,0.15)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CONTRACTS TAB */}
            {tab === "contracts" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                {contracts.length === 0 ? (
                  <div style={{ padding:"48px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>No contract submissions</div>
                ) : contracts.map((c: any) => (
                  <div key={c.address} style={{ background:surf, border:border, borderRadius:"12px", overflow:"hidden" }}>

                    {/* MAIN ROW */}
                    <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:"16px" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px" }}>
                          <div style={{ fontSize:"14px", fontWeight:600, color:t1 }}>{c.name}</div>
                          {c.verified && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(0,184,122,0.08)", color:"#00b87a", border:"1px solid rgba(0,184,122,0.2)" }}>Verified</span>}
                          {c.flag_reason && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(224,136,16,0.1)", color:"#e08810", border:"1px solid rgba(224,136,16,0.2)" }}>⚠ Flagged</span>}
                        </div>
                        <div style={{ fontSize:"10.5px", fontFamily:mono, color:"#8aaeff", marginBottom:"4px" }}>{c.address}</div>
                        <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{c.type} · {c.email || "No email"} · {new Date(c.created_at).toLocaleDateString()}</div>
                        {c.flag_reason && <div style={{ fontSize:"10px", fontFamily:mono, color:"#e08810", marginTop:"4px" }}>{c.flag_reason}</div>}
                      </div>
                      <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                        <button onClick={() => setExpandedContract(expandedContract === c.address ? null : c.address)}
                          style={{ height:"32px", padding:"0 12px", background:"transparent", color:t2, fontSize:"12px", border:"1px solid "+bdr, borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                          {expandedContract === c.address ? "Hide ▲" : "Review ▼"}
                        </button>
                        {!c.verified && <button onClick={() => act(c.address, "approve", "contracts")} disabled={acting}
                          style={{ height:"32px", padding:"0 14px", background:"rgba(0,184,122,0.1)", color:"#00d990", fontSize:"12px", border:"1px solid rgba(0,184,122,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                          Approve
                        </button>}
                        <a href={"/address/"+c.address} target="_blank" rel="noopener noreferrer"
                          style={{ height:"32px", padding:"0 12px", display:"flex", alignItems:"center", background:"transparent", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", textDecoration:"none" }}>
                          View ↗
                        </a>
                        <button onClick={() => act(c.address, "delete", "contracts")} disabled={acting}
                          style={{ height:"32px", padding:"0 14px", background:"rgba(224,51,72,0.06)", color:"#e03348", fontSize:"12px", border:"1px solid rgba(224,51,72,0.15)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* EXPANDED DETAIL PANEL */}
                    {expandedContract === c.address && (
                      <div style={{ borderTop:"1px solid "+bdr, padding:"16px 20px", background:"rgba(0,0,0,0.2)" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
                          {[
                            { label:"Deployer",    value: c.deployer },
                            { label:"Website",     value: c.website  },
                            { label:"Twitter",     value: c.twitter  },
                            { label:"Email",       value: c.email    },
                          ].map(f => (
                            <div key={f.label}>
                              <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"3px" }}>{f.label}</div>
                              <div style={{ fontSize:"11px", fontFamily:mono, color: f.value ? t1 : t3, wordBreak:"break-all" }}>{f.value || "—"}</div>
                            </div>
                          ))}
                        </div>
                        {c.description && (
                          <div style={{ marginBottom:"12px" }}>
                            <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"4px" }}>Description</div>
                            <div style={{ fontSize:"12px", color:t2, lineHeight:1.6 }}>{c.description}</div>
                          </div>
                        )}
                        {c.source_code && (
                          <div>
                            <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"6px" }}>Source Code <span style={{ color:"#00b87a" }}>✓ Submitted</span></div>
                            <pre style={{ fontSize:"10px", fontFamily:mono, color:"#6b7da8", background:"rgba(0,0,0,0.3)", border:"1px solid "+bdr, borderRadius:"6px", padding:"12px", maxHeight:"160px", overflowY:"auto", whiteSpace:"pre-wrap", wordBreak:"break-all", margin:0 }}>
                              {c.source_code.slice(0, 800)}{c.source_code.length > 800 ? "\n\n... [truncated]" : ""}
                            </pre>
                          </div>
                        )}
                        {!c.source_code && (
                          <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>No source code submitted</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* EVENTS TAB */}
            {tab === "events" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>

                {/* CREATE OFFICIAL EVENT */}
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:"4px" }}>
                  <button onClick={() => setShowEventForm(!showEventForm)}
                    style={{ height:"34px", padding:"0 16px", background:showEventForm?"transparent":"#1a56ff", color:showEventForm?t2:"#fff", fontSize:"12px", fontWeight:600, border:"1px solid "+(showEventForm?bdr:"#1a56ff"), borderRadius:"7px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                    {showEventForm ? "Cancel" : "+ Create Official Event"}
                  </button>
                </div>

                {/* OFFICIAL EVENT FORM */}
                {showEventForm && (
                  <div style={{ background:surf, border:"1px solid rgba(26,86,255,0.25)", borderRadius:"12px", overflow:"hidden", marginBottom:"4px" }}>
                    <div style={{ padding:"14px 20px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", gap:"8px" }}>
                      <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(26,86,255,0.12)", color:"#8aaeff", border:"1px solid rgba(26,86,255,0.25)" }}>🔵 OFFICIAL</span>
                      <span style={{ fontSize:"13px", fontWeight:600, color:t1 }}>Create Official Event</span>
                      <span style={{ fontSize:"11px", color:t2 }}>— auto-approved and marked official</span>
                    </div>
                    <div style={{ padding:"20px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                      {[
                        { k:"name",              l:"Event Name *",          p:"Arc Hackathon 2025" },
                        { k:"tagline",           l:"Tagline",               p:"One-line description" },
                        { k:"organizer",         l:"Organizer",             p:"Arc Foundation" },
                        { k:"organizer_twitter", l:"Organizer Twitter",     p:"@arclabs" },
                        { k:"link",              l:"Event Link *",          p:"https://..." },
                        { k:"email",             l:"Contact Email",         p:"events@arc.network" },
                      ].map((f: any) => (
                        <div key={f.k}>
                          <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>{f.l}</label>
                          <input value={(eventForm as Record<string,string>)[f.k]} onChange={e => setEventForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.p}
                            style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as const }} />
                        </div>
                      ))}
                      <div>
                        <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Event Type</label>
                        <select value={eventForm.type} onChange={e => setEventForm(p => ({ ...p, type: e.target.value }))}
                          style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}>
                          {["Hackathon","Conference","Workshop","AMA","Meetup","Webinar","Launch","Other"].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Timezone</label>
                        <select value={eventForm.timezone} onChange={e => setEventForm(p => ({ ...p, timezone: e.target.value }))}
                          style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}>
                          {["UTC","America/New_York","America/Los_Angeles","Europe/London","Europe/Berlin","Asia/Dubai","Asia/Singapore","Asia/Tokyo"].map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Start Date & Time *</label>
                        <input type="datetime-local" value={eventForm.date} onChange={e => setEventForm(p => ({ ...p, date: e.target.value }))}
                          style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as const }} />
                      </div>
                      <div>
                        <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>End Date & Time</label>
                        <input type="datetime-local" value={eventForm.end_date} onChange={e => setEventForm(p => ({ ...p, end_date: e.target.value }))}
                          style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as const }} />
                      </div>
                      <div>
                        <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Location</label>
                        <input value={eventForm.location} onChange={e => setEventForm(p => ({ ...p, location: e.target.value }))} placeholder="City, Country or Online"
                          style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as const }} />
                      </div>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <label style={{ display:"flex", alignItems:"center", gap:"10px", cursor:"pointer", fontSize:"12px", color:t2 }}>
                          <input type="checkbox" checked={eventForm.is_online} onChange={e => setEventForm(p => ({ ...p, is_online: e.target.checked }))} />
                          Online / Virtual Event
                        </label>
                      </div>
                      <div style={{ gridColumn:"1 / -1" }}>
                        <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Description</label>
                        <textarea value={eventForm.description} onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))} placeholder="What is this event about?"
                          style={{ width:"100%", height:"72px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"8px 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", resize:"vertical", boxSizing:"border-box" as const, lineHeight:1.6 }} />
                      </div>
                    </div>
                    <div style={{ padding:"0 20px 20px" }}>
                      <button onClick={createOfficialEvent} disabled={creatingEvent}
                        style={{ height:"38px", padding:"0 24px", background:"#1a56ff", color:"#fff", fontSize:"13px", fontWeight:600, border:"none", borderRadius:"8px", cursor:creatingEvent?"not-allowed":"pointer", fontFamily:"'Geist',sans-serif", opacity:creatingEvent?.7:1 }}>
                        {creatingEvent ? "Creating..." : "Create & Publish Official Event"}
                      </button>
                    </div>
                  </div>
                )}

                {events.length === 0 && !showEventForm ? (
                  <div style={{ padding:"48px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>No event submissions yet</div>
                ) : events.map((e: any) => (
                  <div key={e.id} style={{ background:surf, border:border, borderRadius:"12px", padding:"16px 20px", display:"flex", alignItems:"center", gap:"16px" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px" }}>
                        <div style={{ fontSize:"14px", fontWeight:600, color:t1 }}>{e.name}</div>
                        {e.approved && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(0,184,122,0.08)", color:"#00b87a", border:"1px solid rgba(0,184,122,0.2)" }}>Live</span>}
                        {!e.approved && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(224,136,16,0.1)", color:"#e08810", border:"1px solid rgba(224,136,16,0.2)" }}>Pending</span>}
                        {e.featured && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(192,136,40,0.1)", color:"#c08828", border:"1px solid rgba(192,136,40,0.2)" }}>Featured</span>}
                        {e.badge === "official" && <span style={{ fontSize:"9px", fontFamily:mono, padding:"1px 6px", borderRadius:"3px", background:"rgba(26,86,255,0.1)", color:"#8aaeff", border:"1px solid rgba(26,86,255,0.2)" }}>🔵 Official</span>}
                      </div>
                      <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>
                        {e.type} · {e.date ? new Date(e.date).toLocaleDateString() : "No date"} · {e.is_online ? "Online" : e.location || "No location"} · {e.email || "No email"}
                      </div>
                      {e.organizer && (
                        <div style={{ fontSize:"10px", fontFamily:mono, color:t2, marginTop:"2px" }}>
                          by {e.organizer}{e.organizer_twitter ? ` · ${e.organizer_twitter}` : ""}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                      {!e.approved && (
                        <button onClick={() => act(e.id, "approve", "events")} disabled={acting}
                          style={{ height:"32px", padding:"0 14px", background:"rgba(0,184,122,0.1)", color:"#00d990", fontSize:"12px", border:"1px solid rgba(0,184,122,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                          Approve
                        </button>
                      )}
                      <button onClick={() => act(e.id, "feature-event", "events")} disabled={acting}
                        style={{ height:"32px", padding:"0 12px", background:e.featured?"rgba(192,136,40,0.1)":"transparent", color:e.featured?"#c08828":t2, fontSize:"12px", border:"1px solid "+(e.featured?"rgba(192,136,40,0.2)":bdr), borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                        {e.featured ? "Unfeature" : "Feature"}
                      </button>
                      <button onClick={() => act(e.id, "badge-event", "events", { badge: e.badge === "official" ? "community" : "official" } as any)} disabled={acting}
                        style={{ height:"32px", padding:"0 12px", background:e.badge==="official"?"rgba(26,86,255,0.1)":"transparent", color:e.badge==="official"?"#8aaeff":t2, fontSize:"12px", border:"1px solid "+(e.badge==="official"?"rgba(26,86,255,0.2)":bdr), borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                        {e.badge === "official" ? "🔵 Official" : "Set Official"}
                      </button>
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noopener noreferrer"
                          style={{ height:"32px", padding:"0 12px", display:"flex", alignItems:"center", background:"transparent", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", textDecoration:"none" }}>
                          View ↗
                        </a>
                      )}
                      <button onClick={() => act(e.id, "delete", "events")} disabled={acting}
                        style={{ height:"32px", padding:"0 14px", background:"rgba(224,51,72,0.06)", color:"#e03348", fontSize:"12px", border:"1px solid rgba(224,51,72,0.15)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* LOCATIONS TAB */}
            {tab === "locations" && (() => {
              const allProjects = [...submissions, ...projects] as any[]
              const missing     = allProjects.filter(p => !p.lat || !p.lng)
              const withLoc     = allProjects.filter(p => p.lat && p.lng)
              return (
                <div>
                  <div style={{ fontSize:"12px", color:t2, marginBottom:"20px", fontFamily:mono }}>
                    {missing.length} projects missing coordinates · {withLoc.length} already mapped
                  </div>
                  {missing.length === 0 ? (
                    <div style={{ padding:"60px", textAlign:"center" }}>
                      <div style={{ fontSize:"32px", marginBottom:"10px" }}>🌍</div>
                      <div style={{ fontSize:"14px", fontWeight:600, color:t1, marginBottom:"4px" }}>All projects mapped</div>
                      <div style={{ fontSize:"11px", color:t2 }}>Every project has coordinates — globe dots are real</div>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                      {missing.map((p: any) => {
                        const inp    = locInputs[p.id] || { city: p.city || "", country: p.country || "", status: "", result: "" }
                        const isDone = inp.status === "done"
                        const isErr  = inp.status === "error"
                        const isBusy = inp.status === "loading"
                        return (
                          <div key={p.id} style={{ background:surf, border:border, borderRadius:"10px", padding:"14px 18px", display:"flex", alignItems:"center", gap:"14px", flexWrap:"wrap" }}>
                            {/* Logo */}
                            <div style={{ width:"36px", height:"36px", borderRadius:"8px", overflow:"hidden", background:"rgba(26,86,255,0.08)", border:"1px solid rgba(26,86,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", fontWeight:700, color:"#8aaeff", flexShrink:0 }}>
                              {p.logo_url ? <img src={p.logo_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>(e.currentTarget.style.display="none")} /> : p.name?.[0]}
                            </div>
                            {/* Name */}
                            <div style={{ minWidth:"140px", flex:"0 0 auto" }}>
                              <div style={{ fontSize:"13px", fontWeight:600, color:t1 }}>{p.name}</div>
                              <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{p.category} · {p.approved ? "live" : "pending"}</div>
                            </div>
                            {/* City input */}
                            <input
                              value={inp.city}
                              onChange={e => setLocInputs(prev => ({ ...prev, [p.id]: { ...inp, city: e.target.value } }))}
                              onKeyDown={e => e.key === "Enter" && geocodeProject(p.id, { city: p.city || "", country: p.country || "" })}
                              placeholder="City (e.g. Lagos)"
                              style={{ flex:1, minWidth:"120px", height:"34px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}
                            />
                            {/* Country input */}
                            <input
                              value={inp.country}
                              onChange={e => setLocInputs(prev => ({ ...prev, [p.id]: { ...inp, country: e.target.value } }))}
                              onKeyDown={e => e.key === "Enter" && geocodeProject(p.id, { city: p.city || "", country: p.country || "" })}
                              placeholder="Country (optional)"
                              style={{ flex:1, minWidth:"120px", height:"34px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}
                            />
                            {/* Geocode button */}
                            <button
                              onClick={() => geocodeProject(p.id, { city: p.city || "", country: p.country || "" })}
                              disabled={isBusy || !inp.city.trim()}
                              style={{ height:"34px", padding:"0 16px", background:isDone?"rgba(0,184,122,0.1)":"rgba(26,86,255,0.1)", color:isDone?"#00d990":"#8aaeff", fontSize:"12px", fontFamily:mono, border:"1px solid "+(isDone?"rgba(0,184,122,0.2)":"rgba(26,86,255,0.2)"), borderRadius:"7px", cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>
                              {isBusy ? "..." : isDone ? "✓ Mapped" : "Geocode →"}
                            </button>
                            {/* Result */}
                            {inp.result && (
                              <div style={{ fontSize:"10px", fontFamily:mono, color:isDone?"#00d990":"#e03348", whiteSpace:"nowrap" }}>
                                {isErr ? "✗ " : "📍 "}{inp.result}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {/* Already mapped */}
                  {withLoc.length > 0 && (
                    <div style={{ marginTop:"32px" }}>
                      <div style={{ fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"12px" }}>Already Mapped ({withLoc.length})</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                        {withLoc.map((p: any) => (
                          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"10px 16px", background:"rgba(0,184,122,0.03)", border:"1px solid rgba(0,184,122,0.1)", borderRadius:"8px" }}>
                            <div style={{ fontSize:"13px", fontWeight:500, color:t1, flex:1 }}>{p.name}</div>
                            <div style={{ fontSize:"10px", fontFamily:mono, color:"#00b87a" }}>{p.city || "—"}{p.country ? `, ${p.country}` : ""}</div>
                            <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{Number(p.lat).toFixed(3)}, {Number(p.lng).toFixed(3)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        )}

        {/* EDIT MODAL */}
        {editing && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"20px" }}>
            <div style={{ background:"var(--surf,#0a0e1a)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"16px", padding:"28px", width:"100%", maxWidth:"560px", maxHeight:"90vh", overflowY:"auto" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"20px" }}>
                <div style={{ fontSize:"16px", fontWeight:600, color:t1 }}>Edit: {editing.name}</div>
                <button onClick={() => setEditing(null)} style={{ background:"none", border:"none", color:t2, cursor:"pointer", fontSize:"20px" }}>×</button>
              </div>
              {[
                { k:"name",        l:"Name",             type:"text" },
                { k:"tagline",     l:"Tagline",          type:"text" },
                { k:"description", l:"Description",      type:"textarea" },
                { k:"website",     l:"Website",          type:"text" },
                { k:"twitter",     l:"Twitter",          type:"text" },
                { k:"github",      l:"GitHub",           type:"text" },
                { k:"discord",     l:"Discord",          type:"text" },
                { k:"contract",    l:"Contract Address", type:"text" },
                { k:"email",       l:"Email",            type:"text" },
                { k:"logo_url",    l:"Logo URL",         type:"text" },
                { k:"city",       l:"City",             type:"text" },
                { k:"country",    l:"Country",          type:"text" },
                { k:"lat",        l:"Latitude",         type:"text" },
                { k:"lng",        l:"Longitude",        type:"text" },
              ].map((f: any) => (
                <div key={f.k} style={{ marginBottom:"12px" }}>
                  <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>{f.l}</label>
                  {f.type === "textarea" ? (
                    <textarea value={(editForm as Record<string,unknown>)[f.k] as string || ""} onChange={e => setEditForm(p => ({...p, [f.k]: e.target.value}))}
                      style={{ width:"100%", height:"80px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"8px 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", resize:"vertical", boxSizing:"border-box" }} />
                  ) : (
                    <input value={(editForm as Record<string,unknown>)[f.k] as string || ""} onChange={e => setEditForm(p => ({...p, [f.k]: e.target.value}))}
                      style={{ width:"100%", height:"36px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" }} />
                  )}
                </div>
              ))}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
                <div>
                  <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Category</label>
                  <select value={editForm.category || ""} onChange={e => setEditForm(p => ({...p, category: e.target.value}))}
                    style={{ width:"100%", height:"36px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Badge</label>
                  <select value={editForm.badge || ""} onChange={e => setEditForm(p => ({...p, badge: e.target.value}))}
                    style={{ width:"100%", height:"36px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}>
                    {BADGES.map(b => <option key={b} value={b}>{b || "None"}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"flex", gap:"16px", marginBottom:"20px" }}>
                {[
                  { k:"featured", l:"Featured" },
                  { k:"live",     l:"Live" },
                ].map((f: any) => (
                  <label key={f.k} style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer", fontSize:"12px", color:t2 }}>
                    <input type="checkbox" checked={!!(editForm as Record<string,unknown>)[f.k]} onChange={e => setEditForm(p => ({...p, [f.k]: e.target.checked}))} />
                    {f.l}
                  </label>
                ))}
              </div>
              <div style={{ display:"flex", gap:"10px" }}>
                <button onClick={saveEdit} disabled={acting}
                  style={{ flex:1, height:"40px", background:"#1a56ff", color:"#fff", fontSize:"13px", fontWeight:600, border:"none", borderRadius:"8px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                  {acting ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditing(null)}
                  style={{ height:"40px", padding:"0 20px", background:"transparent", color:t2, fontSize:"13px", border:"1px solid "+bdr, borderRadius:"8px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ArcLayout>
  )
}