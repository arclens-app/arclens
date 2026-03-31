"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  })
  const data = await res.json()
  return data.result
}

function short(a: string) { return a ? a.slice(0,8)+"..."+a.slice(-6) : "" }
function timeAgo(ts: number) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s / 60) + "m ago"
  return Math.floor(s / 3600) + "h ago"
}

interface Holder  { address: string; value: number; rank: number }
interface WhaleTx { hash: string; from: string; to: string; amount: number; timestamp: number }
interface ActiveW { address: string; txCount: number; rank: number }

function AddressRow({ address, onClick }: { address: string; onClick: () => void }) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)

  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div onClick={onClick} style={{ fontFamily: "monospace", fontSize: "12px", color: "#8aaeff", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {hovered ? address : short(address)}
      </div>
      {hovered && (
        <button onClick={copy}
          style={{ fontSize: "9px", fontFamily: "monospace", padding: "2px 7px", borderRadius: "4px", border: "1px solid rgba(138,174,255,0.2)", background: copied ? "rgba(0,184,122,0.1)" : "rgba(138,174,255,0.08)", color: copied ? "#00d990" : "#8aaeff", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          {copied ? "Copied!" : "Copy"}
        </button>
      )}
    </div>
  )
}

export default function WalletActivityPage() {
  const [mounted, setMounted]     = useState(false)
  const [holders, setHolders]     = useState<Holder[]>([])
  const [whales, setWhales]       = useState<WhaleTx[]>([])
  const [active, setActive]       = useState<ActiveW[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tab, setTab]             = useState<"holders"|"whales"|"active">("holders")
  const [totalHolders, setTotalHolders]       = useState("")
  const [totalSupply, setTotalSupply]         = useState("")
  const [largestTransfer, setLargestTransfer] = useState("")
  const [holderNextPage, setHolderNextPage]   = useState<string|null>(null)
  const [whaleNextPage, setWhaleNextPage]     = useState<string|null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    async function load() {
      setLoading(true)
      try {
        // Token info
        const tokenRes  = await fetch("/api/blockscout?path=v2/tokens/0x3600000000000000000000000000000000000000")
        const tokenData = await tokenRes.json()
        if (tokenData.total_supply) setTotalSupply("$" + (Number(tokenData.total_supply) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }))
        if (tokenData.holders_count) setTotalHolders(Number(tokenData.holders_count).toLocaleString())

        // Top holders
        const holdersRes  = await fetch("/api/blockscout?path=v2/tokens/0x3600000000000000000000000000000000000000/holders")
        const holdersData = await holdersRes.json()
        const filtered = (holdersData.items || [])
          .map((h: Record<string,unknown>) => ({
            address: (h.address as Record<string,string>)?.hash || "",
            value:   Number((h.value as string)||0) / 1e6,
          }))
          .filter((h: { address: string; value: number }) => h.address && h.value < 5_000_000_000)
        setHolders(filtered.map((h: { address: string; value: number }, i: number) => ({ ...h, rank: i + 1 })))
        if (holdersData.next_page_params) {
          const p = holdersData.next_page_params
          setHolderNextPage(`v2/tokens/0x3600000000000000000000000000000000000000/holders?items_count=${p.items_count}&value=${p.value}`)
        }

        // Transfers sorted by amount
        const transfersRes  = await fetch("/api/blockscout?path=v2/tokens/0x3600000000000000000000000000000000000000/transfers")
        const transfersData = await transfersRes.json()
        const allT = (transfersData.items || [])
          .map((t: Record<string,unknown>) => {
            const total = t.total as Record<string,string>
            const from  = t.from as Record<string,string>
            const to    = t.to as Record<string,string>
            const ts    = t.timestamp as string
            return { hash: t.transaction_hash as string, from: from?.hash||"", to: to?.hash||"", amount: Number(total?.value||0)/1e6, timestamp: ts ? Math.floor(new Date(ts).getTime()/1000) : 0 }
          })
          .filter((t: WhaleTx) => t.hash && t.amount > 0)
          .sort((a: WhaleTx, b: WhaleTx) => b.amount - a.amount)
        setWhales(allT)
        if (allT.length > 0) setLargestTransfer("$" + allT[0].amount.toLocaleString(undefined, { maximumFractionDigits: 2 }))
        if (transfersData.next_page_params) {
          const p = transfersData.next_page_params
          setWhaleNextPage(`v2/tokens/0x3600000000000000000000000000000000000000/transfers?block_number=${p.block_number}&index=${p.index}`)
        }

        // Most active wallets — 200 blocks parallel
        const blockHex = await rpc("eth_blockNumber")
        const latest   = parseInt(blockHex, 16)
        const txMap    = new Map<string, number>()
        const batchSize = 10
        for (let batch = 0; batch < 20; batch++) {
          const promises = []
          for (let i = 0; i < batchSize; i++) {
            promises.push(rpc("eth_getBlockByNumber", ["0x" + (latest - (batch * batchSize + i)).toString(16), true]))
          }
          const blocks = await Promise.all(promises)
          for (const b of blocks) {
            if (!b) continue
            for (const tx of b.transactions) {
              if (tx.from) txMap.set(tx.from.toLowerCase(), (txMap.get(tx.from.toLowerCase())||0)+1)
            }
          }
        }
        setActive([...txMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([addr,count],i) => ({ address: addr, txCount: count, rank: i+1 })))

      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [mounted])

  async function loadMoreHolders() {
    if (!holderNextPage) return
    setLoadingMore(true)
    try {
      const res  = await fetch("/api/blockscout?path=" + encodeURIComponent(holderNextPage))
      const data = await res.json()
      const more = (data.items || [])
        .map((h: Record<string,unknown>) => ({ address: (h.address as Record<string,string>)?.hash||"", value: Number((h.value as string)||0)/1e6 }))
        .filter((h: { address: string; value: number }) => h.address && h.value < 5_000_000_000)
      const newHolders = [...holders, ...more].map((h, i) => ({ ...h, rank: i+1 }))
      setHolders(newHolders)
      setHolderNextPage(data.next_page_params ? `v2/tokens/0x3600000000000000000000000000000000000000/holders?items_count=${data.next_page_params.items_count}&value=${data.next_page_params.value}` : null)
    } finally { setLoadingMore(false) }
  }

  async function loadMoreWhales() {
    if (!whaleNextPage) return
    setLoadingMore(true)
    try {
      const res  = await fetch("/api/blockscout?path=" + encodeURIComponent(whaleNextPage))
      const data = await res.json()
      const more = (data.items||[]).map((t: Record<string,unknown>) => {
        const total = t.total as Record<string,string>
        const from  = t.from as Record<string,string>
        const to    = t.to as Record<string,string>
        const ts    = t.timestamp as string
        return { hash: t.transaction_hash as string, from: from?.hash||"", to: to?.hash||"", amount: Number(total?.value||0)/1e6, timestamp: ts ? Math.floor(new Date(ts).getTime()/1000):0 }
      }).filter((t: WhaleTx) => t.hash && t.amount > 0)
      const newWhales = [...whales, ...more].sort((a,b)=>b.amount-a.amount)
      setWhales(newWhales)
      setWhaleNextPage(data.next_page_params ? `v2/tokens/0x3600000000000000000000000000000000000000/transfers?block_number=${data.next_page_params.block_number}&index=${data.next_page_params.index}` : null)
    } finally { setLoadingMore(false) }
  }

  if (!mounted) return <div style={{ minHeight:"100vh", background:"#05070f" }} />

  const mono   = "monospace"
  const border = "rgba(128,128,128,0.1)"
  const surf   = "var(--surf, #080c1a)"
  const maxTx  = active[0]?.txCount || 1
  const maxVal = holders[0]?.value || 1

  const tabs = [
    { id: "holders" as const, label: "Top USDC Holders" },
    { id: "whales"  as const, label: "Largest Transfers" },
    { id: "active"  as const, label: "Most Active Wallets" },
  ]

  return (
    <ArcLayout active="wallets">
      <div style={{ padding:"28px 28px 48px" }}>

        <div style={{ marginBottom:"24px" }}>
          <div style={{ fontSize:"10px", fontFamily:mono, color:"#323e62", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"8px" }}>Analytics</div>
          <div style={{ fontSize:"28px", fontWeight:700, letterSpacing:"-0.04em", marginBottom:"5px" }}>Wallet Activity</div>
          <div style={{ fontSize:"13px", color:"#6b7da8", fontWeight:300 }}>Live wallet analytics on Arc Testnet — top USDC holders, largest transfers, most active addresses.</div>
        </div>

        {/* STATS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"1px", background:border, border:"1px solid "+border, borderRadius:"12px", overflow:"hidden", marginBottom:"24px" }}>
          {[
            { label:"USDC Holders",      value:totalHolders||"...",      color:"#8aaeff", sub:"unique addresses holding USDC" },
            { label:"Total USDC Supply", value:totalSupply||"...",        color:"#00d990", sub:"circulating on Arc Testnet" },
            { label:"Largest Transfer",  value:largestTransfer||"...",    color:"#c08828", sub:"in recent USDC transfers" },
          ].map((s: any) => (
            <div key={s.label} style={{ background:surf, padding:"18px 22px" }}>
              <div style={{ fontSize:"9.5px", fontFamily:mono, color:"#323e62", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>{s.label}</div>
              <div style={{ fontSize:"22px", fontWeight:700, letterSpacing:"-0.04em", color:s.color, marginBottom:"4px" }}>{s.value}</div>
              <div style={{ fontSize:"10px", fontFamily:mono, color:"#323e62" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"20px" }}>
          {tabs.map((t: any) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ height:"34px", padding:"0 16px", background:tab===t.id?"#1a56ff":"transparent", color:tab===t.id?"#fff":"#6b7da8", fontSize:"12px", fontWeight:tab===t.id?600:400, border:"1px solid "+(tab===t.id?"#1a56ff":border), borderRadius:"7px", cursor:"pointer", fontFamily:"'Geist',sans-serif", transition:"all .12s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* TABLE */}
        <div style={{ background:surf, border:"1px solid "+border, borderRadius:"12px", overflow:"hidden" }}>
          <div style={{ padding:"13px 18px", borderBottom:"1px solid "+border, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:tab==="whales"?"#c08828":tab==="active"?"#00d990":"#1a56ff" }}/>
              <div style={{ fontSize:"12.5px", fontWeight:500 }}>
                {tab==="holders" ? "Top USDC Holders — hover to see full address" : tab==="whales" ? "Largest USDC Transfers — sorted by amount" : "Most Active Wallets — last 200 blocks"}
              </div>
            </div>
            {loading && <div style={{ fontSize:"10px", fontFamily:mono, color:"#3a4870" }}>Loading...</div>}
          </div>

          {loading ? (
            <div style={{ padding:"48px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:"#323e62" }}>Scanning Arc Testnet...</div>
          ) : tab==="holders" ? (
            <>
              {holders.map((h: any) => (
                <div key={h.address} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"13px 18px", borderBottom:"1px solid rgba(128,128,128,0.06)" }}>
                  <div style={{ width:"32px", fontSize:"13px", flexShrink:0, textAlign:"center" }}>
                    {h.rank<=3 ? ["🥇","🥈","🥉"][h.rank-1] : <span style={{ fontSize:"11px", fontFamily:mono, color:"#323e62" }}>#{h.rank}</span>}
                  </div>
                  <AddressRow address={h.address} onClick={() => window.location.href="/address/"+h.address} />
                  <div style={{ display:"flex", alignItems:"center", gap:"10px", flexShrink:0 }}>
                    <div style={{ height:"4px", width:Math.max(8,(h.value/maxVal)*100)+"px", background:"rgba(0,217,144,0.3)", borderRadius:"2px" }}/>
                    <div style={{ fontSize:"13px", fontFamily:mono, fontWeight:600, color:"#00d990", minWidth:"160px", textAlign:"right" }}>
                      ${h.value.toLocaleString(undefined,{maximumFractionDigits:2})} USDC
                    </div>
                  </div>
                </div>
              ))}
              {holderNextPage && (
                <div style={{ padding:"16px", textAlign:"center" }}>
                  <button onClick={loadMoreHolders} disabled={loadingMore}
                    style={{ height:"34px", padding:"0 20px", background:"transparent", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.3)", borderRadius:"7px", cursor:loadingMore?"not-allowed":"pointer", fontFamily:"'Geist',sans-serif", opacity:loadingMore?.7:1 }}>
                    {loadingMore ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          ) : tab==="whales" ? (
            <>
              {whales.map((w,i) => (
                <div key={w.hash+i} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"13px 18px", borderBottom:"1px solid rgba(128,128,128,0.06)", cursor:"pointer" }}
                  onClick={() => window.location.href="/tx/"+w.hash}
                  onMouseEnter={e=>(e.currentTarget.style.background="rgba(128,128,128,0.04)")}
                  onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                  <div style={{ width:"32px", fontSize:"13px", flexShrink:0, textAlign:"center" }}>
                    {i<3 ? ["🥇","🥈","🥉"][i] : <span style={{ fontSize:"11px", fontFamily:mono, color:"#323e62" }}>#{i+1}</span>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:"11px", fontFamily:mono, color:"#8aaeff", marginBottom:"3px" }}>{w.hash.slice(0,12)}...{w.hash.slice(-6)}</div>
                    <div style={{ fontSize:"10px", fontFamily:mono, color:"#3a4870" }}>{short(w.from)} → {short(w.to)}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:"14px", fontFamily:mono, fontWeight:700, color:"#c08828", marginBottom:"2px" }}>
                      ${w.amount.toLocaleString(undefined,{maximumFractionDigits:2})} USDC
                    </div>
                    <div style={{ fontSize:"10px", fontFamily:mono, color:"#3a4870" }}>{timeAgo(w.timestamp)}</div>
                  </div>
                </div>
              ))}
              {whaleNextPage && (
                <div style={{ padding:"16px", textAlign:"center" }}>
                  <button onClick={loadMoreWhales} disabled={loadingMore}
                    style={{ height:"34px", padding:"0 20px", background:"transparent", color:"#8aaeff", fontSize:"12px", border:"1px solid rgba(26,86,255,0.3)", borderRadius:"7px", cursor:loadingMore?"not-allowed":"pointer", fontFamily:"'Geist',sans-serif", opacity:loadingMore?.7:1 }}>
                    {loadingMore ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {active.map((a: any) => (
                <div key={a.address} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"13px 18px", borderBottom:"1px solid rgba(128,128,128,0.06)" }}>
                  <div style={{ width:"32px", fontSize:"13px", flexShrink:0, textAlign:"center" }}>
                    {a.rank<=3 ? ["🥇","🥈","🥉"][a.rank-1] : <span style={{ fontSize:"11px", fontFamily:mono, color:"#323e62" }}>#{a.rank}</span>}
                  </div>
                  <AddressRow address={a.address} onClick={() => window.location.href="/address/"+a.address} />
                  <div style={{ display:"flex", alignItems:"center", gap:"10px", flexShrink:0 }}>
                    <div style={{ height:"4px", width:Math.max(8,(a.txCount/maxTx)*120)+"px", background:"rgba(0,184,122,0.35)", borderRadius:"2px" }}/>
                    <div style={{ fontSize:"13px", fontFamily:mono, fontWeight:600, color:"#00d990", minWidth:"60px", textAlign:"right" }}>{a.txCount} txs</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </ArcLayout>
  )
}