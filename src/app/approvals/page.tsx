"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

interface Approval {
  id: string
  tokenAddress: string
  symbol: string
  spender: string
  spenderName: string | null
  allowanceRaw: string
  unlimited: boolean
  risk: "high" | "medium" | "low"
  status: "active" | "revoking" | "revoked" | "failed"
  color: string
}

function encodeApproveZero(spender: string): string {
  const sig = "0x095ea7b3"
  const pad = (a: string) => "000000000000000000000000" + a.slice(2).toLowerCase()
  return sig + pad(spender) + "0".repeat(64)
}

function encodeAllowance(owner: string, spender: string): string {
  const sig = "0xdd62ed3e"
  const pad = (a: string) => "000000000000000000000000" + a.slice(2).toLowerCase()
  return sig + pad(owner) + pad(spender)
}

async function rpcCall(method: string, params: unknown[] = []) {
  const res = await fetch("https://rpc.testnet.arc.network", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  })
  const data = await res.json()
  return data.result
}

export default function ApprovalsPage() {
  const [mounted, setMounted]       = useState(false)
  const [address, setAddress]       = useState("")
  const [scanned, setScanned]       = useState(false)
  const [loading, setLoading]       = useState(false)
  const [approvals, setApprovals]   = useState<Approval[]>([])
  const [walletAddr, setWalletAddr] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const saved = localStorage.getItem("arclens-wallet")
    if (saved) {
      setWalletAddr(saved)
      setAddress(saved)
    }
  }, [mounted])

  async function connectWallet() {
    if (!(window as any).ethereum) { alert("MetaMask not detected."); return }
    const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" })
    if (accounts[0]) { setWalletAddr(accounts[0]); setAddress(accounts[0]) }
  }

  async function scan() {
    const addr = address.trim()
    if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      alert("Enter a valid wallet address")
      return
    }
    setLoading(true)
    setScanned(false)
    setApprovals([])

    try {
      const res = await fetch(
        "/api/blockscout?path=v2/addresses/" + addr + "/token-transfers?type=ERC-20&limit=100"
      )
      const data = await res.json()
      const items = data.items || []

      const spenderSet = new Set<string>()

      for (const item of items) {
        const from = (item.from?.hash as string || "").toLowerCase()
        const to   = (item.to?.hash as string || "").toLowerCase()
        const isContract = item.to?.is_contract as boolean

        if (from === addr.toLowerCase() && isContract && to) {
          spenderSet.add(to)
        }
      }

      const tokenMap = new Map<string, { symbol: string; color: string }>()
      tokenMap.set("0x3600000000000000000000000000000000000000", { symbol: "USDC", color: "#00d990" })

      for (const item of items) {
        const tokenAddr = (item.token?.address_hash || item.token?.address) as string
        const symbol    = (item.token?.symbol as string) || "???"
        if (tokenAddr && !tokenMap.has(tokenAddr.toLowerCase())) {
          tokenMap.set(tokenAddr.toLowerCase(), { symbol, color: "#1a56ff" })
        }
      }

      const found: Approval[] = []

      for (const [tokenAddr, tokenInfo] of tokenMap.entries()) {
        for (const spender of spenderSet) {
          try {
            const result = await rpcCall("eth_call", [{
              to:   tokenAddr,
              data: encodeAllowance(addr, spender),
            }, "latest"])

            const allowance = BigInt(result || "0x0")
            // Use BigInt(0) instead of 0n to avoid ES2020 target issues
            if (allowance === BigInt(0)) continue

            const MAX = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
            // Use BigInt(2) instead of 2n
            const unlimited = allowance >= MAX / BigInt(2)
            const risk: "high" | "medium" | "low" = unlimited
              ? "high"
              : allowance > BigInt(1000) * BigInt(10) ** BigInt(6)
                ? "medium"
                : "low"

            found.push({
              id:           tokenAddr + "-" + spender,
              tokenAddress: tokenAddr,
              symbol:       tokenInfo.symbol,
              spender,
              spenderName:  null,
              allowanceRaw: allowance.toString(),
              unlimited,
              risk,
              status:       "active",
              color:        tokenInfo.color,
            })
          } catch { /* no allowance or call failed */ }
        }
      }

      setApprovals(found)
      setScanned(true)
    } catch (e) {
      console.error(e)
      setScanned(true)
    } finally {
      setLoading(false)
    }
  }

  async function revoke(approval: Approval) {
    if (!(window as any).ethereum) { alert("MetaMask not detected."); return }
    setApprovals(prev => prev.map(a => a.id === approval.id ? { ...a, status: "revoking" } : a))
    try {
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" })
      const txHash   = await (window as any).ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: accounts[0],
          to:   approval.tokenAddress,
          data: encodeApproveZero(approval.spender),
        }],
      })
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000))
        const receipt = await rpcCall("eth_getTransactionReceipt", [txHash])
        if (receipt?.status === "0x1") {
          setApprovals(prev => prev.map(a => a.id === approval.id ? { ...a, status: "revoked" } : a))
          return
        }
        if (receipt?.status === "0x0") break
      }
      setApprovals(prev => prev.map(a => a.id === approval.id ? { ...a, status: "failed" } : a))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setApprovals(prev => prev.map(a =>
        a.id === approval.id ? { ...a, status: msg.includes("rejected") ? "active" : "failed" } : a
      ))
    }
  }

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#05070f" }} />

  const mono      = "monospace"
  const border    = "rgba(128,128,128,0.1)"
  const surf      = "var(--surf, #080c1a)"
  const riskColor = { high: "#e03348", medium: "#e08810", low: "#00d990" }
  const riskBg    = { high: "rgba(224,51,72,0.08)", medium: "rgba(224,136,16,0.08)", low: "rgba(0,184,122,0.08)" }
  const riskBord  = { high: "rgba(224,51,72,0.2)", medium: "rgba(224,136,16,0.2)", low: "rgba(0,184,122,0.2)" }
  const active    = approvals.filter(a => a.status === "active")
  const highRisk  = active.filter(a => a.risk === "high").length

  return (
    <ArcLayout active="approvals">
      <div style={{ padding: "28px 28px 48px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: "#323e62", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Safety Tool</div>
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em", marginBottom: "5px" }}>Approval Manager</div>
          <div style={{ fontSize: "13px", color: "#6b7da8", fontWeight: 300 }}>Real ERC-20 allowances from Arc Testnet. Every revoke is a real on-chain transaction signed by you in MetaMask.</div>
        </div>

        <div style={{ background: "rgba(224,136,16,0.05)", border: "1px solid rgba(224,136,16,0.2)", borderRadius: "10px", padding: "14px 16px", marginBottom: "20px", display: "flex", gap: "12px" }}>
          <div style={{ fontSize: "18px", flexShrink: 0 }}>⚠️</div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#e08810", marginBottom: "4px" }}>Unlimited approvals are a real security risk</div>
            <div style={{ fontSize: "12px", color: "#6b7da8", lineHeight: 1.65, fontWeight: 300 }}>If a contract with unlimited approval is exploited, your entire token balance can be drained. Revoking sets the allowance to exactly zero on-chain. ArcLens never has access to your funds.</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" }}>
          <input
            style={{ flex: 1, minWidth: "280px", height: "44px", background: surf, border: "1px solid " + border, borderRadius: "9px", padding: "0 14px", fontSize: "13px", fontFamily: mono, color: "var(--t1, #eef2ff)", outline: "none" }}
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") scan() }}
            placeholder="0x... wallet address"
            spellCheck={false}
          />
          <button onClick={connectWallet} style={{ height: "44px", padding: "0 18px", background: "transparent", color: "#8aaeff", fontSize: "12.5px", fontWeight: 600, border: "1px solid rgba(26,86,255,0.3)", borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif", whiteSpace: "nowrap" }}>
            {walletAddr ? "✓ " + walletAddr.slice(0, 8) + "..." : "Connect Wallet"}
          </button>
          <button onClick={scan} disabled={loading} style={{ height: "44px", padding: "0 24px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "9px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Geist', sans-serif", opacity: loading ? .7 : 1, whiteSpace: "nowrap" }}>
            {loading ? "Scanning..." : "Scan Approvals"}
          </button>
        </div>

        {scanned && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1px", background: border, border: "1px solid " + border, borderRadius: "12px", overflow: "hidden", marginBottom: "20px" }}>
              {[
                { label: "Active Approvals", value: active.length.toString(), color: "#8aaeff" },
                { label: "High Risk", value: highRisk.toString(), color: highRisk > 0 ? "#e03348" : "#00d990" },
                { label: "Revoked", value: approvals.filter(a => a.status === "revoked").length.toString(), color: "#00d990" },
              ].map((s: any) => (
                <div key={s.label} style={{ background: surf, padding: "16px 20px" }}>
                  <div style={{ fontSize: "9.5px", fontFamily: mono, color: "#323e62", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>{s.label}</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em", color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: surf, border: "1px solid " + border, borderRadius: "12px", overflow: "hidden" }}>
              <div style={{ padding: "13px 18px", borderBottom: "1px solid " + border, fontSize: "12.5px", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#e08810" }} />
                  Approvals — {address.slice(0, 8)}...{address.slice(-6)}
                </div>
                {highRisk > 0 && <span style={{ fontSize: "10px", fontFamily: mono, color: "#e03348" }}>⚠ {highRisk} high risk</span>}
              </div>
              {approvals.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", fontFamily: mono, fontSize: "12px", color: "#323e62" }}>
                  ✓ No active approvals found. This wallet is clean.
                </div>
              ) : approvals.map((a: any) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: "1px solid rgba(128,128,128,0.06)", opacity: a.status === "revoked" ? .45 : 1, transition: "opacity .2s" }}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: a.color + "18", border: "1px solid " + a.color + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, fontFamily: mono, color: a.color, flexShrink: 0 }}>
                    {a.symbol[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "3px" }}>{a.symbol}</div>
                    <div style={{ fontSize: "11px", fontFamily: mono, color: "#6b7da8" }}>
                      Spender: <span style={{ color: "var(--t1, #eef2ff)" }}>{a.spender.slice(0, 10)}...{a.spender.slice(-6)}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginRight: "8px" }}>
                    <div style={{ fontSize: "13px", fontFamily: mono, fontWeight: 600, color: a.unlimited ? "#e03348" : "var(--t1, #eef2ff)", marginBottom: "4px" }}>
                      {a.unlimited ? "Unlimited" : (Number(BigInt(a.allowanceRaw)) / 1e6).toFixed(2) + " " + a.symbol}
                    </div>
                    <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 7px", borderRadius: "4px", background: riskBg[a.risk], color: riskColor[a.risk], border: "1px solid " + riskBord[a.risk] }}>
                      {a.risk === "high" ? "HIGH RISK" : a.risk === "medium" ? "MEDIUM" : "Low risk"}
                    </span>
                  </div>
                  <div style={{ flexShrink: 0, minWidth: "110px", textAlign: "right" }}>
                    {a.status === "revoked"  && <span style={{ fontSize: "11px", fontFamily: mono, color: "#00d990" }}>✓ Revoked</span>}
                    {a.status === "revoking" && <span style={{ fontSize: "11px", fontFamily: mono, color: "#e08810" }}>Confirming...</span>}
                    {a.status === "failed"   && <button onClick={() => revoke(a)} style={{ fontSize: "11px", padding: "6px 14px", borderRadius: "7px", border: "1px solid rgba(224,51,72,0.3)", background: "rgba(224,51,72,0.08)", color: "#e03348", cursor: "pointer", fontFamily: "'Geist', sans-serif" }}>Retry</button>}
                    {a.status === "active"   && (
                      <button onClick={() => revoke(a)}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(224,51,72,0.18)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(224,51,72,0.08)")}
                        style={{ fontSize: "11px", fontWeight: 600, padding: "6px 14px", borderRadius: "7px", border: "1px solid rgba(224,51,72,0.3)", background: "rgba(224,51,72,0.08)", color: "#e03348", cursor: "pointer", fontFamily: "'Geist', sans-serif", transition: "background .12s" }}>
                        {a.risk === "high" ? "Revoke Now" : "Revoke"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!scanned && !loading && (
          <div style={{ background: surf, border: "1px solid " + border, borderRadius: "12px", padding: "60px 40px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "14px" }}>🔍</div>
            <div style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "8px" }}>Scan any Arc Testnet wallet</div>
            <div style={{ fontSize: "13px", color: "#6b7da8", fontWeight: 300, maxWidth: "400px", margin: "0 auto", lineHeight: 1.7 }}>
              Connect your wallet or paste any address. We find every contract you have sent tokens to, then check live allowances on-chain. Revoke buttons trigger real MetaMask transactions.
            </div>
          </div>
        )}
      </div>
    </ArcLayout>
  )
}