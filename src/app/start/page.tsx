"use client"
import { useState } from "react"
import ArcLayout from "@/components/ArcLayout"

const CHAIN = {
  chainId: "0xA1C",
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://arclenz.xyz"],
}

const LINKS = [
  { label: "Arc Discord",     href: "https://discord.gg/arcnetwork",          icon: "◈", desc: "Community hub — ask questions, meet builders" },
  { label: "Arc on X",        href: "https://x.com/arcnetwork",               icon: "𝕏", desc: "Latest news and announcements" },
  { label: "Arc Docs",        href: "https://docs.arc.network",               icon: "⌘", desc: "Technical documentation for builders" },
  { label: "Testnet Faucet",  href: "https://faucet.arc.network",             icon: "◎", desc: "Get free testnet USDC to start transacting" },
  { label: "ArcScan",         href: "https://testnet.arcscan.app",            icon: "◉", desc: "Official block explorer for Arc Testnet" },
  { label: "Arc Ecosystem",   href: "/ecosystem",                              icon: "◆", desc: "Every project building on Arc, all in one place" },
]

const USER_STEPS = [
  {
    n: "01", title: "Add Arc to your wallet",
    desc: "One click to add Arc Testnet to MetaMask or Rabby. No manual RPC setup.",
    action: "add-network", cta: "+ Add Arc Network",
  },
  {
    n: "02", title: "Get testnet USDC",
    desc: "Arc uses USDC as its native gas token. Claim free testnet USDC from the faucet to start.",
    action: "link", href: "https://faucet.arc.network", cta: "Open Faucet →",
  },
  {
    n: "03", title: "Explore what's being built",
    desc: "Browse every project on Arc — DeFi, payments, NFTs, infrastructure. Find something to try.",
    action: "link", href: "/ecosystem", cta: "Browse Ecosystem →",
  },
  {
    n: "04", title: "Make your first transaction",
    desc: "Try swapping, bridging, or interacting with a contract. Gas costs fractions of a cent — paid in USDC.",
    action: "link", href: "/overview", cta: "Open Explorer →",
  },
  {
    n: "05", title: "Check upcoming events",
    desc: "Hackathons, AMAs, launches, and community calls across the Arc ecosystem.",
    action: "link", href: "/events", cta: "See Events →",
  },
]

const BUILDER_STEPS = [
  {
    n: "01", title: "Add Arc to your wallet",
    desc: "Add Arc Testnet to MetaMask or Rabby to deploy and interact with contracts.",
    action: "add-network", cta: "+ Add Arc Network",
  },
  {
    n: "02", title: "Read the docs",
    desc: "Arc is EVM-compatible. If you know Solidity, you already know how to build on Arc.",
    action: "link", href: "https://docs.arc.network", cta: "Arc Docs →",
  },
  {
    n: "03", title: "Deploy your contract",
    desc: "Use the Contract Registry to deploy and verify your contract on Arc Testnet.",
    action: "link", href: "/registry", cta: "Contract Registry →",
  },
  {
    n: "04", title: "List your project",
    desc: "Get your project on ArcLens. Reach every builder and user in the Arc ecosystem.",
    action: "link", href: "/ecosystem", cta: "Submit Project →",
  },
  {
    n: "05", title: "Join the builder community",
    desc: "Connect with other Arc builders, get feedback, and find collaborators in the Discord.",
    action: "link", href: "https://discord.gg/arcnetwork", cta: "Join Discord →",
  },
]

export default function StartPage() {
  const [path, setPath]         = useState<"user"|"builder">("user")
  const [netAdded, setNetAdded] = useState(false)
  const [netError, setNetError] = useState("")

  async function addNetwork() {
    if (!(window as any).ethereum) {
      setNetError("No wallet detected — install MetaMask or Rabby first")
      return
    }
    try {
      await (window as any).ethereum.request({ method: "wallet_addEthereumChain", params: [CHAIN] })
      setNetAdded(true)
      setNetError("")
    } catch {
      setNetError("Request cancelled")
    }
  }

  const mono = "'DM Mono', monospace"
  const t1   = "var(--t1, #e8ecff)"
  const t2   = "var(--t2, #6b7da8)"
  const t3   = "var(--t3, #2e3a5c)"
  const bdr  = "var(--bdr, rgba(255,255,255,0.06))"
  const surf = "var(--surf, #0a0e1a)"
  const arc  = "#1a56ff"
  const usdc = "#00b87a"

  const steps = path === "user" ? USER_STEPS : BUILDER_STEPS

  return (
    <ArcLayout active="start">
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 20px 80px", fontFamily: "'Geist',system-ui,sans-serif" }}>

        {/* HEADER */}
        <div style={{ marginBottom: "48px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "14px" }}>
            Arc 101 — Start Here
          </div>
          <h1 style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 800, letterSpacing: "-0.05em", color: t1, margin: "0 0 16px", lineHeight: 1.05 }}>
            New to Arc?<br />
            <span style={{ color: arc }}>You're in the right place.</span>
          </h1>
          <p style={{ fontSize: "15px", color: t2, lineHeight: 1.75, fontWeight: 300, maxWidth: "560px", margin: 0 }}>
            Arc is a USDC-native blockchain — gas fees paid in dollars, not ETH. Sub-second finality. EVM-compatible. Built for real payments and real applications.
          </p>
        </div>

        {/* CHAIN FACTS STRIP */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1px", background: bdr, border: "1px solid " + bdr, borderRadius: "12px", overflow: "hidden", marginBottom: "48px" }}>
          {[
            { label: "Gas token",  value: "USDC",      color: usdc },
            { label: "Finality",   value: "< 1 second", color: "#8aaeff" },
            { label: "Gas cost",   value: "~$0.001",    color: usdc },
          ].map(f => (
            <div key={f.label} style={{ padding: "20px 16px", background: surf, textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.04em", color: f.color, marginBottom: "4px" }}>{f.value}</div>
              <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{f.label}</div>
            </div>
          ))}
        </div>

        {/* PATH TOGGLE */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "14px" }}>
            Who are you?
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {([
              { key: "user",    label: "I'm a User",    sub: "Explore, transact, try apps" },
              { key: "builder", label: "I'm a Builder",  sub: "Deploy contracts, list a project" },
            ] as const).map(p => (
              <button key={p.key} onClick={() => setPath(p.key)}
                style={{
                  flex: 1, padding: "16px 20px", textAlign: "left", cursor: "pointer",
                  background: path === p.key ? "rgba(26,86,255,0.1)" : surf,
                  border: "1px solid " + (path === p.key ? "rgba(26,86,255,0.4)" : bdr),
                  borderRadius: "12px", transition: "all .15s",
                }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: path === p.key ? "#8aaeff" : t1, marginBottom: "4px" }}>{p.label}</div>
                <div style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>{p.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* STEPS */}
        <div style={{ marginBottom: "64px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "20px" }}>
            {path === "user" ? "Your path into Arc" : "Launch on Arc"}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {steps.map((step, i) => (
              <div key={step.n} style={{ display: "flex", gap: "20px", paddingBottom: "28px", position: "relative" }}>
                {/* Line connector */}
                {i < steps.length - 1 && (
                  <div style={{ position: "absolute", left: "19px", top: "40px", bottom: 0, width: "1px", background: bdr }} />
                )}
                {/* Number */}
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "rgba(26,86,255,0.08)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "10px", fontFamily: mono, color: "#8aaeff", fontWeight: 700 }}>
                  {step.n}
                </div>
                {/* Content */}
                <div style={{ flex: 1, paddingTop: "8px" }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: t1, marginBottom: "6px", letterSpacing: "-0.02em" }}>{step.title}</div>
                  <div style={{ fontSize: "13px", color: t2, lineHeight: 1.7, marginBottom: "12px", fontWeight: 300 }}>{step.desc}</div>
                  {step.action === "add-network" ? (
                    <div>
                      <button onClick={addNetwork}
                        style={{ height: "36px", padding: "0 20px", background: netAdded ? "rgba(0,184,122,0.1)" : "rgba(26,86,255,0.1)", color: netAdded ? usdc : "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid " + (netAdded ? "rgba(0,184,122,0.3)" : "rgba(26,86,255,0.3)"), borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
                        {netAdded ? "✓ Arc Network Added" : step.cta}
                      </button>
                      {netError && <div style={{ fontSize: "11px", color: "#e03348", fontFamily: mono, marginTop: "6px" }}>{netError}</div>}
                    </div>
                  ) : (
                    <a href={step.href} target={step.href?.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", height: "36px", padding: "0 20px", background: "transparent", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "8px", textDecoration: "none", transition: "all .12s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)"; e.currentTarget.style.color = "#8aaeff" }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.color = t2 }}>
                      {step.cta}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COMMUNITY & LINKS */}
        <div>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "20px" }}>
            Community & Resources
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: "10px" }}>
            {LINKS.map(link => (
              <a key={link.label} href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                style={{ display: "flex", gap: "12px", padding: "14px 16px", background: surf, border: "1px solid " + bdr, borderRadius: "10px", textDecoration: "none", transition: "all .13s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.35)"; e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.transform = "none" }}>
                <div style={{ fontSize: "16px", color: "#8aaeff", flexShrink: 0, marginTop: "1px", fontFamily: mono }}>{link.icon}</div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: t1, marginBottom: "3px" }}>{link.label}</div>
                  <div style={{ fontSize: "11px", color: t3, lineHeight: 1.5 }}>{link.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* BOTTOM CTA */}
        <div style={{ marginTop: "56px", padding: "28px 32px", background: "rgba(26,86,255,0.05)", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: t1, marginBottom: "4px" }}>Ready to explore?</div>
            <div style={{ fontSize: "12px", color: t2, fontFamily: mono }}>47 projects building on Arc right now.</div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <a href="/ecosystem" style={{ height: "38px", padding: "0 22px", background: arc, color: "#fff", fontSize: "12px", fontWeight: 600, borderRadius: "8px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Explore Ecosystem →
            </a>
            <a href="/overview" style={{ height: "38px", padding: "0 22px", background: "transparent", color: t2, fontSize: "12px", border: "1px solid " + bdr, borderRadius: "8px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Open Explorer
            </a>
          </div>
        </div>

      </div>
    </ArcLayout>
  )
}
