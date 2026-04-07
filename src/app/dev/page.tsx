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

interface ChainStat { label: string; value: string; color: string; sub: string }

export default function DevPage() {
  const [mounted, setMounted]       = useState(false)
  const [stats, setStats]           = useState<ChainStat[]>([])
  const [copied, setCopied]         = useState("")
  const [netAdded, setNetAdded]     = useState(false)
  const [devTab, setDevTab]         = useState<"console"|"faucet">("console")
  const [rpcPing, setRpcPing]       = useState<{ms:number; block:string}|null>(null)
  const [pinging, setPinging]       = useState(false)
  const [faucetAddr, setFaucetAddr] = useState("")
  const [faucetUsdc, setFaucetUsdc] = useState(true)
  const [faucetEurc, setFaucetEurc] = useState(false)
  const [claiming, setClaiming]     = useState(false)
  const [claimResult, setClaimResult] = useState<{ok:boolean; msg:string}|null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    // Load connected wallet
    const saved = localStorage.getItem("arclens-wallet")
    if (saved) setFaucetAddr(saved)
    // Load chain stats
    async function load() {
      try {
        const [blockHex, gasHex] = await Promise.all([
          rpc("eth_blockNumber"),
          rpc("eth_gasPrice"),
        ])
        const blockNum = parseInt(blockHex, 16)
        const gasGwei  = parseInt(gasHex, 16) / 1e9
        const gasUSDC  = (gasGwei * 46000 * 1e-9).toFixed(4)
        setStats([
          { label: "Latest Block",    value: "#" + blockNum.toLocaleString(), color: "#8aaeff", sub: "live" },
          { label: "ERC-20 Gas Cost", value: "$" + gasUSDC + " USDC",         color: "#00d990", sub: "stable" },
          { label: "Chain ID",        value: "5042002",                       color: "#a080ff", sub: "arc-testnet" },
          { label: "Finality",        value: "< 1 second",                    color: "#00d990", sub: "deterministic" },
        ])
      } catch { /* ignore */ }
    }
    load()
  }, [mounted])

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(""), 1500)
  }

  async function testRPC() {
    setPinging(true)
    setRpcPing(null)
    const start = Date.now()
    try {
      const blockHex = await rpc("eth_blockNumber")
      const ms    = Date.now() - start
      const block = parseInt(blockHex, 16).toLocaleString()
      setRpcPing({ ms, block })
    } catch { setRpcPing(null) }
    finally { setPinging(false) }
  }

  async function claimFaucet() {
    if (!faucetAddr || !/^0x[0-9a-fA-F]{40}$/.test(faucetAddr)) {
      setClaimResult({ ok: false, msg: "Please enter a valid wallet address" })
      return
    }
    if (!faucetUsdc && !faucetEurc) {
      setClaimResult({ ok: false, msg: "Select at least one token to claim" })
      return
    }
    setClaiming(true)
    setClaimResult(null)
    try {
      const res = await fetch("https://faucet.circle.com/drips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address:    faucetAddr,
          blockchain: "ARC-TESTNET",
          usdc:       faucetUsdc,
          eurc:       faucetEurc,
        }),
      })
      if (res.ok) {
        setClaimResult({ ok: true, msg: `Success! ${faucetUsdc ? "20 USDC" : ""}${faucetUsdc && faucetEurc ? " + " : ""}${faucetEurc ? "20 EURC" : ""} sent to your wallet. Takes ~30 seconds to arrive.` })
      } else {
        const data = await res.json().catch(() => ({}))
        const msg  = data?.message || data?.error || "Request failed"
        if (msg.toLowerCase().includes("limit")) {
          setClaimResult({ ok: false, msg: "Rate limit reached. You can request tokens once every 2 hours per address." })
        } else {
          // Fallback to direct link
          setClaimResult({ ok: false, msg: "Direct claim failed. Opening Circle faucet in new tab..." })
          setTimeout(() => window.open("https://faucet.circle.com", "_blank"), 1000)
        }
      }
    } catch {
      // CORS block — open faucet directly
      setClaimResult({ ok: false, msg: "Opening Circle faucet in a new tab — paste your address there." })
      window.open("https://faucet.circle.com", "_blank")
    }
    finally { setClaiming(false) }
  }

  async function addNetwork() {
    if (!(window as any).ethereum) { alert("No wallet detected"); return }
    try {
      await (window as any).ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x4CE752",
          chainName: "Arc Testnet",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: ["https://rpc.testnet.arc.network"],
          blockExplorerUrls: ["https://arclenz.xyz"],
        }],
      })
      setNetAdded(true)
    } catch { /* user rejected */ }
  }

  if (!mounted) return <div style={{ minHeight:"100vh", background:"var(--bg,#060812)" }} />

  const mono   = "'DM Mono', monospace"
  const surf   = "var(--surf, #0a0e1a)"
  const surf2  = "var(--surf2, #0e1224)"
  const t1     = "var(--t1, #e8ecff)"
  const t2     = "var(--t2, #6b7da8)"
  const t3     = "var(--t3, #2e3a5c)"
  const bdr    = "var(--bdr, rgba(255,255,255,0.06))"
  const border = "1px solid var(--bdr, rgba(255,255,255,0.06))"
  const usdc   = "#00b87a"
  const arc    = "#1a56ff"

  const endpoints = [
    { name: "HTTPS RPC",   url: "https://rpc.testnet.arc.network",  status: "live", ms: "~120ms" },
    { name: "Alchemy RPC", url: "https://arc-testnet.g.alchemy.com/v2/...", status: "live", ms: "~80ms"  },
    { name: "WebSocket",   url: "wss://rpc.testnet.arc.network", status: "live", ms: "~90ms"  },
  ]

  const snippets = [
    { label: "Connect to Arc", code: `const provider = new ethers.JsonRpcProvider(\n  "https://rpc.testnet.arc.network",\n  { chainId: 5042002, name: "arc-testnet" }\n)` },
    { label: "Read USDC Balance", code: `const USDC = "0x3600000000000000000000000000000000000000"\nconst abi  = ["function balanceOf(address) view returns (uint256)"]\nconst usdc = new ethers.Contract(USDC, abi, provider)\nconst bal  = await usdc.balanceOf(address)\nconsole.log(ethers.formatUnits(bal, 6), "USDC")` },
    { label: "Send USDC", code: `const abi  = ["function transfer(address to, uint256 amount) returns (bool)"]\nconst usdc = new ethers.Contract(USDC, abi, signer)\nconst tx   = await usdc.transfer(recipient, ethers.parseUnits("1.00", 6))\nawait tx.wait() // Confirms in < 1 second` },
    { label: "Estimate Gas", code: `const feeData = await provider.getFeeData()\nconst gasGwei = Number(ethers.formatUnits(feeData.gasPrice, "gwei"))\n// Simple transfer: ~21,000 gas × gasGwei × 1e-9 USDC\n// ERC-20 transfer: ~46,000 gas\n// Contract call: ~85,000 gas` },
  ]

  return (
    <ArcLayout active="dev">
      <div style={{ padding:"28px 28px 48px" }}>

        {/* HEADER */}
        <div style={{ marginBottom:"20px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:"12px" }}>
          <div>
            <div style={{ fontSize:"10px", fontFamily:mono, color:t3, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"8px" }}>Developers</div>
            <div style={{ fontSize:"26px", fontWeight:700, letterSpacing:"-0.04em", marginBottom:"4px", color:t1 }}>Dev Console</div>
            <div style={{ fontSize:"13px", color:t2, fontWeight:300 }}>Network config, RPC endpoints, code snippets and faucet for Arc builders.</div>
          </div>
          <button onClick={testRPC} disabled={pinging}
            style={{ height:"38px", padding:"0 18px", background:rpcPing?"rgba(0,184,122,0.08)":"rgba(26,86,255,0.08)", color:rpcPing?"#00d990":"#8aaeff", fontSize:"12px", fontFamily:mono, border:"1px solid "+(rpcPing?"rgba(0,184,122,0.2)":"rgba(26,86,255,0.2)"), borderRadius:"8px", cursor:pinging?"not-allowed":"pointer", whiteSpace:"nowrap", flexShrink:0, transition:"all .12s" }}>
            {pinging ? "Pinging..." : rpcPing ? `✓ ${rpcPing.ms}ms · Block #${rpcPing.block}` : "⚡ Test RPC"}
          </button>
        </div>

        {/* TABS */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"20px" }}>
          {[{id:"console",label:"Dev Console"},{id:"faucet",label:"🚰 Faucet"}].map((t: any) => (
            <button key={t.id} onClick={() => setDevTab(t.id as "console"|"faucet")}
              style={{ height:"34px", padding:"0 18px", background:devTab===t.id?"#1a56ff":"transparent", color:devTab===t.id?"#fff":t2, fontSize:"12px", fontWeight:devTab===t.id?600:400, border:"1px solid "+(devTab===t.id?"#1a56ff":bdr), borderRadius:"7px", cursor:"pointer", fontFamily:"'Geist',sans-serif", transition:"all .12s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── FAUCET TAB ── */}
        {devTab === "faucet" && (
          <div>
            {/* Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1px", background:bdr, borderRadius:"14px", overflow:"hidden", border:"1px solid "+bdr, marginBottom:"20px" }}>
              {[
                { label:"Available",   value:"20 USDC", sub:"per request", color:usdc },
                { label:"Also",        value:"20 EURC", sub:"per request", color:"#4070ff" },
                { label:"Wait Time",   value:"2 hours", sub:"between claims", color:t2 },
                { label:"Network",     value:"Arc Testnet", sub:"Chain ID 5042002", color:"#8aaeff" },
              ].map((s: any) => (
                <div key={s.label} style={{ background:surf, padding:"16px 20px" }}>
                  <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>{s.label}</div>
                  <div style={{ fontSize:"18px", fontWeight:700, letterSpacing:"-0.03em", color:s.color, marginBottom:"3px" }}>{s.value}</div>
                  <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Claim form */}
            <div style={{ background:surf, border:"1px solid rgba(26,86,255,0.15)", borderRadius:"14px", padding:"24px", maxWidth:"560px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"18px" }}>
                <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:usdc }}/>
                <div style={{ fontSize:"13px", fontWeight:600, color:t1 }}>Request Testnet Tokens</div>
              </div>

              {/* Address */}
              <div style={{ marginBottom:"14px" }}>
                <div style={{ fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"6px" }}>Wallet Address</div>
                <div style={{ display:"flex", gap:"8px" }}>
                  <input
                    value={faucetAddr}
                    onChange={e => setFaucetAddr(e.target.value)}
                    placeholder="0x..."
                    style={{ flex:1, height:"40px", background:"var(--surf2,#0e1224)", border:"1px solid "+bdr, borderRadius:"8px", padding:"0 12px", fontSize:"12px", fontFamily:mono, color:t1, outline:"none" }}
                  />
                  <button onClick={() => { const w = localStorage.getItem("arclens-wallet"); if(w) setFaucetAddr(w) }}
                    style={{ height:"40px", padding:"0 12px", background:"transparent", color:"#8aaeff", fontSize:"11px", fontFamily:mono, border:"1px solid rgba(26,86,255,0.2)", borderRadius:"8px", cursor:"pointer", whiteSpace:"nowrap" }}>
                    My Wallet
                  </button>
                </div>
              </div>

              {/* Token selection */}
              <div style={{ marginBottom:"18px" }}>
                <div style={{ fontSize:"10px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>Select Tokens</div>
                <div style={{ display:"flex", gap:"10px" }}>
                  {[
                    { id:"usdc", label:"USDC", val:faucetUsdc, set:setFaucetUsdc, color:usdc },
                    { id:"eurc", label:"EURC", val:faucetEurc, set:setFaucetEurc, color:"#4070ff" },
                  ].map((tok: any) => (
                    <button key={tok.id} onClick={() => tok.set(!tok.val)}
                      style={{ height:"40px", padding:"0 20px", background:tok.val?"rgba(0,184,122,0.08)":"transparent", color:tok.val?tok.color:t2, fontSize:"13px", fontFamily:mono, fontWeight:tok.val?600:400, border:"1px solid "+(tok.val?"rgba(0,184,122,0.25)":bdr), borderRadius:"8px", cursor:"pointer", transition:"all .12s" }}>
                      {tok.val ? "✓ " : ""}{tok.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Claim button */}
              <button onClick={claimFaucet} disabled={claiming}
                style={{ width:"100%", height:"44px", background:arc, color:"#fff", fontSize:"14px", fontWeight:600, border:"none", borderRadius:"10px", cursor:claiming?"not-allowed":"pointer", fontFamily:"'Geist',sans-serif", opacity:claiming?.7:1, transition:"opacity .12s", marginBottom:"12px" }}>
                {claiming ? "Requesting..." : "Request Tokens — Free"}
              </button>

              {/* Result */}
              {claimResult && (
                <div style={{ padding:"12px 14px", borderRadius:"8px", background:claimResult.ok?"rgba(0,184,122,0.06)":"rgba(224,51,72,0.06)", border:"1px solid "+(claimResult.ok?"rgba(0,184,122,0.2)":"rgba(224,51,72,0.2)"), fontSize:"12px", fontFamily:mono, color:claimResult.ok?usdc:"#e03348", lineHeight:1.6 }}>
                  {claimResult.msg}
                </div>
              )}

              <div style={{ marginTop:"12px", fontSize:"10.5px", fontFamily:mono, color:t3, lineHeight:1.7 }}>
                Powered by <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" style={{ color:"#8aaeff", textDecoration:"none" }}>Circle Faucet</a> · 20 USDC per request · 2 hour cooldown per address
              </div>
            </div>
          </div>
        )}

        {/* ── DEV CONSOLE TAB ── */}
        {devTab === "console" && (
          <>
            {/* STATS */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1px", background:bdr, borderRadius:"14px", overflow:"hidden", border:"1px solid "+bdr, marginBottom:"20px" }}>
              {stats.map((s: any) => (
                <div key={s.label} style={{ background:surf, padding:"16px 20px" }}>
                  <div style={{ fontSize:"9px", fontFamily:mono, color:t3, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"8px" }}>{s.label}</div>
                  <div style={{ fontSize:"18px", fontWeight:700, letterSpacing:"-0.03em", color:s.color, marginBottom:"3px" }}>{s.value}</div>
                  <div style={{ fontSize:"9.5px", fontFamily:mono, color:t3 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* ADD NETWORK */}
            <div style={{ background:surf, border:"1px solid rgba(26,86,255,0.2)", borderRadius:"12px", overflow:"hidden", marginBottom:"16px", position:"relative" }}>
              <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px", background:"linear-gradient(90deg, #1a56ff, #4070ff 40%, transparent)" }} />
              <div style={{ padding:"20px 22px", display:"flex", alignItems:"center", gap:"16px" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"14px", fontWeight:600, letterSpacing:"-0.02em", marginBottom:"4px", color:t1 }}>Add Arc Testnet to MetaMask</div>
                  <div style={{ fontSize:"12px", color:t2, fontWeight:300 }}>One click to add Arc Testnet (Chain ID 5042002) with USDC as native gas token.</div>
                </div>
                <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                  <button onClick={() => copy("https://rpc.testnet.arc.network", "rpc")}
                    style={{ height:"38px", padding:"0 16px", background:"transparent", color:copied==="rpc"?"#00d990":t2, fontSize:"12px", border:"1px solid "+bdr, borderRadius:"8px", cursor:"pointer", fontFamily:"'Geist',sans-serif", whiteSpace:"nowrap" }}>
                    {copied==="rpc"?"✓ Copied":"Copy RPC"}
                  </button>
                  <button onClick={addNetwork}
                    style={{ height:"38px", padding:"0 20px", background:netAdded?"rgba(0,184,122,0.1)":arc, color:netAdded?"#00d990":"#fff", fontSize:"13px", fontWeight:600, border:"none", borderRadius:"8px", cursor:"pointer", fontFamily:"'Geist',sans-serif", whiteSpace:"nowrap" }}>
                    {netAdded?"✓ Added":"+ Add Network"}
                  </button>
                </div>
              </div>
            </div>

            {/* NETWORK CONFIG */}
            <div style={{ background:surf, border:border, borderRadius:"12px", overflow:"hidden", marginBottom:"16px" }}>
              <div style={{ padding:"13px 18px", borderBottom:border, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#8aaeff" }}/>
                  <span style={{ fontSize:"12.5px", fontWeight:500 }}>Network Config</span>
                </div>
                <button onClick={() => copy(JSON.stringify({chainId:"0x4CE752",chainName:"Arc Testnet",nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},rpcUrls:["https://rpc.testnet.arc.network"],blockExplorerUrls:["https://arclenz.xyz"]},null,2), "config")}
                  style={{ fontSize:"10px", fontFamily:mono, padding:"3px 10px", borderRadius:"5px", border:"1px solid "+bdr, background:"transparent", color:copied==="config"?"#00d990":t2, cursor:"pointer" }}>
                  {copied==="config"?"✓ Copied":"Copy JSON"}
                </button>
              </div>
              {[
                { label:"Network Name",     value:"Arc Testnet" },
                { label:"Chain ID",         value:"5042002 (0x4CE752)" },
                { label:"RPC URL",          value:"https://rpc.testnet.arc.network" },
                { label:"Native Currency",  value:"USDC (18 decimals)" },
                { label:"USDC Contract",    value:"0x3600000000000000000000000000000000000000" },
                { label:"Block Explorer",   value:"https://arclenz.xyz" },
              ].map((row: any) => (
                <div key={row.label} style={{ display:"flex", alignItems:"center", gap:"16px", padding:"10px 18px", borderBottom:"1px solid rgba(128,128,128,0.04)" }}>
                  <div style={{ fontSize:"10px", fontFamily:mono, color:t3, minWidth:"140px", textTransform:"uppercase", letterSpacing:"0.06em" }}>{row.label}</div>
                  <div style={{ flex:1, fontSize:"12px", fontFamily:mono, color:t2 }}>{row.value}</div>
                  <button onClick={() => copy(row.value, row.label)}
                    style={{ fontSize:"9px", fontFamily:mono, padding:"2px 8px", borderRadius:"4px", border:"1px solid "+bdr, background:"transparent", color:copied===row.label?"#00d990":t3, cursor:"pointer", flexShrink:0 }}>
                    {copied===row.label?"✓":"Copy"}
                  </button>
                </div>
              ))}
            </div>

            {/* RPC ENDPOINTS */}
            <div style={{ background:surf, border:border, borderRadius:"12px", overflow:"hidden", marginBottom:"16px" }}>
              <div style={{ padding:"13px 18px", borderBottom:border, display:"flex", alignItems:"center", gap:"8px" }}>
                <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:usdc }}/>
                <span style={{ fontSize:"12.5px", fontWeight:500 }}>RPC Endpoints</span>
              </div>
              {endpoints.map((ep: any) => (
                <div key={ep.name} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"12px 18px", borderBottom:"1px solid rgba(128,128,128,0.04)" }}>
                  <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:usdc, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"12px", fontWeight:500, color:t1, marginBottom:"2px" }}>{ep.name}</div>
                    <div style={{ fontSize:"10.5px", fontFamily:mono, color:t3 }}>{ep.url}</div>
                  </div>
                  <div style={{ fontSize:"10px", fontFamily:mono, color:t3, marginRight:"8px" }}>{ep.ms}</div>
                  <button onClick={() => copy(ep.url, ep.name)}
                    style={{ fontSize:"9.5px", fontFamily:mono, padding:"3px 10px", borderRadius:"5px", border:"1px solid "+bdr, background:"transparent", color:copied===ep.name?"#00d990":t2, cursor:"pointer", flexShrink:0 }}>
                    {copied===ep.name?"✓":"Copy"}
                  </button>
                </div>
              ))}
            </div>

            {/* GAS REFERENCE */}
            <div style={{ background:surf, border:border, borderRadius:"12px", overflow:"hidden", marginBottom:"16px" }}>
              <div style={{ padding:"13px 18px", borderBottom:border, display:"flex", alignItems:"center", gap:"8px" }}>
                <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#a080ff" }}/>
                <span style={{ fontSize:"12.5px", fontWeight:500 }}>Gas Reference</span>
                <span style={{ fontSize:"10px", fontFamily:mono, color:t3, marginLeft:"auto" }}>Base fee: 160 Gwei</span>
              </div>
              {[
                { op:"ETH Transfer",     gas:"21,000",  cost:"$0.009" },
                { op:"ERC-20 Transfer",  gas:"46,000",  cost:"$0.011" },
                { op:"Contract Call",    gas:"85,000",  cost:"$0.020" },
                { op:"Contract Deploy",  gas:"200,000", cost:"$0.048" },
              ].map((row: any) => (
                <div key={row.op} style={{ display:"flex", alignItems:"center", gap:"16px", padding:"10px 18px", borderBottom:"1px solid rgba(128,128,128,0.04)" }}>
                  <div style={{ flex:1, fontSize:"12px", color:t1 }}>{row.op}</div>
                  <div style={{ fontSize:"11px", fontFamily:mono, color:t2, minWidth:"80px", textAlign:"right" }}>{row.gas} gas</div>
                  <div style={{ fontSize:"13px", fontFamily:mono, fontWeight:600, color:usdc, minWidth:"60px", textAlign:"right" }}>{row.cost}</div>
                </div>
              ))}
            </div>

            {/* CODE SNIPPETS */}
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              {snippets.map((s: any) => (
                <div key={s.label} style={{ background:surf, border:border, borderRadius:"12px", overflow:"hidden" }}>
                  <div style={{ padding:"10px 16px", borderBottom:border, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ fontSize:"11.5px", fontWeight:500, color:t1 }}>{s.label}</div>
                    <button onClick={() => copy(s.code, s.label)}
                      style={{ fontSize:"9.5px", fontFamily:mono, padding:"3px 10px", borderRadius:"5px", border:"1px solid "+bdr, background:"transparent", color:copied===s.label?"#00d990":t2, cursor:"pointer" }}>
                      {copied===s.label?"✓ Copied":"Copy"}
                    </button>
                  </div>
                  <pre style={{ margin:0, padding:"14px 16px", fontSize:"11px", fontFamily:mono, color:"#8aaeff", overflowX:"auto", lineHeight:1.7 }}>{s.code}</pre>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ArcLayout>
  )
}