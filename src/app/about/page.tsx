"use client"
import ArcLayout from "@/components/ArcLayout"

const FEATURES = [
  {
    icon: "◎",
    title: "Arc Ecosystem Directory",
    desc: "The definitive public directory of every project building on Arc. Filter by category, discover teams, and track project activity on a live 3D globe.",
    color: "#00b87a",
  },
  {
    icon: "▲",
    title: "Protocol Metrics",
    desc: "Deployer-verified TVL, volume, and cumulative revenue for stablecoin protocols on Arc. Every number is exact (no oracle estimation), auditable down to the tx hash, and the indexer reconciles to chain hourly.",
    color: "#d4a447",
  },
  {
    icon: "✦",
    title: "Arc Trials",
    desc: "A testing campaign platform where builders post tasks and reward community testers in USDC. On-chain verification confirms real participation.",
    color: "#8aaeff",
  },
  {
    icon: "◆",
    title: "Events Hub",
    desc: "Hackathons, workshops, AMAs, and community calls across the Arc ecosystem — all in one calendar.",
    color: "#a855f7",
  },
  {
    icon: "✦",
    title: "Contract Registry",
    desc: "Verify, submit, and discover smart contracts deployed on Arc. Deployer-signed claims so identity is never spoofable.",
    color: "#e08810",
  },
  {
    icon: "◉",
    title: "Wallet Analytics",
    desc: "Top USDC holders, whale transaction monitoring, and active wallet intelligence across the Arc network.",
    color: "#ec4899",
  },
  {
    icon: "◈",
    title: "Network Explorer",
    desc: "Real-time blocks, transactions, addresses, and gas analytics. One of many surfaces — useful, not the headline.",
    color: "#1a56ff",
  },
  {
    icon: "⌘",
    title: "Dev Console",
    desc: "A browser-based RPC console for querying the Arc network directly. Built for developers who want raw access without leaving the browser.",
    color: "#6366f1",
  },
]

const STATS = [
  { value: "Chain 5042002", label: "Arc Testnet" },
  { value: "USDC", label: "Native gas token" },
  { value: "< 1s", label: "Finality" },
  { value: "$0.01", label: "Avg transfer cost" },
]

export default function AboutPage() {
  const mono = "'DM Mono', monospace"
  const arc  = "#1a56ff"
  const usdc = "#00b87a"
  const t1   = "var(--t1, #e8ecff)"
  const t2   = "var(--t2, #6b7da8)"
  const t3   = "var(--t3, #2e3a5c)"
  const bdr  = "var(--bdr, rgba(255,255,255,0.06))"

  return (
    <ArcLayout active="">
      <div style={{ fontFamily: "'Geist', system-ui, sans-serif", color: t1 }}>

        {/* Hero */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "72px 28px 64px" }}>
          <div style={{ maxWidth: "680px" }}>
            <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "20px" }}>
              About ArcLens
            </div>
            <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1.06, color: t1, margin: "0 0 24px" }}>
              The financial intelligence<br />
              layer for <span style={{ color: arc }}>Arc</span>.
            </h1>
            <p style={{ fontSize: "15px", color: t2, lineHeight: 1.8, margin: "0 0 16px", fontWeight: 300, maxWidth: "560px" }}>
              ArcLens was built to make Arc transparent, accessible, and useful — for builders shipping products, testers earning USDC, and anyone curious about what's happening on the network.
            </p>
            <p style={{ fontSize: "15px", color: t2, lineHeight: 1.8, margin: "0 0 36px", fontWeight: 300, maxWidth: "560px" }}>
              Arc is the first L1 blockchain where USDC is the native gas token — no ETH, no volatility, just dollars. ArcLens is built around that idea: every fee, every balance, every reward displayed in real dollars.
            </p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <a href="/overview" style={{ height: "42px", padding: "0 24px", background: arc, color: "#fff", fontSize: "13px", fontWeight: 600, borderRadius: "9px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                Explore the Chain
              </a>
              <a href="/ecosystem" style={{ height: "42px", padding: "0 22px", background: "transparent", color: t1, fontSize: "13px", fontWeight: 500, borderRadius: "9px", textDecoration: "none", display: "inline-flex", alignItems: "center", border: "1px solid " + bdr }}>
                Browse Ecosystem
              </a>
              <a href="mailto:support@arclenz.xyz" style={{ height: "42px", padding: "0 22px", background: "transparent", color: "#8aaeff", fontSize: "13px", fontWeight: 500, borderRadius: "9px", textDecoration: "none", display: "inline-flex", alignItems: "center", border: "1px solid rgba(26,86,255,0.25)" }}>
                Contact Us
              </a>
            </div>
          </div>
        </div>

        {/* Stats band */}
        <div style={{ borderTop: "1px solid " + bdr, borderBottom: "1px solid " + bdr }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ padding: "32px 28px", textAlign: "center", borderRight: i < 3 ? "1px solid " + bdr : "none" }}>
                <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.04em", color: i % 2 === 0 ? arc : usdc, marginBottom: "6px" }}>{s.value}</div>
                <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mission */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "80px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "80px", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "16px" }}>Our Mission</div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 800, letterSpacing: "-0.045em", color: t1, margin: "0 0 20px", lineHeight: 1.15 }}>
                Make Arc legible<br />to the world.
              </h2>
              <p style={{ fontSize: "14px", color: t2, lineHeight: 1.8, margin: "0 0 16px", fontWeight: 300 }}>
                ArcLens isn&apos;t a block explorer with an ecosystem bolted on. It&apos;s the ecosystem and intelligence layer for Arc — protocol metrics, project directory, trial campaigns, and reputation all in one place. The explorer is one of many surfaces, useful but not the headline.
              </p>
              <p style={{ fontSize: "14px", color: t2, lineHeight: 1.8, margin: 0, fontWeight: 300 }}>
                Arc's vision is a financial system built on USDC. ArcLens is the intelligence layer that makes that vision visible.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: bdr, borderRadius: "12px", overflow: "hidden", border: "1px solid " + bdr }}>
              {[
                { title: "Builder-first", desc: "Every feature is built around what builders and testers actually need." },
                { title: "USDC-native", desc: "Every metric is displayed in dollars, not Gwei, wei, or ETH." },
                { title: "Open access", desc: "No account required. No paywall. Every piece of data is free to read." },
                { title: "Community-powered", desc: "The ecosystem directory and Arc Trials are built by and for the Arc community." },
              ].map((p, i) => (
                <div key={i} style={{ padding: "24px", background: "var(--surf2, #0e1224)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: t1, marginBottom: "8px" }}>{p.title}</div>
                  <div style={{ fontSize: "11px", color: t2, lineHeight: 1.65, fontWeight: 300 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Features grid */}
        <div style={{ borderTop: "1px solid " + bdr }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "80px 28px" }}>
            <div style={{ marginBottom: "48px" }}>
              <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "12px" }}>Platform</div>
              <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, letterSpacing: "-0.045em", color: t1, margin: 0 }}>
                Everything Arc, in one place.
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1px", background: bdr, borderRadius: "12px", overflow: "hidden", border: "1px solid " + bdr }}>
              {FEATURES.map((f, i) => (
                <div key={i} style={{ padding: "28px", background: "var(--surf, #0a0e1a)", transition: "background .12s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surf2, #0e1224)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--surf, #0a0e1a)")}>
                  <div style={{ fontSize: "18px", marginBottom: "12px", color: f.color }}>{f.icon}</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: t1, marginBottom: "8px" }}>{f.title}</div>
                  <div style={{ fontSize: "12px", color: t2, lineHeight: 1.7, fontWeight: 300 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contact */}
        <div style={{ borderTop: "1px solid " + bdr }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "80px 28px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "16px" }}>Get in Touch</div>
                <h2 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.04em", color: t1, margin: "0 0 16px" }}>
                  Questions or partnerships?
                </h2>
                <p style={{ fontSize: "14px", color: t2, lineHeight: 1.8, margin: "0 0 28px", fontWeight: 300 }}>
                  Whether you're a builder wanting to list your project, a team looking to partner, or a user who needs help — reach out.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <a href="mailto:support@arclenz.xyz"
                    style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "12px 18px", borderRadius: "9px", border: "1px solid " + bdr, textDecoration: "none", color: t2, fontSize: "13px", transition: "all .12s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)"; e.currentTarget.style.color = t1 }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.color = t2 }}>
                    <span style={{ fontSize: "14px" }}>✉</span>
                    support@arclenz.xyz
                  </a>
                  <a href="https://x.com/arclens_app" target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "12px 18px", borderRadius: "9px", border: "1px solid " + bdr, textDecoration: "none", color: t2, fontSize: "13px", transition: "all .12s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)"; e.currentTarget.style.color = t1 }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.color = t2 }}>
                    <span style={{ fontSize: "14px", fontFamily: mono }}>𝕏</span>
                    @arclens_app
                  </a>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[
                  { label: "List your project", desc: "Submit your project to the Arc Ecosystem Directory.", href: "/ecosystem#submit", cta: "Submit project →" },
                  { label: "Create a campaign", desc: "Post a testing campaign on Arc Trials and reward your community in USDC.", href: "/trials/create", cta: "Create campaign →" },
                  { label: "Legal", desc: "Read our Terms of Service and Privacy Policy.", href: "/terms", cta: "View terms →" },
                ].map((card, i) => (
                  <a key={i} href={card.href} style={{ padding: "20px", borderRadius: "10px", border: "1px solid " + bdr, textDecoration: "none", display: "block", transition: "border-color .12s" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(26,86,255,0.3)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = bdr)}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: t1, marginBottom: "5px" }}>{card.label}</div>
                    <div style={{ fontSize: "11px", color: t2, marginBottom: "10px", fontWeight: 300 }}>{card.desc}</div>
                    <div style={{ fontSize: "11px", fontFamily: mono, color: "#8aaeff" }}>{card.cta}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </ArcLayout>
  )
}
