"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

const CATEGORIES = ["Infrastructure","DeFi","AI","Payments","NFT","Gaming","Social","Developer Tools","Bridge","Identity","Wallet","Exchange","Lending","Analytics","Other"]
const BADGES = ["", "official", "verified", "claimed"]

interface Project {
  id: number; name: string; tagline: string; category: string; description: string
  logo_url: string|null; email: string|null; website: string|null; twitter: string|null
  github: string|null; discord: string|null; contract: string|null; contracts: string[]|null; badge: string|null
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
interface AdminCampaign {
  id: number; title: string; tagline: string|null; type: string
  description: string; tasks: {id:string;title:string;description:string}[]
  review_questions: {id:string;label:string;min_words:number;required:boolean}[]
  reward_type: string; reward_description: string|null; reward_usdc_amount: number|null
  contract_address: string|null; app_url: string|null; min_rank: number; is_fcfs: boolean
  creator_wallet: string; project_name: string|null; project_logo: string|null; campaign_logo: string|null
  total_slots: number|null; expires_at: string|null; status: string; created_at: string
  completion_count: number
}

export default function AdminPage() {
  const [mounted, setMounted]         = useState(false)
  const [authed, setAuthed]           = useState(false)
  const [pw, setPw]                   = useState("")
  const [password, setPassword]       = useState("")
  const [loading, setLoading]         = useState(false)
  const [tab, setTab]                 = useState<"pending"|"updates"|"campaign-updates"|"projects"|"contracts"|"events"|"locations"|"campaigns">("pending")
  const [submissions, setSubmissions] = useState<Project[]>([])
  const [projects, setProjects]       = useState<Project[]>([])
  const [contracts, setContracts]     = useState<Contract[]>([])
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([])
  const [events, setEvents]           = useState<Event[]>([])
  const [pendingCampaigns, setPendingCampaigns] = useState<AdminCampaign[]>([])
  const [pendingCampaignUpdates, setPendingCampaignUpdates] = useState<any[]>([])
  const [allCampaigns, setAllCampaigns] = useState<any[]>([])
  const [acting, setActing]           = useState(false)
  const [locInputs, setLocInputs]     = useState<Record<number,{city:string;country:string;status:string;result:string}>>({})
  const [toast, setToast]             = useState<{ok:boolean;text:string}|null>(null)
  const [rejectingCampaignId, setRejectingCampaignId] = useState<number|null>(null)
  const [rejectingProjectId, setRejectingProjectId]   = useState<number|null>(null)
  const [rejectProjectReason, setRejectProjectReason] = useState("")
  const [rejectReason, setRejectReason] = useState("")
  const [editing, setEditing]         = useState<Project|null>(null)
  const [editForm, setEditForm]       = useState<Partial<Project>>({})
  const [expandedContract, setExpandedContract] = useState<string|null>(null)
  const [showEventForm, setShowEventForm] = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [eventForm, setEventForm] = useState({
    name: "", tagline: "", type: "Hackathon", description: "",
    date: "", end_date: "", timezone: "UTC",
    location: "", is_online: false,
    link: "", organizer: "", organizer_twitter: "", email: "", logo_url: "",
  })
  const [eventLogoPreview, setEventLogoPreview] = useState<string|null>(null)
  const [eventLogoUploading, setEventLogoUploading] = useState(false)
  const [search, setSearch] = useState("")

  const mono  = "'DM Mono', monospace"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"

  useEffect(() => { setMounted(true) }, [])

  function showToast(ok: boolean, text: string) {
    setToast({ ok, text })
    setTimeout(() => setToast(null), 3500)
  }

  async function login() {
    const res  = await fetch(`/api/admin?action=auth`, { headers: { Authorization: `Bearer ${pw}` } })
    const data = await res.json()
    if (data.ok) { setPassword(pw); setAuthed(true); loadAll(pw) }
    else showToast(false, "Wrong password")
  }

  async function loadAll(p = password) {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin?action=list&_=${Date.now()}`, { headers: { Authorization: `Bearer ${p}` } })
      const data = await res.json()
      setSubmissions(data.submissions || [])
      setProjects(data.projects || [])
      setContracts(data.contracts || [])
      setPendingUpdates(data.pendingUpdates || [])
      setEvents(data.events || [])
      setPendingCampaigns(data.pendingCampaigns || [])
      setPendingCampaignUpdates(data.pendingCampaignUpdates || [])
      setAllCampaigns(data.allCampaigns || [])
    } finally { setLoading(false) }
  }

  async function act(id: number|string, action: string, table = "projects", extraData?: any) {
    setActing(true)
    try {
      const res  = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, password, table, data: extraData }),
      })
      const data = await res.json()
      if (data.success || data.ok) {
        showToast(true, action === "approve" ? "Approved" : action === "approve-all-updates" ? "All changes applied" : action === "reject-all-updates" ? "Changes rejected" : action === "approve-update" ? "Update applied" : action === "reject-update" ? "Update rejected" : action === "approve-campaign-update" ? "Campaign update applied" : action === "reject-campaign-update" ? "Campaign update rejected" : action === "delete" || action === "reject" ? "Removed" : "Done")
        loadAll()
      } else {
        showToast(false, data.error || "Action failed")
      }
    } catch { showToast(false, "Network error") }
    finally { setActing(false) }
  }

  function confirmDelete(id: number|string, table: string) {
    if (window.confirm("Are you sure you want to delete this? This cannot be undone.")) {
      act(id, "delete", table)
    }
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
      if (data.success) {
        showToast(true, "Project updated")
        const merged = { ...editing, ...editForm } as Project
        setProjects(prev => prev.map(p => String(p.id) === String(editing.id) ? merged : p))
        setSubmissions(prev => prev.map(p => String(p.id) === String(editing.id) ? merged : p))
        setEditing(null)
      }
      else showToast(false, data.error || "Update failed")
    } catch { showToast(false, "Network error") }
    finally { setActing(false) }
  }

  function startEdit(p: Project) {
    setEditing(p)
    setEditForm({ ...p })
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

  async function uploadEventLogo(file: File) {
    setEventLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res  = await fetch("/api/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (data.url) {
        setEventForm(p => ({ ...p, logo_url: data.url }))
        setEventLogoPreview(data.url)
      } else {
        showToast(false, "Logo upload failed")
      }
    } finally {
      setEventLogoUploading(false)
    }
  }

  async function createOfficialEvent() {
    if (!eventForm.name.trim()) { showToast(false, "Event name required"); return }
    if (!eventForm.date)        { showToast(false, "Event date required"); return }
    setCreatingEvent(true)
    try {
      const res  = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...eventForm, email: eventForm.email || "admin@arclens.app" }),
      })
      const data = await res.json()
      if (data.success && data.id) {
        await Promise.all([
          fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.id, action: "approve",      password, table: "events" }) }),
          fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.id, action: "badge-event", password, table: "events", data: { badge: "official" } }) }),
        ])
        showToast(true, "Official event created and live")
        setShowEventForm(false)
        setEventLogoPreview(null)
        setEventForm({ name: "", tagline: "", type: "Hackathon", description: "", date: "", end_date: "", timezone: "UTC", location: "", is_online: false, link: "", organizer: "", organizer_twitter: "", email: "", logo_url: "" })
        loadAll()
      } else {
        showToast(false, data.error || "Failed to create event")
      }
    } catch { showToast(false, "Network error") }
    finally { setCreatingEvent(false) }
  }

  if (!mounted) return <div style={{ minHeight:"100vh", background:"var(--bg,#060812)" }} />

  if (!authed) return (
    <ArcLayout active="">
      <div style={{ minHeight:"80vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:surf, border:"1px solid " + bdr, borderRadius:"16px", padding:"40px", width:"360px" }}>
          <div style={{ fontSize:"11px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"8px" }}>Arclens</div>
          <div style={{ fontSize:"22px", fontWeight:700, letterSpacing:"-0.04em", marginBottom:"6px", color:t1 }}>Admin Panel</div>
          <div style={{ fontSize:"12px", color:t2, marginBottom:"28px" }}>Enter your admin password to continue</div>
          <input
            type="password" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key==="Enter" && login()}
            placeholder="Password"
            style={{ width:"100%", height:"42px", background:surf2, border:"1px solid "+bdr, borderRadius:"8px", padding:"0 14px", fontSize:"13px", fontFamily:mono, color:t1, outline:"none", marginBottom:"14px", boxSizing:"border-box" }}
          />
          <button onClick={login} style={{ width:"100%", height:"42px", background:"#1a56ff", color:"#fff", fontSize:"13px", fontWeight:600, border:"none", borderRadius:"8px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
            Sign In →
          </button>
        </div>
      </div>
    </ArcLayout>
  )

  const pendingCount     = submissions.length + contracts.filter(c => !c.verified).length
  const pendingEvents    = events.filter(e => !e.approved).length
  const totalPending     = pendingCount + pendingUpdates.length + pendingEvents + pendingCampaigns.length + pendingCampaignUpdates.length
  const missingLoc       = [...submissions,...projects].filter((p:any)=>!p.lat).length
  const CAMPAIGN_TYPE_LABELS: Record<string,string> = { beta_test:"Beta Test", stress_test:"Stress Test", edge_case:"Edge Case Hunt", ux_review:"UX Review", onboarding:"Onboarding Test", integration:"Integration Test", builder_audit:"Builder Audit", payment_flow:"Payment Flow Test" }
  const REWARD_TYPE_LABELS: Record<string,string>   = { whitelist:"Whitelist", early_access:"Early Access", discord_role:"Discord Role", credit:"Public Credit", token_allocation:"Token Alloc.", usdc:"USDC", other:"Other" }

  // ── Sidebar nav config ──
  const queueTabs = [
    { id: "pending"   as const, label: "Submissions",  count: submissions.length,       urgent: submissions.length > 0 },
    { id: "updates"          as const, label: "Field Updates",    count: pendingUpdates.length,         urgent: pendingUpdates.length > 0 },
    { id: "campaign-updates" as const, label: "Campaign Edits",   count: pendingCampaignUpdates.length, urgent: pendingCampaignUpdates.length > 0 },
    { id: "campaigns"        as const, label: "Campaigns",         count: pendingCampaigns.length,       urgent: pendingCampaigns.length > 0 },
    { id: "events"    as const, label: "Events",        count: pendingEvents,            urgent: pendingEvents > 0 },
  ]
  const manageTabs = [
    { id: "projects"  as const, label: "All Projects",  count: projects.length,  urgent: false },
    { id: "contracts" as const, label: "Contracts",     count: contracts.length, urgent: false },
    { id: "locations" as const, label: "Locations",     count: missingLoc,       urgent: missingLoc > 0 },
  ]

  const sidebarBtnStyle = (active: boolean): React.CSSProperties => ({
    width: "100%", height: "36px", display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 10px", borderRadius: "7px", border: "none", cursor: "pointer", marginBottom: "2px",
    background: active ? "rgba(26,86,255,0.12)" : "transparent",
    color: active ? "#8aaeff" : t2,
    fontSize: "12px", fontFamily: "'Geist',sans-serif", textAlign: "left",
  })

  return (
    <ArcLayout active="">
      <div style={{ display:"flex", minHeight:"100vh" }}>

        {/* ── SIDEBAR ── */}
        <div style={{ width:"220px", background:surf, borderRight:"1px solid "+bdr, display:"flex", flexDirection:"column", flexShrink:0, position:"sticky", top:0, height:"100vh", overflowY:"auto" }}>

          {/* Brand */}
          <div style={{ padding:"20px 16px 16px", borderBottom:"1px solid "+bdr }}>
            <div style={{ fontSize:"13px", fontWeight:700, color:t1, letterSpacing:"-0.02em" }}>Arclens Admin</div>
            {totalPending > 0 && (
              <div style={{ display:"inline-flex", alignItems:"center", gap:"5px", marginTop:"6px", background:"rgba(224,51,72,0.1)", border:"1px solid rgba(224,51,72,0.2)", borderRadius:"5px", padding:"2px 8px" }}>
                <span style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#e03348", display:"inline-block" }} />
                <span style={{ fontSize:"10px", fontFamily:mono, color:"#e03348" }}>{totalPending} pending</span>
              </div>
            )}
          </div>

          {/* Review Queue */}
          <div style={{ padding:"16px 10px 8px" }}>
            <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.1em", padding:"0 6px 8px" }}>Review Queue</div>
            {queueTabs.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setSearch("") }} style={sidebarBtnStyle(tab === t.id)}>
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span style={{ fontSize:"10px", fontFamily:mono, padding:"1px 6px", borderRadius:"10px",
                    background: t.urgent ? "rgba(224,51,72,0.15)" : "rgba(107,125,168,0.1)",
                    color: t.urgent ? "#e03348" : t3,
                    border: `1px solid ${t.urgent ? "rgba(224,51,72,0.2)" : bdr}` }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Manage */}
          <div style={{ padding:"8px 10px" }}>
            <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.1em", padding:"0 6px 8px", marginTop:"8px" }}>Manage</div>
            {manageTabs.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setSearch("") }} style={sidebarBtnStyle(tab === t.id)}>
                <span>{t.label}</span>
                <span style={{ fontSize:"10px", fontFamily:mono, color: t.urgent ? "#e08810" : t3 }}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Bottom actions */}
          <div style={{ marginTop:"auto", padding:"16px 10px", borderTop:"1px solid "+bdr, display:"flex", flexDirection:"column", gap:"6px" }}>
            <button onClick={() => loadAll()} style={{ height:"32px", background:"transparent", border:"1px solid "+bdr, borderRadius:"6px", color:t2, fontSize:"11px", fontFamily:mono, cursor:"pointer" }}>
              ↻ Refresh
            </button>
            <button onClick={() => setAuthed(false)} style={{ height:"32px", background:"rgba(224,51,72,0.06)", border:"1px solid rgba(224,51,72,0.15)", borderRadius:"6px", color:"#e03348", fontSize:"11px", fontFamily:mono, cursor:"pointer" }}>
              Sign Out
            </button>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ flex:1, padding:"28px 32px 48px", overflowY:"auto", minWidth:0 }}>

          {/* Tab header */}
          <div style={{ marginBottom:"24px" }}>
            <div style={{ fontSize:"18px", fontWeight:700, letterSpacing:"-0.03em", color:t1 }}>
              {tab === "pending"          ? "Project Submissions"
               : tab === "updates"          ? "Founder Field Updates"
               : tab === "campaign-updates" ? "Campaign Edit Requests"
               : tab === "campaigns"        ? "Campaign Reviews"
               : tab === "events"           ? "Events"
               : tab === "projects"         ? "All Projects"
               : tab === "contracts"        ? "Contract Registry"
               : "Location Mapping"}
            </div>
            <div style={{ fontSize:"11px", fontFamily:mono, color:t3, marginTop:"4px" }}>
              {tab === "pending"          ? `${submissions.length} awaiting approval`
               : tab === "updates"          ? `${pendingUpdates.length} field changes to review`
               : tab === "campaign-updates" ? `${pendingCampaignUpdates.length} campaign edit requests to review`
               : tab === "campaigns"        ? `${pendingCampaigns.length} campaigns awaiting approval`
               : tab === "events"    ? `${pendingEvents} pending · ${events.length} total`
               : tab === "projects"  ? `${projects.length} approved projects on Arc Ecosystem`
               : tab === "contracts" ? `${contracts.length} total · ${contracts.filter(c=>!c.verified).length} unverified`
               : `${missingLoc} missing coordinates`}
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div style={{ position:"fixed", top:"20px", right:"24px", zIndex:9999, padding:"12px 18px", borderRadius:"10px",
              background: toast.ok ? "rgba(0,184,122,0.12)" : "rgba(224,51,72,0.12)",
              border: `1px solid ${toast.ok ? "rgba(0,184,122,0.3)" : "rgba(224,51,72,0.3)"}`,
              color: toast.ok ? "#00d990" : "#e03348", fontSize:"13px", fontFamily:"'Geist',sans-serif",
              display:"flex", alignItems:"center", gap:"10px", boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
              <span>{toast.ok ? "✓" : "✗"}</span>
              <span>{toast.text}</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding:"60px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>Loading...</div>
          ) : (
            <>
              {/* ── PENDING SUBMISSIONS ── */}
              {tab === "pending" && (
                <div>
                  {submissions.length === 0 && contracts.filter(c=>!c.verified).length === 0 ? (
                    <EmptyState icon="✓" title="All caught up" sub="No pending project submissions" />
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                      <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name..."
                        style={{ height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"8px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", width:"100%", boxSizing:"border-box" as const }}
                      />
                      {submissions.filter((s:any) => s.name?.toLowerCase().includes(search.toLowerCase())).map((s: any) => (
                        <div key={s.id}>
                        <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"12px", padding:"18px 22px", display:"flex", alignItems:"center", gap:"16px" }}>
                          <div style={{ width:"44px", height:"44px", borderRadius:"10px", background:"rgba(26,86,255,0.08)", border:"1px solid rgba(26,86,255,0.15)", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
                            {s.logo_url
                              ? <img src={`/api/image-proxy?url=${encodeURIComponent(s.logo_url)}`} alt={s.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>(e.currentTarget.style.display="none")} />
                              : <span style={{ fontSize:"16px", fontWeight:700, color:"#8aaeff" }}>{s.name?.[0]}</span>
                            }
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:"14px", fontWeight:600, color:t1, marginBottom:"2px" }}>{s.name}</div>
                            <div style={{ fontSize:"12px", color:t2, marginBottom:"4px" }}>{s.tagline}</div>
                            <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
                              <span style={pill(t3, bdr)}>{s.category}</span>
                              <span style={pill(t3, bdr)}>{s.email || "No email"}</span>
                              <span style={pill(t3, bdr)}>{new Date(s.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                            <ActionBtn onClick={() => act(s.id, "approve")} disabled={acting} color="green">Approve</ActionBtn>
                            <ActionBtn onClick={() => startEdit(s)} color="blue">Edit</ActionBtn>
                            <ActionBtn onClick={() => { setRejectingProjectId(s.id); setRejectProjectReason("") }} disabled={acting} color="red">Reject</ActionBtn>
                          </div>
                        </div>
                        {rejectingProjectId === s.id && (
                          <div style={{ borderTop:"1px solid rgba(224,51,72,0.15)", padding:"14px 22px 18px", background:"rgba(224,51,72,0.03)" }}>
                            <div style={{ fontSize:"10px", fontFamily:mono, color:"#e03348", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>Rejection reason (sent to builder)</div>
                            <select
                              value={rejectProjectReason}
                              onChange={e => setRejectProjectReason(e.target.value)}
                              style={{ width:"100%", background:surf2, border:"1px solid rgba(224,51,72,0.2)", borderRadius:"7px", padding:"8px 12px", fontSize:"12px", fontFamily:mono, color:rejectProjectReason ? t1 : t3, outline:"none", marginBottom:"8px", boxSizing:"border-box" as const }}
                            >
                              <option value="">Select a reason or type below...</option>
                              <option value="Project does not appear to be deployed or active on Arc Testnet.">Not deployed or active on Arc Testnet</option>
                              <option value="Insufficient project information — missing website, description, or verifiable links.">Insufficient information</option>
                              <option value="Logo or branding does not meet listing standards.">Logo or branding quality</option>
                              <option value="Project category or description appears misleading.">Misleading category or description</option>
                              <option value="A duplicate or near-identical listing already exists.">Duplicate listing</option>
                            </select>
                            <textarea
                              value={rejectProjectReason}
                              onChange={e => setRejectProjectReason(e.target.value)}
                              placeholder="Or write a custom reason..."
                              rows={2}
                              style={{ width:"100%", background:surf2, border:"1px solid rgba(224,51,72,0.2)", borderRadius:"7px", padding:"8px 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", resize:"vertical", lineHeight:1.6, boxSizing:"border-box" as const, marginBottom:"10px" }}
                            />
                            <div style={{ display:"flex", gap:"8px" }}>
                              <button
                                onClick={() => { act(s.id, "reject", "projects", { reason: rejectProjectReason }); setRejectingProjectId(null) }}
                                disabled={acting}
                                style={{ height:"30px", padding:"0 16px", background:"rgba(224,51,72,0.12)", color:"#e03348", fontSize:"11px", border:"1px solid rgba(224,51,72,0.3)", borderRadius:"5px", cursor:"pointer", fontWeight:600, opacity:acting?.6:1 }}>
                                Confirm Reject
                              </button>
                              <button onClick={() => setRejectingProjectId(null)}
                                style={{ height:"30px", padding:"0 14px", background:"transparent", color:t2, fontSize:"11px", border:"1px solid "+bdr, borderRadius:"5px", cursor:"pointer" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── PENDING UPDATES ── */}
              {tab === "updates" && (() => {
                // Group all pending field changes by project so admin makes one decision per project
                const groups: Record<number, { project_id: number; project_name: string; project_slug: string; submitted_at: string; fields: any[] }> = {}
                for (const u of pendingUpdates as any[]) {
                  if (!groups[u.project_id]) {
                    groups[u.project_id] = { project_id: u.project_id, project_name: u.project_name, project_slug: u.project_slug, submitted_at: u.submitted_at, fields: [] }
                  }
                  groups[u.project_id].fields.push(u)
                }
                const groupList = Object.values(groups)
                return (
                  <div>
                    {groupList.length === 0 ? (
                      <EmptyState icon="✓" title="No pending updates" sub="Founder listing changes will appear here" />
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                        {groupList.map(g => (
                          <div key={g.project_id} style={{ background:surf, border:"1px solid "+bdr, borderRadius:"12px", padding:"18px 22px" }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px", flexWrap:"wrap", gap:"8px" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                <span style={{ fontSize:"14px", fontWeight:600, color:t1 }}>{g.project_name}</span>
                                <span style={{ fontSize:"10px", fontFamily:mono, color:"#8aaeff", padding:"2px 8px", background:"rgba(26,86,255,0.1)", borderRadius:"4px", border:"1px solid rgba(26,86,255,0.2)" }}>
                                  {g.fields.length} field{g.fields.length !== 1 ? "s" : ""} changed
                                </span>
                              </div>
                              <span style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{new Date(g.submitted_at).toLocaleDateString()}</span>
                            </div>

                            {/* All field changes stacked */}
                            <div style={{ display:"flex", flexDirection:"column", gap:"8px", marginBottom:"14px" }}>
                              {g.fields.map((u: any) => (
                                <div key={u.id} style={{ display:"grid", gridTemplateColumns:"90px 1fr 1fr", gap:"8px", alignItems:"start" }}>
                                  <span style={{ fontSize:"9px", fontFamily:mono, color:"#8aaeff", padding:"4px 0", textAlign:"center", background:"rgba(26,86,255,0.08)", borderRadius:"5px", border:"1px solid rgba(26,86,255,0.18)" }}>
                                    {u.field}
                                  </span>
                                  <div style={{ padding:"7px 10px", background:"rgba(224,51,72,0.04)", border:"1px solid rgba(224,51,72,0.12)", borderRadius:"6px" }}>
                                    <div style={{ fontSize:"8px", fontFamily:mono, color:"#e03348", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"3px" }}>Current</div>
                                    <div style={{ fontSize:"11px", color:t2, wordBreak:"break-all", lineHeight:1.4 }}>{u.old_value || "—"}</div>
                                  </div>
                                  <div style={{ padding:"7px 10px", background:"rgba(0,184,122,0.04)", border:"1px solid rgba(0,184,122,0.12)", borderRadius:"6px" }}>
                                    <div style={{ fontSize:"8px", fontFamily:mono, color:"#00b87a", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"3px" }}>Proposed</div>
                                    <div style={{ fontSize:"11px", color:t1, wordBreak:"break-all", lineHeight:1.4 }}>{u.new_value}</div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div style={{ marginBottom:"10px" }}>
                              <input
                                id={`pu-reason-${g.project_id}`}
                                type="text"
                                placeholder="Rejection reason (optional — sent to founder by email)"
                                style={{ width:"100%", height:"34px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", color:t1, outline:"none", boxSizing:"border-box" as const, fontFamily:mono }}
                              />
                            </div>
                            <div style={{ display:"flex", gap:"8px" }}>
                              <ActionBtn onClick={() => act(g.project_id, "approve-all-updates")} disabled={acting} color="green">Apply All Changes</ActionBtn>
                              <ActionBtn onClick={() => act(g.project_id, "reject-all-updates", "projects", { reason: (document.getElementById(`pu-reason-${g.project_id}`) as HTMLInputElement)?.value || "" })} disabled={acting} color="red">Reject All</ActionBtn>
                              <a href={`/ecosystem/${g.project_slug}`} target="_blank" rel="noopener noreferrer"
                                style={{ height:"32px", padding:"0 14px", display:"flex", alignItems:"center", background:"transparent", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", textDecoration:"none" }}>
                                View Project ↗
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── CAMPAIGN EDIT REQUESTS ── */}
              {tab === "campaign-updates" && (
                <div>
                  {pendingCampaignUpdates.length === 0 ? (
                    <EmptyState icon="✓" title="No campaign edit requests" sub="Founder campaign change requests will appear here for review" />
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                      {pendingCampaignUpdates.map((u: any) => {
                        const ch = u.proposed_changes as Record<string, any>
                        return (
                          <div key={u.id} style={{ background:surf, border:"1px solid "+bdr, borderRadius:"12px", padding:"18px 22px" }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px", flexWrap:"wrap", gap:"8px" }}>
                              <div>
                                <span style={{ fontSize:"14px", fontWeight:600, color:t1 }}>{u.campaign_title}</span>
                                <span style={{ fontSize:"10px", fontFamily:mono, color:t3, marginLeft:"8px" }}>Campaign #{u.campaign_id}</span>
                              </div>
                              <span style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{new Date(u.submitted_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{ display:"flex", flexDirection:"column", gap:"8px", marginBottom:"14px" }}>
                              {Object.entries(ch).map(([field, value]) => (
                                <div key={field} style={{ display:"grid", gridTemplateColumns:"120px 1fr", gap:"10px", alignItems:"start" }}>
                                  <span style={{ fontSize:"10px", fontFamily:mono, color:"#8aaeff", padding:"3px 8px", background:"rgba(26,86,255,0.1)", borderRadius:"4px", border:"1px solid rgba(26,86,255,0.2)", textAlign:"center" }}>{field}</span>
                                  <span style={{ fontSize:"12px", color:t1, padding:"3px 8px", background:"rgba(0,184,122,0.04)", border:"1px solid rgba(0,184,122,0.12)", borderRadius:"4px", wordBreak:"break-all" }}>{String(value)}</span>
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize:"10px", fontFamily:mono, color:t3, marginBottom:"12px" }}>
                              Requested by: {u.requester_wallet?.slice(0,10)}...{u.requester_wallet?.slice(-6)}
                            </div>
                            <div style={{ marginBottom:"10px" }}>
                              <input
                                id={`cu-reason-${u.id}`}
                                type="text"
                                placeholder="Rejection reason (optional — sent to founder by email)"
                                style={{ width:"100%", height:"34px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", color:t1, outline:"none", boxSizing:"border-box" as const, fontFamily:mono }}
                              />
                            </div>
                            <div style={{ display:"flex", gap:"8px" }}>
                              <ActionBtn onClick={() => act(u.id, "approve-campaign-update")} disabled={acting} color="green">Apply Changes</ActionBtn>
                              <ActionBtn onClick={() => act(u.id, "reject-campaign-update", "projects", { reason: (document.getElementById(`cu-reason-${u.id}`) as HTMLInputElement)?.value || "" })} disabled={acting} color="red">Reject</ActionBtn>
                              <a href={`/forge/${u.campaign_id}`} target="_blank" rel="noopener noreferrer"
                                style={{ height:"32px", padding:"0 14px", display:"flex", alignItems:"center", background:"transparent", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", textDecoration:"none" }}>
                                View Campaign ↗
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── ALL PROJECTS ── */}
              {tab === "projects" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name..."
                    style={{ height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"8px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", width:"100%", boxSizing:"border-box" as const }}
                  />
                  {projects.length === 0 ? (
                    <div style={{ padding:"48px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>No approved projects yet</div>
                  ) : projects.filter((p:any) => p.name?.toLowerCase().includes(search.toLowerCase())).map((p: any) => (
                    <div key={p.id} style={{ background:surf, border:"1px solid "+bdr, borderRadius:"10px", padding:"14px 18px", display:"flex", alignItems:"center", gap:"14px" }}>
                      <div style={{ width:"38px", height:"38px", borderRadius:"8px", background:"rgba(26,86,255,0.06)", border:"1px solid "+bdr, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
                        {p.logo_url
                          ? <img src={`/api/image-proxy?url=${encodeURIComponent(p.logo_url!)}`} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>(e.currentTarget.style.display="none")} />
                          : <span style={{ fontSize:"13px", fontWeight:700, color:t3 }}>{p.name?.[0]}</span>
                        }
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"2px" }}>
                          <span style={{ fontSize:"13px", fontWeight:600, color:t1 }}>{p.name}</span>
                          {p.badge && <span style={pill("#8aaeff","rgba(26,86,255,0.2)")}>{p.badge}</span>}
                          {p.featured && <span style={pill("#c08828","rgba(192,136,40,0.2)")}>Featured</span>}
                          {p.live && <span style={pill("#00b87a","rgba(0,184,122,0.2)")}>Live</span>}
                        </div>
                        <div style={{ fontSize:"11px", color:t2 }}>{p.category} · {p.website || "No website"}</div>
                      </div>
                      <div style={{ display:"flex", gap:"6px", flexShrink:0 }}>
                        <ActionBtn onClick={() => startEdit(p)} color="blue">Edit</ActionBtn>
                        <ActionBtn onClick={() => confirmDelete(p.id, "projects")} disabled={acting} color="red">Delete</ActionBtn>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── CONTRACTS ── */}
              {tab === "contracts" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  {contracts.length === 0 ? (
                    <div style={{ padding:"48px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>No contract submissions</div>
                  ) : contracts.map((c: any) => (
                    <div key={c.address} style={{ background:surf, border:"1px solid "+bdr, borderRadius:"10px", overflow:"hidden" }}>
                      <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:"14px" }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"3px" }}>
                            <span style={{ fontSize:"13px", fontWeight:600, color:t1 }}>{c.name}</span>
                            {c.verified && <span style={pill("#00b87a","rgba(0,184,122,0.2)")}>Verified</span>}
                            {c.flag_reason && <span style={pill("#e08810","rgba(224,136,16,0.2)")}>⚠ Flagged</span>}
                          </div>
                          <div style={{ fontSize:"10.5px", fontFamily:mono, color:"#8aaeff", marginBottom:"2px" }}>{c.address}</div>
                          <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{c.type} · {c.email || "No email"} · {new Date(c.created_at).toLocaleDateString()}</div>
                          {c.flag_reason && <div style={{ fontSize:"10px", fontFamily:mono, color:"#e08810", marginTop:"3px" }}>{c.flag_reason}</div>}
                        </div>
                        <div style={{ display:"flex", gap:"6px", flexShrink:0 }}>
                          <button onClick={() => setExpandedContract(expandedContract === c.address ? null : c.address)}
                            style={{ height:"30px", padding:"0 10px", background:"transparent", color:t2, fontSize:"11px", border:"1px solid "+bdr, borderRadius:"5px", cursor:"pointer", fontFamily:mono }}>
                            {expandedContract === c.address ? "Hide ▲" : "Review ▼"}
                          </button>
                          {!c.verified && <ActionBtn onClick={() => act(c.address, "approve", "contracts")} disabled={acting} color="green">Approve</ActionBtn>}
                          <a href={"/address/"+c.address} target="_blank" rel="noopener noreferrer"
                            style={{ height:"30px", padding:"0 10px", display:"flex", alignItems:"center", background:"transparent", color:"#8aaeff", fontSize:"11px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"5px", textDecoration:"none" }}>
                            View ↗
                          </a>
                          <ActionBtn onClick={() => confirmDelete(c.address, "contracts")} disabled={acting} color="red">Delete</ActionBtn>
                        </div>
                      </div>
                      {expandedContract === c.address && (
                        <div style={{ borderTop:"1px solid "+bdr, padding:"14px 18px", background:"rgba(0,0,0,0.2)" }}>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
                            {[{label:"Deployer",value:c.deployer},{label:"Website",value:c.website},{label:"Twitter",value:c.twitter},{label:"Email",value:c.email}].map(f => (
                              <div key={f.label}>
                                <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"3px" }}>{f.label}</div>
                                <div style={{ fontSize:"11px", fontFamily:mono, color:f.value?t1:t3, wordBreak:"break-all" }}>{f.value||"—"}</div>
                              </div>
                            ))}
                          </div>
                          {c.description && <div style={{ fontSize:"12px", color:t2, lineHeight:1.6, marginBottom:"10px" }}>{c.description}</div>}
                          {c.source_code ? (
                            <pre style={{ fontSize:"10px", fontFamily:mono, color:"#6b7da8", background:"rgba(0,0,0,0.3)", border:"1px solid "+bdr, borderRadius:"6px", padding:"10px", maxHeight:"140px", overflowY:"auto", whiteSpace:"pre-wrap", wordBreak:"break-all", margin:0 }}>
                              {c.source_code.slice(0,800)}{c.source_code.length>800?"\n\n... [truncated]":""}
                            </pre>
                          ) : (
                            <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>No source code submitted</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── EVENTS ── */}
              {tab === "events" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                  <div style={{ display:"flex", justifyContent:"flex-end" }}>
                    <button onClick={() => setShowEventForm(!showEventForm)}
                      style={{ height:"34px", padding:"0 16px", background:showEventForm?"transparent":"#1a56ff", color:showEventForm?t2:"#fff", fontSize:"12px", fontWeight:600, border:"1px solid "+(showEventForm?bdr:"#1a56ff"), borderRadius:"7px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                      {showEventForm ? "Cancel" : "+ Create Official Event"}
                    </button>
                  </div>

                  {showEventForm && (
                    <div style={{ background:surf, border:"1px solid rgba(26,86,255,0.25)", borderRadius:"12px", overflow:"hidden", marginBottom:"4px" }}>
                      <div style={{ padding:"14px 20px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", gap:"8px" }}>
                        <span style={pill("#8aaeff","rgba(26,86,255,0.25)")}>🔵 OFFICIAL</span>
                        <span style={{ fontSize:"13px", fontWeight:600, color:t1 }}>Create Official Event</span>
                        <span style={{ fontSize:"11px", color:t2 }}>— auto-approved and marked official</span>
                      </div>
                      <div style={{ padding:"20px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                        <div style={{ gridColumn:"1 / -1", display:"flex", alignItems:"center", gap:"16px" }}>
                          <label style={{ cursor:"pointer" }}>
                            <div style={{ width:"72px", height:"72px", borderRadius:"10px", border:"2px dashed rgba(26,86,255,0.3)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", overflow:"hidden", background:eventLogoPreview?"transparent":"rgba(26,86,255,0.04)", flexShrink:0 }}>
                              {eventLogoPreview
                                ? <img src={eventLogoPreview} alt="logo" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                                : <><div style={{ fontSize:"20px", color:t3 }}>+</div><div style={{ fontSize:"8px", fontFamily:mono, color:t3 }}>{eventLogoUploading?"...":"Logo"}</div></>
                              }
                            </div>
                            <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{const f=e.target.files?.[0];if(f)uploadEventLogo(f)}} />
                          </label>
                          <div>
                            <div style={{ fontSize:"11px", color:t2, marginBottom:"4px" }}>Event Logo</div>
                            <div style={{ fontSize:"10px", fontFamily:mono, color:t3, lineHeight:1.6 }}>Click to upload · PNG, JPG, SVG<br/>Displayed on the events page</div>
                            {eventForm.logo_url && <div style={{ fontSize:"10px", fontFamily:mono, color:"#00b87a", marginTop:"4px" }}>✓ Uploaded</div>}
                          </div>
                        </div>
                        {[
                          {k:"name",l:"Event Name *",p:"Arc Hackathon 2025"},
                          {k:"tagline",l:"Tagline",p:"One-line description"},
                          {k:"organizer",l:"Organizer",p:"Arc Foundation"},
                          {k:"organizer_twitter",l:"Organizer Twitter",p:"@arclabs"},
                          {k:"link",l:"Event Link *",p:"https://..."},
                          {k:"email",l:"Contact Email",p:"events@arc.network"},
                        ].map((f:any) => (
                          <div key={f.k}>
                            <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>{f.l}</label>
                            <input value={(eventForm as any)[f.k]} onChange={e=>setEventForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.p}
                              style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as const }} />
                          </div>
                        ))}
                        <div>
                          <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Event Type</label>
                          <select value={eventForm.type} onChange={e=>setEventForm(p=>({...p,type:e.target.value}))}
                            style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}>
                            {["Hackathon","Conference","Workshop","Office Hours","AMA","Demo Day","Community Call","Twitter Space","Grant Round","Governance Vote","Meetup","Webinar","Launch","Ecosystem Sprint","Other"].map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Timezone</label>
                          <select value={eventForm.timezone} onChange={e=>setEventForm(p=>({...p,timezone:e.target.value}))}
                            style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}>
                            {["UTC","America/New_York","America/Los_Angeles","Europe/London","Europe/Berlin","Asia/Dubai","Asia/Singapore","Asia/Tokyo"].map(tz=><option key={tz} value={tz}>{tz}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Start Date & Time *</label>
                          <input type="datetime-local" value={eventForm.date} onChange={e=>setEventForm(p=>({...p,date:e.target.value}))}
                            style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as const }} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>End Date & Time</label>
                          <input type="datetime-local" value={eventForm.end_date} onChange={e=>setEventForm(p=>({...p,end_date:e.target.value}))}
                            style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as const }} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Location</label>
                          <input value={eventForm.location} onChange={e=>setEventForm(p=>({...p,location:e.target.value}))} placeholder="City, Country or Online"
                            style={{ width:"100%", height:"36px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as const }} />
                        </div>
                        <div style={{ display:"flex", alignItems:"center" }}>
                          <label style={{ display:"flex", alignItems:"center", gap:"10px", cursor:"pointer", fontSize:"12px", color:t2 }}>
                            <input type="checkbox" checked={eventForm.is_online} onChange={e=>setEventForm(p=>({...p,is_online:e.target.checked}))} />
                            Online / Virtual Event
                          </label>
                        </div>
                        <div style={{ gridColumn:"1 / -1" }}>
                          <label style={{ display:"block", fontSize:"9.5px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"5px" }}>Description</label>
                          <textarea value={eventForm.description} onChange={e=>setEventForm(p=>({...p,description:e.target.value}))} placeholder="What is this event about?"
                            style={{ width:"100%", height:"72px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", padding:"8px 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", resize:"vertical", boxSizing:"border-box" as const, lineHeight:1.6 }} />
                        </div>
                      </div>
                      <div style={{ padding:"0 20px 20px" }}>
                        <button onClick={createOfficialEvent} disabled={creatingEvent}
                          style={{ height:"38px", padding:"0 24px", background:"#1a56ff", color:"#fff", fontSize:"13px", fontWeight:600, border:"none", borderRadius:"8px", cursor:creatingEvent?"not-allowed":"pointer", fontFamily:"'Geist',sans-serif", opacity:creatingEvent?.7:1 }}>
                          {creatingEvent?"Creating...":"Create & Publish Official Event"}
                        </button>
                      </div>
                    </div>
                  )}

                  {events.map((e: any) => (
                    <div key={e.id} style={{ background:surf, border:"1px solid "+bdr, borderRadius:"10px", padding:"14px 18px", display:"flex", alignItems:"center", gap:"14px" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"3px", flexWrap:"wrap" }}>
                          <span style={{ fontSize:"13px", fontWeight:600, color:t1 }}>{e.name}</span>
                          {e.approved && <span style={pill("#00b87a","rgba(0,184,122,0.2)")}>Live</span>}
                          {!e.approved && <span style={pill("#e08810","rgba(224,136,16,0.2)")}>Pending</span>}
                          {e.featured && <span style={pill("#c08828","rgba(192,136,40,0.2)")}>Featured</span>}
                          {e.badge==="official" && <span style={pill("#8aaeff","rgba(26,86,255,0.2)")}>🔵 Official</span>}
                        </div>
                        <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>
                          {e.type} · {e.date?new Date(e.date).toLocaleDateString():"No date"} · {e.is_online?"Online":e.location||"No location"}
                        </div>
                        {e.organizer && <div style={{ fontSize:"10px", fontFamily:mono, color:t2, marginTop:"2px" }}>by {e.organizer}{e.organizer_twitter?` · ${e.organizer_twitter}`:""}</div>}
                      </div>
                      <div style={{ display:"flex", gap:"6px", flexShrink:0, flexWrap:"wrap" }}>
                        {!e.approved && <ActionBtn onClick={() => act(e.id, "approve", "events")} disabled={acting} color="green">Approve</ActionBtn>}
                        <button onClick={() => act(e.id, "feature-event", "events")} disabled={acting}
                          style={{ height:"30px", padding:"0 10px", background:e.featured?"rgba(192,136,40,0.1)":"transparent", color:e.featured?"#c08828":t2, fontSize:"11px", border:"1px solid "+(e.featured?"rgba(192,136,40,0.2)":bdr), borderRadius:"5px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                          {e.featured?"Unfeature":"Feature"}
                        </button>
                        <button onClick={() => act(e.id, "badge-event", "events", { badge: e.badge==="official"?"community":"official" } as any)} disabled={acting}
                          style={{ height:"30px", padding:"0 10px", background:e.badge==="official"?"rgba(26,86,255,0.1)":"transparent", color:e.badge==="official"?"#8aaeff":t2, fontSize:"11px", border:"1px solid "+(e.badge==="official"?"rgba(26,86,255,0.2)":bdr), borderRadius:"5px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                          {e.badge==="official"?"🔵 Official":"Set Official"}
                        </button>
                        {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ height:"30px", padding:"0 10px", display:"flex", alignItems:"center", background:"transparent", color:"#8aaeff", fontSize:"11px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"5px", textDecoration:"none" }}>View ↗</a>}
                        <ActionBtn onClick={() => confirmDelete(e.id, "events")} disabled={acting} color="red">Delete</ActionBtn>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── LOCATIONS ── */}
              {tab === "locations" && (() => {
                const allProjects = [...submissions,...projects] as any[]
                const missing = allProjects.filter(p => !p.lat||!p.lng)
                const withLoc = allProjects.filter(p => p.lat&&p.lng)
                return (
                  <div>
                    <div style={{ fontSize:"12px", color:t2, marginBottom:"20px", fontFamily:mono }}>
                      {missing.length} missing coordinates · {withLoc.length} already mapped
                    </div>
                    {missing.length === 0 ? (
                      <EmptyState icon="🌍" title="All projects mapped" sub="Every project has coordinates — globe dots are real" />
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                        {missing.map((p: any) => {
                          const inp = locInputs[p.id]||{city:p.city||"",country:p.country||"",status:"",result:""}
                          const isDone = inp.status==="done"; const isErr = inp.status==="error"; const isBusy = inp.status==="loading"
                          return (
                            <div key={p.id} style={{ background:surf, border:"1px solid "+bdr, borderRadius:"10px", padding:"12px 16px", display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
                              <div style={{ width:"34px", height:"34px", borderRadius:"8px", overflow:"hidden", background:"rgba(26,86,255,0.06)", border:"1px solid "+bdr, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                {p.logo_url?<img src={`/api/image-proxy?url=${encodeURIComponent(p.logo_url)}`} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>(e.currentTarget.style.display="none")} />:<span style={{ fontSize:"13px", fontWeight:700, color:t3 }}>{p.name?.[0]}</span>}
                              </div>
                              <div style={{ minWidth:"120px", flex:"0 0 auto" }}>
                                <div style={{ fontSize:"12px", fontWeight:600, color:t1 }}>{p.name}</div>
                                <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{p.category} · {p.approved?"live":"pending"}</div>
                              </div>
                              <input value={inp.city} onChange={e=>setLocInputs(prev=>({...prev,[p.id]:{...inp,city:e.target.value}}))}
                                onKeyDown={e=>e.key==="Enter"&&geocodeProject(p.id,{city:p.city||"",country:p.country||""})}
                                placeholder="City" style={{ flex:1, minWidth:"100px", height:"32px", background:surf2, border:"1px solid "+bdr, borderRadius:"6px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }} />
                              <input value={inp.country} onChange={e=>setLocInputs(prev=>({...prev,[p.id]:{...inp,country:e.target.value}}))}
                                onKeyDown={e=>e.key==="Enter"&&geocodeProject(p.id,{city:p.city||"",country:p.country||""})}
                                placeholder="Country" style={{ flex:1, minWidth:"100px", height:"32px", background:surf2, border:"1px solid "+bdr, borderRadius:"6px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }} />
                              <button onClick={()=>geocodeProject(p.id,{city:p.city||"",country:p.country||""})} disabled={isBusy||!inp.city.trim()}
                                style={{ height:"32px", padding:"0 14px", background:isDone?"rgba(0,184,122,0.1)":"rgba(26,86,255,0.1)", color:isDone?"#00d990":"#8aaeff", fontSize:"11px", fontFamily:mono, border:"1px solid "+(isDone?"rgba(0,184,122,0.2)":"rgba(26,86,255,0.2)"), borderRadius:"6px", cursor:"pointer", flexShrink:0 }}>
                                {isBusy?"...":isDone?"✓ Mapped":"Geocode →"}
                              </button>
                              {inp.result && <div style={{ fontSize:"10px", fontFamily:mono, color:isDone?"#00d990":"#e03348", whiteSpace:"nowrap" }}>{isErr?"✗ ":"📍 "}{inp.result}</div>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {withLoc.length > 0 && (
                      <div style={{ marginTop:"28px" }}>
                        <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"10px" }}>Already Mapped ({withLoc.length})</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
                          {withLoc.map((p: any) => (
                            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"8px 14px", background:"rgba(0,184,122,0.03)", border:"1px solid rgba(0,184,122,0.08)", borderRadius:"7px" }}>
                              <div style={{ fontSize:"12px", fontWeight:500, color:t1, flex:1 }}>{p.name}</div>
                              <div style={{ fontSize:"10px", fontFamily:mono, color:"#00b87a" }}>{p.city||"—"}{p.country?`, ${p.country}`:""}</div>
                              <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{Number(p.lat).toFixed(3)}, {Number(p.lng).toFixed(3)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── CAMPAIGNS ── */}
              {tab === "campaigns" && (
                <div>
                  {pendingCampaigns.length === 0 ? (
                    <EmptyState icon="✦" title="No pending campaigns" sub="Campaign submissions from founders will appear here for review" />
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                      {pendingCampaigns.map((c: AdminCampaign) => (
                        <div key={c.id} style={{ background:surf, border:"1px solid "+bdr, borderRadius:"12px", overflow:"hidden" }}>
                          <div style={{ padding:"18px 22px" }}>
                            {/* Header row */}
                            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"12px", marginBottom:"14px" }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"6px" }}>
                                  {(c.campaign_logo||c.project_logo) && (
                                    <img src={`/api/image-proxy?url=${encodeURIComponent((c.campaign_logo||c.project_logo)!)}`} alt="" style={{ width:32,height:32,borderRadius:7,objectFit:"cover",flexShrink:0 }} />
                                  )}
                                  <div>
                                    <div style={{ fontSize:"15px", fontWeight:600, color:t1 }}>{c.title}</div>
                                    {c.tagline && <div style={{ fontSize:"12px", color:t2, marginTop:2 }}>{c.tagline}</div>}
                                  </div>
                                </div>
                                <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"8px" }}>
                                  <span style={pill("#8aaeff","rgba(26,86,255,0.2)")}>{CAMPAIGN_TYPE_LABELS[c.type]||c.type}</span>
                                  <span style={pill(c.reward_type==="usdc"?"#00d990":t2, c.reward_type==="usdc"?"rgba(0,184,122,0.2)":bdr)}>
                                    {REWARD_TYPE_LABELS[c.reward_type]||c.reward_type}{c.reward_usdc_amount?` · $${c.reward_usdc_amount} USDC`:""}
                                  </span>
                                  {c.total_slots && <span style={pill(t3,bdr)}>{c.total_slots} slots</span>}
                                  {c.min_rank > 0 && <span style={pill("#c08828","rgba(192,136,40,0.2)")}>Min rank: {["Scout","Builder","Verified","Trusted","Arc Proven"][c.min_rank]}</span>}
                                  {c.contract_address && <span style={pill("#00d990","rgba(0,184,122,0.15)")}>✓ on-chain</span>}
                                  {c.app_url && <span style={pill("#6366f1","rgba(99,102,241,0.15)")}>has app URL</span>}
                                </div>
                                <div style={{ fontSize:"12px", color:t2 }}>
                                  {c.project_name && <><span style={{ color:t1, fontWeight:500 }}>{c.project_name}</span> · </>}
                                  <span style={{ fontFamily:mono }}>{c.creator_wallet.slice(0,10)}...{c.creator_wallet.slice(-6)}</span>
                                  <span style={{ marginLeft:10, fontSize:"10px", fontFamily:mono, color:t3 }}>Submitted {new Date(c.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                                <ActionBtn onClick={() => act(c.id, "approve", "campaigns")} disabled={acting} color="green">Approve</ActionBtn>
                                <ActionBtn onClick={() => { setRejectingCampaignId(c.id); setRejectReason("") }} disabled={acting} color="red">Reject</ActionBtn>
                              </div>
                            </div>

                            {/* Description */}
                            <div style={{ padding:"10px 14px", background:surf2, border:"1px solid "+bdr, borderRadius:"8px", fontSize:"12px", color:t2, lineHeight:1.6, marginBottom:"10px" }}>
                              {c.description}
                            </div>

                            {/* Tasks */}
                            {c.tasks?.length > 0 && (
                              <div style={{ marginBottom:"10px" }}>
                                <div style={{ fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"6px" }}>Tasks ({c.tasks.length})</div>
                                <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
                                  {c.tasks.map((t,i) => (
                                    <div key={t.id} style={{ display:"flex", gap:"8px", fontSize:"12px", color:t2 }}>
                                      <span style={{ fontFamily:mono, color:t3, flexShrink:0 }}>{String(i+1).padStart(2,"0")}</span>
                                      <span><span style={{ color:t1, fontWeight:500 }}>{t.title}</span>{t.description ? ` — ${t.description}` : ""}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Review questions */}
                            {c.review_questions?.length > 0 && (
                              <div style={{ marginBottom:"10px" }}>
                                <div style={{ fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"6px" }}>Review questions ({c.review_questions.length})</div>
                                <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
                                  {c.review_questions.map((q,i) => (
                                    <div key={q.id} style={{ fontSize:"12px", color:t2 }}>
                                      <span style={{ fontFamily:mono, color:t3 }}>Q{i+1} </span>
                                      {q.label}
                                      <span style={{ fontFamily:mono, color:t3, marginLeft:6 }}>min {q.min_words}w{q.required?" · required":""}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* App URL + contract */}
                            {(c.app_url || c.contract_address) && (
                              <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
                                {c.app_url && (
                                  <a href={c.app_url} target="_blank" rel="noopener noreferrer" style={{ fontSize:"11px", fontFamily:mono, color:"#6366f1", textDecoration:"none" }}>↗ {c.app_url}</a>
                                )}
                                {c.contract_address && (
                                  <span style={{ fontSize:"11px", fontFamily:mono, color:"#00d990" }}>{c.contract_address}</span>
                                )}
                              </div>
                            )}

                            {c.reward_description && (
                              <div style={{ marginTop:"10px", padding:"8px 12px", background:surf2, border:"1px solid "+bdr, borderRadius:"7px", fontSize:"12px", color:t2, fontStyle:"italic" }}>
                                "{c.reward_description}"
                              </div>
                            )}
                          </div>
                          {rejectingCampaignId === c.id && (
                            <div style={{ borderTop:"1px solid rgba(224,51,72,0.15)", padding:"14px 22px 18px", background:"rgba(224,51,72,0.03)" }}>
                              <div style={{ fontSize:"10px", fontFamily:mono, color:"#e03348", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>Rejection reason (shown to founder)</div>
                              <textarea
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="e.g. Duplicate campaign, insufficient detail in task descriptions, violates guidelines..."
                                rows={2}
                                style={{ width:"100%", background:surf2, border:"1px solid rgba(224,51,72,0.2)", borderRadius:"7px", padding:"8px 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", resize:"vertical", lineHeight:1.6, boxSizing:"border-box" as const, marginBottom:"10px" }}
                              />
                              <div style={{ display:"flex", gap:"8px" }}>
                                <button
                                  onClick={() => { act(c.id, "reject", "campaigns", { reason: rejectReason }); setRejectingCampaignId(null) }}
                                  disabled={acting}
                                  style={{ height:"30px", padding:"0 16px", background:"rgba(224,51,72,0.12)", color:"#e03348", fontSize:"11px", border:"1px solid rgba(224,51,72,0.3)", borderRadius:"5px", cursor:"pointer", fontFamily:"'Geist',sans-serif", fontWeight:600, opacity:acting?.6:1 }}>
                                  Confirm Reject
                                </button>
                                <button onClick={() => setRejectingCampaignId(null)}
                                  style={{ height:"30px", padding:"0 14px", background:"transparent", color:t2, fontSize:"11px", border:"1px solid "+bdr, borderRadius:"5px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── All Campaigns (manage / delete) ── */}
                  {allCampaigns.length > 0 && (
                    <div style={{ marginTop: 28 }}>
                      <div style={{ fontSize:"11px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>
                        All Campaigns ({allCampaigns.length})
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {allCampaigns.map((c: any) => {
                          const statusColor: Record<string,string> = {
                            active: "#00b87a", pending_approval: "#e08810", approved: "#8aaeff",
                            rejected: "#e03348", ended: "#6b7da8", completed: "#a855f7",
                          }
                          const sc = statusColor[c.status] || t3
                          return (
                            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:surf2, border:"1px solid "+bdr, borderRadius:9 }}>
                              <div style={{ width:7, height:7, borderRadius:"50%", background:sc, flexShrink:0 }} />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:t1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.title}</div>
                                <div style={{ fontSize:10, fontFamily:mono, color:t3, marginTop:2 }}>
                                  {c.project_name && <>{c.project_name} · </>}
                                  {c.status} · {c.filled_slots}/{c.total_slots ?? "∞"} slots · {new Date(c.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <a href={`/forge/${c.id}`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize:10, fontFamily:mono, color:t3, textDecoration:"none", padding:"3px 8px", border:"1px solid "+bdr, borderRadius:4, flexShrink:0 }}>
                                View
                              </a>
                              <button
                                onClick={() => { if (window.confirm(`Delete "${c.title}"? This also removes all completions and cannot be undone.`)) act(c.id, "delete-campaign") }}
                                disabled={acting}
                                style={{ height:28, padding:"0 12px", background:"rgba(224,51,72,0.08)", color:"#e03348", fontSize:11, border:"1px solid rgba(224,51,72,0.2)", borderRadius:5, cursor:"pointer", fontFamily:"'Geist',sans-serif", fontWeight:600, flexShrink:0 }}>
                                Delete
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {editing && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"20px" }}>
          <div style={{ background:"var(--surf,#0a0e1a)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"16px", padding:"28px", width:"100%", maxWidth:"560px", maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"20px" }}>
              <div style={{ fontSize:"16px", fontWeight:600, color:t1 }}>Edit: {editing.name}</div>
              <button onClick={() => setEditing(null)} style={{ background:"none", border:"none", color:t2, cursor:"pointer", fontSize:"20px", lineHeight:1 }}>×</button>
            </div>
            {[
              {k:"name",l:"Name",type:"text"},{k:"tagline",l:"Tagline",type:"text"},{k:"description",l:"Description",type:"textarea"},
              {k:"website",l:"Website",type:"text"},{k:"twitter",l:"Twitter",type:"text"},{k:"github",l:"GitHub",type:"text"},
              {k:"discord",l:"Discord",type:"text"},{k:"contract",l:"Primary Contract Address",type:"text"},{k:"email",l:"Email",type:"text"},
              {k:"logo_url",l:"Logo URL",type:"text"},{k:"city",l:"City",type:"text"},{k:"country",l:"Country",type:"text"},
              {k:"lat",l:"Latitude",type:"text"},{k:"lng",l:"Longitude",type:"text"},
            ].map((f:any) => (
              <div key={f.k} style={{ marginBottom:"10px" }}>
                <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"4px" }}>{f.l}</label>
                {f.type==="textarea"
                  ? <textarea value={(editForm as any)[f.k]||""} onChange={e=>setEditForm(p=>({...p,[f.k]:e.target.value}))}
                      style={{ width:"100%", height:"72px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"8px 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", resize:"vertical", boxSizing:"border-box" }} />
                  : <input value={(editForm as any)[f.k]||""} onChange={e=>setEditForm(p=>({...p,[f.k]:e.target.value}))}
                      style={{ width:"100%", height:"36px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" }} />
                }
              </div>
            ))}
            {/* Additional contract addresses */}
            <div style={{ marginBottom:"10px" }}>
              <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"6px" }}>Additional Contract Addresses</label>
              {((editForm as any).contracts || []).map((addr: string, i: number) => (
                <div key={i} style={{ display:"flex", gap:"6px", marginBottom:"6px" }}>
                  <input value={addr} onChange={e => setEditForm(p => { const arr = [...((p as any).contracts||[])]; arr[i]=e.target.value; return {...p, contracts: arr} })}
                    style={{ flex:1, height:"34px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"0 10px", fontSize:"11px", fontFamily:mono, color:t1, outline:"none", boxSizing:"border-box" as any }} placeholder="0x..." />
                  <button onClick={() => setEditForm(p => { const arr = ((p as any).contracts||[]).filter((_:any, j:number)=>j!==i); return {...p, contracts: arr} })}
                    style={{ height:"34px", padding:"0 10px", background:"rgba(224,51,72,0.08)", color:"#e03348", border:"1px solid rgba(224,51,72,0.2)", borderRadius:"7px", cursor:"pointer", fontSize:"12px" }}>✕</button>
                </div>
              ))}
              <button onClick={() => setEditForm(p => ({...p, contracts: [...((p as any).contracts||[]), ""]}))}
                style={{ height:"30px", padding:"0 12px", background:"rgba(26,86,255,0.08)", color:"#8aaeff", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", cursor:"pointer", fontSize:"11px", fontFamily:mono }}>
                + Add Contract
              </button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
              <div>
                <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"4px" }}>Category</label>
                <select value={editForm.category||""} onChange={e=>setEditForm(p=>({...p,category:e.target.value}))}
                  style={{ width:"100%", height:"36px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"4px" }}>Badge</label>
                <select value={editForm.badge||""} onChange={e=>setEditForm(p=>({...p,badge:e.target.value}))}
                  style={{ width:"100%", height:"36px", background:"var(--surf2,#0e1224)", border:"1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius:"7px", padding:"0 10px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}>
                  {BADGES.map(b=><option key={b} value={b}>{b||"None"}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:"flex", gap:"16px", marginBottom:"18px" }}>
              {[{k:"featured",l:"Featured"},{k:"live",l:"Live"}].map((f:any) => (
                <label key={f.k} style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer", fontSize:"12px", color:t2 }}>
                  <input type="checkbox" checked={!!(editForm as any)[f.k]} onChange={e=>setEditForm(p=>({...p,[f.k]:e.target.checked}))} />
                  {f.l}
                </label>
              ))}
            </div>
            <div style={{ display:"flex", gap:"10px" }}>
              <button onClick={saveEdit} disabled={acting}
                style={{ flex:1, height:"40px", background:"#1a56ff", color:"#fff", fontSize:"13px", fontWeight:600, border:"none", borderRadius:"8px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                {acting?"Saving...":"Save Changes"}
              </button>
              <button onClick={() => setEditing(null)}
                style={{ height:"40px", padding:"0 20px", background:"transparent", color:t2, fontSize:"13px", border:"1px solid "+bdr, borderRadius:"8px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ArcLayout>
  )
}

// ── Shared micro-components ──
function pill(color: string, border: string): React.CSSProperties {
  return { fontSize:"9px", fontFamily:"'DM Mono',monospace", padding:"2px 7px", borderRadius:"4px", color, border:`1px solid ${border}`, background:"transparent", display:"inline-flex", alignItems:"center" }
}

function ActionBtn({ onClick, disabled, color, children }: { onClick: () => void; disabled?: boolean; color: "green"|"blue"|"red"; children: React.ReactNode }) {
  const colors = {
    green: { bg:"rgba(0,184,122,0.1)", text:"#00d990", border:"rgba(0,184,122,0.2)" },
    blue:  { bg:"rgba(26,86,255,0.08)", text:"#8aaeff", border:"rgba(26,86,255,0.2)" },
    red:   { bg:"rgba(224,51,72,0.08)", text:"#e03348", border:"rgba(224,51,72,0.2)" },
  }[color]
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ height:"30px", padding:"0 12px", background:colors.bg, color:colors.text, fontSize:"11px", border:`1px solid ${colors.border}`, borderRadius:"5px", cursor:"pointer", fontFamily:"'Geist',sans-serif", opacity:disabled?.6:1 }}>
      {children}
    </button>
  )
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ padding:"64px", textAlign:"center" }}>
      <div style={{ fontSize:"32px", marginBottom:"12px" }}>{icon}</div>
      <div style={{ fontSize:"15px", fontWeight:600, color:"var(--t1,#e8ecff)", marginBottom:"6px" }}>{title}</div>
      <div style={{ fontSize:"12px", color:"var(--t2,#6b7da8)", fontFamily:"'DM Mono',monospace" }}>{sub}</div>
    </div>
  )
}
