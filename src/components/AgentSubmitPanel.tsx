"use client"
// "Submit with your agent" — points builders at the ArcLens MCP server
// (/api/mcp) from the top of the submit form. Same checks, email code and
// review as the form; this only shows how to connect.
import { useState } from "react"
import LensFace from "@/components/LensFace"

const CMD = "claude mcp add --transport http arclens https://arclenz.xyz/api/mcp"
const URL_ = "https://arclenz.xyz/api/mcp"

const mono   = "'DM Mono', monospace"
const border = "rgba(128,128,128,0.1)"
const surf2  = "var(--surf2, #0c1122)"
const t1     = "var(--t1, #e8ecff)"
const t2     = "var(--t2, #6b7da8)"
const t3     = "var(--t3, #2e3a5c)"

function CopyRow({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked; text stays selectable */ }
  }
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: "8px", minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "nowrap", background: surf2, border: "1px solid " + border, borderRadius: "8px", padding: "10px 12px", fontSize: "12px", fontFamily: mono, color: t1, userSelect: "all" }}>
        <span style={{ color: t3 }}>$ </span>{text}
      </div>
      <button onClick={copy} aria-label={label}
        style={{ flexShrink: 0, padding: "0 14px", background: copied ? "rgba(0,200,150,0.12)" : "transparent", border: "1px solid " + (copied ? "rgba(0,200,150,0.35)" : border), borderRadius: "8px", color: copied ? "#00c896" : t2, fontSize: "11.5px", fontWeight: 600, cursor: "pointer", fontFamily: "'Geist', sans-serif", transition: "all .13s" }}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

export default function AgentSubmitPanel() {
  const [other, setOther] = useState(false)
  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid " + border, background: "rgba(26,86,255,0.035)" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "12px" }}>
        <LensFace size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: t1, letterSpacing: "-0.02em", marginBottom: "3px" }}>Submit with your agent</div>
          <div style={{ fontSize: "12px", color: t2, fontWeight: 300, lineHeight: 1.6, maxWidth: "620px" }}>
            Connect ArcLens once, then ask your agent to list your project. It reads your codebase, checks every field and asks you to confirm before sending. Same email code and review as this form.
          </div>
        </div>
      </div>
      <CopyRow text={CMD} label="Copy the Claude Code command" />
      <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", fontSize: "11.5px", color: t2, lineHeight: 1.6 }}>
        <span>Then start a new session and ask: <span style={{ color: t1 }}>&ldquo;List my project on ArcLens&rdquo;</span></span>
        <button onClick={() => setOther(!other)}
          style={{ background: "none", border: "none", padding: 0, color: "#8aaeff", fontSize: "11.5px", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px", fontFamily: "inherit" }}>
          {other ? "Hide other agents" : "Using Cursor, Codex or another agent?"}
        </button>
      </div>
      {other && (
        <div style={{ marginTop: "10px" }}>
          <div style={{ fontSize: "11.5px", color: t2, lineHeight: 1.6, marginBottom: "8px" }}>
            Add ArcLens as a remote MCP server (HTTP) in your agent&apos;s settings using this address:
          </div>
          <CopyRow text={URL_} label="Copy the MCP server address" />
        </div>
      )}
    </div>
  )
}
