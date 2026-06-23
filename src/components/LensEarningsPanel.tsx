"use client"
//
// LensEarningsPanel — the builder-facing surface, shown on a founder's
// dashboard. Turns the payout from "money happens" into "you are encouraged":
// the founder sees their project earning recognition when Lens AI cites it.

import { useEffect, useState } from "react"
import LensFace from "@/components/LensFace"

const SURF2 = "var(--surf2, #0e1224)", BDR = "var(--bdr, rgba(255,255,255,0.06))"
const T1 = "var(--t1, #e8ecff)", T2 = "var(--t2, #6b7da8)", T3 = "var(--t3, #2e3a5c)", USDC = "#00b87a"
const MONO = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

interface Earnings { cites: number; earnedUsd: string; last_cited: string | null }

export default function LensEarningsPanel({ slug }: { slug: string }) {
  const [e, setE] = useState<Earnings | null>(null)
  useEffect(() => {
    if (!slug) return
    fetch(`/api/lens/earnings?slug=${encodeURIComponent(slug)}`).then(r => r.json()).then(setE).catch(() => {})
  }, [slug])

  if (!e) return null
  const earning = e.cites > 0

  return (
    <div style={{ background: SURF2, border: `1px solid ${BDR}`, borderRadius: 16, padding: "16px 18px", display: "flex", gap: 14, alignItems: "center" }}>
      <LensFace state={earning ? "confident" : "idle"} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: T3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Lens AI</div>
        {earning ? (
          <>
            <div style={{ fontSize: 14, color: T1, marginTop: 4, lineHeight: 1.5 }}>
              Lens AI has cited your project <b style={{ color: T1 }}>{e.cites}×</b> and paid you{" "}
              <b style={{ color: USDC, fontFamily: MONO }}>{e.earnedUsd}</b> in USDC.
            </div>
            <div style={{ fontSize: 12, color: T2, marginTop: 4 }}>
              Your verified data is earning when it answers the ecosystem. <a href="/lens" style={{ color: "#6691ff", textDecoration: "none" }}>See the board →</a>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: T1, marginTop: 4, lineHeight: 1.5 }}>
              Lens AI pays verified builders when their data grounds an answer.
            </div>
            <div style={{ fontSize: 12, color: T2, marginTop: 4 }}>
              Get verified and your project starts earning when the ecosystem&apos;s AI cites it. <a href="/lens" style={{ color: "#6691ff", textDecoration: "none" }}>How it works →</a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
