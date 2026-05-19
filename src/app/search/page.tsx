"use client"
import { useEffect, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import ArcLayout from "@/components/ArcLayout"

function timeAgo(ts: number) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s / 60) + "m ago"
  return Math.floor(s / 3600) + "h ago"
}
function short(a: string) { return a ? a.slice(0,8)+"..."+a.slice(-6) : "" }
function shortHash(h: string) { return h ? h.slice(0,12)+"..."+h.slice(-6) : "" }

interface AIResult { type:string; intent:string; target:string|null; filter:string|null; explanation:string; suggestions:string[] }
interface Row { hash:string; from:string; to:string|null; valueUSDC:string; timestamp:number; label?:string }
interface AddrPreview { address:string; usdcBal:string; txCount:string; isContract:boolean; name:string }

function getEndpoint(filter: string): string {
  if (filter.includes("bridge"))          return "v2/addresses/0xDD396e9d6f1FC2D29A18dab097737dbF295E4dC1/token-transfers?type=ERC-20"
  if (filter.includes("top_holders"))     return "v2/tokens/0x3600000000000000000000000000000000000000/holders"
  if (filter.includes("whale"))           return "v2/tokens/0x3600000000000000000000000000000000000000/holders"
  if (filter.includes("contract_deploy")) return "v2/smart-contracts"
  return "v2/tokens/0x3600000000000000000000000000000000000000/transfers"
}

function parseItems(items: Record<string, unknown>[], filter: string): Row[] {
  const rows: Row[] = []
  for (const item of items) {
    if (rows.length >= 25) break
    if (filter.includes("top_holders") || filter.includes("whale")) {
      const addr  = (item.address as Record<string,string>)?.hash || item.address as string || ""
      const value = Number((item.value as string) || 0) / 1e6
      if (!addr) continue
      rows.push({ hash: addr, from: addr, to: null, valueUSDC: "$" + value.toFixed(2) + " USDC", timestamp: 0, label: "holder" })
      continue
    }
    if (filter.includes("contract_deploy")) {
      const addrFull = item.address as Record<string,unknown>
      const addr     = (addrFull?.hash as string) || ""
      const name     = (addrFull?.name as string) || "Unknown Contract"
      if (!addr) continue
      rows.push({ hash: addr, from: addr, to: null, valueUSDC: name, timestamp: 0, label: "contract" })
      continue
    }
    const total    = item.total as Record<string,string> || {}
    const valueRaw = Number(total.value || 0)
    const valueUSDC = valueRaw / 1e6
    const fromObj  = item.from as Record<string,string>
    const toObj    = item.to as Record<string,string>
    const fromHash = fromObj?.hash || ""
    const toHash   = toObj?.hash || null
    const ts       = item.timestamp ? Math.floor(new Date(item.timestamp as string).getTime() / 1000) : 0
    const txHash   = item.transaction_hash as string || ""
    if (!txHash) continue
    rows.push({ hash: txHash, from: fromHash, to: toHash, valueUSDC: "$" + valueUSDC.toFixed(2), timestamp: ts })
  }
  return rows
}

function SearchContent() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") || ""
  const [query, setQuery]               = useState(initialQuery)
  const [loading, setLoading]           = useState(false)
  const [aiResult, setAiResult]         = useState<AIResult|null>(null)
  const [rows, setRows]                 = useState<Row[]>([])
  const [loadingRows, setLoadingRows]   = useState(false)
  const [addrPreview, setAddrPreview]   = useState<AddrPreview|null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(() => { if (initialQuery) runSearch(initialQuery) }, [])

  // Live address preview as user types
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    const q = query.trim()

    // Valid address — fetch preview after 400ms debounce
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
      setAddrPreview(null)
      previewTimer.current = setTimeout(() => fetchAddrPreview(q), 400)
    } else {
      setAddrPreview(null)
    }
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current) }
  }, [query])

  async function fetchAddrPreview(addr: string) {
    setLoadingPreview(true)
    try {
      const [bsRes, tokRes] = await Promise.all([
        fetch("/api/blockscout?path=v2/addresses/" + addr),
        fetch("/api/blockscout?path=v2/addresses/" + addr + "/token-balances"),
      ])
      const bsData  = await bsRes.json()
      const tokData = await tokRes.json()

      let usdcBal = "$0.00"
      for (const t of (tokData || [])) {
        if (t.token?.address?.toLowerCase() === "0x3600000000000000000000000000000000000000") {
          const bal = Number(t.value || 0) / 1e6
          usdcBal = "$" + bal.toLocaleString(undefined, { maximumFractionDigits: 2 })
          break
        }
      }

      setAddrPreview({
        address:    addr,
        usdcBal,
        txCount:    bsData.transaction_count !== undefined ? Number(bsData.transaction_count).toLocaleString() : "—",
        isContract: bsData.is_contract || false,
        name:       bsData.name || "",
      })
    } catch { setAddrPreview(null) }
    finally { setLoadingPreview(false) }
  }

  async function runSearch(q: string) {
    if (!q.trim()) return
    // Direct route for addresses and hashes
    if (/^0x[0-9a-fA-F]{40}$/.test(q.trim())) { window.location.href = "/address/" + q.trim(); return }
    if (/^0x[0-9a-fA-F]{64}$/.test(q.trim())) { window.location.href = "/tx/" + q.trim(); return }
    if (/^\d+$/.test(q.trim())) { window.location.href = "/blocks"; return }

    setLoading(true); setAiResult(null); setRows([])
    try {
      const res  = await fetch("/api/search", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({query:q}) })
      const data = await res.json() as AIResult
      setAiResult(data)
      fetchRows(data)
    } catch { setAiResult({type:"error",intent:q,target:null,filter:null,explanation:"Search failed.",suggestions:[]}) }
    finally { setLoading(false) }
  }

  async function fetchRows(result: AIResult) {
    setLoadingRows(true)
    const filter = (result.filter||"").toLowerCase()
    try {
      const path = getEndpoint(filter)
      const res  = await fetch("/api/blockscout?path=" + encodeURIComponent(path))
      const data = await res.json()
      setRows(parseItems(data.items || [], filter))
    } catch (e) { console.error(e) }
    finally { setLoadingRows(false) }
  }

  function go() {
    const q = query.trim()
    if (!q) return
    window.history.pushState({}, "", "/search?q="+encodeURIComponent(q))
    runSearch(q)
  }

  // Use CSS variables throughout — respects light/dark mode
  const mono   = "'DM Mono', monospace"
  const bdr    = "var(--bdr, rgba(255,255,255,0.06))"
  const surf   = "var(--surf, #0a0e1a)"
  const surf2  = "var(--surf2, #0e1224)"
  const t1     = "var(--t1, #e8ecff)"
  const t2     = "var(--t2, #6b7da8)"
  const t3     = "var(--t3, #2e3a5c)"
  const usdc   = "#00b87a"
  const arc    = "#1a56ff"

  return (
    <ArcLayout active="">
      <div style={{ padding:"28px 28px 48px" }}>

        {/* SEARCH BAR */}
        <div style={{ marginBottom:"24px" }}>
          <div style={{ fontSize:"10px", fontFamily:mono, color:t3, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"14px" }}>
            Arc Testnet Search
          </div>
          <div style={{ display:"flex", gap:"10px" }}>
            <input ref={inputRef}
              style={{ flex:1, height:"48px", background:surf, border:"1px solid rgba(26,86,255,0.3)", borderRadius:"10px", padding:"0 16px", fontSize:"14px", fontFamily:mono, color:t1, outline:"none", transition:"border-color .12s" }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") go() }}
              onFocus={e => (e.currentTarget.style.borderColor="rgba(26,86,255,0.6)")}
              onBlur={e => (e.currentTarget.style.borderColor="rgba(26,86,255,0.3)")}
              placeholder="Search addresses, USDC transfers, bridge activity, contracts…"
              autoFocus spellCheck={false}
            />
            <button onClick={go} disabled={loading}
              style={{ height:"48px", padding:"0 28px", background:arc, color:"#fff", fontSize:"14px", fontWeight:600, border:"none", borderRadius:"10px", cursor:loading?"not-allowed":"pointer", fontFamily:"'Geist',sans-serif", opacity:loading?.7:1, transition:"opacity .12s" }}>
              {loading?"Thinking...":"Search"}
            </button>
          </div>

          {/* ADDRESS PREVIEW — shows instantly as user types */}
          {(loadingPreview || addrPreview) && (
            <div style={{ marginTop:"10px", background:surf, border:"1px solid rgba(26,86,255,0.2)", borderRadius:"10px", overflow:"hidden" }}>
              {loadingPreview ? (
                <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:"10px" }}>
                  <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:t3, animation:"shimmer 1.5s infinite" }}/>
                  <span style={{ fontSize:"11px", fontFamily:mono, color:t3 }}>Looking up address on Arc Testnet...</span>
                </div>
              ) : addrPreview && (
                <div onClick={() => window.location.href="/address/"+addrPreview.address}
                  onMouseEnter={e => (e.currentTarget.style.background=surf2)}
                  onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                  style={{ padding:"14px 18px", cursor:"pointer", transition:"background .1s" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px", minWidth:0 }}>
                      {/* Avatar */}
                      <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:addrPreview.isContract?"rgba(26,86,255,0.1)":"rgba(0,184,122,0.08)", border:"1px solid "+(addrPreview.isContract?"rgba(26,86,255,0.2)":"rgba(0,184,122,0.15)"), display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontFamily:mono, color:addrPreview.isContract?"#8aaeff":usdc, flexShrink:0 }}>
                        {addrPreview.isContract ? "⬡" : "◎"}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"7px", marginBottom:"3px" }}>
                          {addrPreview.name && <span style={{ fontSize:"13px", fontWeight:500, color:t1 }}>{addrPreview.name}</span>}
                          <span style={{ fontSize:"10px", fontFamily:mono, padding:"2px 7px", borderRadius:"4px", background:addrPreview.isContract?"rgba(26,86,255,0.08)":"rgba(0,184,122,0.06)", color:addrPreview.isContract?"#8aaeff":usdc, border:"1px solid "+(addrPreview.isContract?"rgba(26,86,255,0.18)":"rgba(0,184,122,0.15)") }}>
                            {addrPreview.isContract ? "Contract" : "Wallet"}
                          </span>
                        </div>
                        <div style={{ fontSize:"10.5px", fontFamily:mono, color:t3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {addrPreview.address}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:"16px", flexShrink:0 }}>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:"9px", fontFamily:mono, color:t3, marginBottom:"2px", textTransform:"uppercase", letterSpacing:"0.06em" }}>USDC</div>
                        <div style={{ fontSize:"13px", fontFamily:mono, fontWeight:600, color:usdc }}>{addrPreview.usdcBal}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:"9px", fontFamily:mono, color:t3, marginBottom:"2px", textTransform:"uppercase", letterSpacing:"0.06em" }}>Txns</div>
                        <div style={{ fontSize:"13px", fontFamily:mono, fontWeight:600, color:"#8aaeff" }}>{addrPreview.txCount}</div>
                      </div>
                      <div style={{ fontSize:"12px", color:t3 }}>→</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUGGESTION CHIPS */}
          {!aiResult && !loading && !addrPreview && (
            <div style={{ display:"flex", gap:"8px", marginTop:"12px", flexWrap:"wrap" }}>
              {["top USDC wallets","bridge activity","large USDC transfers","new contract deploys","whale wallets"].map((s: any) => (
                <button key={s} onClick={() => { setQuery(s); runSearch(s) }}
                  style={{ fontSize:"11px", fontFamily:mono, padding:"4px 12px", borderRadius:"99px", border:"1px solid "+bdr, background:"transparent", color:t2, cursor:"pointer", transition:"all .12s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="rgba(26,86,255,0.3)"; e.currentTarget.style.color="#8aaeff" }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=bdr; e.currentTarget.style.color=t2 }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* QUERY RESULT */}
        {aiResult && (
          <div style={{ background:"rgba(26,86,255,0.05)", border:"1px solid rgba(26,86,255,0.15)", borderRadius:"12px", padding:"16px 20px", marginBottom:"20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"10px" }}>
              <div style={{ fontSize:"9px", fontFamily:mono, color:"#8aaeff", textTransform:"uppercase", letterSpacing:"0.1em" }}>Result</div>
              <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:usdc }}/>
              <div style={{ fontSize:"9px", fontFamily:mono, color:usdc }}>Live</div>
            </div>
            <div style={{ fontSize:"13.5px", color:t1, lineHeight:1.75, fontWeight:300, marginBottom:aiResult.suggestions?.length?"14px":"0" }}>
              {aiResult.explanation}
            </div>
            {aiResult.suggestions?.length > 0 && (
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", alignItems:"center" }}>
                <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3 }}>Try:</div>
                {aiResult.suggestions.map((s: any) => (
                  <button key={s} onClick={() => { setQuery(s); runSearch(s) }}
                    style={{ fontSize:"10.5px", fontFamily:mono, padding:"3px 12px", borderRadius:"99px", border:"1px solid rgba(124,92,252,0.2)", background:"rgba(124,92,252,0.06)", color:"#a080ff", cursor:"pointer" }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RESULTS */}
        {(rows.length > 0 || loadingRows) && (
          <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"12px", overflow:"hidden" }}>
            <div style={{ padding:"13px 18px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:usdc }}/>
              <div style={{ fontSize:"12.5px", fontWeight:500 }}>
                {loadingRows ? "Fetching from Arc Testnet..." : rows.length+" results"}
              </div>
            </div>
            {loadingRows ? (
              <div style={{ padding:"40px", textAlign:"center", fontFamily:mono, fontSize:"11px", color:t3 }}>Loading...</div>
            ) : rows.map((row, i) => (
              <div key={row.hash+i}
                onClick={() => {
                  if (row.label==="holder"||row.label==="contract") window.location.href="/address/"+row.from
                  else window.location.href="/tx/"+row.hash
                }}
                onMouseEnter={e => (e.currentTarget.style.background=surf2)}
                onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                style={{ display:"flex", alignItems:"center", gap:"12px", padding:"13px 18px", borderBottom:"1px solid rgba(128,128,128,0.06)", cursor:"pointer", transition:"background .1s" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  {row.label==="holder" ? (
                    <>
                      <div style={{ fontSize:"11px", fontFamily:mono, color:"#8aaeff", marginBottom:"3px" }}>{short(row.from)}</div>
                      <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>USDC Holder · Arc Testnet</div>
                    </>
                  ) : row.label==="contract" ? (
                    <>
                      <div style={{ fontSize:"12px", fontWeight:500, marginBottom:"3px", color:t1 }}>{row.valueUSDC}</div>
                      <div style={{ fontSize:"10px", fontFamily:mono, color:"#8aaeff" }}>{short(row.from)}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:"11px", fontFamily:mono, color:"#8aaeff", marginBottom:"3px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{shortHash(row.hash)}</div>
                      <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{short(row.from)} → {row.to?short(row.to):"contract"}</div>
                    </>
                  )}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  {row.label==="holder" ? (
                    <div style={{ fontSize:"13px", fontFamily:mono, fontWeight:600, color:usdc }}>{row.valueUSDC}</div>
                  ) : row.label==="contract" ? (
                    <div style={{ fontSize:"10px", fontFamily:mono, color:usdc, padding:"2px 8px", borderRadius:"4px", background:"rgba(0,184,122,0.08)", border:"1px solid rgba(0,184,122,0.2)" }}>Verified</div>
                  ) : (
                    <>
                      <div style={{ fontSize:"13px", fontFamily:mono, fontWeight:600, color:usdc, marginBottom:"2px" }}>{row.valueUSDC}</div>
                      <div style={{ fontSize:"10px", fontFamily:mono, color:t3 }}>{timeAgo(row.timestamp)}</div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <style>{`@keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
      </div>
    </ArcLayout>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"var(--bg, #060812)" }}/>}>
      <SearchContent/>
    </Suspense>
  )
}