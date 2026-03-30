"use client"
import { useEffect, useState, useCallback } from "react"
import ArcLayout from "@/components/ArcLayout"

function timeAgo(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s/60) + "m ago"
  if (s < 86400) return Math.floor(s/3600) + "h ago"
  return Math.floor(s/86400) + "d ago"
}
function short(a: string) { return a ? a.slice(0,8)+"..."+a.slice(-6) : "" }

// CCTP V2 supported chains with Arc domain = 7
const CHAINS: Record<number, { name: string; logo: string; color: string; blockscout?: string }> = {
  0:  { name: "Ethereum",       logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",        color: "#627EEA" },
  1:  { name: "Avalanche",      logo: "https://assets.coingecko.com/coins/images/12559/small/coin-round-red.png",color: "#E84142" },
  2:  { name: "OP Mainnet",     logo: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",      color: "#FF0420" },
  3:  { name: "Arbitrum",       logo: "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg", color: "#28A0F0" },
  6:  { name: "Base",           logo: "https://assets.coingecko.com/coins/images/30060/small/base.png",          color: "#0052FF" },
  7:  { name: "Arc Testnet (old)", logo: "", color: "#1a56ff" },
  26: { name: "Arc Testnet",    logo: "https://arclens.app/arc-logo.png",                                        color: "#1a56ff" },
  8:  { name: "Polygon",        logo: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",        color: "#8247E5" },
  10: { name: "Unichain",       logo: "https://assets.coingecko.com/coins/images/35024/small/unichain.png",      color: "#FF007A" },
  11: { name: "Linea",          logo: "https://assets.coingecko.com/coins/images/28206/small/linea-logo.png",    color: "#61DFFF" },
  14: { name: "Sonic",          logo: "https://assets.coingecko.com/coins/images/38108/small/sonic.jpg",         color: "#FF7B24" },
}

const TOKEN_MESSENGER    = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA"
const MSG_TRANSMITTER    = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
const TOKEN_MINTER       = "0xb43db544E2c27092c107639Ad201b3dEfAbcF192"
const BRIDGE_CONTRACT    = TOKEN_MESSENGER
const ARC_DOMAIN         = 26

interface Transfer {
  hash: string
  from: string
  to: string
  amount: string
  amountNum: number
  srcDomain: number
  dstDomain: number
  timestamp: string
  direction: "in" | "out"
  status: "complete" | "pending"
}

interface Stats {
  totalIn: number
  totalOut: number
  totalVolume: number
  topChainIn: number
  topChainOut: number
  txCount: number
}

export default function BridgePage() {
  const [mounted, setMounted]         = useState(false)
  const [loading, setLoading]         = useState(true)
  const [transfers, setTransfers]     = useState<Transfer[]>([])
  const [stats, setStats]             = useState<Stats|null>(null)
  const [filter, setFilter]           = useState<"all"|"in"|"out">("all")
  const [lastUpdate, setLastUpdate]   = useState<Date|null>(null)
  const [page, setPage]               = useState(1)
  const [inCursors, setInCursors]     = useState<(string|null)[]>([null])
  const [outCursors, setOutCursors]   = useState<(string|null)[]>([null])
  const [hasMoreIn, setHasMoreIn]     = useState(false)
  const [hasMoreOut, setHasMoreOut]   = useState(false)
  const [allTimeIn, setAllTimeIn]     = useState(0)
  const [allTimeOut, setAllTimeOut]   = useState(0)
  const [loadingPage, setLoadingPage] = useState(false)
  const [refreshing, setRefreshing]   = useState(false)
  const [timeSince, setTimeSince]     = useState(0)
  const [hasLoaded, setHasLoaded]     = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const loadBridgeData = useCallback(async () => {
    try {
      // First try Iris API
      try {
        const irisRes = await fetch(
          "https://iris-api-sandbox.circle.com/v2/messages?destinationDomain=26&limit=25"
        )
        if (irisRes.ok) {
          const irisData = await irisRes.json()
          const msgs = irisData.messages || []
          if (msgs.length > 0) {
            const enriched: Transfer[] = msgs.map((m: Record<string,unknown>) => ({
              hash:       m.sourceTxHash as string || "",
              from:       m.sender as string || "",
              to:         m.recipient as string || "",
              amount:     (Number(m.amount || 0) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }),
              amountNum:  Number(m.amount || 0) / 1e6,
              srcDomain:  Number(m.sourceDomain ?? 0),
              dstDomain:  Number(m.destinationDomain ?? 26),
              timestamp:  m.createdAt as string || new Date().toISOString(),
              direction:  Number(m.destinationDomain) === ARC_DOMAIN ? "in" : "out",
              status:     m.state === "complete" ? "complete" : "pending",
            })).filter((t: Transfer) => t.hash)
            if (enriched.length > 0) {
              setTransfers(enriched)
              computeStats(enriched)
              setHasLoaded(true)
              setLastUpdate(new Date())
              setTimeSince(0)
              setLoading(false)
              return
            }
          }
        }
      } catch { /* Iris blocked */ }

      // Fallback: use MessageTransmitter receiveMessage txns = USDC minted onto Arc
      // Fetch both pages in parallel for more coverage
      const [inRes, outRes, inRes2, outRes2] = await Promise.all([
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + MSG_TRANSMITTER + "/transactions")),
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + TOKEN_MESSENGER + "/transactions")),
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + MSG_TRANSMITTER + "/transactions?page=2")),
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + TOKEN_MESSENGER + "/transactions?page=2")),
      ])

      const [inData, outData, inData2, outData2] = await Promise.all([
        inRes.json(), outRes.json(), inRes2.json(), outRes2.json()
      ])

      // Merge pages
      const inItems  = [...(inData.items  || []), ...(inData2.items  || [])]
      const outItems = [...(outData.items || []), ...(outData2.items || [])]

      const seen = new Set<string>()
      const parsed: Transfer[] = []

      // receiveMessage = USDC arriving onto Arc (incoming)
      for (const t of inItems) {
        const hash = t.hash as string
        if (!hash || seen.has(hash)) continue
        seen.add(hash)
        const method = t.method as string
        if (method !== "receiveMessage") continue

        const fromAddr = (t.from as Record<string,string>)?.hash || ""
        const ts       = t.timestamp as string

        // Decode source domain and amount from message bytes
        let srcDomain = 0
        let amountNum = 0
        let amountStr = "—"
        try {
          const decoded = t.decoded_input as Record<string,unknown>
          const params  = decoded?.parameters as {name:string; value:string}[] || []
          const msgParam = params.find(p => p.name === "message")
          if (msgParam?.value) {
            const hex = msgParam.value.slice(2) // remove 0x
            // CCTP message format: version(4) + sourceDomain(4) + destDomain(4) + ...
            srcDomain = parseInt(hex.slice(8, 16), 16)  // bytes 4-7
            // BurnMessage amount is at fixed offset within the message body
            // After header (116 bytes = 232 hex chars), burn message starts
            // amount is at offset 132 bytes into burn body = burn header + mint recipient + ...
            // Easier: search for the amount near the end of the hex
            const amountHex = hex.slice(hex.length - 160, hex.length - 128)
            const amt = parseInt(amountHex, 16)
            if (amt > 0 && amt < 1e15) {
              amountNum = amt / 1e6
              amountStr = "$" + amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 })
            }
          }
        } catch { /* use defaults */ }

        parsed.push({
          hash,
          from:      fromAddr,
          to:        fromAddr,
          amount:    amountStr,
          amountNum,
          srcDomain,
          dstDomain: ARC_DOMAIN,
          timestamp: ts,
          direction: "in",
          status:    t.result === "success" ? "complete" : "pending",
        })
      }

      // depositForBurn on TokenMessenger = USDC leaving Arc (outgoing)
      for (const t of outItems) {
        const hash = t.hash as string
        if (!hash || seen.has(hash)) continue
        seen.add(hash)
        const method = t.method as string
        if (!method?.includes("depositForBurn") && method !== "burn") continue

        const fromAddr  = (t.from as Record<string,string>)?.hash || ""
        const ts        = t.timestamp as string
        // Extract amount from decoded input
        const decoded   = t.decoded_input as Record<string,unknown>
        const params    = decoded?.parameters as {name:string;value:string}[] || []
        const amountParam = params.find(p => p.name === "amount")
        const amountNum = amountParam ? Number(amountParam.value) / 1e6 : 0
        const amountStr = amountNum > 0 ? "$" + amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"

        // Get destination domain from params
        const destDomainParam = params.find(p => p.name === "destinationDomain")
        const dstDomain = destDomainParam ? Number(destDomainParam.value) : 0

        parsed.push({
          hash,
          from:      fromAddr,
          to:        fromAddr,
          amount:    amountStr,
          amountNum,
          srcDomain: ARC_DOMAIN,
          dstDomain,
          timestamp: ts,
          direction: "out",
          status:    t.result === "success" ? "complete" : "pending",
        })
      }

      // Get total counts from counters for accurate stats display
      const [inCountRes, outCountRes] = await Promise.all([
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + MSG_TRANSMITTER + "/counters")),
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + TOKEN_MESSENGER + "/counters")),
      ])
      const inCount  = await inCountRes.json()
      const outCount = await outCountRes.json()
      const totalInCount  = Number(inCount?.transactions_count  || 0)
      const totalOutCount = Number(outCount?.transactions_count || 0)
      setAllTimeIn(totalInCount)
      setAllTimeOut(totalOutCount)

      // Store cursors for pagination
      if (inData.next_page_params) {
        const p = inData.next_page_params
        setInCursors([null, `v2/addresses/${MSG_TRANSMITTER}/transactions?block_number=${p.block_number}&index=${p.index}`])
        setHasMoreIn(true)
      }
      if (outData.next_page_params) {
        const p = outData.next_page_params
        setOutCursors([null, `v2/addresses/${TOKEN_MESSENGER}/transactions?block_number=${p.block_number}&index=${p.index}`])
        setHasMoreOut(true)
      }

      parsed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setTransfers(parsed)
      setPage(1)
      computeStats(parsed, totalInCount, totalOutCount, true)
      setHasLoaded(true)
      setLastUpdate(new Date())
      setTimeSince(0)
    } catch (e) { console.error("[Bridge]", e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  function computeStats(items: Transfer[], totalIn = 0, totalOut = 0, resetVol = true) {
    const inItems     = items.filter(t => t.direction === "in")
    const outItems    = items.filter(t => t.direction === "out")
    const pageVolume  = items.reduce((s, t) => s + t.amountNum, 0)

    if (resetVol) setCumVolume(pageVolume)
    else setCumVolume(prev => prev + pageVolume)

    const chainCount: Record<number, number> = {}
    for (const t of inItems) chainCount[t.srcDomain] = (chainCount[t.srcDomain] || 0) + 1
    const topIn  = Object.entries(chainCount).sort((a,b) => b[1]-a[1])[0]
    const chainCountOut: Record<number, number> = {}
    for (const t of outItems) chainCountOut[t.dstDomain] = (chainCountOut[t.dstDomain] || 0) + 1
    const topOut = Object.entries(chainCountOut).sort((a,b) => b[1]-a[1])[0]

    setStats({
      totalIn:     items.filter(t => t.direction === "in").reduce((s,t) => s + t.amountNum, 0),
      totalOut:    items.filter(t => t.direction === "out").reduce((s,t) => s + t.amountNum, 0),
      totalVolume: pageVolume,
      topChainIn:  topIn  ? Number(topIn[0])  : 6,
      topChainOut: topOut ? Number(topOut[0]) : 6,
      txCount:     totalIn + totalOut || items.length,
    })
  }

  useEffect(() => {
    if (!mounted) return
    loadBridgeData()
    const interval = setInterval(loadBridgeData, 30000)
    return () => clearInterval(interval)
  }, [mounted, loadBridgeData])

  // Live "last updated" counter using ref
  useEffect(() => {
    const t = setInterval(() => {
      if (true) {
        setTimeSince(Math.floor((Date.now() - lastRefreshRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(t)
  }, [])

  if (!mounted) return <div style={{ minHeight:"100vh", background:"var(--bg,#060812)" }} />

  const mono  = "'DM Mono', monospace"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const usdc  = "#00b87a"
  const arc   = "#1a56ff"

  const filtered = filter === "all" ? transfers : transfers.filter(t => t.direction === filter)

  function ChainBadge({ domain, size = 20 }: { domain: number; size?: number }) {
    const chain = CHAINS[domain]
    if (!chain) return <span style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>Domain {domain}</span>
    return (
      <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
        <img src={chain.logo} alt={chain.name}
          style={{ width:size+"px", height:size+"px", borderRadius:"50%", objectFit:"cover", flexShrink:0 }}
          onError={e => (e.currentTarget.style.display="none")} />
        <span style={{ fontSize:"11px", fontFamily:mono, color:t2 }}>{chain.name}</span>
      </div>
    )
  }

  return (
    <ArcLayout active="bridge">
      <div style={{ padding:"28px 28px 48px" }}>

        {/* HEADER */}
        <div style={{ marginBottom:"24px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:"12px" }}>
          <div>
            <div style={{ fontSize:"10px", fontFamily:mono, color:t3, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"8px" }}>Cross-Chain · CCTP V2</div>
            <div style={{ fontSize:"26px", fontWeight:700, letterSpacing:"-0.04em", marginBottom:"4px", color:t1 }}>Arc Bridge Tracker</div>
            <div style={{ fontSize:"13px", color:t2, fontWeight:300 }}>Live USDC flows in and out of Arc via Circle CCTP V2. Burn on source → mint on Arc.</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"6px" }}>
            <button onClick={() => {
              setRefreshing(true)
              loadBridgeData().then(() => setRefreshing(false)).catch(() => setRefreshing(false))
            }} disabled={refreshing}
              style={{ height:"36px", padding:"0 16px", background:"transparent", color:"#8aaeff", fontSize:"11px", fontFamily:mono, border:"1px solid rgba(26,86,255,0.2)", borderRadius:"8px", cursor:refreshing?"not-allowed":"pointer", opacity:refreshing?.6:1 }}>
              {refreshing ? "↻ Refreshing..." : "↻ Refresh"}
            </button>
            <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3 }}>
              {hasLoaded ? `Updated ${timeSince}s ago · auto-refreshes 30s` : "Connecting..."}
            </div>
          </div>
        </div>

        {/* STATS BAND */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"1px", background:bdr, borderRadius:"14px", overflow:"hidden", border:"1px solid "+bdr, marginBottom:"20px" }}>
          {[
            { label:"Total Transfers", value: (allTimeIn + allTimeOut) > 0 ? (allTimeIn + allTimeOut).toLocaleString() : "...", sub:"all time · since launch",   color:"#8aaeff" },
            { label:"Into Arc",        value: allTimeIn  > 0 ? allTimeIn.toLocaleString()  : "...",                            sub:"receiveMessage · all time",  color:usdc },
            { label:"Out of Arc",      value: allTimeOut > 0 ? allTimeOut.toLocaleString() : "...",                            sub:"depositForBurn · all time",  color:"#e08810" },
          ].map(s => (
            <div key={s.label} style={{ background:surf, padding:"16px 20px" }}>
              <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>{s.label}</div>
              <div style={{ fontSize:"20px", fontWeight:700, letterSpacing:"-0.03em", color:s.color, marginBottom:"3px" }}>{s.value}</div>
              <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* CHAIN FLOW DIAGRAM */}
        <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", padding:"20px", marginBottom:"20px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"16px" }}>
            <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:usdc }}/>
            <span style={{ fontSize:"12.5px", fontWeight:500 }}>Supported CCTP V2 Chains → Arc</span>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"10px", alignItems:"center" }}>
            {[0,1,2,3,6,8,10,11,14].map(domain => (
              <div key={domain} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"6px 12px", background:surf2, borderRadius:"8px", border:"1px solid "+bdr }}>
                <img src={CHAINS[domain]?.logo} alt={CHAINS[domain]?.name}
                  style={{ width:"16px", height:"16px", borderRadius:"50%", objectFit:"cover" }}
                  onError={e => (e.currentTarget.style.display="none")} />
                <span style={{ fontSize:"11px", fontFamily:mono, color:t2 }}>{CHAINS[domain]?.name}</span>
              </div>
            ))}
            <div style={{ padding:"6px 12px", display:"flex", alignItems:"center", gap:"6px", background:"rgba(26,86,255,0.08)", borderRadius:"8px", border:"1px solid rgba(26,86,255,0.2)" }}>
              <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:arc }}/>
              <span style={{ fontSize:"11px", fontFamily:mono, color:"#8aaeff", fontWeight:600 }}>Arc Testnet</span>
              <span style={{ fontSize:"9px", fontFamily:mono, color:t3 }}>Domain 26</span>
            </div>
          </div>
        </div>

        {/* FILTER TABS */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"16px" }}>
          {[
            { id:"all" as const, label:"All Transfers" },
            { id:"in"  as const, label:"→ Into Arc" },
            { id:"out" as const, label:"← Out of Arc" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ height:"32px", padding:"0 14px", background:filter===f.id?"#1a56ff":"transparent", color:filter===f.id?"#fff":t2, fontSize:"11.5px", fontWeight:filter===f.id?600:400, border:"1px solid "+(filter===f.id?"#1a56ff":bdr), borderRadius:"7px", cursor:"pointer", fontFamily:"'Geist',sans-serif", transition:"all .12s" }}>
              {f.label}
              {f.id !== "all" && <span style={{ marginLeft:"5px", fontSize:"10px", opacity:.7 }}>
                ({f.id === "in" ? transfers.filter(t=>t.direction==="in").length : transfers.filter(t=>t.direction==="out").length})
              </span>}
            </button>
          ))}
        </div>

        {/* TRANSFERS TABLE */}
        <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", overflow:"hidden" }}>
          <div style={{ padding:"13px 18px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:usdc, animation:"pulse 2s infinite" }}/>
              <span style={{ fontSize:"12.5px", fontWeight:500 }}>Live Bridge Transfers</span>
            </div>
            <span style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>Auto-refreshes every 30s</span>
          </div>

          {/* Table header */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 120px 120px 100px 80px 80px", gap:"0", padding:"8px 18px", borderBottom:"1px solid "+bdr }}>
            {["Transaction","From Chain","To Chain","Amount","Direction","Time"].map(h => (
              <div key={h} style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em" }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding:"60px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>
              Loading bridge transfers...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:"60px", textAlign:"center" }}>
              <div style={{ fontSize:"32px", marginBottom:"12px" }}>🌉</div>
              <div style={{ fontSize:"14px", fontWeight:600, color:t1, marginBottom:"6px" }}>No bridge transfers yet</div>
              <div style={{ fontSize:"12px", fontFamily:mono, color:t3, maxWidth:"400px", margin:"0 auto", lineHeight:1.7 }}>
                CCTP V2 contracts are deployed on Arc Testnet. Bridge transfers will appear here once users start moving USDC between Arc and other chains.
              </div>
            </div>
          ) : filtered.map((t, i) => (
            <div key={t.hash+i}
              onClick={() => t.hash && (window.location.href="/tx/"+t.hash)}
              onMouseEnter={e => (e.currentTarget.style.background=surf2)}
              onMouseLeave={e => (e.currentTarget.style.background="transparent")}
              style={{ display:"grid", gridTemplateColumns:"1fr 120px 120px 100px 80px 80px", gap:"0", padding:"12px 18px", borderBottom:"1px solid rgba(128,128,128,0.04)", cursor:t.hash?"pointer":"default", transition:"background .1s", alignItems:"center" }}>

              {/* Hash */}
              <div>
                <div style={{ fontSize:"11px", fontFamily:mono, color:"#8aaeff", marginBottom:"2px" }}>{short(t.hash)}</div>
                <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3 }}>{short(t.from)}</div>
              </div>

              {/* From chain */}
              <ChainBadge domain={t.direction==="in" ? t.srcDomain : ARC_DOMAIN} />

              {/* To chain */}
              <ChainBadge domain={t.direction==="in" ? ARC_DOMAIN : t.dstDomain} />

              {/* Amount */}
              <div style={{ fontSize:"13px", fontFamily:mono, fontWeight:600, color:usdc }}>{t.amount}</div>

              {/* Direction badge */}
              <div style={{ fontSize:"9.5px", fontFamily:mono, padding:"3px 8px", borderRadius:"5px", background:t.direction==="in"?"rgba(0,184,122,0.08)":"rgba(224,136,16,0.08)", color:t.direction==="in"?"#00d990":"#e08810", border:"1px solid "+(t.direction==="in"?"rgba(0,184,122,0.2)":"rgba(224,136,16,0.2)"), display:"inline-block" }}>
                {t.direction==="in" ? "→ In" : "← Out"}
              </div>

              {/* Time */}
              <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{t.timestamp ? timeAgo(t.timestamp) : "—"}</div>
            </div>
          ))}

          {/* PAGINATION */}
          {(page > 1 || hasMoreIn || hasMoreOut) && (
            <div style={{ padding:"14px 18px", borderTop:"1px solid "+bdr, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>
                Showing page {page} · {filtered.length} transfers
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1||loadingPage}
                  style={{ height:"32px", padding:"0 14px", background:"transparent", color:page===1?t3:t2, fontSize:"12px", fontFamily:mono, border:"1px solid "+bdr, borderRadius:"7px", cursor:page===1?"not-allowed":"pointer", opacity:page===1?.4:1 }}>
                  ← Prev
                </button>
                <div style={{ height:"32px", padding:"0 14px", background:"rgba(26,86,255,0.08)", color:"#8aaeff", fontSize:"12px", fontFamily:mono, border:"1px solid rgba(26,86,255,0.2)", borderRadius:"7px", display:"flex", alignItems:"center" }}>
                  {page}
                </div>
                <button onClick={async () => {
                  setLoadingPage(true)
                  try {
                    const nextP = page + 1
                    const [inR, outR] = await Promise.all([
                      fetch("/api/blockscout?path=" + encodeURIComponent(`v2/addresses/${MSG_TRANSMITTER}/transactions?page=${nextP}`)),
                      fetch("/api/blockscout?path=" + encodeURIComponent(`v2/addresses/${TOKEN_MESSENGER}/transactions?page=${nextP}`)),
                    ])
                    const [inD, outD] = await Promise.all([inR.json(), outR.json()])
                    const seen2 = new Set<string>()
                    const newTransfers: Transfer[] = []
                    for (const t of (inD.items || [])) {
                      const hash = t.hash as string
                      if (!hash || seen2.has(hash) || t.method !== "receiveMessage") continue
                      seen2.add(hash)
                      let srcDomain = 0, amountNum = 0, amountStr = "—"
                      try {
                        const params = (t.decoded_input as Record<string,unknown>)?.parameters as {name:string;value:string}[] || []
                        const msgParam = params.find(p => p.name === "message")
                        if (msgParam?.value) {
                          const hex = msgParam.value.slice(2)
                          srcDomain = parseInt(hex.slice(8,16), 16)
                          const amt = parseInt(hex.slice(hex.length-160, hex.length-128), 16)
                          if (amt > 0 && amt < 1e15) { amountNum = amt/1e6; amountStr = "$"+amountNum.toLocaleString(undefined,{maximumFractionDigits:2}) }
                        }
                      } catch {}
                      newTransfers.push({ hash, from:(t.from as Record<string,string>)?.hash||"", to:"", amount:amountStr, amountNum, srcDomain, dstDomain:ARC_DOMAIN, timestamp:t.timestamp as string||"", direction:"in", status:t.result==="success"?"complete":"pending" })
                    }
                    for (const t of (outD.items || [])) {
                      const hash = t.hash as string
                      if (!hash || seen2.has(hash) || !t.method?.includes("depositForBurn")) continue
                      seen2.add(hash)
                      const params = (t.decoded_input as Record<string,unknown>)?.parameters as {name:string;value:string}[] || []
                      const amountP = params.find(p => p.name==="amount")
                      const amountNum = amountP ? Number(amountP.value)/1e6 : 0
                      const dstDomainP = params.find(p => p.name==="destinationDomain")
                      newTransfers.push({ hash, from:(t.from as Record<string,string>)?.hash||"", to:"", amount:amountNum>0?"$"+amountNum.toLocaleString(undefined,{maximumFractionDigits:2}):"—", amountNum, srcDomain:ARC_DOMAIN, dstDomain:dstDomainP?Number(dstDomainP.value):0, timestamp:t.timestamp as string||"", direction:"out", status:t.result==="success"?"complete":"pending" })
                    }
                    if (newTransfers.length > 0) {
                      newTransfers.sort((a,b) => new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime())
                      setTransfers(newTransfers)
                      setPage(nextP)
                      setHasMoreIn(!!(inD.next_page_params))
                      setHasMoreOut(!!(outD.next_page_params))
                      computeStats(newTransfers, allTimeIn, allTimeOut, false)
                    }
                  } finally { setLoadingPage(false) }
                }} disabled={(!hasMoreIn && !hasMoreOut)||loadingPage}
                  style={{ height:"32px", padding:"0 14px", background:"transparent", color:(!hasMoreIn&&!hasMoreOut)?t3:t2, fontSize:"12px", fontFamily:mono, border:"1px solid "+bdr, borderRadius:"7px", cursor:(!hasMoreIn&&!hasMoreOut)?"not-allowed":"pointer", opacity:(!hasMoreIn&&!hasMoreOut)?.4:1 }}>
                  {loadingPage ? "..." : "Next →"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* INFO SECTION */}
        <div style={{ marginTop:"20px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
          <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"12px", padding:"16px 20px" }}>
            <div style={{ fontSize:"11px", fontWeight:600, marginBottom:"10px", color:t1 }}>How CCTP V2 Works on Arc</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
              {[
                { step:"1", label:"Burn", desc:"USDC burned on source chain" },
                { step:"2", label:"Attest", desc:"Circle Iris signs the message" },
                { step:"3", label:"Mint", desc:"Native USDC minted on Arc" },
              ].map(s => (
                <div key={s.step} style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                  <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"rgba(26,86,255,0.1)", border:"1px solid rgba(26,86,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"9px", fontFamily:mono, color:"#8aaeff", flexShrink:0 }}>{s.step}</div>
                  <div>
                    <div style={{ fontSize:"11px", fontWeight:500, color:t1 }}>{s.label}</div>
                    <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"12px", padding:"16px 20px" }}>
            <div style={{ fontSize:"11px", fontWeight:600, marginBottom:"10px", color:t1 }}>Arc Bridge Contracts</div>
            {[
              { label:"TokenMessenger V2",    addr:TOKEN_MESSENGER },
              { label:"MessageTransmitter V2", addr:MSG_TRANSMITTER },
              { label:"TokenMinter V2",        addr:TOKEN_MINTER },
              { label:"USDC (Native)",         addr:"0x3600000000000000000000000000000000000000" },
              { label:"Arc CCTP Domain",       addr:"26" },
            ].map(c => (
              <div key={c.label} style={{ marginBottom:"8px" }}>
                <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"2px" }}>{c.label}</div>
                <div style={{ fontSize:"10.5px", fontFamily:mono, color:"#8aaeff", cursor: c.addr.length > 5 ? "pointer":"default" }}
                  onClick={() => c.addr.startsWith("0x") && (window.location.href="/address/"+c.addr)}>
                  {c.addr}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ArcLayout>
  )
}