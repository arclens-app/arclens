"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"
import { SkeletonRow, SkeletonStatsBand } from "@/components/ArcSkeleton"

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

function short(addr: string) { return addr ? addr.slice(0,6)+"..."+addr.slice(-4) : "" }
function shortHash(h: string) { return h ? h.slice(0,10)+"..."+h.slice(-6) : "" }

interface Block { number: number; txCount: number; feeUSDC: string; validator: string; timestamp: number }
interface Tx    { hash: string; from: string; to: string|null; toName?: string; valueUSDC: string; gasUSDC: string; timestamp: number }

export default function Home() {
  const [mounted, setMounted]   = useState(false)
  const [blockNum, setBlockNum] = useState("")
  const [gasUSDC, setGasUSDC]   = useState("")
  const [tps, setTps]           = useState("...")
  const [blocks, setBlocks]     = useState<Block[]>([])
  const [txs, setTxs]           = useState<Tx[]>([])
  const [lastBlock, setLastBlock] = useState(0)
  const [connected, setConnected] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    async function fetchAll() {
      try {
        const blockHex = await rpc("eth_blockNumber")
        const num      = parseInt(blockHex, 16)
        const gasHex   = await rpc("eth_gasPrice")
        const gwei     = parseInt(gasHex, 16) / 1e9
        setBlockNum(num.toLocaleString())
        setGasUSDC((gwei * 46000 * 1e-9).toFixed(4))
        setConnected(true)
        if (num === lastBlock) return
        setLastBlock(num)
        const newBlocks: Block[] = []
        const newTxs: Tx[] = []
        for (let i = 0; i < 6; i++) {
          const b = await rpc("eth_getBlockByNumber", ["0x" + (num - i).toString(16), true])
          if (!b) continue
          const gasUsed = parseInt(b.gasUsed, 16)
          const baseFee = parseInt(b.baseFeePerGas || "0x2540BE400", 16)
          const feeUSDC = (Number(BigInt(gasUsed) * BigInt(baseFee)) / 1e18).toFixed(4)
          const ts      = parseInt(b.timestamp, 16)
          newBlocks.push({ number: parseInt(b.number, 16), txCount: b.transactions.length, feeUSDC, validator: b.miner, timestamp: ts })
          for (const tx of b.transactions.slice(0, 4)) {
            if (newTxs.length >= 10) break
            const gasUsedTx  = parseInt(tx.gas, 16)
            const gasPriceTx = parseInt(tx.gasPrice || "0x2540BE400", 16)
            const gasUSDCTx  = (gasUsedTx * gasPriceTx / 1e18).toFixed(4)
            const valueUSDC  = (Number(BigInt(tx.value || "0x0")) / 1e18).toFixed(2)
            newTxs.push({ hash: tx.hash, from: tx.from, to: tx.to, valueUSDC: "$" + valueUSDC, gasUSDC: "$" + gasUSDCTx, timestamp: ts })
          }
        }
        if (newBlocks.length >= 2) {
          const totalTxs = newBlocks.slice(0,5).reduce((s,b) => s + b.txCount, 0)
          const timeSpan = newBlocks[0].timestamp - newBlocks[Math.min(4, newBlocks.length-1)].timestamp
          setTps(timeSpan > 0 ? (totalTxs / timeSpan).toFixed(1) : "...")
        }
        setBlocks(newBlocks)
        setTxs(newTxs)

        // Look up registered contract names for to-addresses
        const toAddrs = [...new Set(newTxs.map(t => t.to).filter(Boolean))] as string[]
        if (toAddrs.length > 0) {
          try {
            const namesRes = await fetch("/api/names", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addresses: toAddrs.map(a => a.toLowerCase()) }),
            })
            const namesMap = await namesRes.json()
            if (Object.keys(namesMap).length > 0) {
              setTxs(prev => prev.map((t: any) => ({
                ...t,
                toName: t.to ? namesMap[t.to.toLowerCase()]?.name : undefined,
              })))
            }
          } catch { /* names lookup is non-critical */ }
        }
      } catch { setConnected(false) }
    }
    fetchAll()
    const t = setInterval(fetchAll, 15000)
    return () => clearInterval(t)
  }, [mounted, lastBlock])

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#060812" }} />

  const mono  = "'DM Mono', monospace"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const arc   = "#1a56ff"
  const usdc  = "#00b87a"

  const stats = [
    { label: "Latest Block",    value: "#" + blockNum,          color: "#8aaeff", sub: "Arc Testnet · live" },
    { label: "Avg ERC-20 Cost", value: "$" + gasUSDC + " USDC", color: usdc,      sub: "Stable · predictable" },
    { label: "Live TPS",        value: tps,                      color: "#8aaeff", sub: "Transactions / second" },
    { label: "Gas Token",       value: "USDC",                   color: usdc,      sub: "Not ETH · not volatile" },
  ]

  const gasBand = [
    { label: "Base fee",      value: "$0.010 USDC" },
    { label: "Transfer",      value: "$0.009" },
    { label: "ERC-20",        value: "$0.011" },
    { label: "Contract Call", value: "$0.020" },
    { label: "Deploy",        value: "$0.048" },
  ]

  return (
    <ArcLayout active="overview">
      <div style={{ padding: "32px 28px 56px", position: "relative" }}>

        {/* AMBIENT GLOW */}
        <div style={{ position: "absolute", top: 0, left: "20%", width: "500px", height: "300px", background: "radial-gradient(ellipse, rgba(26,86,255,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "absolute", top: "100px", right: "10%", width: "400px", height: "250px", background: "radial-gradient(ellipse, rgba(0,184,122,0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1 }}>

          {/* HEADER */}
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", background: "rgba(26,86,255,0.08)", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "99px", marginBottom: "14px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: usdc, animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: "10px", fontFamily: mono, color: "#8aaeff", letterSpacing: "0.06em" }}>Arc Testnet · Economic OS · Chain 2588</span>
            </div>
            <div style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1.1, marginBottom: "8px", color: t1 }}>
              Network Overview
            </div>
            <div style={{ fontSize: "13.5px", color: t2, fontWeight: 300, maxWidth: "480px", lineHeight: 1.65 }}>
              All fees denominated in USDC. No volatile gas pricing. Sub-second deterministic finality.
            </div>
          </div>

          {/* STATS BAND */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1px", background: bdr, borderRadius: "14px", overflow: "hidden", marginBottom: "16px", border: "1px solid " + bdr }}>
            {stats.map((s: any) => (
              <div key={s.label} style={{ background: surf, padding: "20px 20px", transition: "background .15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = surf2)}
                onMouseLeave={e => (e.currentTarget.style.background = surf)}>
                <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>{s.label}</div>
                <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.04em", color: s.color, marginBottom: "5px" }}>{s.value}</div>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* GAS TRACKER */}
          <div style={{ display: "flex", alignItems: "center", background: "rgba(0,184,122,0.03)", border: "1px solid rgba(0,184,122,0.08)", borderRadius: "10px", marginBottom: "24px", overflow: "hidden" }}>
            <div style={{ padding: "11px 16px", fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", borderRight: "1px solid " + bdr, flexShrink: 0, background: "rgba(0,184,122,0.04)" }}>
              Gas Tracker
            </div>
            {gasBand.map((g: any) => (
              <div key={g.label} style={{ padding: "9px 16px", borderRight: "1px solid " + bdr, flexShrink: 0 }}>
                <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>{g.label}</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: usdc, letterSpacing: "-0.02em" }}>{g.value}</div>
              </div>
            ))}
          </div>

          {/* FEEDS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

            {/* BLOCKS */}
            <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid " + bdr, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: arc }} />
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>Latest Blocks</span>
                </div>
                <span style={{ fontSize: "10px", fontFamily: mono, color: connected ? usdc : t3 }}>
                  {connected ? "● Live" : "Connecting..."}
                </span>
              </div>
              {blocks.length === 0 ? (
                <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
              ) : blocks.map((b: any) => (
                <div key={b.number}
                  onClick={() => window.location.href = "/search?q=" + b.number}
                  onMouseEnter={e => (e.currentTarget.style.background = surf2)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderBottom: "1px solid " + bdr, cursor: "pointer", transition: "background .1s" }}>
                  <div style={{ minWidth: "84px", background: "rgba(26,86,255,0.07)", border: "1px solid rgba(26,86,255,0.14)", borderRadius: "7px", padding: "5px 8px", textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: "11px", color: "#8aaeff", fontWeight: 500 }}>#{b.number.toLocaleString()}</div>
                    <div style={{ fontSize: "9px", fontFamily: mono, color: t3, marginTop: "1px" }}>block</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", marginBottom: "2px", color: t1 }}>{b.txCount} txns</div>
                    <div style={{ fontSize: "10px", fontFamily: mono, color: t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{short(b.validator)}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "12px", fontFamily: mono, color: usdc, fontWeight: 500 }}>${b.feeUSDC}</div>
                    <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "2px" }}>{timeAgo(b.timestamp)}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: "10px 18px" }}>
                <a href="/blocks" style={{ fontSize: "11px", fontFamily: mono, color: "#8aaeff", textDecoration: "none", opacity: .7 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = ".7")}>
                  View all blocks →
                </a>
              </div>
            </div>

            {/* TRANSACTIONS */}
            <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "14px", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid " + bdr, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: usdc }} />
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>Latest Transactions</span>
                </div>
                <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>All fees in USDC</span>
              </div>
              {txs.length === 0 ? (
                <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
              ) : txs.map((tx: any) => (
                <div key={tx.hash}
                  onClick={() => window.location.href = "/tx/" + tx.hash}
                  onMouseEnter={e => (e.currentTarget.style.background = surf2)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderBottom: "1px solid " + bdr, cursor: "pointer", transition: "background .1s" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "11px", fontFamily: mono, color: "#8aaeff", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortHash(tx.hash)}</div>
                    <div style={{ fontSize: "10px", fontFamily: mono, color: t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {short(tx.from)} → {tx.toName ? <span style={{ color: "#00d990" }}>{tx.toName}</span> : tx.to ? short(tx.to) : "contract creation"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "12px", fontFamily: mono, fontWeight: 500, color: t1 }}>{tx.valueUSDC}</div>
                    <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "2px" }}>Gas: {tx.gasUSDC}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: "10px 18px" }}>
                <a href="/transactions" style={{ fontSize: "11px", fontFamily: mono, color: "#8aaeff", textDecoration: "none", opacity: .7 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = ".7")}>
                  View all transactions →
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </ArcLayout>
  )
}