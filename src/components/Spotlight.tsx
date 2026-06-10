"use client"
//
// Spotlight — the single rotating promo banner on the Ecosystem page. ONE slot,
// admin-curated (+ founder applications), rotating through campaigns / events /
// featured projects. Auto-hides when there's nothing live. Trust-gating is
// server-side (risk-flagged projects never appear here).
//
// SpotlightCard is the presentational banner for ONE item — used by the live
// rotating <Spotlight/> AND by the founder/admin forms as a live preview, so
// what you see while composing is EXACTLY what publishes (no drift).
//
// Motion: entrance rise, slide+fade between slides, story-style progress bar,
// ambient glow, CTA lift on hover. Swipe (touch) or tap a bar to change slide.
// Responsive (mobile hides the side image, CTA goes full-width). Honors
// prefers-reduced-motion.
//
// Fit preview: add ?spotlightPreview=1 to render a sample with no live content.

import { useEffect, useRef, useState } from "react"

export interface SpotlightItem {
  id?: number | string
  kind: "campaign" | "event" | "project" | "custom"
  title: string
  subtitle?: string | null
  image_url?: string | null
  image_pos?: string | null   // CSS object-position, e.g. "70% 40%" (focal point)
  link_url?: string | null
  cta_text?: string | null
  accent?: string | null
}

const SAMPLE: SpotlightItem[] = [
  { id: "preview-1", kind: "campaign", title: "Explore the Arc ecosystem", subtitle: "Real projects, verified on-chain — discover what's building on Arc.", link_url: "/ecosystem", cta_text: "Get started", accent: "#3b6bff" },
  { id: "preview-2", kind: "project", title: "Lunex — a proven DeFi hub on Arc", subtitle: "Established on-chain track record. Swap, earn, build.", link_url: "/ecosystem/lunex", cta_text: "View project", accent: "#00b87a" },
]

const ROTATE_MS = 6000
const MONO = "'DM Mono', ui-monospace, monospace"
const KIND_LABEL: Record<string, string> = { campaign: "Campaign", event: "Event", project: "Featured", custom: "Spotlight" }

const cardStyles = `
  .spot-banner { animation: spotIn 460ms cubic-bezier(0.22,1,0.36,1); transition: border-color .2s; }
  .spot-banner:hover { border-color: var(--bdr, rgba(128,128,128,0.28)); }
  .spot-banner:hover .spot-cta { transform: translateY(-1px); }
  .spot-banner:hover .spot-arrow { transform: translateX(3px); }
  .spot-content { animation: spotSlide 520ms cubic-bezier(0.22,1,0.36,1); }
  .spot-img { animation: spotImg 700ms cubic-bezier(0.22,1,0.36,1); }
  .spot-glow { animation: spotGlow 9s ease-in-out infinite; }
  .spot-prog { animation: spotProg ${ROTATE_MS}ms linear forwards; }
  @keyframes spotIn    { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spotSlide { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes spotImg   { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: scale(1); } }
  @keyframes spotGlow  { 0%,100% { opacity: 0.7; transform: translateX(0); } 50% { opacity: 1; transform: translateX(-6%); } }
  @keyframes spotProg  { from { width: 0%; } to { width: 100%; } }
  @media (max-width: 640px) {
    .spot-img { display: none; }
    .spot-content { padding: 18px 18px 30px; gap: 14px; }
    .spot-title { font-size: 17px; }
    .spot-cta { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .spot-banner, .spot-content, .spot-img, .spot-glow, .spot-prog { animation: none !important; }
    .spot-prog { width: 100%; }
  }
`

/** The banner visual for ONE item. Presentational — no link, no rotation.
 *  `static` disables the animations (for a steady form preview). */
export function SpotlightCard({ item, static: isStatic, editable, onPosChange }: { item: SpotlightItem; static?: boolean; editable?: boolean; onPosChange?: (pos: string) => void }) {
  const accent = item.accent || "#3b6bff"
  const drag = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null)
  const parsePos = (s?: string | null) => {
    const m = (s || "100% 50%").match(/(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?/)
    return m ? { x: +m[1], y: +m[2] } : { x: 100, y: 50 }
  }
  const onDown = (e: React.PointerEvent) => {
    if (!editable || !item.image_url) return
    const p = parsePos(item.image_pos)
    drag.current = { cx: e.clientX, cy: e.clientY, px: p.x, py: p.y }
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId) } catch {}
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !onPosChange) return
    const { cx, cy, px, py } = drag.current
    const nx = Math.max(0, Math.min(100, px - (e.clientX - cx) * 0.32))
    const ny = Math.max(0, Math.min(100, py - (e.clientY - cy) * 0.32))
    onPosChange(`${Math.round(nx)}% ${Math.round(ny)}%`)
  }
  const onUp = () => { drag.current = null }
  return (
    <div className="spot-banner" style={{
      position: "relative", overflow: "hidden", borderRadius: "16px",
      border: "1px solid var(--bdr, rgba(128,128,128,0.14))",
      background: `linear-gradient(105deg, var(--surf2,#0c1122) 0%, var(--surf,#080c1a) 60%)`,
      minHeight: "118px", animation: isStatic ? "none" : undefined,
    }}>
      <div className="spot-glow" style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 120% at 85% 0%, ${accent}26, transparent 60%)`, pointerEvents: "none", animation: isStatic ? "none" : undefined }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: `linear-gradient(90deg, ${accent}, ${accent}55 45%, transparent)` }} />

      {item.image_url && (
        <div className="spot-img" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "44%", maxWidth: "520px", overflow: "hidden", animation: isStatic ? "none" : undefined, cursor: editable ? "grab" : undefined, touchAction: editable ? "none" : undefined }}>
          <img src={item.image_url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: item.image_pos || "right center" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, var(--surf,#080c1a) 0%, transparent 46%)", pointerEvents: "none" }} />
          {editable && <div style={{ position: "absolute", bottom: 6, right: 8, fontSize: 9, fontFamily: MONO, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.4)", padding: "2px 6px", borderRadius: 4, pointerEvents: "none" }}>drag to reposition</div>}
        </div>
      )}

      <div className="spot-content" style={{ position: "relative", display: "flex", alignItems: "center", gap: "20px", padding: "22px 24px", flexWrap: "wrap", animation: isStatic ? "none" : undefined }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ fontSize: "9.5px", fontFamily: MONO, letterSpacing: "0.14em", textTransform: "uppercase", color: accent, marginBottom: "8px" }}>
            {KIND_LABEL[item.kind] || "Spotlight"}
          </div>
          <div className="spot-title" style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--t1,#e8ecff)", lineHeight: 1.2, marginBottom: item.subtitle ? "6px" : 0 }}>
            {item.title || "Your headline"}
          </div>
          {item.subtitle && (
            <div style={{ fontSize: "13px", color: "var(--t2,#9aa8c7)", fontWeight: 300, lineHeight: 1.55, maxWidth: "560px" }}>
              {item.subtitle}
            </div>
          )}
        </div>
        {item.cta_text && (
          <span className="spot-cta" style={{
            flexShrink: 0, height: "40px", padding: "0 20px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px",
            background: accent, color: "#fff", fontSize: "13px", fontWeight: 600,
            borderRadius: "9px", fontFamily: "'Geist', sans-serif", boxShadow: `0 6px 18px ${accent}40`,
          }}>
            {item.cta_text}<span className="spot-arrow" style={{ transition: "transform .18s" }}>→</span>
          </span>
        )}
      </div>
      <style>{cardStyles}</style>
    </div>
  )
}

export default function Spotlight() {
  const [items, setItems] = useState<SpotlightItem[]>([])
  const [i, setI] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchX = useRef<number | null>(null)
  const didSwipe = useRef(false)

  useEffect(() => {
    let alive = true
    fetch("/api/spotlight", { cache: "no-store" })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => {
        if (!alive) return
        let list: SpotlightItem[] = Array.isArray(d.items) ? d.items : []
        if (list.length === 0 && typeof window !== "undefined" && window.location.search.includes("spotlightPreview")) list = SAMPLE
        setItems(list)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (items.length <= 1) return
    timer.current = setInterval(() => setI(v => (v + 1) % items.length), ROTATE_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [items.length, i])

  if (items.length === 0) return null
  const item = items[Math.min(i, items.length - 1)]
  const accent = item.accent || "#3b6bff"
  const href = item.link_url || "#"
  const external = /^https?:\/\//.test(href)
  const n = items.length
  const go = (dir: number) => setI(v => (v + dir + n) % n)
  const jump = (e: React.MouseEvent, d: number) => { e.preventDefault(); e.stopPropagation(); setI(d) }

  function onTouchStart(e: React.TouchEvent) { touchX.current = e.touches[0].clientX; didSwipe.current = false }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null || n <= 1) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) > 40) { didSwipe.current = true; go(dx < 0 ? 1 : -1) }
  }
  function onClick(e: React.MouseEvent) { if (didSwipe.current) { e.preventDefault(); didSwipe.current = false } }

  return (
    <a href={href} onClick={onClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      style={{ display: "block", position: "relative", marginBottom: "24px", textDecoration: "none", touchAction: "pan-y", userSelect: "none" }}>
      <SpotlightCard item={item} />
      {n > 1 && (
        <div style={{ position: "absolute", bottom: "11px", right: "18px", display: "flex", gap: "6px", zIndex: 2 }}>
          {items.map((_, d) => (
            <span key={d} onClick={(e) => jump(e, d)} style={{ width: "22px", height: "5px", borderRadius: "3px", background: "var(--bdr,rgba(128,128,128,0.25))", overflow: "hidden", cursor: "pointer" }} role="button" aria-label={`Slide ${d + 1}`}>
              <span key={`${d}-${i}`} className={d === i ? "spot-prog" : ""} style={{ display: "block", height: "100%", borderRadius: "3px", background: accent, width: d < i ? "100%" : "0%" }} />
            </span>
          ))}
        </div>
      )}
    </a>
  )
}
