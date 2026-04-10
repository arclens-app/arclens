"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

interface Tx {
  hash: string
  block: number
  timestamp: number
  from: string
  to: string | null
  valueUSDC: string
  gasUSDC: string
  status: string
}

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch("https://rpc.testnet.arc.network", {
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

function shortHash(h: string) {
  if (!h) return ""
  return h.slice(0, 12) + "..." + h.slice(-6)
}

export default function TransactionsPage() {
  const [mounted, setMounted] = useState(false)
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    async function load() {
      try {
        const blockHex = await rpc("eth_blockNumber")
        const latest = parseInt(blockHex, 16)
        const allTxs: Tx[] = []
        for (let i = 0; i < 5 && allTxs.length < 30; i++) {
          const b = await rpc("eth_getBlockByNumber", ["0x" + (latest - i).toString(16), true])
          if (!b) continue
          const ts = parseInt(b.timestamp, 16)
          for (const tx of b.transactions) {
            if (allTxs.length >= 30) break
            const gasUsed = parseInt(tx.gas, 16)
            const gasPrice = parseInt(tx.gasPrice || "0x2540BE400", 16)
            const gasUSDC = (gasUsed * gasPrice / 1e18).toFixed(6)
            const valueUSDC = (Number(BigInt(tx.value || "0x0")) / 1e18).toFixed(4)
            allTxs.push({
              hash: tx.hash,
              block: parseInt(b.number, 16),
              timestamp: ts,
              from: tx.from,
              to: tx.to,
              valueUSDC: "$" + valueUSDC,
              gasUSDC: "$" + gasUSDC,
              status: "confirmed",
            })
          }
        }
        setTxs(allTxs)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [mounted])

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#05070f" }} />

  const mono = "monospace"
  const border = "rgba(128,128,128,0.1)"

  return (
    <ArcLayout active="transactions">
      <div style={{ padding: "28px 28px 48px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: "#323e62", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Explorer</div>
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em", marginBottom: "5px" }}>Transactions</div>
          <div style={{ fontSize: "13px", color: "#6b7da8", fontWeight: 300 }}>Latest transactions on Arc Testnet. All gas costs in USDC.</div>
        </div>
        <div style={{ background: "var(--surf, #080c1a)", border: "1px solid " + border, borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid " + border }}>
                {["Hash", "Block", "Age", "From", "To", "Value", "Gas (USDC)", "Status"].map((h: any) => (
                  <th key={h} style={{ padding: "11px 18px", fontSize: "9.5px", fontFamily: mono, color: "#323e62", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: "48px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: "#323e62" }}>Loading transactions...</td></tr>
              ) : txs.map((tx: any) => (
                <tr key={tx.hash}
                  onClick={() => window.location.href = "/tx/" + tx.hash}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(128,128,128,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  style={{ borderBottom: "1px solid rgba(128,128,128,0.06)", cursor: "pointer" }}>
                  <td style={{ padding: "11px 18px", fontFamily: mono, fontSize: "11px", color: "#8aaeff" }}>{shortHash(tx.hash)}</td>
                  <td style={{ padding: "11px 18px", fontFamily: mono, fontSize: "11px", color: "#8aaeff" }}>#{tx.block.toLocaleString()}</td>
                  <td style={{ padding: "11px 18px", fontFamily: mono, fontSize: "11px", color: "#6b7da8" }}>{timeAgo(tx.timestamp)}</td>
                  <td style={{ padding: "11px 18px", fontFamily: mono, fontSize: "11px", color: "#6b7da8" }}>{short(tx.from)}</td>
                  <td style={{ padding: "11px 18px", fontFamily: mono, fontSize: "11px", color: "#6b7da8" }}>{tx.to ? short(tx.to) : "Create"}</td>
                  <td style={{ padding: "11px 18px", fontFamily: mono, fontSize: "11px" }}>{tx.valueUSDC}</td>
                  <td style={{ padding: "11px 18px", fontFamily: mono, fontSize: "11px", color: "#00d990" }}>{tx.gasUSDC}</td>
                  <td style={{ padding: "11px 18px" }}>
                    <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: "rgba(0,184,122,0.08)", color: "#00d990", border: "1px solid rgba(0,184,122,0.2)" }}>✓</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ArcLayout>
  )
}