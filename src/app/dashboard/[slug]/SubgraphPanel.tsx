"use client"
//
// Founder self-serve config for PROTOCOL-REPORTED (subgraph) metrics — the
// second way to get TVL/volume on ArcLens, alongside on-chain verified
// contract tracking. A founder points us at their own subgraph; the numbers
// show LABELLED as self-reported (amber), never the green verified badge.
//
// The "Test connection" button runs the query live server-side and shows the
// extracted values, so a founder confirms it works BEFORE saving. Save re-runs
// the query and refuses a config that doesn't return a number.

import { useCallback, useEffect, useState } from "react"

interface Theme { mono: string; bdr: string; surf: string; surf2: string; t1: string; t2: string; t3: string; green: string }

const fmtUsd = (n: number | null | undefined) => {
  if (n == null) return "—"
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export default function SubgraphPanel({ slug, token, theme }: { slug: string; token: string | null; theme: Theme }) {
  const { mono, bdr, surf, surf2, t1, t2, t3, green } = theme

  const [url, setUrl]           = useState("")
  const [query, setQuery]       = useState("")
  const [tvlPath, setTvlPath]   = useState("")
  const [volPath, setVolPath]   = useState("")
  const [tsPath, setTsPath]     = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [seriesQuery, setSeriesQuery] = useState("")
  const [seriesPath, setSeriesPath]   = useState("")
  const [seriesX, setSeriesX]         = useState("")
  const [seriesY, setSeriesY]         = useState("")

  const [loading, setLoading]   = useState(true)
  const [busy, setBusy]         = useState<"test" | "save" | null>(null)
  const [result, setResult]     = useState<{ ok: boolean; msg: string; extracted?: any } | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = token ? `?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}` : `?slug=${encodeURIComponent(slug)}`
      const res = await fetch(`/api/subgraph-config${qs}`, { cache: "no-store" })
      const data = await res.json()
      const c = data.config || {}
      setUrl(c.subgraph_url || "")
      setQuery(c.subgraph_query || "")
      setTvlPath(c.subgraph_tvl_path || "")
      setVolPath(c.subgraph_volume_path || "")
      setTsPath(c.subgraph_source_ts_path || "")
      setSeriesQuery(c.subgraph_series_query || "")
      setSeriesPath(c.subgraph_series_path || "")
      setSeriesX(c.subgraph_series_x || "")
      setSeriesY(c.subgraph_series_y || "")
      if (c.subgraph_series_query) setShowAdvanced(true)
      setLastUpdated(c.subgraph_updated_at || null)
    } finally { setLoading(false) }
  }, [slug, token])

  useEffect(() => { load() }, [load])

  async function run(action: "test" | "save") {
    setBusy(action)
    setResult(null)
    try {
      const res = await fetch("/api/subgraph-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, token, action,
          subgraph_url: url, subgraph_query: query,
          subgraph_tvl_path: tvlPath, subgraph_volume_path: volPath, subgraph_source_ts_path: tsPath,
          subgraph_series_query: seriesQuery, subgraph_series_path: seriesPath,
          subgraph_series_x: seriesX, subgraph_series_y: seriesY,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const e = data.extracted || {}
        const parts = [
          e.tvl_usd != null ? `TVL ${fmtUsd(e.tvl_usd)}` : null,
          e.volume_usd != null ? `Volume ${fmtUsd(e.volume_usd)}` : null,
          e.series_points ? `${e.series_points} history points` : null,
        ].filter(Boolean).join(" · ")
        setResult({
          ok: true,
          msg: action === "save"
            ? (data.cleared ? "Subgraph feed removed." : `Saved · ${parts}. Your page updates within the hour.`)
            : `Connected · ${parts}`,
          extracted: e,
        })
        if (action === "save") load()
      } else {
        setResult({ ok: false, msg: data.error + (data.sample ? `\nResponse: ${data.sample}` : "") })
      }
    } catch { setResult({ ok: false, msg: "Network error — try again" }) }
    finally { setBusy(null) }
  }

  const input = {
    width: "100%", background: surf2, border: "1px solid " + bdr, borderRadius: 8,
    padding: "9px 12px", fontSize: 12.5, fontFamily: mono, color: t1, outline: "none",
    boxSizing: "border-box" as const,
  }
  const label = { fontSize: 11, fontFamily: mono, color: t2, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6, display: "block" }
  const hint  = { fontSize: 10.5, color: t3, marginTop: 5, lineHeight: 1.5 }

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: mono, fontSize: 12, color: t3 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Explainer */}
      <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t1, marginBottom: 6 }}>Report metrics from your subgraph</div>
        <p style={{ fontSize: 12.5, color: t2, lineHeight: 1.65, margin: 0 }}>
          If your protocol runs its own subgraph, point ArcLens at it and we&apos;ll display your TVL and volume,
          refreshed hourly. These show <strong style={{ color: "#e0a810" }}>labelled as self-reported</strong> —
          for the green verified badge, switch to the <strong style={{ color: t1 }}>Verified · on-chain</strong> method above instead.
        </p>
        {lastUpdated && (
          <div style={{ fontSize: 10.5, fontFamily: mono, color: green, marginTop: 8 }}>
            ● Feed active · last synced {new Date(lastUpdated).toLocaleString()}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={label}>Subgraph URL</label>
          <input style={input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.studio.thegraph.com/query/…/version/latest" spellCheck={false} />
          <div style={hint}>Your subgraph&apos;s GraphQL endpoint. Must be https.</div>
        </div>

        <div>
          <label style={label}>Query</label>
          <textarea style={{ ...input, minHeight: 74, resize: "vertical", lineHeight: 1.6 }} value={query} onChange={e => setQuery(e.target.value)} placeholder="{ protocols(first:1){ totalTvlUsd totalVolumeUsd } }" spellCheck={false} />
          <div style={hint}>A GraphQL query that returns your headline numbers.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={label}>TVL path</label>
            <input style={input} value={tvlPath} onChange={e => setTvlPath(e.target.value)} placeholder="protocols.0.totalTvlUsd" spellCheck={false} />
          </div>
          <div>
            <label style={label}>Volume path</label>
            <input style={input} value={volPath} onChange={e => setVolPath(e.target.value)} placeholder="protocols.0.totalVolumeUsd" spellCheck={false} />
          </div>
        </div>
        <div style={{ ...hint, marginTop: -6 }}>
          Dot-path into the response, e.g. <code style={{ color: t2 }}>protocols.0.totalTvlUsd</code>. Fill at least one.
        </div>

        {/* Advanced / optional */}
        <button onClick={() => setShowAdvanced(v => !v)}
          style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#8aaeff", fontSize: 11.5, fontFamily: mono, cursor: "pointer", padding: 0 }}>
          {showAdvanced ? "− Hide" : "+ Optional"}: freshness timestamp & history chart
        </button>
        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16, background: surf, border: "1px solid " + bdr, borderRadius: 10 }}>
            <div>
              <label style={label}>Source timestamp path <span style={{ color: t3 }}>(optional)</span></label>
              <input style={input} value={tsPath} onChange={e => setTsPath(e.target.value)} placeholder="_meta.block.timestamp" spellCheck={false} />
              <div style={hint}>Unix seconds your data is current as of — shows an honest &quot;as of&quot; time on your page.</div>
            </div>
            <div style={{ height: 1, background: bdr }} />
            <div style={{ fontSize: 10.5, fontFamily: mono, color: t3 }}>DAILY HISTORY CHART (all four, or leave blank)</div>
            <div>
              <label style={label}>Series query</label>
              <textarea style={{ ...input, minHeight: 56, resize: "vertical", lineHeight: 1.6 }} value={seriesQuery} onChange={e => setSeriesQuery(e.target.value)} placeholder="{ dayDatas(first:60, orderBy:date, orderDirection:desc){ date tvlUsd } }" spellCheck={false} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div><label style={label}>Array path</label><input style={input} value={seriesPath} onChange={e => setSeriesPath(e.target.value)} placeholder="dayDatas" spellCheck={false} /></div>
              <div><label style={label}>Date key</label><input style={input} value={seriesX} onChange={e => setSeriesX(e.target.value)} placeholder="date" spellCheck={false} /></div>
              <div><label style={label}>USD key</label><input style={input} value={seriesY} onChange={e => setSeriesY(e.target.value)} placeholder="tvlUsd" spellCheck={false} /></div>
            </div>
          </div>
        )}

        {/* Result banner */}
        {result && (
          <div style={{
            padding: "11px 14px", borderRadius: 8, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap",
            fontFamily: result.ok ? "inherit" : mono,
            background: result.ok ? "rgba(0,184,122,0.07)" : "rgba(224,51,72,0.07)",
            border: "1px solid " + (result.ok ? "rgba(0,184,122,0.25)" : "rgba(224,51,72,0.25)"),
            color: result.ok ? green : "#e0788a",
          }}>
            {result.ok ? "✓ " : "✕ "}{result.msg}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => run("test")} disabled={!!busy || !url.trim()}
            style={{ height: 38, padding: "0 18px", background: "transparent", color: t1, border: "1px solid " + bdr, borderRadius: 9, fontSize: 12.5, fontFamily: mono, cursor: busy || !url.trim() ? "default" : "pointer", opacity: busy || !url.trim() ? 0.5 : 1 }}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </button>
          <button onClick={() => run("save")} disabled={!!busy}
            style={{ height: 38, padding: "0 22px", background: "#1a56ff", color: "#fff", border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 650, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy === "save" ? "Saving…" : "Save & activate"}
          </button>
          {url.trim() && (
            <button onClick={() => { setUrl(""); run("save") }} disabled={!!busy}
              title="Remove the subgraph feed"
              style={{ height: 38, padding: "0 14px", background: "transparent", color: "#e0788a", border: "1px solid rgba(224,51,72,0.25)", borderRadius: 9, fontSize: 11.5, fontFamily: mono, cursor: "pointer", marginLeft: "auto" }}>
              Remove feed
            </button>
          )}
        </div>
        <div style={{ ...hint }}>Tip: always <strong style={{ color: t2 }}>Test connection</strong> first — it shows the exact numbers we&apos;ll read, so you can fix a path before saving.</div>
      </div>
    </div>
  )
}
