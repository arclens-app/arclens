"use client"
import { trustBadge, type BadgeSpec } from "@/lib/trustBadge"

// Renders in the same inline spot as the old OFFICIAL/VERIFIED chips (next to
// the project name). Neutral by default; a green ✓ only on Verified+, red only
// on a flagged risk — colour appears just where it matters, the word does the
// rest. (✓ is a text glyph, already used in the old VERIFIED chip — not an emoji.)
export function TrustBadge({ trust_level, recognition, risk_flagged, legacy_badge, spec }: {
  trust_level?: string | null
  recognition?: string | null
  risk_flagged?: boolean
  legacy_badge?: string | null
  spec?: BadgeSpec
}) {
  const b = spec || trustBadge({ trust_level, recognition, risk_flagged, legacy_badge })
  const risk = b.mark === "risk"
  const check = b.mark === "check"
  // Colour follows the mark: green chip on trusted, red on risk, neutral grey
  // otherwise. Tinted background + matching text so the signal actually reads
  // at a glance — not just a hairline glyph.
  const tone = risk
    ? { bg: "rgba(224,51,72,0.12)", fg: "#e03348", bd: "rgba(224,51,72,0.35)" }
    : check
    ? { bg: "rgba(0,200,150,0.14)", fg: "#00c896", bd: "rgba(0,200,150,0.40)" }
    : { bg: "rgba(128,128,128,0.08)", fg: "var(--t2,#6b7da8)", bd: "rgba(128,128,128,0.18)" }
  return (
    <span
      title={b.tip}
      style={{
        display: "inline-flex", alignItems: "center", gap: "3px",
        fontSize: "9px", fontFamily: "'DM Mono', monospace", fontWeight: 700,
        padding: "2px 6px", borderRadius: "4px", flexShrink: 0,
        textTransform: "uppercase", letterSpacing: "0.04em",
        background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`,
      }}
    >
      {check && <span style={{ fontWeight: 900, fontSize: "10px", lineHeight: 1 }}>✓</span>}
      {risk && <span style={{ fontWeight: 900 }}>!</span>}
      {b.label}
    </span>
  )
}
