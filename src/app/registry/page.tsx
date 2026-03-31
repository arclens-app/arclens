"use client"
import { useEffect, useState } from "react"
import ArcLayout from "@/components/ArcLayout"

const PROTECTED_NAMES = ["usdc","circle","arc bridge","arclens","uniswap","aave","compound","metamask","official","verified"]

function Badge({ badge }: { badge: string }) {
  const config: Record<string, { label: string; color: string; bg: string; border: string }> = {
    official: { label: "🔵 Official",   color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.25)" },
    verified: { label: "✓✓ Verified",  color: "#00d990", bg: "rgba(0,184,122,0.08)",   border: "rgba(0,184,122,0.2)" },
    claimed:  { label: "✓ Claimed",    color: "#8aaeff", bg: "rgba(26,86,255,0.08)",   border: "rgba(26,86,255,0.2)" },
  }
  const c = config[badge] || config.claimed
  return <span style={{ fontSize: "9px", fontFamily: "monospace", padding: "2px 8px", borderRadius: "4px", background: c.bg, color: c.color, border: "1px solid " + c.border }}>{c.label}</span>
}

export default function RegistryPage() {
  const [mounted, setMounted]   = useState(false)
  const [tab, setTab]           = useState<"claim"|"browse">("claim")
  const [contracts, setContracts] = useState<Record<string,unknown>[]>([])
  const [loadingBrowse, setLoadingBrowse] = useState(false)

  // Form state
  const [addr, setAddr]         = useState("")
  const [name, setName]         = useState("")
  const [type, setType]         = useState("")
  const [desc, setDesc]         = useState("")
  const [website, setWebsite]   = useState("")
  const [twitter, setTwitter]   = useState("")
  const [email, setEmail]       = useState("")
  const [source, setSource]     = useState("")

  // Signing state
  const [walletAddr, setWalletAddr]     = useState("")
  const [deployer, setDeployer]         = useState("")
  const [deployerChecked, setDeployerChecked] = useState(false)
  const [checkingDeployer, setCheckingDeployer] = useState(false)
  const [signing, setSigning]           = useState(false)
  const [signed, setSigned]             = useState(false)
  const [signature, setSignature]       = useState("")
  const [submitting, setSubmitting]     = useState(false)
  const [status, setStatus]             = useState<"idle"|"done"|"error">("idle")
  const [statusMsg, setStatusMsg]       = useState("")
  const [warnings, setWarnings]         = useState<string[]>([])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || tab !== "browse") return
    async function load() {
      setLoadingBrowse(true)
      try {
        const res  = await fetch("/api/verify?list=true")
        const data = await res.json()
        setContracts(data.contracts || [])
      } catch { setContracts([]) }
      finally { setLoadingBrowse(false) }
    }
    load()
  }, [mounted, tab])

  async function connectWallet() {
    if (!(window as any).ethereum) { alert("MetaMask or Rabby wallet not detected."); return }
    const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" })
    if (accounts[0]) setWalletAddr(accounts[0])
  }

  async function checkDeployer() {
    if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr.trim())) {
      alert("Enter a valid contract address first"); return
    }
    setCheckingDeployer(true)
    setDeployerChecked(false)
    setSigned(false)
    setWarnings([])
    try {
      // Check contract exists
      const codeRes  = await fetch("/api/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getCode", params: [addr.trim(), "latest"], id: 1 }) })
      const codeData = await codeRes.json()
      if (!codeData.result || codeData.result === "0x") {
        alert("This address has no contract code on Arc Testnet. Are you on the right network?"); return
      }

      // Get deployer from Blockscout
      const bsRes  = await fetch("/api/blockscout?path=v2/addresses/" + addr.trim())
      const bsData = await bsRes.json()
      const foundDeployer = bsData.creator_address_hash || bsData.creation_tx_hash ? null : null

      // Try to get from smart-contracts endpoint
      const scRes  = await fetch("/api/blockscout?path=v2/smart-contracts/" + addr.trim())
      const scData = await scRes.json()

      const deployerAddr = scData.deployed_bytecode ? (bsData.creator_address_hash || "") : (bsData.creator_address_hash || "")
      setDeployer(deployerAddr)
      setDeployerChecked(true)

      // Name warnings
      const w: string[] = []
      const lowerName = name.toLowerCase()
      if (PROTECTED_NAMES.some(p => lowerName.includes(p))) w.push("Name contains a protected word — extra review required")
      if (name.toLowerCase().includes("official")) w.push("Claiming to be 'official' requires extra verification")
      setWarnings(w)

    } catch (e) { console.error(e); setDeployerChecked(true) }
    finally { setCheckingDeployer(false) }
  }

  async function signClaim() {
    if (!(window as any).ethereum) { alert("Connect your wallet first"); return }
    if (!walletAddr) { alert("Connect your wallet first"); return }
    setSigning(true)
    try {
      const message = [
        "ArcLens Contract Registry Claim",
        "",
        "I am claiming identity for:",
        "Contract: " + addr.trim(),
        "Name: " + name.trim(),
        "Timestamp: " + Math.floor(Date.now() / 1000),
        "",
        "This is a FREE signature. No transaction. No gas. No funds moved.",
      ].join("\n")

      const sig = await (window as any).ethereum.request({
        method: "personal_sign",
        params: [message, walletAddr],
      })
      setSignature(sig)
      setSigned(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes("rejected")) alert("Signing failed: " + msg)
    } finally { setSigning(false) }
  }

  async function submit() {
    if (!addr.trim() || !name.trim() || !email.trim()) {
      setStatus("error"); setStatusMsg("Contract address, name and email are required"); return
    }
    if (!signed) {
      setStatus("error"); setStatusMsg("Please sign the claim with your wallet first"); return
    }
    setSubmitting(true)
    try {
      const res  = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address:     addr.trim(),
          name:        name.trim(),
          type:        type.trim() || undefined,
          description: desc.trim() || undefined,
          website:     website.trim() || undefined,
          twitter:     twitter.trim() || undefined,
          email:       email.trim(),
          source_code: source.trim() || undefined,
          signature,
          signer:      walletAddr,
          deployer,
          warnings,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus("done")
        setStatusMsg(data.verified
          ? "Contract verified and identity claimed. Your name now appears everywhere on ArcLens."
          : "Identity claim submitted for review. You will be notified at " + email + " once approved.")
      } else {
        setStatus("error"); setStatusMsg(data.error || "Submission failed")
      }
    } catch { setStatus("error"); setStatusMsg("Network error — try again") }
    finally { setSubmitting(false) }
  }

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#05070f" }} />

  const mono   = "monospace"
  const border = "rgba(128,128,128,0.1)"
  const surf   = "var(--surf, #080c1a)"
  const surf2  = "var(--surf2, #0c1122)"

  const inputStyle = { width: "100%", height: "38px", background: surf2, border: "1px solid " + border, borderRadius: "7px", padding: "0 12px", fontSize: "12.5px", fontFamily: mono, color: "var(--t1, #eef2ff)", outline: "none" } as React.CSSProperties

  return (
    <ArcLayout active="registry">
      <div style={{ padding: "28px 28px 48px" }}>

        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: "#323e62", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Developers</div>
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em", marginBottom: "5px" }}>Contract Registry</div>
          <div style={{ fontSize: "13px", color: "#6b7da8", fontWeight: 300 }}>Claim your contract's identity on Arc. Your name appears everywhere on ArcLens — transaction feeds, address pages, search results, and the approval manager.</div>
        </div>

        {/* HOW IT WORKS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1px", background: border, border: "1px solid " + border, borderRadius: "10px", overflow: "hidden", marginBottom: "24px" }}>
          {[
            { n: "1", label: "Connect wallet",      sub: "Prove you own the deployer address", done: !!walletAddr },
            { n: "2", label: "Verify contract",     sub: "We confirm it exists on Arc",         done: deployerChecked },
            { n: "3", label: "Sign the claim",      sub: "Free — no gas, no funds",             done: signed },
            { n: "4", label: "Submit for review",   sub: "Goes live after ArcLens approves",    done: status === "done" },
          ].map((s, i) => (
            <div key={i} style={{ background: surf, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontFamily: mono, background: s.done ? "rgba(0,184,122,0.1)" : "rgba(26,86,255,0.08)", border: "1px solid " + (s.done ? "rgba(0,184,122,0.2)" : "rgba(26,86,255,0.15)"), color: s.done ? "#00d990" : "#8aaeff" }}>
                {s.done ? "✓" : s.n}
              </div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 500, marginBottom: "2px" }}>{s.label}</div>
                <div style={{ fontSize: "10px", fontFamily: mono, color: "#3a4870" }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[{ id: "claim", label: "Claim Identity" }, { id: "browse", label: "Browse Registry" }].map((t: any) => (
            <button key={t.id} onClick={() => setTab(t.id as "claim"|"browse")} style={{ height: "34px", padding: "0 18px", background: tab === t.id ? "#1a56ff" : "transparent", color: tab === t.id ? "#fff" : "#6b7da8", fontSize: "12.5px", fontWeight: tab === t.id ? 600 : 400, border: "1px solid " + (tab === t.id ? "#1a56ff" : border), borderRadius: "7px", cursor: "pointer", fontFamily: "'Geist',sans-serif" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* CLAIM TAB */}
        {tab === "claim" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "20px", alignItems: "start" }}>
            <div style={{ background: surf, border: "1px solid " + border, borderRadius: "12px", overflow: "hidden" }}>

              {/* STEP 1 — WALLET */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid " + border }}>
                <div style={{ fontSize: "11px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Step 1 — Connect Wallet</div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button onClick={connectWallet} style={{ height: "36px", padding: "0 16px", background: walletAddr ? "rgba(0,184,122,0.08)" : "#1a56ff", color: walletAddr ? "#00d990" : "#fff", fontSize: "12px", fontWeight: 600, border: walletAddr ? "1px solid rgba(0,184,122,0.2)" : "none", borderRadius: "7px", cursor: "pointer", fontFamily: "'Geist',sans-serif" }}>
                    {walletAddr ? "✓ " + walletAddr.slice(0,8) + "..." + walletAddr.slice(-6) : "Connect Wallet"}
                  </button>
                  {walletAddr && <div style={{ fontSize: "11px", fontFamily: mono, color: "#3a4870" }}>Wallet connected — this must be the deployer address</div>}
                </div>
              </div>

              {/* STEP 2 — CONTRACT DETAILS */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid " + border }}>
                <div style={{ fontSize: "11px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Step 2 — Contract Details</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Contract Address *</label>
                    <input style={inputStyle} value={addr} onChange={e => { setAddr(e.target.value); setDeployerChecked(false); setSigned(false) }} placeholder="0x..." spellCheck={false} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Contract Name *</label>
                    <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. ArcSwap Router" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Type</label>
                    <input style={inputStyle} value={type} onChange={e => setType(e.target.value)} placeholder="ERC-20 / DEX / NFT / Bridge…" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Your Email *</label>
                    <input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Website</label>
                    <input style={inputStyle} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Twitter / X</label>
                    <input style={inputStyle} value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="@handle" />
                  </div>
                </div>
                <div style={{ marginBottom: "10px" }}>
                  <label style={{ display: "block", fontSize: "9.5px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Description</label>
                  <input style={inputStyle} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this contract do?" />
                </div>
                <button onClick={checkDeployer} disabled={checkingDeployer || !addr || !name}
                  style={{ height: "34px", padding: "0 16px", background: deployerChecked ? "rgba(0,184,122,0.08)" : "rgba(26,86,255,0.1)", color: deployerChecked ? "#00d990" : "#8aaeff", fontSize: "12px", fontWeight: 600, border: "1px solid " + (deployerChecked ? "rgba(0,184,122,0.2)" : "rgba(26,86,255,0.2)"), borderRadius: "7px", cursor: (checkingDeployer||!addr||!name) ? "not-allowed" : "pointer", fontFamily: "'Geist',sans-serif", opacity: (checkingDeployer||!addr||!name) ? .6 : 1 }}>
                  {checkingDeployer ? "Checking..." : deployerChecked ? "✓ Contract verified on Arc" : "Verify Contract Exists"}
                </button>

                {/* WARNINGS */}
                {warnings.length > 0 && (
                  <div style={{ marginTop: "10px", padding: "10px 13px", background: "rgba(224,136,16,0.07)", border: "1px solid rgba(224,136,16,0.2)", borderRadius: "7px" }}>
                    {warnings.map(w => <div key={w} style={{ fontSize: "11px", color: "#e08810", fontFamily: mono }}>⚠ {w}</div>)}
                  </div>
                )}

                {deployerChecked && deployer && (
                  <div style={{ marginTop: "8px", fontSize: "10.5px", fontFamily: mono, color: "#3a4870", lineHeight: 1.6 }}>
                    Deployer on record: <span style={{ color: "#8aaeff" }}>{deployer.slice(0,10)}...{deployer.slice(-6)}</span>
                    {walletAddr && deployer.toLowerCase() === walletAddr.toLowerCase()
                      ? <span style={{ color: "#00d990", marginLeft: "8px" }}>✓ Matches your wallet</span>
                      : walletAddr ? <span style={{ color: "#e08810", marginLeft: "8px" }}>⚠ Connect the deployer wallet</span> : null
                    }
                  </div>
                )}
              </div>

              {/* STEP 3 — SIGN */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid " + border }}>
                <div style={{ fontSize: "11px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Step 3 — Sign the Claim</div>
                <div style={{ fontSize: "11.5px", color: "#6b7da8", lineHeight: 1.65, marginBottom: "12px", fontWeight: 300 }}>
                  Sign a message proving you control this wallet. <strong style={{ color: "#eef2ff", fontWeight: 500 }}>This is completely free — no transaction, no gas, no funds moved.</strong> MetaMask will show a message signing screen, not a transaction screen.
                </div>
                <button onClick={signClaim} disabled={signing || !walletAddr || !deployerChecked}
                  style={{ height: "36px", padding: "0 18px", background: signed ? "rgba(0,184,122,0.08)" : "#1a56ff", color: signed ? "#00d990" : "#fff", fontSize: "12px", fontWeight: 600, border: signed ? "1px solid rgba(0,184,122,0.2)" : "none", borderRadius: "7px", cursor: (signing||!walletAddr||!deployerChecked) ? "not-allowed" : "pointer", fontFamily: "'Geist',sans-serif", opacity: (signing||!walletAddr||!deployerChecked) ? .6 : 1 }}>
                  {signing ? "Waiting for wallet..." : signed ? "✓ Claim signed" : "Sign Claim (Free)"}
                </button>
              </div>

              {/* STEP 4 — SOURCE CODE (OPTIONAL) */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid " + border }}>
                <div style={{ fontSize: "11px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Step 4 — Source Code (Optional)</div>
                <div style={{ fontSize: "11px", color: "#3a4870", fontFamily: mono, marginBottom: "8px" }}>Submitting source code upgrades your badge from ✓ Claimed to ✓✓ Verified. Source code is publicly readable — it shows users your contract is open and auditable.</div>
                <textarea
                  style={{ ...inputStyle, height: "100px", padding: "10px 12px", resize: "vertical", lineHeight: 1.6 } as React.CSSProperties}
                  value={source} onChange={e => setSource(e.target.value)}
                  placeholder={"// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\n// Paste flattened source code here"}
                />
              </div>

              {/* SUBMIT */}
              <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
                <button onClick={submit} disabled={submitting || !signed}
                  style={{ flex: 1, height: "40px", background: status === "done" ? "#00b87a" : "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "8px", cursor: (submitting||!signed) ? "not-allowed" : "pointer", fontFamily: "'Geist',sans-serif", opacity: (submitting||!signed) ? .7 : 1 }}>
                  {submitting ? "Submitting..." : status === "done" ? "✓ Submitted" : "Submit for Review"}
                </button>
                <div style={{ fontSize: "10px", fontFamily: mono, color: "#3a4870", lineHeight: 1.6 }}>Free · Reviewed by<br />ArcLens team</div>
              </div>

              {(status === "done" || status === "error") && (
                <div style={{ margin: "0 20px 16px", padding: "11px 13px", background: status === "done" ? "rgba(0,184,122,0.06)" : "rgba(224,51,72,0.06)", border: "1px solid " + (status === "done" ? "rgba(0,184,122,0.2)" : "rgba(224,51,72,0.2)"), borderRadius: "8px", fontSize: "12px", color: status === "done" ? "#00d990" : "#e03348", lineHeight: 1.65 }}>
                  {statusMsg}
                </div>
              )}
            </div>

            {/* PREVIEW */}
            <div style={{ background: surf, border: "1px solid " + border, borderRadius: "12px", overflow: "hidden", position: "sticky", top: "68px" }}>
              <div style={{ padding: "11px 16px", borderBottom: "1px solid " + border, fontSize: "9px", fontFamily: mono, color: "#3a4870", textTransform: "uppercase", letterSpacing: "0.1em" }}>How it appears in ArcLens</div>

              {/* IN TX FEED */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid " + border }}>
                <div style={{ fontSize: "8.5px", fontFamily: mono, color: "#3a4870", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>In transaction feeds</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, fontFamily: mono, color: "#8aaeff" }}>
                    {name ? name[0].toUpperCase() : "?"}
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 500, display: "flex", alignItems: "center", gap: "5px" }}>
                      {name || "Your Contract"}
                      <Badge badge={source ? "verified" : "claimed"} />
                    </div>
                    <div style={{ fontSize: "9.5px", fontFamily: mono, color: "#3a4870" }}>{addr ? addr.slice(0,8)+"..."+addr.slice(-4) : "0x0000...0000"}</div>
                  </div>
                </div>
              </div>

              {/* IN APPROVAL MANAGER */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid " + border }}>
                <div style={{ fontSize: "8.5px", fontFamily: mono, color: "#3a4870", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>In approval manager</div>
                <div style={{ fontSize: "11px", fontFamily: mono, color: "#6b7da8" }}>
                  Spender: <span style={{ color: "var(--t1, #eef2ff)", fontWeight: 500 }}>{name || "Your Contract"}</span>
                  <span style={{ marginLeft: "6px" }}><Badge badge={source ? "verified" : "claimed"} /></span>
                </div>
              </div>

              {/* BADGE GUIDE */}
              <div style={{ padding: "12px 16px" }}>
                <div style={{ fontSize: "8.5px", fontFamily: mono, color: "#3a4870", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Badge tiers</div>
                {[
                  { badge: "claimed",  desc: "Identity claimed — reviewed by ArcLens" },
                  { badge: "verified", desc: "Source code verified on-chain" },
                  { badge: "official", desc: "Arc core infrastructure — assigned by ArcLens" },
                ].map((b: any) => (
                  <div key={b.badge} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" }}>
                    <Badge badge={b.badge} />
                    <div style={{ fontSize: "10px", color: "#3a4870", fontFamily: mono }}>{b.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BROWSE TAB */}
        {tab === "browse" && (
          <div style={{ background: surf, border: "1px solid " + border, borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid " + border, display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00d990" }} />
              <div style={{ fontSize: "12.5px", fontWeight: 500 }}>Registered Contracts on Arc Testnet</div>
            </div>
            {loadingBrowse ? (
              <div style={{ padding: "48px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: "#3a4870" }}>Loading...</div>
            ) : contracts.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", fontFamily: mono, fontSize: "11px", color: "#3a4870" }}>No contracts registered yet. Be the first.</div>
            ) : contracts.map((c, i) => (
              <div key={i}
                onClick={() => window.location.href = "/address/" + c.address}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(128,128,128,0.04)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 18px", borderBottom: "1px solid rgba(128,128,128,0.06)", cursor: "pointer" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, fontFamily: mono, color: "#8aaeff", flexShrink: 0 }}>
                  {(c.name as string)?.[0] || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "3px", display: "flex", alignItems: "center", gap: "7px" }}>
                    {c.name as string}
                    <Badge badge={(c.badge as string) || "claimed"} />
                  </div>
                  <div style={{ fontSize: "10.5px", fontFamily: mono, color: "#6b7da8" }}>{(c.address as string).slice(0,10)}...{(c.address as string).slice(-8)}</div>
                </div>
                <div style={{ fontSize: "10px", fontFamily: mono, color: "#3a4870" }}>{c.type as string || "Contract"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ArcLayout>
  )
}