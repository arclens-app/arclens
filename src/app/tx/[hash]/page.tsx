"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"

function timeAgo(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s/60) + "m ago"
  if (s < 86400) return Math.floor(s/3600) + "h ago"
  return Math.floor(s/86400) + "d ago"
}
function short(a: string) { return a ? a.slice(0,8)+"..."+a.slice(-6) : "" }

interface TxDetail {
  hash: string
  from: string
  to: string | null
  toName: string | null
  value: string
  gasUSDC: string
  gasUsed: string
  blockNumber: string
  timestamp: string
  method: string | null
  status: "success" | "failed"
  nonce: number
  type: string
  inputData: string | null
  decodedInput: { method_call: string; parameters: {name:string; type:string; value:string}[] } | null
  isUSDCTransfer: boolean
  usdcAmount: string | null
  tokenTransfers: { from:string; to:string; amount:string; symbol:string }[]
}

export default function TxPage() {
  const { hash }  = useParams<{ hash: string }>()
  const [tx, setTx]       = useState<TxDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || !hash) return
    async function load() {
      setLoading(true)
      try {
        const [txRes, transfersRes] = await Promise.all([
          fetch("/api/blockscout?path=" + encodeURIComponent("v2/transactions/" + hash)),
          fetch("/api/blockscout?path=" + encodeURIComponent("v2/transactions/" + hash + "/token-transfers")),
        ])
        const txData        = await txRes.json()
        const transfersData = await transfersRes.json()

        if (txData.message || txData.errors) {
          setError("Transaction not found on Arc Testnet")
          return
        }

        const feeWei  = Number((txData.fee as Record<string,string>)?.value || 0)
        const gasUSDC = (feeWei / 1e18).toFixed(6)

        // Token transfers
        const transfers = (transfersData.items || []).map((t: Record<string,unknown>) => {
          const total = t.total as Record<string,string>
          const tok   = t.token as Record<string,string>
          const from  = t.from as Record<string,string>
          const to    = t.to as Record<string,string>
          const decimals = Number(tok?.decimals || 6)
          const amount   = (Number(total?.value || 0) / Math.pow(10, decimals)).toFixed(2)
          return { from: from?.hash||"", to: to?.hash||"", amount, symbol: tok?.symbol||"USDC" }
        })

        // Detect USDC transfer
        const usdcTransfer = transfers.find((t: {symbol:string}) => t.symbol === "USDC")

        setTx({
          hash:          txData.hash,
          from:          (txData.from as Record<string,string>)?.hash || "",
          to:            (txData.to as Record<string,string>)?.hash || null,
          toName:        (txData.to as Record<string,string>)?.name || null,
          value:         "$" + (Number((txData.value as string)||0) / 1e18).toFixed(4),
          gasUSDC:       "$" + gasUSDC,
          gasUsed:       Number(txData.gas_used || 0).toLocaleString(),
          blockNumber:   "#" + Number(txData.block_number || 0).toLocaleString(),
          timestamp:     txData.timestamp as string || "",
          method:        txData.method as string|null,
          status:        txData.result === "success" ? "success" : "failed",
          nonce:         txData.nonce as number || 0,
          type:          (txData.transaction_types as string[])?.[0] || "contract_call",
          inputData:     txData.raw_input as string|null,
          decodedInput:  txData.decoded_input as TxDetail["decodedInput"],
          isUSDCTransfer: !!usdcTransfer,
          usdcAmount:    usdcTransfer?.amount || null,
          tokenTransfers: transfers,
        })
      } catch (e) {
        setError("Failed to load transaction: " + String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [mounted, hash])

  if (!mounted) return <div style={{ minHeight:"100vh", background:"var(--bg,#060812)" }} />

  const mono  = "'DM Mono', monospace"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const usdc  = "#00b87a"

  function Row({ label, value, link, color }: { label:string; value:string; link?:string|null; color?:string }) {
    return (
      <div style={{ display:"flex", alignItems:"flex-start", gap:"20px", padding:"11px 20px", borderBottom:"1px solid rgba(128,128,128,0.04)" }}>
        <div style={{ fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", minWidth:"130px", flexShrink:0, paddingTop:"2px" }}>{label}</div>
        {link ? (
          <a href={link} style={{ fontSize:"12.5px", fontFamily:mono, color:"#8aaeff", wordBreak:"break-all", textDecoration:"none" }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration="underline")}
            onMouseLeave={e => (e.currentTarget.style.textDecoration="none")}>
            {value}
          </a>
        ) : (
          <div style={{ fontSize:"12.5px", fontFamily:mono, color:color||t2, wordBreak:"break-all" }}>{value}</div>
        )}
      </div>
    )
  }

  return (
    <ArcLayout active="">
      <div style={{ padding:"28px 28px 48px" }}>

        {loading && (
          <div style={{ padding:"80px", textAlign:"center", fontFamily:mono, fontSize:"12px", color:t3 }}>
            Looking up transaction on Arc Testnet...
          </div>
        )}

        {error && (
          <div style={{ padding:"24px", background:"rgba(224,51,72,0.06)", border:"1px solid rgba(224,51,72,0.2)", borderRadius:"12px", fontFamily:mono, fontSize:"12px", color:"#e03348" }}>
            {error}
          </div>
        )}

        {tx && (
          <>
            {/* HEADER */}
            <div style={{ marginBottom:"24px" }}>
              <div style={{ fontSize:"10px", fontFamily:mono, color:t3, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"10px" }}>Transaction</div>
              <div style={{ fontSize:"13px", fontFamily:mono, color:"#8aaeff", wordBreak:"break-all", marginBottom:"14px", lineHeight:1.6 }}>{tx.hash}</div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
                <span style={{ fontSize:"10px", fontFamily:mono, padding:"3px 10px", borderRadius:"5px", background:tx.status==="success"?"rgba(0,184,122,0.08)":"rgba(224,51,72,0.08)", color:tx.status==="success"?"#00d990":"#e03348", border:"1px solid "+(tx.status==="success"?"rgba(0,184,122,0.2)":"rgba(224,51,72,0.2)") }}>
                  {tx.status === "success" ? "Confirmed" : "Failed"}
                </span>
                {tx.method && (
                  <span style={{ fontSize:"10px", fontFamily:mono, padding:"3px 10px", borderRadius:"5px", background:"rgba(138,174,255,0.08)", color:"#8aaeff", border:"1px solid rgba(138,174,255,0.2)" }}>
                    {tx.method}
                  </span>
                )}
                {tx.isUSDCTransfer && (
                  <span style={{ fontSize:"10px", fontFamily:mono, padding:"3px 10px", borderRadius:"5px", background:"rgba(0,184,122,0.08)", color:usdc, border:"1px solid rgba(0,184,122,0.2)" }}>
                    USDC Transfer
                  </span>
                )}
              </div>
            </div>

            {/* SUMMARY BAND */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1px", background:bdr, borderRadius:"14px", overflow:"hidden", border:"1px solid "+bdr, marginBottom:"20px" }}>
              {[
                { label:"Value",    value:tx.isUSDCTransfer && tx.usdcAmount ? "$"+tx.usdcAmount+" USDC" : tx.value+" USDC", color:usdc },
                { label:"Gas Paid", value:tx.gasUSDC+" USDC", color:usdc },
                { label:"Block",    value:tx.blockNumber, color:"#8aaeff" },
                { label:"Age",      value:tx.timestamp ? timeAgo(tx.timestamp) : "—", color:t1 },
              ].map((s: any) => (
                <div key={s.label} style={{ background:surf, padding:"16px 20px" }}>
                  <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>{s.label}</div>
                  <div style={{ fontSize:"18px", fontWeight:700, letterSpacing:"-0.03em", color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* VALUE FLOW */}
            {(tx.from || tx.to) && (
              <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", padding:"20px", marginBottom:"16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"16px" }}>
                  <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:usdc }}/>
                  <span style={{ fontSize:"12.5px", fontWeight:500 }}>Value Flow</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                  {/* FROM */}
                  <div onClick={() => window.location.href="/address/"+tx.from} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"6px", cursor:"pointer" }}>
                    <div style={{ width:"44px", height:"44px", borderRadius:"50%", background:"rgba(26,86,255,0.1)", border:"1px solid rgba(26,86,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontFamily:mono, color:"#8aaeff" }}>FROM</div>
                    <div style={{ fontSize:"9.5px", fontFamily:mono, color:"#8aaeff" }}>{short(tx.from)}</div>
                  </div>
                  {/* Arrow + amount */}
                  <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
                    <div style={{ fontSize:"12px", fontFamily:mono, fontWeight:600, color:usdc }}>{tx.isUSDCTransfer && tx.usdcAmount ? "$"+tx.usdcAmount : tx.value} USDC</div>
                    <div style={{ width:"100%", height:"1px", background:"linear-gradient(90deg, rgba(26,86,255,0.3), rgba(0,184,122,0.3))" }}/>
                    <div style={{ fontSize:"9px", fontFamily:mono, color:t3 }}>→</div>
                  </div>
                  {/* USDC contract if applicable */}
                  {tx.isUSDCTransfer && (
                    <>
                      <div onClick={() => window.location.href="/address/0x3600000000000000000000000000000000000000"} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"6px", cursor:"pointer" }}>
                        <div style={{ width:"44px", height:"44px", borderRadius:"50%", overflow:"hidden", border:"2px solid rgba(0,184,122,0.3)", flexShrink:0 }}>
                          <img src="https://assets.coingecko.com/coins/images/6319/small/usdc.png" alt="USDC" style={{ width:"100%", height:"100%" }} />
                        </div>
                        <div style={{ fontSize:"9.5px", fontFamily:mono, color:usdc }}>USDC</div>
                      </div>
                      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
                        <div style={{ fontSize:"12px", fontFamily:mono, fontWeight:600, color:usdc }}>{tx.usdcAmount ? "$"+tx.usdcAmount : ""} USDC</div>
                        <div style={{ width:"100%", height:"1px", background:"linear-gradient(90deg, rgba(0,184,122,0.3), rgba(26,86,255,0.3))" }}/>
                        <div style={{ fontSize:"9px", fontFamily:mono, color:t3 }}>→</div>
                      </div>
                    </>
                  )}
                  {/* TO */}
                  {tx.to && (
                    <div onClick={() => window.location.href="/address/"+tx.to!} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"6px", cursor:"pointer" }}>
                      <div style={{ width:"44px", height:"44px", borderRadius:"50%", background:"rgba(0,184,122,0.08)", border:"1px solid rgba(0,184,122,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontFamily:mono, color:usdc }}>TO</div>
                      <div style={{ fontSize:"9.5px", fontFamily:mono, color:usdc }}>{tx.toName || short(tx.to)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DETAILS */}
            <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", overflow:"hidden", marginBottom:"16px" }}>
              <div style={{ padding:"13px 20px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", gap:"8px" }}>
                <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#8aaeff" }}/>
                <span style={{ fontSize:"12.5px", fontWeight:500 }}>Transaction Details</span>
              </div>
              <Row label="From"       value={tx.from}        link={"/address/"+tx.from} />
              <Row label="To"         value={tx.toName ? tx.toName+" ("+short(tx.to||"")+")" : tx.to||"Contract Creation"} link={tx.to?"/address/"+tx.to:null} />
              <Row label="Value"      value={tx.value+" USDC"} color={usdc} />
              <Row label="Gas Cost"   value={tx.gasUSDC+" USDC"} color={usdc} />
              <Row label="Gas Used"   value={tx.gasUsed+" units"} />
              <Row label="Block"      value={tx.blockNumber} />
              <Row label="Timestamp"  value={tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "—"} />
              <Row label="Nonce"      value={String(tx.nonce)} />
              <Row label="Status"     value={tx.status === "success" ? "Success" : "Failed"} color={tx.status==="success"?"#00d990":"#e03348"} />
            </div>

            {/* DECODED INPUT */}
            {tx.decodedInput && (
              <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", overflow:"hidden", marginBottom:"16px" }}>
                <div style={{ padding:"13px 20px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", gap:"8px" }}>
                  <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#a080ff" }}/>
                  <span style={{ fontSize:"12.5px", fontWeight:500 }}>Decoded Input</span>
                </div>
                <div style={{ padding:"16px 20px" }}>
                  <div style={{ fontSize:"12px", fontFamily:mono, color:"#a080ff", marginBottom:"12px" }}>{tx.decodedInput.method_call}</div>
                  {tx.decodedInput.parameters.map((p, i) => (
                    <div key={i} style={{ display:"flex", gap:"16px", padding:"8px 0", borderBottom:"1px solid rgba(128,128,128,0.04)" }}>
                      <div style={{ fontSize:"10px", fontFamily:mono, minWidth:"100px" }}>{p.name} <span style={{ color:"rgba(128,128,128,0.4)" }}>({p.type})</span></div>
                      <div style={{ fontSize:"11px", fontFamily:mono, color:t2, wordBreak:"break-all" }}>{String(p.value).length > 60 ? String(p.value).slice(0,60)+"..." : String(p.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RAW INPUT */}
            {tx.inputData && tx.inputData !== "0x" && !tx.decodedInput && (
              <div style={{ background:surf, border:"1px solid "+bdr, borderRadius:"14px", overflow:"hidden" }}>
                <div style={{ padding:"13px 20px", borderBottom:"1px solid "+bdr, display:"flex", alignItems:"center", gap:"8px" }}>
                  <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:t3 }}/>
                  <span style={{ fontSize:"12.5px", fontWeight:500 }}>Input Data</span>
                </div>
                <div style={{ padding:"16px 20px" }}>
                  <div style={{ fontSize:"11px", fontFamily:mono, color:t3, wordBreak:"break-all", lineHeight:1.6 }}>
                    {tx.inputData.slice(0,300)}{tx.inputData.length > 300 ? "..." : ""}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ArcLayout>
  )
}