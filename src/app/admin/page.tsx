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
}
interface Contract {
  id: number; address: string; name: string; type: string; email: string|null
  website: string|null; twitter: string|null; badge: string|null; deployer: string|null
  flag_reason: string|null; verified: boolean; created_at: string
}

export default function AdminPage() {
  const [mounted, setMounted]         = useState(false)
  const [authed, setAuthed]           = useState(false)
  const [pw, setPw]                   = useState("")
  const [password, setPassword]       = useState("")
  const [loading, setLoading]         = useState(false)
  const [tab, setTab]                 = useState<"pending"|"projects"|"contracts">("pending")
  const [submissions, setSubmissions] = useState<Project[]>([])
  const [projects, setProjects]       = useState<Project[]>([])
  const [contracts, setContracts]     = useState<Contract[]>([])
  const [acting, setActing]           = useState(false)
  const [msg, setMsg]                 = useState<{ok:boolean;text:string}|null>(null)
  const [editing, setEditing]         = useState<Project|null>(null)
  const [editForm, setEditForm]       = useState<Partial<Project>>({})

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
    } finally { setLoading(false) }
  }

  async function act(id: number, action: string, table = "projects") {
    setActing(true)
    setMsg(null)
    try {
      const res  = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, password, table }),
      })
      const data = await res.json()
      if (data.success || data.ok) {
        setMsg({ ok: true, text: action === "approve" ? "✓ Approved" : action === "delete" || action === "reject" ? "✓ Deleted" : "✓ Done" })
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

  return (
    <ArcLayout active="">
      <div style={{ padding:"24px 28px 48px" }}>

        {/* TOPBAR */}
        <div style={{ display:"flex", alignItems:"center", gap:"16px", marginBottom:"24px" }}>
          <div style={{ fontSize:"20px", fontWeight:700, letterSpacing:"-0.04em", color:t1 }}>Admin Panel</div>
          <div style={{ fontSize:"11px", fontFamily:mono, padding:"3px 10px", borderRadius:"5px", background:"rgba(224,51,72,0.08)", border:"1px solid rgba(224,51,72,0.2)", color:"#e03348" }}>
            {pendingCount} pending
          </div>
          <button onClick={() => loadAll()} style={{ marginLeft:"auto", height:"32px", padding:"0 14px", background:"transparent", color:t2, fontSize:"11px", fontFamily:mono, border:"1px solid "+bdr, borderRadius:"6px", cursor:"pointer" }}>
            ↻ Refresh
          </button>
          <button onClick={() => setAuthed(false)} style={{ height:"32px", padding:"0 14px", background:"transparent", color:"#e03348", fontSize:"11px", fontFamily:mono, border:"1px solid rgba(224,51,72,0.2)", borderRadius:"6px", cursor:"pointer" }}>
            Sign Out
          </button>
        </div>

        {/* TABS */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"20px" }}>
          {[
            { id:"pending"   as const, label:`Pending (${pendingCount})` },
            { id:"projects"  as const, label:`All Projects (${projects.length})` },
            { id:"contracts" as const, label:`Contracts (${contracts.length})` },
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
            {/* PENDING TAB */}
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
                  <div key={c.id} style={{ background:surf, border:border, borderRadius:"12px", padding:"16px 20px", display:"flex", alignItems:"center", gap:"16px" }}>
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
                      {!c.verified && <button onClick={() => act(c.id, "approve", "contracts")} disabled={acting}
                        style={{ height:"32px", padding:"0 14px", background:"rgba(0,184,122,0.1)", color:"#00d990", fontSize:"12px", border:"1px solid rgba(0,184,122,0.2)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                        Approve
                      </button>}
                      <a href={"/address/"+c.address} target="_blank" rel="noopener noreferrer"
                        style={{ height:"32px", padding:"0 12px", display:"flex", alignItems:"center", background:"transparent", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.2)", borderRadius:"6px", textDecoration:"none" }}>
                        View ↗
                      </a>
                      <button onClick={() => act(c.id, "delete", "contracts")} disabled={acting}
                        style={{ height:"32px", padding:"0 14px", background:"rgba(224,51,72,0.06)", color:"#e03348", fontSize:"12px", border:"1px solid rgba(224,51,72,0.15)", borderRadius:"6px", cursor:"pointer", fontFamily:"'Geist',sans-serif" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

              {/* Dropdowns */}
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

              {/* Toggles */}
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