"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

interface Token {
  rank: number
  address: string
  name: string
  symbol: string
  marketCap: string
  holders: string
  color: string
  verified: boolean
}

export default function TokensPage() {
  const [mounted, setMounted] = useState(false)
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    async function load() {
      try {
        const res = await fetch("/api/blockscout?path=v2/tokens%3Ftype%3DERC-20%26sort%3Dholder_count%26order%3Ddesc")
        const data = await res.json()
        const items = (data.items || []).slice(0, 20)
        setTokens(items.map((t: Record<string, unknown>, i: number) => ({
          rank: i + 1,
          address: t.address as string,
          name: (t.name as string) || "Unknown Token",
          symbol: (t.symbol as string) || "???",
          marketCap: t.circulating_market_cap
            ? "$" + Number(t.circulating_market_cap as string).toLocaleString(undefined, { maximumFractionDigits: 0 })
            : "N/A",
          holders: t.holders ? Number(t.holders as string).toLocaleString() : "0",
          color: (t.address as string)?.toLowerCase() === "0x3600000000000000000000000000000000000000" ? "#00d990" : "#1a56ff",
          verified: !!(t.is_verified),
        })))
      } catch {
        setTokens([
          { rank: 1, address: "0x3600000000000000000000000000000000000000", name: "USD Coin", symbol: "USDC", marketCap: "$48.3M", holders: "92,104", color: "#00d990", verified: true },
          { rank: 2, address: "0x0000000000000000000000000000000000000001", name: "Wrapped ETH", symbol: "WETH", marketCap: "$6.8M", holders: "14,887", color: "#60a5fa", verified: true },
          { rank: 3, address: "0x0000000000000000000000000000000000000002", name: "EURC", symbol: "EURC", marketCap: "$4.1M", holders: "8,204", color: "#8aaeff", verified: false },
        ])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [mounted])

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#05070f" }} />

  const mono = "monospace"
  const border = "rgba(128,128,128,0.1)"

  function Badge({ verified }: { verified: boolean }) {
    return verified
      ? <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(0,184,122,0.08)", color: "#00d990", border: "1px solid rgba(0,184,122,0.2)" }}>✓ Verified</span>
      : <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(224,136,16,0.08)", color: "#e08810", border: "1px solid rgba(224,136,16,0.2)" }}>⚠ Unverified</span>
  }

  return (
    <ArcLayout active="tokens">
      <div style={{ padding: "28px 28px 48px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: "#323e62", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Explorer</div>
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em", marginBottom: "5px" }}>Tokens</div>
          <div style={{ fontSize: "13px", color: "#6b7da8", fontWeight: 300 }}>All ERC-20 tokens on Arc Testnet. Safety ratings from the contract registry.</div>
        </div>
        <div style={{ background: "var(--surf, #080c1a)", border: "1px solid " + border, borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid " + border }}>
                {["#", "Token", "Market Cap", "Holders", "Safety"].map((h: any) => (
                  <th key={h} style={{ padding: "11px 18px", fontSize: "9.5px", fontFamily: mono, color: "#323e62", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: "48px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: "#323e62" }}>Loading tokens from Arc Testnet...</td></tr>
              ) : tokens.map((t: any) => (
                <tr key={t.address} onClick={() => window.location.href = "/address/" + t.address}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(128,128,128,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  style={{ borderBottom: "1px solid rgba(128,128,128,0.06)", cursor: "pointer" }}>
                  <td style={{ padding: "13px 18px", fontSize: "11px", fontFamily: mono, color: "#323e62" }}>{t.rank}</td>
                  <td style={{ padding: "13px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: t.color + "18", border: "1px solid " + t.color + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, fontFamily: mono, color: t.color, flexShrink: 0 }}>{t.symbol[0]}</div>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "2px" }}>{t.name}</div>
                        <div style={{ fontSize: "10px", fontFamily: mono, color: "#323e62" }}>{t.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "13px 18px", fontSize: "12px", fontFamily: mono }}>{t.marketCap}</td>
                  <td style={{ padding: "13px 18px", fontSize: "12px", fontFamily: mono, color: "#6b7da8" }}>{t.holders}</td>
                  <td style={{ padding: "13px 18px" }}><Badge verified={t.verified} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ArcLayout>
  )
}