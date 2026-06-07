// src/lib/trustBadge.ts
// Maps a project's trust state to the ONE chip it shows (highest earned),
// rendered in the same inline spot as the old OFFICIAL/VERIFIED chips.
// Minimal + calm: a green check only on the genuinely-trusted (Verified+),
// red only on a flagged risk, neutral otherwise. Colour never differentiates
// tiers — the WORD does.

export type BadgeMark = "check" | "risk" | "none"

export interface BadgeSpec {
  key: string
  label: string   // user-facing word
  mark: BadgeMark // green check / red alert / nothing
  tip: string     // honest one-liner (hover / profile)
}

// Green ✓ = a signal we can stand behind: recognition (Arc Official / Arc
// Partner) or a real independent audit on record (Verified). Claimed is an
// objective fact shown subtly (no card chip). Risk is the red auto-flag. We do
// NOT do identity/KYC vouching — Verified means "audited", not "we know them".
const SPECS: Record<string, BadgeSpec> = {
  risk:         { key: "risk",         label: "Risk flagged", mark: "risk",  tip: "A safety check failed — interact with caution." },
  arc_official: { key: "arc_official", label: "Arc Official", mark: "check", tip: "Built by Arc / Circle." },
  arc_partner:  { key: "arc_partner",  label: "Arc Partner",  mark: "check", tip: "An officially recognized Arc partner." },
  verified:     { key: "verified",     label: "Verified",     mark: "check", tip: "Independent security audit on record." },
  claimed:      { key: "claimed",      label: "Claimed",      mark: "none",  tip: "The team has claimed and controls this listing." },
  listed:       { key: "listed",       label: "Listed",       mark: "none",  tip: "Listed on ArcLens. Do your own diligence." },
}

export function trustBadge(opts: { trust_level?: string | null; recognition?: string | null; risk_flagged?: boolean; legacy_badge?: string | null }): BadgeSpec {
  if (opts.risk_flagged) return SPECS.risk
  if (opts.recognition === "official") return SPECS.arc_official
  if (opts.recognition === "partner") return SPECS.arc_partner
  switch (opts.trust_level) {
    case "verified": return SPECS.verified
    case "claimed":  return SPECS.claimed
  }
  // No trust level set yet → fall back to the legacy `badge` so today's
  // recognized projects keep their display (no regression).
  if (opts.legacy_badge === "official") return SPECS.arc_official
  return SPECS.listed // neutral baseline, no stigma
}

// For the legend/preview, low → high.
export const ALL_BADGES: BadgeSpec[] = [
  SPECS.listed, SPECS.claimed, SPECS.verified, SPECS.arc_partner, SPECS.arc_official, SPECS.risk,
]
