"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"

function short(a: string) { return a ? a.slice(0,8)+"..."+a.slice(-6) : "" }
function shortHash(h: string) { return h ? h.slice(0,12)+"..."+h.slice(-6) : "" }
function timeAgo(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s/60) + "m ago"
  if (s < 86400) return Math.floor(s/3600) + "h ago"
  return Math.floor(s/86400) + "d ago"
}

const USDC_ADDR = "0x3600000000000000000000000000000000000000"

interface Token { symbol:string; name:string; balance:string; address:string; logo:string|null }
interface Tx { hash:string; from:string; to:string|null; toName?:string; value:string; gas:string; timestamp:string; method:string|null; success:boolean }

export default function AddressPage() {
  const { addr } = useParams<{ addr: string }>()
  const [mounted, setMounted]         = useState(false)
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState<"txs"|"tokens"|"info">("txs")
  const [copied, setCopied]           = useState(false)
  const [usdcBal, setUsdcBal]         = useState("")
  const [txCount, setTxCount]         = useState("")
  const [isContract, setIsContract]   = useState(false)
  const [contractName, setContractName] = useState("")
  const [tokens, setTokens]           = useState<Token[]>([])
  const [txs, setTxs]                 = useState<Tx[]>([])
  const [page, setPage]               = useState(1)
  const [pageCursors, setPageCursors] = useState<(string|null)[]>([null])
  const [loadingPage, setLoadingPage] = useState(false)
  const [nextPage, setNextPage]       = useState<string|null>(null)
  const totalPages = nextPage ? page + 1 : page

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || !addr) return
    load()
  }, [mounted, addr])

  async function load() {
    setLoading(true)
    try {
      const [bsRes, tokRes, txsRes, countersRes] = await Promise.all([
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + addr)),
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + addr + "/token-balances")),
        fetch("/api/blockscout?path=v2/addresses/" + addr + "/transactions"),
        fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + addr + "/counters")),
      ])

      const bsData       = await bsRes.json()
      const tokData      = await tokRes.json()
      const txData       = await txsRes.json()
      const countersData = await countersRes.json()

      // Contract check
      setIsContract(!!bsData.is_contract)
      if (bsData.name) setContractName(bsData.name)

      // USDC balance from coin_balance (native gas token on Arc)
      const coinBal = Number(bsData.coin_balance || 0) / 1e18
      setUsdcBal("$" + coinBal.toLocaleString(undefined, { maximumFractionDigits: 2 }))

      // Exact tx count from counters endpoint
      const exactCount = countersData?.transactions_count ?? countersData?.transaction_count
      if (exactCount != null) {
        setTxCount(Number(exactCount).toLocaleString())
      } else {
        const hasMore = !!txData.next_page_params
        setTxCount(hasMore ? txData.items?.length + "+" : (txData.items?.length || 0).toString())
      }

      // Tokens — skip USDC (shown separately), skip zero balances
      const tokItems = Array.isArray(tokData) ? tokData : (tokData?.items || [])
      const other: Token[] = []
      for (const t of tokItems) {
        const tok     = t.token || {}
        const tokAddr = (tok.address_hash || tok.address || "").toLowerCase()
        if (tokAddr === USDC_ADDR) continue
        const decimals = Number(tok.decimals || 18)
        const raw      = Number(t.value || 0)
        if (raw === 0) continue
        const bal     = raw / Math.pow(10, decimals)
        const balStr  = bal >= 1000
          ? bal.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : bal.toFixed(2)
        other.push({ symbol: tok.symbol||"???", name: tok.name||"Unknown", balance: balStr, address: tok.address_hash||tok.address||"", logo: tok.icon_url||null })
      }
      setTokens(other)

      // Transactions
      const items = txData.items || []
      const hasMore = !!txData.next_page_params
      // Only set tx count from items if counters didn't provide it
      if (!countersData?.transactions_count && !countersData?.transaction_count) {
        setTxCount(hasMore ? items.length + "+" : items.length.toString())
      }
      setTxs(items.map((t: Record<string,unknown>) => {
        const feeObj = t.fee as Record<string,string>
        const feeWei = Number(feeObj?.value || 0)
        // On Arc, gas is paid in USDC. fee.value is in wei (18 decimals) but represents USDC micro-units
        // actual USDC cost = fee_wei / 1e18 (it's already in USDC wei)
        const gasUSDC = (feeWei / 1e18).toFixed(6)
        return {
          hash:      t.hash as string,
          from:      (t.from as Record<string,string>)?.hash || "",
          to:        (t.to as Record<string,string>)?.hash || null,
          value:     "$" + (Number((t.value as string)||0) / 1e18).toFixed(4),
          gas:       "$" + gasUSDC,
          timestamp: t.timestamp as string || "",
          method:    t.method as string|null,
          success:   (t.result as string) === "success" || (t.status as string) === "ok",
        }
      }))

      // Look up contract names for to-addresses
      try {
        const toAddrs = [...new Set(items.map((t: Record<string,unknown>) => (t.to as Record<string,string>)?.hash).filter(Boolean))]
        if (toAddrs.length > 0) {
          const namesRes = await fetch("/api/names", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ addresses: toAddrs.map((a: unknown) => (a as string).toLowerCase()) }) })
          const namesMap = await namesRes.json()
          if (Object.keys(namesMap).length > 0) {
            setTxs(prev => prev.map(t => ({ ...t, toName: t.to ? namesMap[t.to.toLowerCase()]?.name : undefined })))
          }
        }
      } catch { /* non-critical */ }

      if (txData.next_page_params) {
        const p = txData.next_page_params
        const cursor = `v2/addresses/${addr}/transactions?block_number=${p.block_number}&index=${p.index}`
        setNextPage(cursor)
        setPageCursors([null, cursor]) // page 1 = null cursor, page 2 = this cursor
      } else {
        setNextPage(null)
      }
      setPage(1)
    } catch (e) { console.error("[Address]", e) }
    finally { setLoading(false) }
  }

  async function goToPage(p: number) {
    if (p === page || loadingPage) return
    setLoadingPage(true)
    try {
      const cursor = pageCursors[p - 1] // cursor for requested page (0-indexed)
      const path   = cursor
        ? "/api/blockscout?path=" + cursor
        : "/api/blockscout?path=v2/addresses/" + addr + "/transactions"
      const res    = await fetch(path)
      const data   = await res.json()
      const items  = (data.items || []).map((t: Record<string,unknown>) => {
        const feeObj = t.fee as Record<string,string>
        const feeWei = Number(feeObj?.value || 0)
        return {
          hash:      t.hash as string,
          from:      (t.from as Record<string,string>)?.hash || "",
          to:        (t.to as Record<string,string>)?.hash || null,
          value:     "$" + (Number((t.value as string)||0) / 1e18).toFixed(4),
          gas:       "$" + (feeWei / 1e18).toFixed(6),
          timestamp: t.timestamp as string || "",
          method:    t.method as string|null,
          success:   (t.result as string) === "success" || (t.status as string) === "ok",
        }
      })
      setTxs(items)
      setPage(p)

      // Store next cursor if we don't have it yet
      if (data.next_page_params && !pageCursors[p]) {
        const np = data.next_page_params
        const newCursor = `v2/addresses/${addr}/transactions?block_number=${np.block_number}&index=${np.index}`
        setPageCursors(prev => {
          const updated = [...prev]
          updated[p] = newCursor
          return updated
        })
        setNextPage(newCursor)
      } else if (!data.next_page_params) {
        setNextPage(null)
      }
      // Scroll to top of tx list
      window.scrollTo({ top: 300, behavior: "smooth" })
    } catch (e) { console.error(e) }
    finally { setLoadingPage(false) }
  }

  function copy() { navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  if (!mounted) return <div style={{ minHeight:"100vh", background:"var(--bg,#060812)" }} />

  const mono = "'DM Mono', monospace"
  const bdr  = "var(--bdr, rgba(255,255,255,0.06))"
  const surf = "var(--surf, #0a0e1a)"
  const surf2= "var(--surf2, #0e1224)"
  const t1   = "var(--t1, #e8ecff)"
  const t2   = "var(--t2, #6b7da8)"
  const t3   = "var(--t3, #2e3a5c)"
  const usdc = "#00b87a"
  const arc  = "#1a56ff"

  return (
    <ArcLayout active="">
      <div style={{ padding:"28px 28px 48px" }}>

        {/* HEADER */}
        <div style={{ marginBottom:"24px" }}>
          <div style={{ fontSize:"10px", fontFamily:mono, color:t3, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"10px" }}>
            {isContract ? "Smart Contract" : "Wallet Address"} · Arc Testnet
          </div>

          {contractName && <div style={{ fontSize:"22px", fontWeight:700, letterSpacing:"-0.04em", color:t1, marginBottom:"10px" }}>{contractName}</div>}

          {/* Address pill */}
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", background:surf, border:"1px solid "+bdr, borderRadius:"9px", padding:"8px 14px" }}>
              <span style={{ fontSize:"13px", fontFamily:mono, color:t2 }}>{addr}</span>
              <button onClick={copy} style={{ fontSize:"9.5px", fontFamily:mono, padding:"2px 8px", borderRadius:"4px", border:"1px solid "+bdr, background:"transparent", color:copied?"#00b87a":t3, cursor:"pointer", transition:"color .12s" }}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Stats band */}
          <div style={{ display:"flex", gap:"1px", background:bdr, borderRadius:"14px", overflow:"hidden", border:"1px solid "+bdr, width:"fit-content" }}>
            {/* USDC Balance */}
            <div style={{ background:surf, padding:"16px 24px", minWidth:"170px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"8px" }}>
                <img src="https://assets.coingecko.com/coins/images/6319/small/usdc.png" alt="USDC" style={{ width:"13px", height:"13px", borderRadius:"50%" }} />
                <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em" }}>USDC Balance</div>
              </div>
              <div style={{ fontSize:"24px", fontWeight:700, letterSpacing:"-0.04em", color:usdc }}>{loading?"...":usdcBal}</div>
              <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3, marginTop:"4px" }}>Native gas token · Arc</div>
            </div>
            <div style={{ width:"1px", background:bdr }}/>
            {/* Transactions */}
            <div style={{ background:surf, padding:"16px 24px", minWidth:"140px" }}>
              <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>Transactions</div>
              <div style={{ fontSize:"24px", fontWeight:700, letterSpacing:"-0.04em", color:"#8aaeff" }}>{loading?"...":txCount||"—"}</div>
              <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3, marginTop:"4px" }}>on Arc Testnet</div>
            </div>
            <div style={{ width:"1px", background:bdr }}/>
            {/* Type */}
            <div style={{ background:surf, padding:"16px 24px", minWidth:"130px" }}>
              <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>Account Type</div>
              <div style={{ display:"flex", alignItems:"center", gap:"7px", marginBottom:"4px" }}>
                <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:isContract?arc:usdc }}/>
                <div style={{ fontSize:"20px", fontWeight:700, letterSpacing:"-0.03em", color:isContract?"#8aaeff":usdc }}>{loading?"...":isContract?"Contract":"Wallet"}</div>
              </div>
              <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3 }}>{isContract?"Smart contract":"User wallet"}</div>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"18px" }}>
          {[
            { id:"txs"    as const, label:"Transactions",   count:txs.length },
            { id:"tokens" as const, label:"Token Holdings", count:tokens.length },
            { id:"info"   as const, label:"Info" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ height:"34px", padding:"0 16px", background:tab===t.id?"#1a56ff":"transparent", color:tab===t.id?"#fff":t2, fontSize:"12px", fontWeight:tab===t.id?600:400, border:"1px solid "+(tab===t.id?"#1a56ff":bdr), borderRadius:"7px", cursor:"pointer", fontFamily:"'Geist',sans-serif", transition:"all .12s" }}>
              {t.label}
              {"count" in t && t.count > 0 && <span style={{ marginLeft:"6px", fontSize:"10px", opacity:.7 }}>({t.count})</span>}
            </button>
          ))}
        </div>

        {/* TRANSACTIONS */}
        {tab === "txs" && (
          <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", overflow:"hidden" }}>
            <div style={{ padding:"13px 18px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:usdc }}/>
                <span style={{ fontSize:"12.5px", fontWeight:500 }}>Transaction History</span>
              </div>
              {txCount && <span style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{txCount} total</span>}
            </div>
            {loading ? (
              <div style={{ padding:"48px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>Loading transactions...</div>
            ) : txs.length === 0 ? (
              <div style={{ padding:"48px", textAlign:"center" }}>
                <div style={{ fontSize:"13px", fontWeight:500, marginBottom:"6px", color:t1 }}>No transactions yet</div>
                <div style={{ fontSize:"11px", fontFamily:mono, color:t3 }}>This address has no recorded transactions on Arc Testnet</div>
              </div>
            ) : txs.map((tx, i) => (
              <div key={tx.hash+i}
                onClick={() => window.location.href="/tx/"+tx.hash}
                onMouseEnter={e => (e.currentTarget.style.background=surf2)}
                onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                style={{ display:"flex", alignItems:"center", gap:"12px", padding:"11px 18px", borderBottom:"1px solid rgba(128,128,128,0.04)", cursor:"pointer", transition:"background .1s" }}>
                <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:tx.success?"#00b87a":"#e03348", flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:"11px", fontFamily:mono, color:"#8aaeff", marginBottom:"3px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{shortHash(tx.hash)}</div>
                  <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>
                    {short(tx.from)} → {tx.toName ? <span style={{ color:"#00d990" }}>{tx.toName}</span> : tx.to?short(tx.to):"contract creation"}
                    {tx.method && <span style={{ marginLeft:"8px", padding:"1px 6px", borderRadius:"3px", background:"rgba(138,174,255,0.08)", color:"#8aaeff", fontSize:"9px" }}>{tx.method}</span>}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:"12px", fontFamily:mono, fontWeight:500, color:t1, marginBottom:"2px" }}>{tx.value}</div>
                  <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3 }}>{tx.timestamp?timeAgo(tx.timestamp):""}</div>
                </div>
              </div>
            ))}
            {/* PAGINATION */}
            {(page > 1 || nextPage) && (
              <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", borderTop:"1px solid "+bdr }}>
                {/* Prev */}
                <button onClick={() => goToPage(page-1)} disabled={page===1||loadingPage}
                  style={{ width:"32px", height:"32px", display:"flex", alignItems:"center", justifyContent:"center", background:"transparent", border:"1px solid "+bdr, borderRadius:"7px", cursor:page===1?"not-allowed":"pointer", color:page===1?t3:t2, fontSize:"13px", opacity:page===1?.4:1 }}>
                  ←
                </button>

                {/* Page numbers */}
                {Array.from({ length: totalPages }, (_, i) => i+1).map(n => (
                  <button key={n} onClick={() => goToPage(n)} disabled={loadingPage}
                    style={{ width:"32px", height:"32px", display:"flex", alignItems:"center", justifyContent:"center", background:n===page?"#1a56ff":"transparent", border:"1px solid "+(n===page?"#1a56ff":bdr), borderRadius:"7px", cursor:"pointer", color:n===page?"#fff":t2, fontSize:"12px", fontFamily:mono, fontWeight:n===page?600:400, transition:"all .12s" }}>
                    {loadingPage && n===page ? "..." : n}
                  </button>
                ))}

                {/* Next */}
                <button onClick={() => goToPage(page+1)} disabled={!nextPage||loadingPage}
                  style={{ width:"32px", height:"32px", display:"flex", alignItems:"center", justifyContent:"center", background:"transparent", border:"1px solid "+bdr, borderRadius:"7px", cursor:!nextPage?"not-allowed":"pointer", color:!nextPage?t3:t2, fontSize:"13px", opacity:!nextPage?.4:1 }}>
                  →
                </button>
              </div>
            )}
          </div>
        )}

        {/* TOKENS */}
        {tab === "tokens" && (
          <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", overflow:"hidden" }}>
            <div style={{ padding:"13px 18px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:usdc }}/>
              <span style={{ fontSize:"12.5px", fontWeight:500 }}>Token Holdings</span>
            </div>
            {/* USDC always first */}
            <div style={{ display:"flex", alignItems:"center", gap:"14px", padding:"14px 18px", borderBottom:"1px solid rgba(128,128,128,0.04)" }}>
              <img src="https://assets.coingecko.com/coins/images/6319/small/usdc.png" alt="USDC" style={{ width:"38px", height:"38px", borderRadius:"50%", flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"13.5px", fontWeight:500, marginBottom:"2px", color:t1 }}>USD Coin</div>
                <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>USDC · Native gas token</div>
              </div>
              <div style={{ fontSize:"16px", fontFamily:mono, fontWeight:700, color:usdc }}>{usdcBal}</div>
            </div>
            {loading ? (
              <div style={{ padding:"24px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>Loading tokens...</div>
            ) : tokens.length === 0 ? (
              <div style={{ padding:"24px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>No other tokens held</div>
            ) : tokens.map(tok => (
              <div key={tok.address}
                onClick={() => window.location.href="/address/"+tok.address}
                onMouseEnter={e => (e.currentTarget.style.background=surf2)}
                onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                style={{ display:"flex", alignItems:"center", gap:"14px", padding:"14px 18px", borderBottom:"1px solid rgba(128,128,128,0.04)", cursor:"pointer", transition:"background .1s" }}>
                <div style={{ width:"38px", height:"38px", borderRadius:"50%", overflow:"hidden", flexShrink:0, background:"rgba(138,174,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontWeight:700, fontFamily:mono, color:"#8aaeff" }}>
                  {tok.logo ? <img src={tok.logo} alt={tok.symbol} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e => (e.currentTarget.style.display="none")} /> : tok.symbol.slice(0,2)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"13.5px", fontWeight:500, marginBottom:"2px", color:t1 }}>{tok.name}</div>
                  <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{tok.symbol} · {short(tok.address)}</div>
                </div>
                <div style={{ fontSize:"15px", fontFamily:mono, fontWeight:600, color:t1 }}>{tok.balance}</div>
              </div>
            ))}
          </div>
        )}

        {/* INFO */}
        {tab === "info" && (
          <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", overflow:"hidden" }}>
            <div style={{ padding:"13px 18px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#8aaeff" }}/>
              <span style={{ fontSize:"12.5px", fontWeight:500 }}>Address Info</span>
            </div>
            <div style={{ padding:"8px 0" }}>
              {[
                { label:"Full Address",   value:addr },
                { label:"Account Type",   value:isContract?"Smart Contract":"Wallet (user account)" },
                { label:"Network",        value:"Arc Testnet (Chain ID 2588)" },
                { label:"USDC Balance",   value:usdcBal },
                { label:"Transactions",   value:txCount||"—" },
                ...(contractName?[{ label:"Contract Name", value:contractName }]:[]),
              ].map(row => (
                <div key={row.label} style={{ display:"flex", alignItems:"flex-start", gap:"20px", padding:"10px 20px", borderBottom:"1px solid rgba(128,128,128,0.04)" }}>
                  <div style={{ fontSize:"11px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", minWidth:"140px", flexShrink:0, paddingTop:"1px" }}>{row.label}</div>
                  <div style={{ fontSize:"12.5px", fontFamily:mono, color:t2, wordBreak:"break-all" }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ArcLayout>
  )
}