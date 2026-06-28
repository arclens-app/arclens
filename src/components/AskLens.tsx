"use client"
//
// AskLens — a small, contextual "Ask Lens AI" button. Dropped on any surface,
// it opens the agent already working on a question. This is how Lens AI powers
// the product: every page can hand it context.
//
// Usage:  <AskLens prompt="Tell me about Lunex on Arc" />
//
import LensFace from "@/components/LensFace"

export default function AskLens({
  prompt,
  label = "Ask Lens AI",
  send = true,
  style,
}: {
  prompt: string
  label?: string
  send?: boolean
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("arclens:ask", { detail: { prompt, send } }))}
      title={prompt}
      aria-label={label}
      style={{
        height: "34px",
        padding: "0 11px",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: "rgba(26,86,255,0.08)",
        color: "#8aaeff",
        border: "1px solid rgba(26,86,255,0.22)",
        borderRadius: "7px",
        fontSize: "11.5px",
        fontFamily: "'DM Mono', monospace",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "background 0.14s, border-color 0.14s",
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(26,86,255,0.15)"; e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)" }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(26,86,255,0.08)"; e.currentTarget.style.borderColor = "rgba(26,86,255,0.22)" }}
    >
      <LensFace state="idle" size={15} />
      {label}
    </button>
  )
}
