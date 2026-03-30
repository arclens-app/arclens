"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

interface Block {
  number: number
  timestamp: number
  txCount: number
  validator: string
  gasUsed: string
  feeUSDC: string
}

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  })
  const data = await res.json()
  return data.result
}

function timeAgo(ts: number) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s / 60) + "m ago"
  return Math.floor(s / 3600) + "h ago"
}

function short(addr: string) {
  if (!addr) return ""
  return addr.slice(0, 8) + "..." + addr.slice(-6)
}

export default function BlocksPage() {
  const [mounted, setMounted] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    async function load() {
      try {
        const blockHex = await rpc("eth_blockNumber")
        const latest = parseInt(blockHex, 16)
        const fetched: Block[] = []
        for (let i = 0; i < 25; i++) {
          const b = await rpc("eth_getBlockByNumber", ["0x" + (latest - i).toString(16), false])
          if (!b) continue
          const gasUsed = parseInt(b.gasUsed, 16)
          const baseFee = parseInt(b.baseFeePerGas || "0x2540BE400", 16)
          const feeUSDC = (Number(BigInt(gasUsed) * BigInt(baseFee)) / 1e18).toFixed(4)
          fetched.push({
            number: parseInt(b.number, 16),
            timestamp: parseInt(b.timestamp, 16),
            txCount: b.transactions.length,
            validator: b.miner,
            gasUsed: gasUsed.toLocaleString(),
            feeUSDC,
          })
        }
        setBlocks(fetched)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [mounted])

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#05070f" }} />

  const mono = "monospace"
  const border = "rgba(128,128,128,0.1)"

  return (
    <ArcLayout active="blocks">
      <div style={{ padding: "28px 28px 48px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: "#323e62", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Explorer</div>
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em", marginBottom: "5px" }}>Blocks</div>
          <div style={{ fontSize: "13px", color: "#6b7da8", fontWeight: 300 }}>Latest blocks on Arc Testnet. Block rewards collected in USDC.</div>
        </div>
        <div style={{ background: "var(--surf, #080c1a)", border: "1px solid " + border, borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid " + border }}>
                {["Block", "Age", "Txns", "Validator", "Gas Used", "Fees (USDC)"].map(h => (
                  <th key={h} style={{ padding: "11px 18px", fontSize: "9.5px", fontFamily: mono, color: "#323e62", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: "48px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: "#323e62" }}>Loading blocks...</td></tr>
              ) : blocks.map(b => (
                <tr key={b.number}
                  onClick={() => window.location.href = "/search?q=" + b.number}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(128,128,128,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  style={{ borderBottom: "1px solid rgba(128,128,128,0.06)", cursor: "pointer" }}>
                  <td style={{ padding: "12px 18px", fontFamily: mono, fontSize: "12px", color: "#8aaeff", fontWeight: 500 }}>#{b.number.toLocaleString()}</td>
                  <td style={{ padding: "12px 18px", fontFamily: mono, fontSize: "11px", color: "#6b7da8" }}>{timeAgo(b.timestamp)}</td>
                  <td style={{ padding: "12px 18px", fontSize: "12px" }}>{b.txCount}</td>
                  <td style={{ padding: "12px 18px", fontFamily: mono, fontSize: "11px", color: "#6b7da8" }}>{short(b.validator)}</td>
                  <td style={{ padding: "12px 18px", fontFamily: mono, fontSize: "11px", color: "#6b7da8" }}>{b.gasUsed}</td>
                  <td style={{ padding: "12px 18px", fontFamily: mono, fontSize: "12px", color: "#00d990", fontWeight: 500 }}>${b.feeUSDC}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ArcLayout>
  )
}