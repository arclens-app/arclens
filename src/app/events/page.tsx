"use client"
import { useEffect, useState, useRef } from "react"
import ArcLayout from "@/components/ArcLayout"

interface Event {
  id: number
  name: string
  tagline: string | null
  type: string | null
  description: string | null
  date: string
  end_date: string | null
  timezone: string
  location: string | null
  is_online: boolean
  link: string | null
  logo_url: string | null
  organizer: string | null
  organizer_twitter: string | null
  tags: string[]
  badge: string | null
  featured: boolean
}

function imgSrc(url: string | null): string | null {
  if (!url) return null
  if (/\.blob\.vercel-storage\.com\//i.test(url)) return url
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

const EVENT_TYPES = ["All", "Hackathon", "Conference", "Workshop", "Office Hours", "AMA", "Demo Day", "Community Call", "Twitter Space", "Grant Round", "Governance Vote", "Meetup", "Webinar", "Launch", "Ecosystem Sprint", "Other"]
const TAGS = ["DeFi", "NFT", "Dev", "Community", "Gaming", "AI", "Payments", "Identity", "Infrastructure"]

function formatDate(d: string) {
  const date = new Date(d)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// When to show, in the EVENT's own timezone (matches how Arc lists it, e.g. "1:00 PM EDT").
// Same-day events get a date + time (range); multi-day get a date range, no time.
function eventWhen(start: string, end: string | null, tz: string): { date: string; time: string | null } {
  const zone = tz || "UTC"
  const s = new Date(start)
  const e = end ? new Date(end) : null
  const dateFull = (d: Date) => d.toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric", year: "numeric" })
  const dateShort = (d: Date) => d.toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric" })
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: zone })
  const t = (d: Date, withZone: boolean) => d.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", ...(withZone ? { timeZoneName: "short" } : {}) })
  if (!e || dayKey(s) === dayKey(e)) {
    const time = e && t(e, false) !== t(s, false) ? `${t(s, false)} – ${t(e, true)}` : t(s, true)
    return { date: dateFull(s), time }
  }
  const range = dayKey(s).slice(0, 7) === dayKey(e).slice(0, 7)
    ? `${dateShort(s)} – ${e.toLocaleDateString("en-US", { timeZone: zone, day: "numeric", year: "numeric" })}`
    : `${dateShort(s)} – ${dateFull(e)}`
  return { date: range, time: null }
}

// A <datetime-local> value is a naive wall-clock ("2026-07-10T13:00") with no zone.
// Combine it with the chosen IANA timezone to get the correct UTC instant, so a
// "1pm New York" submission is stored as the same instant Arc's own events use.
function zonedToUtcISO(naive: string, tz: string): string {
  if (!naive) return naive
  const s = naive.length === 16 ? naive + ":00" : naive
  const base = new Date(s + "Z") // read the wall-clock digits as if they were UTC
  if (isNaN(base.getTime())) return naive
  const utcD = new Date(base.toLocaleString("en-US", { timeZone: "UTC" }))
  const tzD = new Date(base.toLocaleString("en-US", { timeZone: tz || "UTC" }))
  return new Date(base.getTime() - (tzD.getTime() - utcD.getTime())).toISOString()
}

function buildIcsUrl(e: Event) {
  function pad(n: number) { return String(n).padStart(2, "0") }
  function toIcsDate(d: string) {
    const dt = new Date(d)
    return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`
  }
  const start = toIcsDate(e.date)
  const end   = e.end_date ? toIcsDate(e.end_date) : toIcsDate(new Date(new Date(e.date).getTime() + 3_600_000).toISOString())
  const loc   = e.is_online ? "Online" : (e.location || "")
  const desc  = (e.description || "").replace(/\n/g, "\\n").replace(/,/g, "\\,")
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ArcLens//Events//EN",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${e.name.replace(/,/g, "\\,")}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${loc}`,
    e.link ? `URL:${e.link}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n")
  return "data:text/calendar;charset=utf8," + encodeURIComponent(ics)
}

function isUpcoming(d: string) {
  return new Date(d) >= new Date()
}

function daysUntil(d: string) {
  const diff = new Date(d).getTime() - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days < 0)  return "Past"
  return `In ${days} days`
}

const TYPE_COLOR: Record<string, string> = {
  Hackathon:       "#1a56ff",
  Conference:      "#8b5cf6",
  Workshop:        "#00b87a",
  "Office Hours":  "#00b87a",
  AMA:             "#e08810",
  "Demo Day":      "#f59e0b",
  "Community Call":"#6b7da8",
  "Twitter Space": "#1d9bf0",
  "Grant Round":   "#00d990",
  "Governance Vote":"#8b5cf6",
  Meetup:          "#ec4899",
  Webinar:         "#06b6d4",
  Launch:          "#e03348",
  "Ecosystem Sprint":"#1a56ff",
  Other:           "#6b7da8",
}

export default function EventsPage() {
  const [mounted, setMounted]       = useState(false)
  const [events, setEvents]         = useState<Event[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState("All")
  const [badgeFilter, setBadgeFilter] = useState<"all"|"official"|"community">("all")
  const [search, setSearch]         = useState("")
  const [showPast, setShowPast]     = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [uploading, setUploading]   = useState(false)
  const [logoUrl, setLogoUrl]       = useState<string|null>(null)
  const [logoPreview, setLogoPreview] = useState<string|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: "", tagline: "", type: "Meetup", description: "",
    date: "", end_date: "", timezone: "UTC",
    location: "", is_online: false,
    link: "", organizer: "", organizer_twitter: "", email: "",
    tags: [] as string[],
  })

  useEffect(() => {
    setMounted(true)
    // Default the timezone picker to the submitter's own zone, not UTC.
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) setForm(f => ({ ...f, timezone: tz })) } catch {}
  }, [])

  useEffect(() => {
    if (!mounted) return
    fetch("/api/events")
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [mounted])

  async function handleLogoUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) { setSubmitError("Image must be under 5MB"); return }
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
      else { setSubmitError("Image upload failed — try a smaller file"); setLogoPreview(null) }
    } catch { setSubmitError("Image upload failed"); setLogoPreview(null) }
    finally { setUploading(false) }
  }

  function toggleTag(tag: string) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }))
  }

  async function submitEvent() {
    if (!form.name.trim())  { setSubmitError("Event name is required"); return }
    if (!form.date)         { setSubmitError("Event date is required"); return }
    if (!form.email.trim()) { setSubmitError("Contact email is required"); return }

    setSubmitting(true)
    setSubmitError("")
    try {
      const res  = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          date: zonedToUtcISO(form.date, form.timezone),
          end_date: form.end_date ? zonedToUtcISO(form.end_date, form.timezone) : "",
          logo_url: logoUrl,
        }),
      })
      const data = await res.json()
      if (data.success) { setSubmitted(true) }
      else { setSubmitError(data.error || "Submission failed") }
    } catch { setSubmitError("Network error — try again") }
    finally { setSubmitting(false) }
  }

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#05070f" }} />

  const mono   = "monospace"
  const border = "rgba(128,128,128,0.1)"
  const surf   = "var(--surf, #080c1a)"
  const surf2  = "var(--surf2, #0c1122)"
  const t1     = "var(--t1, #e8ecff)"
  const t2     = "var(--t2, #6b7da8)"
  const t3     = "var(--t3, #2e3a5c)"
  const bdr    = "var(--bdr, rgba(255,255,255,0.06))"
  const arc    = "#1a56ff"
  const usdc   = "#00b87a"

  const inputStyle = {
    width: "100%", height: "38px", background: surf2,
    border: "1px solid " + border, borderRadius: "7px",
    padding: "0 12px", fontSize: "12.5px", fontFamily: mono,
    color: t1, outline: "none",
  } as React.CSSProperties

  const upcoming = events.filter(e => isUpcoming(e.date))
  const past     = events.filter(e => !isUpcoming(e.date))

  const filtered = (showPast ? past : upcoming).filter(e => {
    const matchType   = filter === "All" || e.type === filter
    const matchBadge  = badgeFilter === "all" ? true
      : badgeFilter === "official"  ? e.badge === "official"
      : badgeFilter === "community" ? (e.badge === "community" || !e.badge)
      : true
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.organizer?.toLowerCase().includes(search.toLowerCase())
    return matchType && matchBadge && matchSearch
  })

  const featured = upcoming.filter(e => e.featured)

  function EventCard({ e }: { e: Event }) {
    const color      = TYPE_COLOR[e.type || ""] || "#6b7da8"
    const countdown  = daysUntil(e.date)
    const isPast     = countdown === "Past"
    const isUrgent   = countdown === "Today" || countdown === "Tomorrow"
    const twitterUrl = e.organizer_twitter
      ? e.organizer_twitter.startsWith("http") ? e.organizer_twitter : "https://x.com/" + e.organizer_twitter.replace("@", "")
      : null
    const icsUrl = buildIcsUrl(e)

    return (
      <div
        onMouseEnter={ev => { ev.currentTarget.style.borderColor = color + "50"; ev.currentTarget.style.transform = "translateY(-2px)"; ev.currentTarget.style.boxShadow = `0 8px 28px rgba(0,0,0,0.18)` }}
        onMouseLeave={ev => { ev.currentTarget.style.borderColor = border; ev.currentTarget.style.transform = "none"; ev.currentTarget.style.boxShadow = "none" }}
        style={{ background: surf, border: "1px solid " + border, borderRadius: "14px", overflow: "hidden", transition: "all .15s", display: "flex", flexDirection: "column", opacity: isPast ? 0.55 : 1 }}>

        {/* BANNER — the poster is the hero, badges overlaid */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "1200 / 628", overflow: "hidden", background: `linear-gradient(135deg, ${color}22, ${color}08)`, flexShrink: 0 }}>
          {e.logo_url
            ? <img src={imgSrc(e.logo_url)!} alt={e.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={ev => { ev.currentTarget.style.visibility = "hidden" }} />
            : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 22px", textAlign: "center", fontSize: "18px", fontWeight: 700, fontFamily: mono, letterSpacing: "-0.02em", lineHeight: 1.25, color }}>{e.name}</div>
          }
          {/* scrim keeps overlaid badges legible on any poster */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,0.34) 0%, transparent 26%, transparent 60%, rgba(0,0,0,0.40) 100%)" }} />
          {/* official / featured */}
          <div style={{ position: "absolute", top: "10px", left: "10px", display: "flex", gap: "6px" }}>
            {e.badge === "official" && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "8.5px", fontWeight: 700, fontFamily: mono, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: "999px", background: "rgba(26,86,255,0.92)", color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.28)" }}><span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#fff" }} />OFFICIAL</span>}
            {e.featured && <span style={{ fontSize: "8.5px", fontWeight: 700, fontFamily: mono, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: "999px", background: "rgba(192,136,40,0.92)", color: "#fff" }}>FEATURED</span>}
          </div>
          {/* countdown */}
          {!isPast && <span style={{ position: "absolute", top: "10px", right: "10px", fontSize: "9px", fontWeight: 600, fontFamily: mono, padding: "3px 9px", borderRadius: "999px", background: "rgba(0,0,0,0.5)", color: isUrgent ? "#ff6b7a" : "#5ff0b0", border: "1px solid rgba(255,255,255,0.14)" }}>{countdown}</span>}
          {/* type */}
          {e.type && <span style={{ position: "absolute", bottom: "10px", left: "10px", fontSize: "9px", fontFamily: mono, padding: "3px 9px", borderRadius: "999px", background: "rgba(0,0,0,0.5)", color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}>{e.type}</span>}
        </div>

        {/* TITLE */}
        <div style={{ padding: "14px 18px 0", fontSize: "15px", fontWeight: 700, letterSpacing: "-0.02em", color: t1, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>

        {/* TAGLINE */}
        {e.tagline && (
          <div style={{ padding: "0 18px 8px", fontSize: "13px", color: t1, fontWeight: 500, lineHeight: 1.5 }}>{e.tagline}</div>
        )}

        {/* DESCRIPTION */}
        {e.description && (
          <div style={{ padding: "0 18px 12px", fontSize: "12px", color: t2, lineHeight: 1.7, flex: 1 }}>
            {e.description.slice(0, 200)}{e.description.length > 200 ? "…" : ""}
          </div>
        )}

        {/* DATE + LOCATION */}
        <div style={{ padding: "10px 18px", borderTop: "1px solid " + border, display: "flex", flexDirection: "column", gap: "6px" }}>
          {/* Date range */}
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
              <rect x="1" y="2" width="10" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {(() => { const w = eventWhen(e.date, e.end_date, e.timezone); return (<>
              <span style={{ fontSize: "11px", fontFamily: mono, color: t2 }}>{w.date}</span>
              {w.time && <span style={{ fontSize: "10.5px", fontFamily: mono, color: t2, fontWeight: 500, opacity: 0.92 }}>{w.time}</span>}
            </>) })()}
          </div>
          {/* Location */}
          {(e.location || e.is_online) && (
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                {e.is_online
                  ? <><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1.5 6h9M6 1.5a5 5 0 0 1 0 9M6 1.5a5 5 0 0 0 0 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></>
                  : <><path d="M6 1C4.067 1 2.5 2.567 2.5 4.5c0 2.786 3.5 6.5 3.5 6.5s3.5-3.714 3.5-6.5C9.5 2.567 7.933 1 6 1Z" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="6" cy="4.5" r="1" fill="currentColor"/></>
                }
              </svg>
              <span style={{ fontSize: "11px", fontFamily: mono, color: t2 }}>
                {e.is_online ? "Online" : e.location}
                {e.is_online && e.location ? ` · ${e.location}` : ""}
              </span>
            </div>
          )}
          {/* Organizer */}
          {e.organizer && (
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <path d="M1.5 10.5c0-2.21 2.015-4 4.5-4s4.5 1.79 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
              </svg>
              {twitterUrl
                ? <a href={twitterUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", fontFamily: mono, color: "#8aaeff", textDecoration: "none" }} onMouseEnter={ev => (ev.currentTarget.style.textDecoration = "underline")} onMouseLeave={ev => (ev.currentTarget.style.textDecoration = "none")}>{e.organizer}</a>
                : <span style={{ fontSize: "11px", fontFamily: mono, color: t2 }}>{e.organizer}</span>
              }
            </div>
          )}
        </div>

        {/* TAGS */}
        {e.tags?.length > 0 && (
          <div style={{ padding: "0 18px 12px", display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {e.tags.map(tag => (
              <span key={tag} style={{ fontSize: "8.5px", fontFamily: mono, padding: "2px 8px", borderRadius: "99px", background: "rgba(138,174,255,0.06)", color: "#8aaeff", border: "1px solid rgba(138,174,255,0.12)" }}>{tag}</span>
            ))}
          </div>
        )}

        {/* ACTIONS */}
        {(e.link || !isPast) && (
          <div style={{ padding: "10px 18px", borderTop: "1px solid " + border, display: "flex", alignItems: "center", gap: "8px" }}>
            {e.link && (
              <a href={e.link} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "30px", padding: "0 14px", background: arc, color: "#fff", fontSize: "11px", fontWeight: 600, borderRadius: "6px", textDecoration: "none", fontFamily: "'Geist', sans-serif", flexShrink: 0 }}>
                {isPast ? "View Event" : "Register"} →
              </a>
            )}
            {!isPast && (
              <a href={icsUrl} download={`${e.name.replace(/\s+/g, "_")}.ics`}
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "30px", padding: "0 12px", background: "transparent", color: t3, fontSize: "10px", fontFamily: mono, border: "1px solid " + border, borderRadius: "6px", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
                onMouseEnter={ev => { (ev.currentTarget as HTMLAnchorElement).style.color = t2; (ev.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.12)" }}
                onMouseLeave={ev => { (ev.currentTarget as HTMLAnchorElement).style.color = t3; (ev.currentTarget as HTMLAnchorElement).style.borderColor = border }}
              >
                + Add to Calendar
              </a>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <ArcLayout active="events">
      <div style={{ padding: "28px 28px 48px" }}>

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Community</div>
            <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em", marginBottom: "5px", color: t1 }}>Arc Events</div>
            <div style={{ fontSize: "13px", color: t2, fontWeight: 300, maxWidth: "480px", lineHeight: 1.65 }}>
              Hackathons, AMAs, conferences and community meetups across the Arc ecosystem.
            </div>
          </div>
          <button onClick={() => { setShowForm(!showForm); setSubmitted(false); setSubmitError("") }}
            style={{ height: "40px", padding: "0 20px", background: showForm ? "transparent" : arc, color: showForm ? t2 : "#fff", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (showForm ? border : arc), borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif", whiteSpace: "nowrap", transition: "all .13s" }}>
            {showForm ? "Cancel" : "+ Submit Event"}
          </button>
        </div>

        {/* SUBMIT FORM */}
        {showForm && (
          <div style={{ background: surf, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "14px", overflow: "hidden", marginBottom: "28px", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, #1a56ff, #4070ff 40%, transparent)" }} />
            <div style={{ padding: "20px 24px", borderBottom: "1px solid " + border }}>
              <div style={{ fontSize: "14px", fontWeight: 600, letterSpacing: "-0.025em", marginBottom: "4px", color: t1 }}>Submit an Event</div>
              <div style={{ fontSize: "12px", color: t2, fontWeight: 300 }}>Reviewed before going live · Official Arc events get a verified badge</div>
            </div>

            {submitted ? (
              <div style={{ padding: "48px", textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "14px" }}>🎉</div>
                <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "6px", color: t1 }}>Event submitted!</div>
                <div style={{ fontSize: "13px", color: t2, fontWeight: 300 }}>Your event will appear after review. Usually within 24 hours.</div>
              </div>
            ) : (
              <div style={{ padding: "24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>

                  {/* Logo upload */}
                  <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "16px", padding: "14px", background: surf2, borderRadius: "10px", border: "1px solid " + border }}>
                    <div style={{ width: "52px", height: "52px", borderRadius: "10px", overflow: "hidden", background: "rgba(26,86,255,0.08)", border: "1px solid rgba(26,86,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {logoPreview
                        ? <img src={logoPreview} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: "20px", opacity: .4 }}>◆</span>
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 500, color: t1, marginBottom: "4px" }}>Event Logo / Banner</div>
                      <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        style={{ height: "28px", padding: "0 14px", background: "transparent", color: "#8aaeff", fontSize: "11px", border: "1px solid rgba(26,86,255,0.3)", borderRadius: "6px", cursor: "pointer", fontFamily: "'Geist', sans-serif" }}>
                        {uploading ? "Uploading..." : logoUrl ? "Change Image" : "Upload Image"}
                      </button>
                      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                    </div>
                  </div>

                  {[
                    { k: "name",               l: "Event Name *",          p: "Arc Hackathon 2025" },
                    { k: "tagline",            l: "Tagline",               p: "One-line description" },
                    { k: "organizer",          l: "Organizer Name *",      p: "Arc Foundation" },
                    { k: "organizer_twitter",  l: "Organizer Twitter / X", p: "@handle" },
                    { k: "link",               l: "Event Link *",          p: "https://..." },
                    { k: "email",              l: "Contact Email *",       p: "you@email.com" },
                  ].map((f: any) => (
                    <div key={f.k}>
                      <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{f.l}</label>
                      <input style={inputStyle} value={(form as Record<string,string>)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.p} spellCheck={false} />
                    </div>
                  ))}

                  {/* Type */}
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Event Type *</label>
                    <select style={inputStyle} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                      {["Hackathon","Conference","Workshop","Office Hours","AMA","Demo Day","Community Call","Twitter Space","Grant Round","Governance Vote","Meetup","Webinar","Launch","Ecosystem Sprint","Other"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Timezone */}
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Timezone</label>
                    <select style={inputStyle} value={form.timezone} onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}>
                      {Array.from(new Set([form.timezone, "UTC","America/New_York","America/Los_Angeles","America/Chicago","Europe/London","Europe/Berlin","Asia/Dubai","Asia/Singapore","Asia/Tokyo","Australia/Sydney"].filter(Boolean))).map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>

                  {/* Start date */}
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Start Date & Time *</label>
                    <input type="datetime-local" style={inputStyle} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                  </div>

                  {/* End date */}
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>End Date & Time</label>
                    <input type="datetime-local" style={inputStyle} value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
                  </div>

                  {/* Location */}
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Location</label>
                    <input style={inputStyle} value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="City, Country or Online" />
                  </div>

                  {/* Online toggle */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "12px", color: t2 }}>
                      <input type="checkbox" checked={form.is_online} onChange={e => setForm(p => ({ ...p, is_online: e.target.checked }))} />
                      Online / Virtual Event
                    </label>
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Description</label>
                  <textarea style={{ ...inputStyle, height: "80px", padding: "10px 12px", resize: "vertical", lineHeight: 1.65 } as React.CSSProperties}
                    value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="What is this event about? Who should attend?" />
                </div>

                {/* Tags */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Tags</label>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {TAGS.map(tag => (
                      <button key={tag} onClick={() => toggleTag(tag)}
                        style={{ height: "28px", padding: "0 12px", background: form.tags.includes(tag) ? "rgba(26,86,255,0.15)" : "transparent", color: form.tags.includes(tag) ? "#8aaeff" : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + (form.tags.includes(tag) ? "rgba(26,86,255,0.3)" : border), borderRadius: "99px", cursor: "pointer", transition: "all .12s" }}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {submitError && (
                  <div style={{ padding: "10px 13px", background: "rgba(224,51,72,0.08)", border: "1px solid rgba(224,51,72,0.2)", borderRadius: "7px", fontSize: "12px", color: "#e03348", marginBottom: "12px" }}>
                    {submitError}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <button onClick={submitEvent} disabled={submitting || uploading}
                    style={{ height: "40px", padding: "0 24px", background: arc, color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: (submitting || uploading) ? "not-allowed" : "pointer", fontFamily: "'Geist', sans-serif", opacity: (submitting || uploading) ? .7 : 1 }}>
                    {submitting ? "Submitting..." : "Submit Event"}
                  </button>
                  <div style={{ fontSize: "11px", fontFamily: mono, color: t3, lineHeight: 1.6 }}>
                    Free · Reviewed by ArcLens team
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FEATURED */}
        {featured.length > 0 && (
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>Featured Events</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
              {featured.map(e => <EventCard key={e.id} e={e} />)}
            </div>
          </div>
        )}

        {/* FILTERS */}
        <div style={{ marginBottom: "20px" }}>
          {/* Badge / source filter */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {([
              { key: "all",       label: "All Events" },
              { key: "official",  label: "🔵 Official" },
              { key: "community", label: "Community" },
            ] as const).map(b => (
              <button key={b.key} onClick={() => setBadgeFilter(b.key)}
                style={{ height: "28px", padding: "0 14px", background: badgeFilter === b.key ? "rgba(26,86,255,0.12)" : "transparent", color: badgeFilter === b.key ? "#8aaeff" : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + (badgeFilter === b.key ? "rgba(26,86,255,0.35)" : border), borderRadius: "6px", cursor: "pointer", transition: "all .12s", fontWeight: badgeFilter === b.key ? 600 : 400 }}>
                {b.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowPast(!showPast)}
              style={{ height: "28px", padding: "0 14px", background: showPast ? "rgba(26,86,255,0.1)" : "transparent", color: showPast ? "#8aaeff" : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + (showPast ? "rgba(26,86,255,0.25)" : border), borderRadius: "6px", cursor: "pointer", whiteSpace: "nowrap" }}>
              {showPast ? "Upcoming" : "Past Events"}
            </button>
          </div>

          {/* Type pills — horizontal scroll */}
          <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "8px", WebkitOverflowScrolling: "touch" as any }}>
            {EVENT_TYPES.map(type => (
              <button key={type} onClick={() => setFilter(type)}
                style={{ height: "30px", padding: "0 14px", background: filter === type ? arc : "transparent", color: filter === type ? "#fff" : t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + (filter === type ? arc : border), borderRadius: "99px", cursor: "pointer", transition: "all .12s", whiteSpace: "nowrap", flexShrink: 0 }}>
                {type}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginTop: "8px" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: t3, pointerEvents: "none" }}>⌕</span>
            <input style={{ width: "100%", height: "36px", background: surf, border: "1px solid " + border, borderRadius: "8px", padding: "0 36px 0 32px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none", boxSizing: "border-box" } as React.CSSProperties}
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events by name or organizer..." />
            {search && (
              <button onClick={() => setSearch("")}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t3, cursor: "pointer", fontSize: "14px", padding: "2px 4px" }}>
                ×
              </button>
            )}
          </div>
        </div>

        {/* GRID */}
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: t3 }}>Loading events...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>📅</div>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px", color: t1 }}>No events yet</div>
            <div style={{ fontSize: "12px", color: t2, fontWeight: 300 }}>Be the first to submit an event on Arc.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
            {filtered.map(e => <EventCard key={e.id} e={e} />)}
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: "36px", background: "linear-gradient(135deg, rgba(26,86,255,0.08) 0%, rgba(0,184,122,0.06) 100%)", border: "1px solid rgba(26,86,255,0.18)", borderRadius: "14px", padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.035em", marginBottom: "6px", color: t1 }}>Hosting an Arc event?</div>
            <div style={{ fontSize: "13px", color: t2, fontWeight: 300, maxWidth: "440px", lineHeight: 1.65 }}>Submit your event and get it in front of every ArcLens user. Free, permanent, visible to the whole community.</div>
          </div>
          <button onClick={() => { setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }) }}
            style={{ height: "40px", padding: "0 20px", background: arc, color: "#fff", fontSize: "12.5px", fontWeight: 600, border: "none", borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif", whiteSpace: "nowrap" }}>
            Submit Event
          </button>
        </div>

      </div>
    </ArcLayout>
  )
}