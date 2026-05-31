"use client"
//
// ArcLensAI — pervasive AI surface, mounted once in ArcLayout.
//
// ArcLens-themed throughout: uses the app's CSS theme tokens (--surf, --t1,
// --bdr …) so it adapts to light/dark exactly like every other surface. Arc
// blue (#1a56ff) accent, USDC green (#00b87a) live dot, the Arc·Lens wordmark
// in the header, and a geometric lens-aperture mark (no emoji glyphs).
//
// Trigger:  floating pill, bottom-right — clean, themed, "Ask AI".
// Panel:    slides in from the right. Geist for prose, mono for data/receipts.

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

interface Msg {
  role: "user" | "assistant"
  content: string
}

interface DataCard { tool: string; data: any }

interface ChatResponse {
  message: Msg
  conversationId: number | string | null
  context?: { role: string; kb_hits: number; has_page_data: boolean; llm: string }
  cards?: DataCard[]
}

interface Turn {
  query:   string
  answer:  string | null
  loading: boolean
  ctx?:    ChatResponse["context"]
  cards?:  DataCard[]
  ms?:     number
}

// ── theme tokens ───────────────────────────────────────────────────────────
// All sourced from the CSS vars ArcLayout sets on <html>, so the AI tracks the
// active light/dark theme. Fallbacks are the dark values.
// Fixed premium-dark palette — overlay surfaces read as dark glass (Linear /
// Phantom command-palette style) regardless of the page's light/dark theme.
const BG    = "#060810"
const SURF  = "#0b0e16"
const SURF2 = "#0e121d"
const T1    = "#eef1f8"
const T2    = "#8b93a7"
const T3    = "#565e72"
const BDR   = "rgba(255,255,255,0.08)"
const ARC   = "#3b6bff"
const USDC  = "#00c896"
const SANS  = "'Geist', ui-sans-serif, system-ui, sans-serif"
const MONO  = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

// The brand mark — a lens aperture. ArcLens = a lens; this is a meaningful,
// geometric mark, not a generic sparkle. Arc-gradient rounded square with a
// white ring inside.
function LensMark({ size = 28 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: Math.round(size * 0.29),
      background: `linear-gradient(135deg, ${ARC} 0%, #4a78ff 100%)`,
      boxShadow: "0 4px 14px rgba(26,86,255,0.40), inset 0 1px 0 rgba(255,255,255,0.28)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <div style={{
        width: Math.round(size * 0.42),
        height: Math.round(size * 0.42),
        borderRadius: "50%",
        border: `${Math.max(1.5, size * 0.07)}px solid rgba(255,255,255,0.92)`,
        boxShadow: "0 0 6px rgba(255,255,255,0.35)",
      }} />
    </div>
  )
}

function Wordmark({ size = 13 }: { size?: number }) {
  return (
    <span style={{ fontFamily: SANS, fontWeight: 700, letterSpacing: "-0.03em", fontSize: size }}>
      <span style={{ color: T1 }}>Arc</span>
      <span style={{ color: ARC }}>Lens</span>
      <span style={{ color: T2, fontWeight: 600, letterSpacing: "0", marginLeft: "6px", fontSize: size - 2 }}>AI</span>
    </span>
  )
}

// Answer renderer — Geist prose with **bold**, bullet lines with arc markers.
function renderAnswer(text: string): React.ReactNode {
  const lines = text.split("\n")
  return lines.map((line, i) => {
    const bullet = line.match(/^\s*[•\-]\s+(.*)$/)
    if (bullet) {
      return (
        <div key={i} style={{ display: "flex", gap: "9px", marginBottom: "4px" }}>
          <span style={{ color: ARC, flexShrink: 0, marginTop: "1px" }}>•</span>
          <span style={{ flex: 1 }}>{renderInline(bullet[1])}</span>
        </div>
      )
    }
    if (line.trim() === "") return <div key={i} style={{ height: "7px" }} />
    return <div key={i} style={{ marginBottom: "4px" }}>{renderInline(line)}</div>
  })
}

function renderInline(s: string): React.ReactNode {
  // Tokenize **bold** and [text](url) markdown links.
  const parts = s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ color: T1, fontWeight: 600 }}>{p.slice(2, -2)}</strong>
    }
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = link[2]
      const external = /^https?:\/\//.test(href)
      return (
        <a key={i} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
          style={{ color: ARC, textDecoration: "none", borderBottom: `1px solid ${ARC}66`, fontWeight: 500 }}>
          {link[1]}
        </a>
      )
    }
    return <span key={i}>{p}</span>
  })
}

// ── Live-data cards — rendered from the AI's tool calls (real DB values) ─────
function metricLabel(m: string) { return m === "volume" ? "Volume" : m === "revenue" ? "Revenue" : "TVL" }

function CardShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: "12px", background: SURF2, border: `1px solid ${BDR}`, borderRadius: "14px", overflow: "hidden" }}>
      {title && <div style={{ padding: "10px 14px", fontFamily: MONO, fontSize: "9.5px", letterSpacing: "0.1em", textTransform: "uppercase", color: T3, borderBottom: `1px solid ${BDR}` }}>{title}</div>}
      {children}
    </div>
  )
}
function TokenAvatar({ name }: { name: string }) {
  const palette = ["#3b6bff", "#00b87a", "#a855f7", "#e0883b", "#2775ca", "#e0506e"]
  const c = palette[(name?.charCodeAt(0) || 0) % palette.length]
  return <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg, ${c}, ${c}aa)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{(name || "?")[0].toUpperCase()}</span>
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: "9px", color: T3, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: "14px", fontWeight: 600, color: T1, marginTop: "2px" }}>{value || "—"}</div>
    </div>
  )
}
function CardRow({ href, children, first }: { href: string; children: React.ReactNode; first?: boolean }) {
  return (
    <a href={href} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "11px 14px", textDecoration: "none", color: T1, borderTop: first ? "none" : `1px solid ${BDR}` }}>{children}</a>
  )
}

function renderCards(cards: DataCard[]): React.ReactNode {
  return cards.map((c, i) => {
    const d = c.data || {}
    if (c.tool === "list_top_projects") {
      const rows: any[] = d.projects || []
      if (!rows.length) return <CardShell key={i}><div style={{ padding: "13px 14px", fontSize: "12.5px", color: T2, lineHeight: 1.5 }}>{d.note || "Nothing reporting yet."}</div></CardShell>
      const mk = d.metric === "volume" ? "volume" : d.metric === "revenue" ? "revenue" : "tvl"
      return (
        <CardShell key={i} title={`Top Arc projects by ${metricLabel(d.metric)}`}>
          {rows.map((p, r) => (
            <CardRow key={r} href={`/ecosystem/${p.slug}`} first={r === 0}>
              <span style={{ fontFamily: MONO, fontSize: "11px", color: T3, width: 14 }}>{p.rank}</span>
              <TokenAvatar name={p.name} />
              <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              <span style={{ fontFamily: MONO, fontSize: "14px", fontWeight: 700, color: ARC }}>{p[mk]}</span>
            </CardRow>
          ))}
        </CardShell>
      )
    }
    if (c.tool === "get_project_metrics") {
      if (d.found === false) return <CardShell key={i}><div style={{ padding: "13px 14px", fontSize: "12.5px", color: T2 }}>{d.note || "Project not found."}</div></CardShell>
      return (
        <CardShell key={i}>
          <CardRow href={`/ecosystem/${d.slug}`} first>
            <TokenAvatar name={d.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>{d.name}</div>
              {d.category && <div style={{ fontSize: "10.5px", color: T3 }}>{d.category}</div>}
            </div>
          </CardRow>
          <div style={{ display: "flex", gap: "10px", padding: "2px 14px 14px" }}>
            <Stat label="TVL" value={d.tvl} /><Stat label="Volume" value={d.volume} /><Stat label="Revenue" value={d.revenue} />
          </div>
        </CardShell>
      )
    }
    if (c.tool === "compare_projects") {
      const found: any[] = d.found || []
      if (!found.length) return null
      return (
        <CardShell key={i} title="Comparison">
          <div style={{ display: "flex" }}>
            {found.map((p, ci) => (
              <div key={ci} style={{ flex: 1, padding: "13px 14px", borderLeft: ci ? `1px solid ${BDR}` : "none", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}><TokenAvatar name={p.name} /><span style={{ fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                  <Stat label="TVL" value={p.tvl} /><Stat label="Volume" value={p.volume} /><Stat label="Revenue" value={p.revenue} />
                </div>
              </div>
            ))}
          </div>
        </CardShell>
      )
    }
    if (c.tool === "search_ecosystem") {
      const rows: any[] = d.projects || []
      if (!rows.length) return null
      return (
        <CardShell key={i} title={`${d.count} project${d.count === 1 ? "" : "s"}`}>
          {rows.map((p, r) => (
            <CardRow key={r} href={`/ecosystem/${p.slug}`} first={r === 0}>
              <TokenAvatar name={p.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{p.name}</div>
                {p.tagline && <div style={{ fontSize: "10.5px", color: T3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.tagline}</div>}
              </div>
              {p.tvl && <span style={{ fontFamily: MONO, fontSize: "12px", color: T2, flexShrink: 0 }}>{p.tvl}</span>}
            </CardRow>
          ))}
        </CardShell>
      )
    }
    if (c.tool === "get_top_movers") {
      const rows: any[] = d.projects || []
      if (!rows.length) return <CardShell key={i}><div style={{ padding: "13px 14px", fontSize: "12.5px", color: T2, lineHeight: 1.5 }}>{d.note || "No movement yet."}</div></CardShell>
      return (
        <CardShell key={i} title={`${metricLabel(d.metric)} movers · last ${d.period_days}d`}>
          {rows.map((p, r) => {
            const up = !p.change_pct || p.change_pct.startsWith("+")
            return (
              <CardRow key={r} href={`/ecosystem/${p.slug}`} first={r === 0}>
                <span style={{ fontFamily: MONO, fontSize: "11px", color: T3, width: 14 }}>{p.rank}</span>
                <TokenAvatar name={p.name} />
                <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                <span style={{ fontFamily: MONO, fontSize: "13px", fontWeight: 700, color: T1 }}>{p.value || p.current}</span>
                {p.change_pct && <span style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 600, color: up ? USDC : "#ff5a6e", minWidth: 44, textAlign: "right" }}>{p.change_pct}</span>}
              </CardRow>
            )
          })}
        </CardShell>
      )
    }
    if (c.tool === "get_ecosystem_stats") {
      return (
        <CardShell key={i} title="Arc ecosystem">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", padding: "16px" }}>
            <Stat label="Projects" value={String(d.projects ?? "—")} />
            <Stat label="Total TVL" value={d.total_tvl} />
            <Stat label="Total Volume" value={d.total_volume} />
            <Stat label="Builders" value={String(d.builder_profiles ?? "—")} />
          </div>
        </CardShell>
      )
    }
    if (c.tool === "list_open_trials") {
      const rows: any[] = d.trials || []
      if (!rows.length) return <CardShell key={i}><div style={{ padding: "13px 14px", fontSize: "12.5px", color: T2, lineHeight: 1.5 }}>{d.note || "No open trials right now."}</div></CardShell>
      return (
        <CardShell key={i} title={`${d.count} open trial${d.count === 1 ? "" : "s"}`}>
          {rows.map((t, r) => (
            <CardRow key={r} href={`/trials/${t.slug}`} first={r === 0}>
              <TokenAvatar name={t.project || t.title} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                <div style={{ fontSize: "10.5px", color: T3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.reward ? `Reward: ${t.reward}` : (t.project || "")}</div>
              </div>
              {t.slots && <span style={{ fontFamily: MONO, fontSize: "10.5px", color: T2, flexShrink: 0 }}>{t.slots}</span>}
            </CardRow>
          ))}
        </CardShell>
      )
    }
    if (c.tool === "list_projects") {
      const rows: any[] = d.projects || []
      if (!rows.length) return <CardShell key={i}><div style={{ padding: "13px 14px", fontSize: "12.5px", color: T2, lineHeight: 1.5 }}>{d.note || "No projects match."}</div></CardShell>
      return (
        <CardShell key={i} title={`${d.count} project${d.count === 1 ? "" : "s"}`}>
          {rows.map((p, r) => (
            <CardRow key={r} href={`/ecosystem/${p.slug}`} first={r === 0}>
              <TokenAvatar name={p.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                  {p.name}{p.builder_verified && <span style={{ color: USDC, fontSize: "10px" }}>✓</span>}
                </div>
                <div style={{ fontSize: "10.5px", color: T3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.builder ? `by ${p.builder}` : (p.tagline || p.category || "")}</div>
              </div>
              {p.tvl && <span style={{ fontFamily: MONO, fontSize: "12px", color: T2, flexShrink: 0 }}>{p.tvl}</span>}
            </CardRow>
          ))}
        </CardShell>
      )
    }
    if (c.tool === "get_project_builder") {
      if (d.found === false || !d.builder) return <CardShell key={i}><div style={{ padding: "13px 14px", fontSize: "12.5px", color: T2, lineHeight: 1.5 }}>{d.note || "No builder on record yet."}</div></CardShell>
      const b = d.builder
      return (
        <CardShell key={i} title={`Builder of ${d.project}`}>
          <CardRow href={b.profile_url} first>
            <TokenAvatar name={b.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                {b.name}{b.verified && <span style={{ color: USDC, fontSize: "11px" }}>✓</span>}
              </div>
              <div style={{ fontSize: "10.5px", color: T3 }}>{b.claimed ? "Builder profile" : "Profile not set up yet"}</div>
            </div>
            <span style={{ fontFamily: MONO, fontSize: "11px", color: ARC, flexShrink: 0 }}>View →</span>
          </CardRow>
        </CardShell>
      )
    }
    return null
  })
}

// Route-aware suggestions.
function suggestions(pathname: string): string[] {
  if (pathname.startsWith("/dashboard/")) return [
    "How is my project doing this week?",
    "Draft an announcement for my latest milestone",
    "Walk me through onboarding my contract",
    "What should I do next to grow?",
  ]
  if (pathname.startsWith("/ecosystem/")) return [
    "Give me the elevator pitch for this project",
    "Is this project growing or shrinking?",
    "Show me chain proof of these numbers",
    "Who builds this and what have they shipped?",
  ]
  if (pathname.startsWith("/ecosystem")) return [
    "Top TVL on Arc right now",
    "Stablecoin DEXs ranked by volume",
    "Compare the top three protocols",
    "Who's growing fastest this week?",
  ]
  if (pathname.startsWith("/trials")) return [
    "Best trials I can finish today",
    "Highest USDC reward I qualify for",
    "How do I climb to Trusted rank?",
    "Trials from top-rated projects",
  ]
  if (pathname.startsWith("/admin")) return [
    "Which projects deserve to be featured this week?",
    "Who's the most promising new builder?",
    "Where is momentum on the platform right now?",
    "Draft outreach to a top new founder",
  ]
  return [
    "What's worth looking at on Arc right now?",
    "Show me the strongest stablecoin protocols",
    "Who's gained the most TVL this week?",
    "I'm new to Arc — where do I start?",
  ]
}

export default function ArcLensAI() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState("")
  const [convId, setConvId] = useState<number | string | null>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(v => !v)
      }
      if (e.key === "Escape" && open) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    if (!streamRef.current) return
    streamRef.current.scrollTop = streamRef.current.scrollHeight
  }, [turns])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const t0 = Date.now()
    setTurns(prev => [...prev, { query: trimmed, answer: null, loading: true }])
    setInput("")
    try {
      const thread: Msg[] = turns.flatMap(t => {
        const ms: Msg[] = [{ role: "user", content: t.query }]
        if (t.answer) ms.push({ role: "assistant", content: t.answer })
        return ms
      })
      thread.push({ role: "user", content: trimmed })
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: thread, route: pathname, conversationId: convId }),
      })
      if (!res.body) throw new Error("no stream")
      // Stream protocol: answer text, then \x1e + JSON trailer (id + context).
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const sep = buf.indexOf("\x1e")
        const soFar = sep >= 0 ? buf.slice(0, sep) : buf
        setTurns(prev => prev.map((t, i) => i === prev.length - 1 ? { ...t, answer: soFar, loading: soFar.length === 0 } : t))
      }
      const ms = Date.now() - t0
      const sep = buf.indexOf("\x1e")
      const answer = (sep >= 0 ? buf.slice(0, sep) : buf) || "Something went wrong — try again."
      let meta: ChatResponse | null = null
      if (sep >= 0) { try { meta = JSON.parse(buf.slice(sep + 1)) } catch {} }
      setTurns(prev => prev.map((t, i) => i === prev.length - 1 ? { ...t, answer, loading: false, ctx: meta?.context, cards: meta?.cards, ms } : t))
      if (meta?.conversationId != null) setConvId(meta.conversationId)
    } catch {
      setTurns(prev => prev.map((t, i) => i === prev.length - 1 ? { ...t, answer: "Network error — try again.", loading: false, ms: Date.now() - t0 } : t))
    }
  }, [turns, convId, pathname])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function clearSession() {
    setTurns([])
    setConvId(null)
  }

  return (
    <>
      {/* ── FLOATING TRIGGER — themed pill, bottom-right ───────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open ArcLens AI"
          title="Ask ArcLens AI (⌘K)"
          style={{
            position: "fixed",
            right: "20px", bottom: "20px",
            zIndex: 45,
            height: "44px",
            padding: "0 14px 0 8px",
            display: "flex", alignItems: "center", gap: "10px",
            background: SURF2,
            color: T1,
            border: `1px solid ${BDR}`,
            borderRadius: "999px",
            cursor: "pointer",
            fontFamily: SANS,
            fontSize: "13px", fontWeight: 600, letterSpacing: "-0.01em",
            boxShadow: "0 10px 28px rgba(0,0,0,0.32), 0 0 24px rgba(26,86,255,0.18)",
            transition: "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
            animation: "alFadeUp 360ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = "translateY(-2px)"
            e.currentTarget.style.borderColor = "rgba(26,86,255,0.45)"
            e.currentTarget.style.boxShadow = "0 14px 34px rgba(0,0,0,0.4), 0 0 30px rgba(26,86,255,0.30)"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = "none"
            e.currentTarget.style.borderColor = BDR
            e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.32), 0 0 24px rgba(26,86,255,0.18)"
          }}>
          <span style={{ position: "relative", display: "flex" }}>
            <span style={{
              position: "absolute", inset: "-5px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(26,86,255,0.4) 0%, rgba(26,86,255,0) 70%)",
              animation: "alBreathe 3.4s ease-in-out infinite",
            }} />
            <LensMark size={28} />
          </span>
          <span>Ask AI</span>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: "22px", height: "18px", padding: "0 5px",
            background: "rgba(127,127,127,0.12)",
            border: `1px solid ${BDR}`,
            borderRadius: "4px",
            fontSize: "10px", color: T2, fontFamily: MONO,
          }}>⌘K</span>
        </button>
      )}

      {/* ── BACKDROP ───────────────────────────────────────────────────── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 49,
            background: "rgba(4,6,13,0.55)",
            backdropFilter: "blur(7px)",
            animation: "alFadeIn 200ms ease",
          }}
        />
      )}

      {/* ── PANEL — slide-in from right ────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 50,
          right: "16px", top: "16px", bottom: "16px",
          width: "min(460px, calc(100vw - 32px))",
          background: `radial-gradient(130% 45% at 100% 0%, rgba(59,107,255,0.13), transparent 60%), ${SURF}`,
          border: `1px solid ${BDR}`, borderRadius: "24px",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
          fontFamily: SANS,
          color: T1,
          animation: "alPanelIn 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}>

          {/* HEADER — Arc·Lens wordmark + live dot */}
          <div style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${BDR}`,
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <LensMark size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Wordmark size={14} />
                <span style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: USDC,
                  boxShadow: `0 0 6px rgba(0,184,122,0.7)`,
                  animation: "alLive 2.2s ease-in-out infinite",
                }} />
              </div>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: T3, marginTop: "3px", letterSpacing: "0.02em" }}>
                live from the chain · {pathname}
              </div>
            </div>
            {turns.length > 0 && (
              <button onClick={clearSession} title="New conversation"
                style={{
                  height: "26px", padding: "0 10px",
                  background: "transparent", border: `1px solid ${BDR}`, borderRadius: "6px",
                  color: T2, fontFamily: MONO, fontSize: "10px", cursor: "pointer",
                }}>
                New
              </button>
            )}
            <button onClick={() => setOpen(false)} title="Close (Esc)"
              style={{
                height: "26px", width: "26px",
                background: "transparent", border: `1px solid ${BDR}`, borderRadius: "6px",
                color: T2, fontSize: "12px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              ✕
            </button>
          </div>

          {/* BODY */}
          <div ref={streamRef} style={{
            flex: 1, overflowY: "auto",
            padding: "18px 20px",
            display: "flex", flexDirection: "column", gap: "18px",
          }}>
            {turns.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: T1, letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                  What&apos;s moving on Arc today?
                </div>
                <div style={{ fontSize: "13px", color: T2, lineHeight: 1.65 }}>
                  I read the chain. I know every project on Arc — what they hold,
                  what they earn, who built them. Every number is fetched live;
                  I&apos;ll say &quot;I don&apos;t know&quot; before I&apos;d ever guess.
                </div>

                <div style={{ fontFamily: MONO, fontSize: "10px", color: T3, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "8px" }}>
                  Try asking
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {suggestions(pathname || "/").map((q, i) => (
                    <button key={i} onClick={() => send(q)}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        textAlign: "left",
                        padding: "11px 13px",
                        background: SURF2,
                        border: `1px solid ${BDR}`,
                        borderRadius: "10px",
                        color: T1,
                        fontFamily: SANS, fontSize: "13px",
                        cursor: "pointer",
                        transition: "border-color 0.14s, transform 0.14s, background 0.14s",
                        animation: `alPromptIn 320ms ${i * 55}ms backwards cubic-bezier(0.22, 1, 0.36, 1)`,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = "rgba(26,86,255,0.45)"
                        e.currentTarget.style.transform = "translateX(2px)"
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = BDR
                        e.currentTarget.style.transform = "none"
                      }}>
                      <span style={{ color: ARC, fontWeight: 700, flexShrink: 0 }}>›</span>
                      <span style={{ flex: 1 }}>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {turns.map((t, i) => (
                  <div key={i} style={{ animation: "alTurnIn 280ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                    {/* Query bubble — arc-tinted, right-aligned */}
                    <div style={{
                      alignSelf: "flex-end",
                      marginLeft: "auto",
                      maxWidth: "88%",
                      width: "fit-content",
                      padding: "9px 13px",
                      background: "rgba(26,86,255,0.12)",
                      border: "1px solid rgba(26,86,255,0.28)",
                      borderRadius: "12px 12px 4px 12px",
                      fontSize: "13px", color: T1, lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      marginBottom: "12px",
                    }}>
                      {t.query}
                    </div>
                    {/* Answer */}
                    <div style={{ display: "flex", gap: "10px" }}>
                      <LensMark size={22} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: "13px", lineHeight: 1.65, color: T1, paddingTop: "1px" }}>
                        {t.loading ? (
                          <div style={{ display: "flex", gap: "5px", padding: "6px 0" }}>
                            {[0, 1, 2].map(d => (
                              <span key={d} style={{
                                width: "6px", height: "6px", borderRadius: "50%",
                                background: ARC,
                                animation: `alDot 1.3s ease-in-out infinite`,
                                animationDelay: `${d * 0.15}s`,
                              }} />
                            ))}
                          </div>
                        ) : t.answer ? (
                          <>
                            {renderAnswer(t.answer)}
                            {t.cards && t.cards.length > 0 && renderCards(t.cards)}
                            {t.ctx?.llm && t.ctx.llm !== "stub" && (
                              <div style={{ marginTop: "10px", fontFamily: MONO, fontSize: "9.5px", color: T3, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: USDC, boxShadow: `0 0 5px ${USDC}` }} />
                                grounded in live Arc data
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* INPUT */}
          <div style={{ padding: "12px 16px 14px", borderTop: `1px solid ${BDR}` }}>
            <div style={{
              display: "flex", alignItems: "flex-end", gap: "8px",
              background: SURF2,
              border: `1px solid ${BDR}`,
              borderRadius: "12px",
              padding: "8px 10px 8px 12px",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about Arc, USDC, any project…"
                rows={1}
                style={{
                  flex: 1, resize: "none",
                  background: "transparent", border: "none", outline: "none",
                  color: T1, fontSize: "13px", fontFamily: SANS, lineHeight: 1.6,
                  padding: "3px 0", maxHeight: "140px", caretColor: ARC,
                }}
              />
              <button onClick={() => send(input)} disabled={!input.trim()}
                style={{
                  height: "30px", padding: "0 14px",
                  background: input.trim()
                    ? `linear-gradient(135deg, ${ARC} 0%, #4a78ff 100%)`
                    : "rgba(26,86,255,0.2)",
                  color: "#fff", border: "none", borderRadius: "8px",
                  fontFamily: SANS, fontSize: "12px", fontWeight: 600,
                  cursor: input.trim() ? "pointer" : "not-allowed",
                  flexShrink: 0,
                  boxShadow: input.trim() ? "0 3px 10px rgba(26,86,255,0.35)" : "none",
                  transition: "box-shadow 0.15s, transform 0.15s",
                }}
                onMouseEnter={e => { if (input.trim()) e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none" }}>
                Send
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "7px", fontFamily: MONO, fontSize: "9.5px", color: T3, letterSpacing: "0.03em" }}>
              <span>Enter to send · Shift+Enter for newline</span>
              <span>⌘K to toggle</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes alFadeUp  { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes alFadeIn  { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes alBreathe { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.85; transform: scale(1.18); } }
        @keyframes alLive    { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes alPanelIn { 0% { transform: translateX(28px) scale(0.98); opacity: 0; } 100% { transform: translateX(0) scale(1); opacity: 1; } }
        @keyframes alPromptIn{ 0% { opacity: 0; transform: translateX(6px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes alTurnIn  { 0% { opacity: 0; transform: translateY(4px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes alDot     { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
      `}</style>
    </>
  )
}
