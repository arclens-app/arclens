"use client"
import { useEffect, useState, useRef } from "react"

const NAV = [
  { section: "EXPLORER", items: [
    { id: "home", label: "Home", icon: "⬡", href: "/" },
    { id: "overview",     label: "Overview",          icon: "◈", href: "/overview" },
    { id: "transactions", label: "Transactions",      icon: "⇄", href: "/transactions" },
  ]},
  { section: "ANALYTICS", items: [
    { id: "wallets",      label: "Wallet Activity",   icon: "◉", href: "/wallets", tag: "NEW" },
  ]},
  { section: "TOOLS", items: [
    { id: "approvals",    label: "Approval Manager",  icon: "⚠", href: "/approvals", tag: "SAFETY" },
  ]},
  { section: "DISCOVER", items: [
    { id: "start",        label: "Arc 101 — Start Here", icon: "◈", href: "/start", tag: "NEW" },
    { id: "ecosystem",    label: "Arc Ecosystem",     icon: "◎", href: "/ecosystem" },
    { id: "events",       label: "Events",            icon: "◆", href: "/events" },
  ]},
  { section: "DEVELOPERS", items: [
    { id: "registry",     label: "Contract Registry", icon: "✦", href: "/registry" },
    { id: "dev",          label: "Dev Console",       icon: "⌘", href: "/dev" },
  ]},
]

const TAG_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  NEW:    { bg: "rgba(26,86,255,0.12)",  color: "#8aaeff", border: "rgba(26,86,255,0.2)" },
  SAFETY: { bg: "rgba(224,51,72,0.1)",   color: "#e03348", border: "rgba(224,51,72,0.2)" },
}

export default function ArcLayout({ children, active }: { children: React.ReactNode; active?: string }) {
  const [mounted, setMounted]       = useState(false)
  const [dark, setDark]             = useState(true)
  const [blockNum, setBlockNum]     = useState("")
  const [gas, setGas]               = useState("")
  const [connected, setConnected]   = useState(false)
  const [searchQ, setSearchQ]       = useState("")
  // Sidebar hidden by default on all screens — toggled by hamburger
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [walletAddr, setWalletAddr] = useState<string|null>(null)
  const [walletBal, setWalletBal]   = useState<string|null>(null)
  const [myProject, setMyProject]   = useState<{ name: string; slug: string } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
    const saved = typeof window !== "undefined" ? localStorage.getItem("arclens-theme") : null
    if (saved === "light") setDark(false)
    else setDark(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const saved = localStorage.getItem("arclens-wallet")
    if (saved) {
      setWalletAddr(saved)
      fetchWalletBal(saved)
      // Check if saved wallet owns a project
      fetch("/api/claim", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: saved }),
      }).then(r => r.json()).then(d => {
        if (d.projects?.length > 0) {
          const p = d.projects[0]
          setMyProject({ name: p.name, slug: p.slug || String(p.id) })
        }
      }).catch(() => {})
    }
  }, [mounted])

  async function fetchWalletBal(addr: string) {
    try {
      const res  = await fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + addr))
      const data = await res.json()
      const bal  = Number(data.coin_balance || 0) / 1e18
      setWalletBal("$" + bal.toLocaleString(undefined, { maximumFractionDigits: 2 }))
    } catch { setWalletBal(null) }
  }

  async function connectWallet() {
    if (!(window as any).ethereum) { alert("No wallet detected. Install MetaMask or Rabby."); return }
    try {
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" })
      if (accounts[0]) {
        const addr = accounts[0]
        setWalletAddr(addr)
        localStorage.setItem("arclens-wallet", addr)
        fetchWalletBal(addr)
        // Check if this wallet owns a project
        try {
          const projRes = await fetch("/api/claim", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet: addr }),
          })
          const projData = await projRes.json()
          if (projData.projects?.length > 0) {
            const p = projData.projects[0]
            setMyProject({ name: p.name, slug: p.slug || String(p.id) })
          }
        } catch { }
      }
    } catch { /* user rejected */ }
  }

  function disconnectWallet() {
    setWalletAddr(null)
    setWalletBal(null)
    localStorage.removeItem("arclens-wallet")
  }

  useEffect(() => {
    if (!mounted) return
    async function fetchStats() {
      try {
        const [blockRes, gasRes] = await Promise.all([
          fetch("https://rpc.testnet.arc.network", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }) }),
          fetch("https://rpc.testnet.arc.network", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 2 }) }),
        ])
        const blockData = await blockRes.json()
        const gasData   = await gasRes.json()
        const num  = parseInt(blockData.result, 16)
        const gwei = parseInt(gasData.result, 16) / 1e9
        setBlockNum(num.toLocaleString())
        setGas("$" + (gwei * 46000 * 1e-9).toFixed(4))
        setConnected(true)
      } catch { setConnected(false) }
    }
    fetchStats()
    const t = setInterval(fetchStats, 30000)
    return () => clearInterval(t)
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    document.documentElement.style.setProperty("--bg",    dark ? "#060812" : "#f0f2f8")
    document.documentElement.style.setProperty("--surf",  dark ? "#0a0e1a" : "#ffffff")
    document.documentElement.style.setProperty("--surf2", dark ? "#0e1224" : "#f5f7fc")
    document.documentElement.style.setProperty("--t1",    dark ? "#e8ecff" : "#0a0e1a")
    document.documentElement.style.setProperty("--t2",    dark ? "#6b7da8" : "#4a5578")
    document.documentElement.style.setProperty("--t3",    dark ? "#2e3a5c" : "#8899bb")
    document.documentElement.style.setProperty("--bdr",   dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)")
  }, [dark, mounted])

  // Close sidebar when clicking outside
  useEffect(() => {
    if (!sidebarOpen) return
    function handleClick(e: MouseEvent) {
      const sidebar = document.getElementById("arc-sidebar")
      const hamburger = document.getElementById("arc-hamburger")
      if (sidebar && !sidebar.contains(e.target as Node) && hamburger && !hamburger.contains(e.target as Node)) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [sidebarOpen])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = searchQ.trim().replace(/\s/g, "")
    if (!q) return
    setSearchQ("")
    if (/^0x[0-9a-fA-F]{40}$/i.test(q)) { window.location.href = "/address/" + q; return }
    if (/^0x[0-9a-fA-F]{64}$/i.test(q)) { window.location.href = "/tx/" + q; return }
    if (/^\d+$/.test(q)) { window.location.href = "/blocks"; return }
    window.location.href = "/search?q=" + encodeURIComponent(q)
  }

  function addNetwork() {
    if (!(window as any).ethereum) { alert("No wallet detected"); return }
    ;(window as any).ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: "0x4cef52", chainName: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: ["https://rpc.testnet.arc.network"], blockExplorerUrls: ["https://arclenz.xyz"] }]
    })
  }

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#060812" }} />

  const mono  = "'DM Mono', monospace"
  const sans  = "'Geist', system-ui, sans-serif"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const arc   = "#1a56ff"
  const usdc  = "#00b87a"

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg, #060812)", color: t1, fontFamily: sans, fontSize: "14px" }}>

      {/* OVERLAY — shown when sidebar is open */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 39, backdropFilter: "blur(2px)" }}
        />
      )}

      {/* SIDEBAR — slides in from left, hidden by default */}
      <aside
        id="arc-sidebar"
        style={{
          width: "220px",
          flexShrink: 0,
          background: surf,
          borderRight: "1px solid " + bdr,
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 40,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: sidebarOpen ? "4px 0 24px rgba(0,0,0,0.4)" : "none",
        }}
      >
        {/* LOGO + CLOSE */}
        <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid " + bdr, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }} onClick={() => setSidebarOpen(false)}>
            <svg width="30" height="30" viewBox="0 0 64 64" fill="none" style={{ flexShrink: 0 }}>
              <defs>
                <linearGradient id="archG" x1="32" y1="6" x2="32" y2="52" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ffffff"/>
                  <stop offset="35%" stopColor="#a0beff"/>
                  <stop offset="100%" stopColor="#1845cc"/>
                </linearGradient>
                <linearGradient id="bgG" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#101c3d"/>
                  <stop offset="100%" stopColor="#060c20"/>
                </linearGradient>
                <linearGradient id="scanG" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                  <stop offset="0%" stopColor="#00d990" stopOpacity="0"/>
                  <stop offset="50%" stopColor="#00d990"/>
                  <stop offset="100%" stopColor="#00d990" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="15" fill="url(#bgG)"/>
              <path d="M10 54 C10 54 10 24 32 9 C54 24 54 54 54 54" stroke="url(#archG)" strokeWidth="6" strokeLinecap="round" fill="none"/>
              <path d="M20 54 C20 54 20 32 32 21 C44 32 44 54 44 54" stroke="url(#archG)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.35"/>
              <line x1="16" y1="38" x2="48" y2="38" stroke="url(#scanG)" strokeWidth="1.5"/>
              <circle cx="32" cy="38" r="2.5" fill="#00d990" opacity="0.9"/>
            </svg>
            <div>
              <span style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.03em", color: t1 }}>Arc</span>
              <span style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.03em", color: arc }}>Lens</span>
            </div>
          </a>
          {/* Close X button */}
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: "none", border: "none", color: t2, cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "2px 6px", borderRadius: "4px" }}
          >
            ×
          </button>
        </div>

        {/* NETWORK BADGE */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid " + bdr }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 8px", background: connected ? "rgba(0,184,122,0.06)" : "rgba(26,86,255,0.06)", borderRadius: "6px", border: "1px solid " + (connected ? "rgba(0,184,122,0.15)" : "rgba(26,86,255,0.12)") }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: connected ? usdc : t3, animation: connected ? "pulse 2s infinite" : "none", flexShrink: 0 }} />
            <span style={{ fontSize: "10px", fontFamily: mono, color: connected ? usdc : t3, letterSpacing: "0.04em" }}>Arc Testnet · 2588</span>
          </div>
        </div>

        {/* NAV */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {NAV.map((group: any) => (
            <div key={group.section} style={{ marginBottom: "4px" }}>
              <div style={{ padding: "10px 16px 4px", fontSize: "9px", fontFamily: mono, color: t3, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                {group.section}
              </div>
              {group.items.map((item: any) => {
                const isActive = active === item.id
                return (
                  <a key={item.id} href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: "9px", padding: "8px 16px", margin: "1px 6px", borderRadius: "7px", textDecoration: "none", background: isActive ? "rgba(26,86,255,0.1)" : "transparent", color: isActive ? "#8aaeff" : t2, fontSize: "13px", fontWeight: isActive ? 500 : 400, transition: "all .12s", borderLeft: isActive ? "2px solid " + arc : "2px solid transparent" }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = t1 } }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t2 } }}
                  >
                    <span style={{ fontSize: "12px", opacity: .7, fontFamily: mono, flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.tag && (
                      <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 5px", borderRadius: "3px", ...TAG_STYLE[item.tag] }}>
                        {item.tag}
                      </span>
                    )}
                  </a>
                )
              })}
            </div>
          ))}
          {/* MY PROJECT — dynamic, only when wallet owns a project */}
          {myProject && (
            <div style={{ marginBottom: "4px" }}>
              <div style={{ padding: "10px 16px 4px", fontSize: "9px", fontFamily: mono, color: t3, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                MY DASHBOARD
              </div>
              <a href={`/dashboard/${myProject.slug}`}
                onClick={() => setSidebarOpen(false)}
                style={{ display: "flex", alignItems: "center", gap: "9px", padding: "8px 16px", margin: "1px 6px", borderRadius: "7px", textDecoration: "none", background: "rgba(0,184,122,0.08)", color: "#00b87a", fontSize: "13px", fontWeight: 500, borderLeft: "2px solid #00b87a" }}>
                <span style={{ fontSize: "12px", opacity: .7, fontFamily: mono, flexShrink: 0 }}>◆</span>
                <span style={{ flex: 1 }}>{myProject.name}</span>
              </a>
            </div>
          )}
        </nav>

        {/* WALLET */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid " + bdr }}>
          {walletAddr ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: usdc, flexShrink: 0 }}/>
                <div style={{ fontSize: "9.5px", fontFamily: mono, color: usdc }}>Connected</div>
              </div>
              <div onClick={() => { window.location.href = "/address/" + walletAddr; setSidebarOpen(false) }}
                style={{ fontSize: "10.5px", fontFamily: mono, color: "#8aaeff", marginBottom: "4px", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {walletAddr.slice(0,8)}...{walletAddr.slice(-6)}
              </div>
              {walletBal && <div style={{ fontSize: "13px", fontWeight: 700, color: usdc, letterSpacing: "-0.02em", marginBottom: "6px" }}>{walletBal} USDC</div>}
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => { window.location.href = "/address/" + walletAddr; setSidebarOpen(false) }}
                  style={{ flex: 1, height: "26px", background: "rgba(0,184,122,0.08)", color: usdc, fontSize: "10px", fontFamily: mono, border: "1px solid rgba(0,184,122,0.2)", borderRadius: "5px", cursor: "pointer" }}>
                  My Wallet
                </button>
                <button onClick={disconnectWallet}
                  style={{ height: "26px", padding: "0 8px", background: "transparent", color: t3, fontSize: "10px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "5px", cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <button onClick={connectWallet}
              style={{ width: "100%", height: "34px", background: "rgba(26,86,255,0.08)", color: "#8aaeff", fontSize: "11px", fontFamily: mono, border: "1px solid rgba(26,86,255,0.2)", borderRadius: "8px", cursor: "pointer" }}>
              Connect Wallet
            </button>
          )}
        </div>

        {/* FOOTER */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid " + bdr }}>
          <div style={{ fontSize: "9px", fontFamily: mono, color: t3, lineHeight: 1.8 }}>
            <div>Chain ID <span style={{ color: t2 }}>2588</span></div>
            <div>Gas token <span style={{ color: usdc }}>USDC</span></div>
            <div>Base fee <span style={{ color: t2 }}>160 Gwei ≈ $0.01</span></div>
            <div>Finality <span style={{ color: "#8aaeff" }}>{"< 1 second"}</span></div>
          </div>
        </div>
      </aside>

      {/* MAIN — always full width since sidebar is overlaid */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", width: "100%", maxWidth: "100vw", overflow: "hidden" }}>

        {/* TOPBAR */}
        <header style={{ height: "52px", background: surf, borderBottom: "1px solid " + bdr, display: "flex", alignItems: "center", padding: "0 16px", gap: "10px", position: "sticky", top: 0, zIndex: 30, backdropFilter: "blur(8px)" }}>

          {/* HAMBURGER — always visible */}
          <button
            id="arc-hamburger"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: "none", border: "1px solid " + bdr, color: t2, cursor: "pointer", padding: "5px 8px", fontSize: "16px", lineHeight: 1, flexShrink: 0, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .12s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)"; e.currentTarget.style.color = t1 }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.color = t2 }}
          >
            {sidebarOpen ? "×" : "☰"}
          </button>

          {/* LOGO in topbar */}
          <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <span style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.03em", color: t1 }}>Arc</span>
            <span style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.03em", color: arc }}>Lens</span>
          </a>

          {/* LIVE DOT */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: connected ? usdc : t3, animation: connected ? "pulse 2s infinite" : "none" }} />
            <span style={{ fontSize: "10px", fontFamily: mono, color: connected ? usdc : t3 }}>Live</span>
          </div>

          {/* SEARCH */}
          <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: "560px" }}>
            <div style={{ position: "relative" }}>
              <input
                ref={searchRef}
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search addresses, tx, blocks…"
                style={{ width: "100%", height: "34px", background: "var(--surf2, #0e1224)", border: "1px solid " + bdr, borderRadius: "8px", padding: "0 12px 0 34px", fontSize: "12px", fontFamily: mono, color: t1, outline: "none", transition: "border-color .12s" }}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)")}
                onBlur={e => (e.currentTarget.style.borderColor = bdr)}
              />
              <svg style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", opacity: .35 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t1} strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
          </form>

          <div style={{ flex: 1 }} />

          {/* BLOCK + GAS — hide on very small screens */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <div className="hide-sm" style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>
              Block <span style={{ color: "#8aaeff", fontWeight: 500 }}>#{blockNum || "..."}</span>
            </div>
            <div className="hide-sm" style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>
              Gas <span style={{ color: usdc, fontWeight: 500 }}>{gas || "..."}</span>
            </div>
          </div>

          {/* ADD NETWORK */}
          <button onClick={addNetwork}
            className="hide-sm"
            style={{ height: "30px", padding: "0 12px", background: "transparent", color: t2, fontSize: "11px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "6px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all .12s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)"; e.currentTarget.style.color = "#8aaeff" }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.color = t2 }}>
            + Add Arc
          </button>

          {/* THEME */}
          <button onClick={() => { const next = !dark; setDark(next); localStorage.setItem("arclens-theme", next ? "dark" : "light") }}
            style={{ width: "30px", height: "30px", background: "transparent", border: "1px solid " + bdr, borderRadius: "6px", cursor: "pointer", color: t2, fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {dark ? "☀" : "☾"}
          </button>
        </header>

        {/* PAGE CONTENT — always full width */}
        <main style={{ flex: 1, width: "100%" }}>
          {children}
        </main>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:.35} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        a { color: inherit; }
        @media (max-width: 640px) {
          .hide-sm { display: none !important; }
        }
      `}</style>
    </div>
  )
}
