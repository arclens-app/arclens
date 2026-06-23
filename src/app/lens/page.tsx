"use client"
//
// /lens — the Lens AI showcase. UNLISTED (not in nav): the hackathon judge
// landing + a deliberate share surface. Lives inside ArcLayout (part of the
// product), theme-adaptive, borderless, mobile-ready. One focal metric, a live
// recognition feed, and the most-cited board.

import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"
import LensFace, { type LensState } from "@/components/LensFace"

// ArcLens theme tokens — adapt to light/dark exactly like the rest of the app.
const T1 = "var(--t1, #e8ecff)", T2 = "var(--t2, #6b7da8)", T3 = "var(--t3, #2e3a5c)"
const ARC = "#3b6bff", USDC = "#00b87a"
const HAIR = "var(--bdr, rgba(255,255,255,0.08))"
const SANS = "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif"
const MONO = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

interface BoardRow { rank: number; slug: string; name: string; trust: string; logo: string | null; cites: number; earnedUsd: string; unclaimed: boolean }
interface Recent { project_name: string; project_slug: string; amountUsd: string; kind: string; created_at: string }
interface Board { live: boolean; totalPaidUsd: string; payouts: number; builders_paid: number; credited_e6: number; creditedUsd: string; builders_credited: number; builders_total: number; recent: Recent[]; board: BoardRow[] }

const PAL = ["#3b6bff", "#00b87a", "#a855f7", "#e0883b", "#2775ca", "#e0506e", "#22b8cf", "#f08c00"]
function chipTone(t?: string) {
  if (!t) return null
  if (/risk/i.test(t)) return { fg: "#ff5a6e" }
  if (/Verified|Arc Partner|Arc Official/.test(t)) return { fg: USDC }
  if (/Established/.test(t)) return { fg: "#7aa0ff" }
  return null
}
function Chip({ t }: { t?: string }) {
  const tone = chipTone(t); if (!tone) return null
  return <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: tone.fg, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{t}</span>
}
function ago(ts: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 60) return s + "s ago"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"
}
function Avatar({ name, logo, size = 36 }: { name: string; logo?: string | null; size?: number }) {
  const [err, setErr] = useState(false)
  if (logo && !err) {
    const src = /\.blob\.vercel-storage\.com\//i.test(logo) ? logo : `/api/image-proxy?url=${encodeURIComponent(logo)}`
    return <img src={src} alt="" onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#0e1224", border: `1px solid ${HAIR}` }} />
  }
  const c = PAL[(name?.charCodeAt(0) || 0) % PAL.length]
  return <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg, ${c}, ${c}aa)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: size * 0.42 }}>{(name || "?")[0].toUpperCase()}</span>
}
function askLens() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true, bubbles: true }))
}

export default function LensShowcase() {
  const [d, setD] = useState<Board | null>(null)
  const [face, setFace] = useState<LensState>("idle")

  useEffect(() => { fetch("/api/lens/board").then(r => r.json()).then(setD).catch(() => setD(null)) }, [])
  useEffect(() => {
    const iv = setInterval(() => { setFace("paying"); setTimeout(() => setFace("idle"), 2400) }, 7000)
    return () => clearInterval(iv)
  }, [])

  const board = d?.board || []
  const recent = d?.recent || []
  const ticker = recent.length ? [...recent, ...recent] : []
  const builders = d?.builders_paid ?? 0
  const cites = d?.payouts ?? 0

  return (
    <ArcLayout>
      <div className="lensWrap" style={{
        width: "100%", minHeight: "calc(100vh - 52px)", color: T1, fontFamily: SANS, letterSpacing: "-0.01em",
        background: "radial-gradient(120% 52% at 50% -6%, rgba(59,107,255,0.13), transparent 56%), var(--bg, #060812)",
      }}>
        <div className="lensInner" style={{ maxWidth: 860, margin: "0 auto", padding: "30px 22px 110px" }}>

          {/* HERO */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "44px 0 6px", position: "relative" }}>
            <div style={{ position: "absolute", top: 6, width: 300, height: 300, background: "radial-gradient(circle, rgba(59,107,255,0.20), transparent 62%)", filter: "blur(10px)", pointerEvents: "none" }} />
            <div style={{ marginBottom: 28, position: "relative" }}><LensFace state={face} size={120} /></div>
            <h1 className="lensH1" style={{ fontSize: 44, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.038em", margin: 0, maxWidth: 680, color: T1 }}>
              The first AI that{" "}
              <span style={{ background: "linear-gradient(100deg,#6f97ff,#00c896)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>pays the builders</span>{" "}
              it learns from.
            </h1>
            <p className="lensLede" style={{ color: T2, fontSize: 16, lineHeight: 1.65, maxWidth: 540, margin: "20px auto 0" }}>
              Ask Lens AI anything about Arc. When its answer leans on a verified builder&apos;s data,
              it pays them — a fraction of a cent in USDC, on Arc. Real recognition, settled on-chain.
            </p>
            <button onClick={askLens}
              style={{ marginTop: 32, background: `linear-gradient(135deg, ${ARC}, #4a78ff)`, color: "#fff", border: "none", borderRadius: 999, padding: "14px 28px", fontWeight: 700, fontSize: 14.5, cursor: "pointer", boxShadow: "0 12px 34px rgba(59,107,255,0.45)" }}>
              ◐&nbsp;&nbsp;Ask Lens AI
            </button>
          </div>

          {/* FOCAL METRIC — one confident number, not a grid */}
          <div style={{ textAlign: "center", margin: "62px 0 4px" }}>
            <div className="lensFocal" style={{ fontSize: 56, fontWeight: 800, color: USDC, letterSpacing: "-0.035em", lineHeight: 1 }}>
              {d?.totalPaidUsd ?? "$0.00"}
            </div>
            <div style={{ fontSize: 15, color: T2, marginTop: 14 }}>
              paid to <b style={{ color: T1, fontWeight: 700 }}>{builders}</b> verified builder{builders === 1 ? "" : "s"}
              {(d?.builders_credited ?? 0) > 0 && <>, <b style={{ color: T1, fontWeight: 700 }}>{d?.builders_credited}</b> more credited (pending claim)</>}
              {" "}across <b style={{ color: T1, fontWeight: 700 }}>{cites}</b> citation{cites === 1 ? "" : "s"} — in USDC, on Arc
            </div>
          </div>

          {/* LIVE RECOGNITION FEED — who Lens AI just paid (no micro-amounts) */}
          {ticker.length > 0 && (
            <div style={{ overflow: "hidden", whiteSpace: "nowrap", padding: "26px 0 4px", maskImage: "linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)" }}>
              <div style={{ display: "inline-flex", gap: 38, animation: "lensMarquee 36s linear infinite" }}>
                {ticker.map((f, i) => {
                  const c = f.kind === "credited" ? "#7aa0ff" : USDC
                  return (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13.5, color: T2 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}` }} />
                      Lens AI {f.kind} <b style={{ color: T1, fontWeight: 600 }}>{f.project_name}</b>
                      <span style={{ fontFamily: MONO, color: T3, fontSize: 11 }}>{ago(f.created_at)}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* MOST-CITED — borderless rows */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "50px 0 8px", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", color: T1 }}>Most-cited builders</h2>
            <span style={{ fontSize: 13, color: T3 }}>the builders whose data Lens AI trusts most</span>
          </div>

          {board.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T1 }}>Lens AI is just warming up.</div>
              <div style={{ fontSize: 13.5, color: T2, marginTop: 8, lineHeight: 1.6, maxWidth: 420, margin: "8px auto 0" }}>
                Ask it about a project or who to trust on Arc — and watch it pay the first builder, live.
              </div>
            </div>
          ) : (
            <div>
              {board.map((b) => (
                <a key={b.slug} href={`/ecosystem/${b.slug}`} className="lensRow"
                  style={{ display: "flex", alignItems: "center", gap: 15, padding: "17px 8px", textDecoration: "none", color: T1, borderBottom: `1px solid ${HAIR}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, color: T3, width: 24, opacity: 0.6 }}>{b.rank}</span>
                  <Avatar name={b.name} logo={b.logo} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span><Chip t={b.trust} />
                    </div>
                    <div style={{ fontSize: 12, color: T3, marginTop: 3 }}>cited {b.cites} time{b.cites === 1 ? "" : "s"}{b.unclaimed ? " · claim a wallet to collect" : " as a trusted answer"}</div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: b.unclaimed ? "#7aa0ff" : USDC, display: "flex", alignItems: "center", gap: 6 }}>
                    {b.earnedUsd}{b.unclaimed && <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: 9, color: T3, textTransform: "uppercase", letterSpacing: "0.06em" }}>pending</span>}
                  </span>
                </a>
              ))}
            </div>
          )}

          {/* HOW IT WORKS */}
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "58px 0 20px", letterSpacing: "-0.02em", color: T1 }}>How it works</h2>
          <div className="lensSteps" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            <Step n="01" h="You ask" d="Ask Lens AI about any project, metric, or who to trust on Arc." first />
            <Step n="02" h="It answers from real data" d="It reads live on-chain data and the trust graph — and never guesses." />
            <Step n="03" h="It pays its sources" d="The verified builders whose data grounded the answer earn USDC, instantly." />
          </div>

          {/* FOR AGENTS / DEVELOPERS */}
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "58px 0 8px", letterSpacing: "-0.02em", color: T1 }}>Agents can query Lens AI</h2>
          <p style={{ fontSize: 14.5, color: T2, lineHeight: 1.65, maxWidth: 640, margin: "0 0 16px" }}>
            Building an agent on Arc? Lens AI is a pay-per-call trust oracle. Your agent asks who&apos;s legit,
            pays a fraction of a cent over x402, and gets a verdict back — and that payment flows to the builders
            whose data answered it. Agents paying agents, funding the ecosystem.
          </p>
          <pre style={{ background: "#0a1020", border: `1px solid ${HAIR}`, borderRadius: 12, padding: "16px 18px", overflowX: "auto", fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, color: "#cfe0ff", margin: 0 }}>{`# discover the service
curl https://arclenz.xyz/api/agent

# ask it — pay-per-call over x402
curl -X POST https://arclenz.xyz/api/agent \\
  -H "content-type: application/json" \\
  -H "x-lens-pay: <x402 payment>" \\
  -d '{"action":"trust","target":"<project>"}'
# → { result: { trust: "Verified", ... },
#     paid_to_builders: [ { project, amount, tx } ] }`}</pre>
          <div style={{ fontSize: 12.5, color: T3, marginTop: 10 }}>
            actions: <b style={{ color: T2 }}>trust</b> · <b style={{ color: T2 }}>discover</b> · <b style={{ color: T2 }}>project</b> — live manifest at <a href="/api/agent" style={{ color: "#6691ff", textDecoration: "none" }}>/api/agent</a>
          </div>

          <div style={{ marginTop: 56, paddingTop: 24, borderTop: `1px solid ${HAIR}`, textAlign: "center", fontFamily: MONO, fontSize: 11, color: T3, letterSpacing: "0.04em" }}>
            every payout settled in USDC on Arc · trust-gated · the smallest coin, paid by the fraction
          </div>
        </div>

        <style>{`
          @keyframes lensMarquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
          .lensRow { transition: background .14s ease, padding-left .14s ease }
          .lensRow:hover { background: rgba(127,127,127,0.07); padding-left: 14px !important }
          @media (max-width: 640px) {
            .lensInner { padding: 18px 16px 90px !important }
            .lensH1 { font-size: 30px !important }
            .lensLede { font-size: 14.5px !important }
            .lensFocal { font-size: 42px !important }
            .lensSteps { grid-template-columns: 1fr !important }
            .lensSteps > div { border-left: none !important; border-top: 1px solid ${HAIR}; padding: 18px 0 !important }
          }
        `}</style>
      </div>
    </ArcLayout>
  )
}

function Step({ n, h, d, first }: { n: string; h: string; d: string; first?: boolean }) {
  return (
    <div style={{ padding: first ? "4px 24px 4px 0" : "4px 24px", borderLeft: first ? "none" : `1px solid ${HAIR}` }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: ARC, opacity: 0.5 }}>{n}</div>
      <div style={{ fontSize: 15, fontWeight: 700, margin: "14px 0 8px", color: T1 }}>{h}</div>
      <div style={{ fontSize: 13, color: T2, lineHeight: 1.55 }}>{d}</div>
    </div>
  )
}
