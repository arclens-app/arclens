"use client"
// "Submit with your agent" — points builders at the ArcLens MCP server
// (/api/mcp) from the top of the submit form. Same checks, email code and
// review as the form; this only shows how to connect. One snippet is shown at
// a time behind tabs so the panel stays compact.
import { useState } from "react"
import LensFace from "@/components/LensFace"

const MCP_URL = "https://arclenz.xyz/api/mcp"
const CLIENTS = [
  { id: "claude", label: "Claude Code", hint: "Run this in your terminal, then start a new Claude Code session.", prompt: true,
    text: `claude mcp add --transport http arclens ${MCP_URL}` },
  { id: "cursor", label: "Cursor", hint: "Add this to ~/.cursor/mcp.json, then restart Cursor.", prompt: false,
    text: `{"mcpServers":{"arclens":{"url":"${MCP_URL}"}}}` },
  { id: "codex", label: "Codex", hint: "Add this to ~/.codex/config.toml, then restart Codex.", prompt: false,
    text: `[mcp_servers.arclens]\nurl = "${MCP_URL}"` },
  { id: "other", label: "Other", hint: "In any other MCP client, add a remote (HTTP) server with this address.", prompt: false,
    text: MCP_URL },
] as const

const mono   = "'DM Mono', monospace"
const border = "rgba(128,128,128,0.1)"
const surf2  = "var(--surf2, #0c1122)"
const t1     = "var(--t1, #e8ecff)"
const t2     = "var(--t2, #6b7da8)"
const t3     = "var(--t3, #2e3a5c)"

export default function AgentSubmitPanel() {
  const [tab, setTab] = useState<(typeof CLIENTS)[number]["id"]>("claude")
  const [copied, setCopied] = useState(false)
  const c = CLIENTS.find(x => x.id === tab)!

  async function copy() {
    try { await navigator.clipboard.writeText(c.text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked; text stays selectable */ }
  }

  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid " + border, background: "rgba(26,86,255,0.035)" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "14px" }}>
        <LensFace size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: t1, letterSpacing: "-0.02em", marginBottom: "3px" }}>Submit with your agent</div>
          <div style={{ fontSize: "12px", color: t2, fontWeight: 300, lineHeight: 1.6, maxWidth: "620px" }}>
            Connect ArcLens once, then ask your agent to list your project. It reads your codebase, checks every field and asks you to confirm before sending. Same email code and review as this form.
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Choose your agent" style={{ display: "flex", gap: "4px", marginBottom: "8px", overflowX: "auto" }}>
        {CLIENTS.map(x => {
          const on = x.id === tab
          return (
            <button key={x.id} role="tab" aria-selected={on} onClick={() => { setTab(x.id); setCopied(false) }}
              style={{ flexShrink: 0, padding: "6px 11px", borderRadius: "7px", border: "1px solid " + (on ? "rgba(26,86,255,0.35)" : "transparent"), background: on ? "rgba(26,86,255,0.10)" : "transparent", color: on ? t1 : t2, fontSize: "11.5px", fontWeight: on ? 600 : 500, cursor: "pointer", fontFamily: "'Geist', sans-serif", transition: "all .13s" }}>
              {x.label}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: "11.5px", color: t2, lineHeight: 1.6, marginBottom: "8px" }}>{c.hint}</div>
      <div style={{ display: "flex", alignItems: "stretch", gap: "8px", minWidth: 0 }}>
        <pre style={{ flex: 1, minWidth: 0, margin: 0, overflowX: "auto", background: surf2, border: "1px solid " + border, borderRadius: "8px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6, fontFamily: mono, color: t1, userSelect: "all" }}>
          {c.prompt && <span style={{ color: t3 }}>$ </span>}{c.text}
        </pre>
        <button onClick={copy} aria-label={`Copy the ${c.label} setup`}
          style={{ flexShrink: 0, padding: "0 14px", background: copied ? "rgba(0,200,150,0.12)" : "transparent", border: "1px solid " + (copied ? "rgba(0,200,150,0.35)" : border), borderRadius: "8px", color: copied ? "#00c896" : t2, fontSize: "11.5px", fontWeight: 600, cursor: "pointer", fontFamily: "'Geist', sans-serif", transition: "all .13s" }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div style={{ marginTop: "10px", fontSize: "11.5px", color: t2, lineHeight: 1.6 }}>
        Then ask your agent: <span style={{ color: t1 }}>&ldquo;List my project on ArcLens&rdquo;</span>
      </div>
    </div>
  )
}
