"use client"
import { useState, useEffect } from "react"
import ArcLayout from "@/components/ArcLayout"
import { NodeGuideSection, useColors } from "@/app/node-guide/page"

const CHAIN = {
  chainId: "0x4cef52", chainName: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://arclenz.xyz"],
}

const COMMUNITY = [
  { label: "Arc on X",      href: "https://x.com/arc",                  icon: "𝕏", desc: "Announcements and ecosystem news" },
  { label: "Arc Discord",   href: "https://discord.gg/buildonarc",       icon: "◈", desc: "Chat with builders, get help fast" },
  { label: "Community Hub", href: "https://community.arc.network",       icon: "◎", desc: "Forums, office hours, discussions" },
  { label: "arc.network",   href: "https://www.arc.network",             icon: "◆", desc: "Official Arc website" },
  { label: "Ecosystem",     href: "/ecosystem",                           icon: "◉", desc: "Every project building on Arc" },
]

const IDEATION_PROMPT = `I want to build a dApp on Arc network — a USDC-native EVM chain (Chain ID 5042002).
Arc is built for onchain payments and stablecoin finance. USDC is the gas token.

My rough idea: [describe your idea in plain English]

Help me define exactly what to build. Tell me:
1. Who is this for and what problem does it solve?
2. Why does this need to be on-chain? What is the trustless value?
3. What data and logic must live in the smart contract?
4. What are the 3-5 core functions my contract needs?
5. What does the frontend need to show and let users do?
6. What is the simplest version I can ship in one week?
7. Any Arc-specific advantages I should lean into (USDC payments, cheap gas, fast finality)?

After answering, write one sentence I can use to describe my dApp to someone in 15 seconds.`

const CONTRACT_PROMPT = `Write me a Solidity smart contract for Arc network.

Arc details:
- EVM-compatible, Solidity ^0.8.0
- Chain ID: 5042002
- Gas token: USDC (not ETH)
- RPC: https://rpc.testnet.arc.network

What I want to build: [paste the spec from your ideation session]

Requirements:
- Clean, well-commented code explaining each function
- require() safety checks on every function
- Emit an event for every state change
- No external dependencies unless essential
- Ready to paste into Remix IDE and compile immediately

After the contract, give me:
- A numbered list of every function, its parameters, and what it does
- Any security considerations I should know about`

const FRONTEND_PROMPT = `Build me a complete dApp frontend for Arc network.

Chain details:
- Network name: Arc Testnet
- Chain ID: 5042002 (hex: 0x4cef52)
- RPC URL: https://rpc.testnet.arc.network
- Gas token: USDC

My smart contract:
- Address: [paste your deployed contract address]
- ABI: [paste the ABI JSON from Remix]

What the app should do: [describe the features]

Requirements:
- Plain HTML + CSS + JavaScript in one file — no build tools
- Load ethers.js v6 from CDN: https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js
- Connect wallet button (works with Rabby and MetaMask) — show wallet address when connected
- Auto-prompt to switch to Arc network if user is on wrong network
- Loading spinner while transactions are pending
- Clear success and error messages after each action
- Modern dark UI, clean typography, works on mobile`

const DEBUG_PROMPT = `I am building a dApp on Arc network (Chain ID 5042002, USDC gas token, EVM-compatible).

Error I am seeing:
[paste the full error from browser console (F12) or your wallet popup]

Code causing the issue:
[paste the relevant function or component]

What I was trying to do:
[describe the action that triggered the error]

Tell me:
1. What is wrong and why
2. The fixed code
3. How to avoid this in the future`

const HELLO_ARC = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloArc {
    string public message = "Hello Arc!";
    address public owner;

    event MessageUpdated(address indexed by, string newMessage);

    constructor() {
        owner = msg.sender;
    }

    function setMessage(string memory _msg) public {
        require(msg.sender == owner, "Only owner can update");
        require(bytes(_msg).length > 0, "Message cannot be empty");
        message = _msg;
        emit MessageUpdated(msg.sender, _msg);
    }
}`

const HARDHAT_CFG = `require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.24",
  networks: {
    arc: {
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};`

const FOUNDRY_CFG = `[profile.default]
src = "src"
out = "out"
libs = ["lib"]

[rpc_endpoints]
arc = "https://rpc.testnet.arc.network"

# Deploy:
# forge script script/Deploy.s.sol --rpc-url arc --broadcast

# Verify:
# forge verify-contract <addr> src/MyContract.sol:MyContract --chain-id 5042002`

const WAGMI_CFG = `import { defineChain } from "viem"
import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "ArcLens", url: "https://arclenz.xyz" } },
  testnet: true,
})

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: { [arcTestnet.id]: http() },
})`

const ETHERS_CFG = `import { ethers } from "ethers"

// Works with Rabby, MetaMask, or any injected EVM wallet
const provider = new ethers.BrowserProvider(window.ethereum)

// Add Arc network + get signer
await provider.send("wallet_addEthereumChain", [{
  chainId: "0x4cef52",
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.arc.network"],
}])
const signer = await provider.getSigner()

// Interact with a contract
const contract = new ethers.Contract(ADDRESS, ABI, signer)
const tx = await contract.myFunction(arg1, arg2)
await tx.wait() // finality < 1s on Arc`

const DAPP_IDEAS = [
  { name: "Onchain Invoice",       tag: "Payments",  desc: "Create a payment request on-chain. Client pays USDC directly. Permanent proof of payment, no middleman." },
  { name: "USDC Salary Splitter",  tag: "Payroll",   desc: "One deposit auto-splits USDC between teammates or contributors. Set percentages once, pay forever." },
  { name: "Freelance Escrow",      tag: "Trust",     desc: "Buyer locks USDC. Released to freelancer on milestone approval. Trustless — no Upwork fees." },
  { name: "Onchain Bounty Board",  tag: "Incentive", desc: "Post tasks with USDC rewards. Anyone completes and claims. Transparent, trustless reward flow." },
  { name: "Subscription Contract", tag: "Recurring", desc: "Users approve recurring USDC pulls. Merchant collects each cycle. Onchain SaaS billing." },
  { name: "Group Savings Pool",    tag: "DeFi",      desc: "Members contribute USDC weekly. Each round, one member gets the full pot. Chit fund on Arc." },
  { name: "Prediction Market",     tag: "Social",    desc: "Bet USDC on a yes/no outcome. Winner takes the pool. Resolved transparently on-chain." },
  { name: "NFT Storefront",        tag: "Commerce",  desc: "Sell NFTs priced in USDC, not ETH. Buyers pay a stable dollar amount — no volatility." },
]

const LANDMARKS = [
  { id: "L1", short: "On the network" },
  { id: "L2", short: "Know your build" },
  { id: "L3", short: "Contract live" },
  { id: "L4", short: "App has a URL" },
  { id: "L5", short: "End-to-end test" },
  { id: "L6", short: "In the ecosystem" },
]

/* ═══════════════════════════════════════════════════════════
   Page
═══════════════════════════════════════════════════════════ */
export default function StartPage() {
  const [path, setPath]             = useState<"user"|"builder"|"dev">("user")
  const [netAdded, setNetAdded]     = useState(false)
  const [netError, setNetError]     = useState("")
  const [done, setDone]             = useState<Set<string>>(new Set())
  const [celebrated, setCelebrated] = useState(false)
  const [showLocal, setShowLocal]   = useState(false)
  const nodeColors                  = useColors()

  // Load progress from localStorage, then scroll to first incomplete landmark
  useEffect(() => {
    try {
      const saved = localStorage.getItem("arclens-landmarks")
      if (saved) {
        const parsed: string[] = JSON.parse(saved)
        setDone(new Set(parsed))
        // If user has started, scroll to their first incomplete landmark
        if (parsed.length > 0 && parsed.length < 6) {
          const order = ["L1","L2","L3","L4","L5","L6"]
          const next  = order.find(id => !parsed.includes(id))
          if (next) {
            setTimeout(() => {
              const el = document.getElementById("landmark-" + next)
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
            }, 400)
          }
        }
      }
    } catch {}
  }, [])

  function toggleDone(id: string) {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      try { localStorage.setItem("arclens-landmarks", JSON.stringify([...next])) } catch {}
      if (next.size === 6 && !celebrated) { setCelebrated(true) }
      return next
    })
  }

  async function addNetwork() {
    if (!(window as any).ethereum) { setNetError("Install Rabby first — download at rabby.io, then come back"); return }
    try {
      await (window as any).ethereum.request({ method: "wallet_addEthereumChain", params: [CHAIN] })
      setNetAdded(true); setNetError("")
    } catch { setNetError("Request was cancelled") }
  }

  const mono  = "'DM Mono', monospace"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const arc   = "#1a56ff"
  const usdc  = "#00b87a"
  const link  = "#8aaeff"

  const doneCount = done.size
  const pct       = Math.round((doneCount / 6) * 100)

  return (
    <ArcLayout active="start">
      <div style={{ maxWidth: "840px", margin: "0 auto", padding: "44px 20px 100px", fontFamily: "'Geist',system-ui,sans-serif" }}>

        {/* ── HERO ───────────────────────────────────────────── */}
        <div style={{ marginBottom: "52px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "18px" }}>
            Arc Beginners Guide
          </div>
          <h1 style={{ fontSize: "clamp(30px,5.5vw,52px)", fontWeight: 900, letterSpacing: "-0.05em", color: t1, margin: "0 0 18px", lineHeight: 1.0 }}>
            Not yet an Architect.<br />
            <span style={{ color: arc }}>Start here.</span>
          </h1>
          <p style={{ fontSize: "14px", color: t2, lineHeight: 1.9, fontWeight: 300, maxWidth: "560px", margin: "0 0 24px" }}>
            Arc is a USDC-native blockchain built for onchain payments. Gas costs dollars, not ETH.
            Finality in under a second. This guide takes you from zero to a live, working dApp —
            no coding experience required. Follow the landmarks. Ship something real.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { icon: "◎", text: "USDC gas token", color: usdc, bg: "rgba(0,184,122,0.06)", border: "rgba(0,184,122,0.15)" },
              { icon: "◈", text: "EVM-compatible",  color: link, bg: "rgba(26,86,255,0.06)", border: "rgba(26,86,255,0.15)" },
              { icon: "◆", text: "< 1s finality",   color: link, bg: "rgba(26,86,255,0.06)", border: "rgba(26,86,255,0.15)" },
            ].map(b => (
              <div key={b.text} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: b.bg, border: "1px solid " + b.border, borderRadius: "8px", fontSize: "12px", fontFamily: mono, color: b.color }}>
                <span>{b.icon}</span> {b.text}
              </div>
            ))}
            <a href="https://www.arc.network/blog/introducing-arc-house-and-the-architects-program"
              target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", background: "rgba(26,86,255,0.06)", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "8px", fontSize: "12px", fontFamily: mono, color: link, textDecoration: "none" }}>
              <span>✦</span> What is the Arc Architects Program?
            </a>
          </div>
        </div>

        {/* ── PATH SELECTOR ──────────────────────────────────── */}
        <div style={{ marginBottom: "44px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "12px" }}>
            Choose your path
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
            {([
              { key: "user",    label: "I am a User",   sub: "Explore Arc apps and transactions",  icon: "◎" },
              { key: "builder", label: "I am a Builder", sub: "Build a real dApp step by step",     icon: "◈" },
              { key: "dev",     label: "I am a Dev",     sub: "Give me specs, configs, and links",  icon: "◆" },
            ] as const).map(p => (
              <button key={p.key} onClick={() => setPath(p.key)}
                style={{ padding: "18px 16px", textAlign: "left", cursor: "pointer", background: path === p.key ? "rgba(26,86,255,0.1)" : surf, border: "1px solid " + (path === p.key ? "rgba(26,86,255,0.45)" : bdr), borderRadius: "12px", transition: "all .15s" }}>
                <div style={{ fontSize: "18px", color: path === p.key ? link : t3, marginBottom: "8px" }}>{p.icon}</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: path === p.key ? link : t1, marginBottom: "4px" }}>{p.label}</div>
                <div style={{ fontSize: "11px", fontFamily: mono, color: t3, lineHeight: 1.4 }}>{p.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            USER PATH
        ════════════════════════════════════════════════════ */}
        {path === "user" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { n: "01", title: "Add Arc to your wallet", body: "Arc works with Rabby, MetaMask, or any EVM wallet. One click adds Arc Testnet automatically.", extra: <><AddNetBtn added={netAdded} error={netError} onAdd={addNetwork} /><NetBox mono={mono} surf2={surf2} t2={t2} t3={t3} link={link} usdc={usdc} /></> },
              { n: "02", title: "Get testnet USDC", body: "Arc gas is paid in USDC. Get free testnet USDC in 30 seconds — paste your address and request.", extra: <Row><FlatLink href="https://faucets.chain.link/arc-testnet" label="Chainlink Faucet" /><FlatLink href="https://faucet.circle.com" label="Circle Faucet" /></Row> },
              { n: "03", title: "Make your first transaction", body: "Open ArcLens Explorer and watch live blocks. Send USDC to any address — gas costs fractions of a cent.", extra: <Row><FlatLink href="/overview" label="Open Explorer" /><FlatLink href="/wallets" label="Wallet Activity" /></Row> },
              { n: "04", title: "Try an Arc app", body: "Browse every project building on Arc — DeFi, payments, NFTs, infrastructure. Each has contract details and community reviews.", extra: <FlatLink href="/ecosystem" label="Browse Ecosystem" /> },
              { n: "05", title: "Check upcoming events", body: "Hackathons, community calls, AMAs, and launch events across the Arc ecosystem.", extra: <FlatLink href="/events" label="See Events" /> },
            ].map((s, i, arr) => (
              <div key={s.n} style={{ display: "flex", gap: "20px", paddingBottom: i < arr.length - 1 ? "32px" : 0, position: "relative" }}>
                {i < arr.length - 1 && <div style={{ position: "absolute", left: "19px", top: "42px", bottom: 0, width: "1px", background: bdr }} />}
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "rgba(26,86,255,0.08)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "10px", fontFamily: mono, color: link, fontWeight: 700 }}>{s.n}</div>
                <div style={{ flex: 1, paddingTop: "8px" }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: t1, marginBottom: "10px", letterSpacing: "-0.02em" }}>{s.title}</div>
                  <p style={{ fontSize: "13px", color: t2, lineHeight: 1.8, fontWeight: 300, margin: "0 0 12px" }}>{s.body}</p>
                  {s.extra}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            BUILDER PATH — 6 LANDMARKS
        ════════════════════════════════════════════════════ */}
        {path === "builder" && (
          <div>

            {/* Progress tracker */}
            <div style={{ marginBottom: "48px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em" }}>Your progress</div>
                <div style={{ fontSize: "11px", fontFamily: mono, color: doneCount === 6 ? usdc : t3 }}>
                  {doneCount === 6 ? "All landmarks complete — you built something real" : `${doneCount} of 6 landmarks complete`}
                </div>
              </div>
              <div style={{ fontSize: "11px", fontFamily: mono, color: t3, marginBottom: "12px" }}>
                {doneCount === 0
                  ? "Most people finish all 6 in 3-4 hours. Stop and resume anytime — your progress saves automatically."
                  : doneCount < 6
                  ? "Picked up where you left off. Keep going."
                  : ""}
              </div>
              {/* Progress bar */}
              <div style={{ height: "3px", background: bdr, borderRadius: "2px", marginBottom: "16px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: pct + "%", background: doneCount === 6 ? usdc : arc, borderRadius: "2px", transition: "width .4s ease" }} />
              </div>
              {/* Landmark chips */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "6px" }}>
                {LANDMARKS.map((lm, i) => {
                  const isDone = done.has(lm.id)
                  return (
                    <div key={lm.id} style={{ padding: "10px 8px", background: isDone ? "rgba(0,184,122,0.08)" : surf, border: "1px solid " + (isDone ? "rgba(0,184,122,0.3)" : bdr), borderRadius: "8px", textAlign: "center", transition: "all .2s", position: "relative" }}>
                      <div style={{ fontSize: "13px", fontWeight: 900, color: isDone ? usdc : arc, fontFamily: mono, marginBottom: "3px", letterSpacing: "-0.04em" }}>{lm.id}</div>
                      <div style={{ fontSize: "9px", fontFamily: mono, color: isDone ? usdc : t3, lineHeight: 1.3 }}>{lm.short}</div>
                      {isDone && <div style={{ position: "absolute", top: "6px", right: "6px", fontSize: "8px", color: usdc }}>✓</div>}
                    </div>
                  )
                })}
              </div>
              {/* All done banner */}
              {doneCount === 6 && (
                <a href="https://www.arc.network/blog/introducing-arc-house-and-the-architects-program"
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "16px", padding: "16px 20px", background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.25)", borderRadius: "10px", textDecoration: "none" }}>
                  <div style={{ fontSize: "24px" }}>◈</div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: t1, marginBottom: "2px" }}>You completed all 6 landmarks. You are building on Arc.</div>
                    <div style={{ fontSize: "11px", fontFamily: mono, color: usdc }}>Learn about the Arc Architects Program →</div>
                  </div>
                </a>
              )}
            </div>

            {/* L1 */}
            <LM id="L1" n="L1" title="You are on the network" deliverable="A funded wallet on Arc Testnet" time="5 min"
              aiBest={null} done={done.has("L1")} onToggle={toggleDone}
              checkpoint={["Rabby shows Arc Testnet in the network selector", "Your USDC balance is above zero", "You can see Chain ID 5042002 in Rabby network settings"]}>
              <SL label="1" title="Install Rabby Wallet">
                <P>Rabby is the best wallet for beginners — it shows you exactly what every transaction will do <strong style={{ color: t1 }}>before you sign it</strong>. Free browser extension. Install it, create a wallet, and write your seed phrase on paper. Store it somewhere safe. Never share it with anyone — ever.</P>
                <div style={{ padding: "12px 14px", background: "rgba(0,184,122,0.05)", border: "1px solid rgba(0,184,122,0.12)", borderRadius: "8px", fontSize: "11px", fontFamily: mono, color: usdc, lineHeight: 1.75, marginBottom: "12px" }}>
                  Why Rabby? It previews what each transaction will do before you approve. You see &quot;this will send 5 USDC to 0x123...&quot; — not just a confusing hex string. Beginners avoid costly mistakes this way.
                </div>
                <Row>
                  <FlatLink href="https://rabby.io" label="Download Rabby" />
                  <FlatLink href="https://metamask.io/download/" label="MetaMask (alternative)" />
                </Row>
              </SL>
              <SL label="2" title="Add Arc Testnet">
                <P>Click below — Rabby will pop up and ask to add Arc Testnet. Approve it and you are on the network.</P>
                <AddNetBtn added={netAdded} error={netError} onAdd={addNetwork} />
                <NetBox mono={mono} surf2={surf2} t2={t2} t3={t3} link={link} usdc={usdc} />
              </SL>
              <SL label="3" title="Get free testnet USDC">
                <P>Arc gas is paid in USDC. Get free testnet USDC from either faucet — paste your wallet address and request. Takes 30 seconds.</P>
                <Row>
                  <FlatLink href="https://faucets.chain.link/arc-testnet" label="Chainlink Faucet" />
                  <FlatLink href="https://faucet.circle.com" label="Circle Faucet" />
                </Row>
                <Note color={usdc}>Request more than you think you need. Deploying costs fractions of a cent — your balance will barely move.</Note>
              </SL>
            </LM>

            {/* L2 */}
            <LM id="L2" n="L2" title="You know what you are building" deliverable="A clear spec — what goes on-chain and why" time="20-30 min"
              aiBest="Claude — claude-sonnet-4-5" aiBestHref="https://claude.ai" aiAlt="Gemini 2.5 Pro" aiWhy="Free tier, 200K context — best at reasoning through an idea and turning it into a build plan"
              done={done.has("L2")} onToggle={toggleDone}
              checkpoint={['You can finish this sentence: "My dApp lets [who] do [what] using USDC on Arc"', "You know which logic lives in the contract vs the frontend", "You have a list of 3-5 functions the contract needs"]}>
              <SL label="1" title="What is a dApp — 60 seconds">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "16px" }}>
                  {[
                    { icon: "◈", label: "Smart Contract", desc: "Code that lives on Arc. Stores data, enforces rules. Nobody can change it after deploy — not even you." },
                    { icon: "◎", label: "Frontend", desc: "The website your users see. Regular HTML/CSS/JS. Talks to the contract through the wallet." },
                    { icon: "◉", label: "Wallet", desc: "Rabby or MetaMask. The user identity. Signs every transaction and shows you what you are approving before you do it." },
                  ].map(c => (
                    <div key={c.label} style={{ padding: "14px", background: surf2, borderRadius: "8px" }}>
                      <div style={{ fontSize: "16px", color: link, marginBottom: "7px" }}>{c.icon}</div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: t1, marginBottom: "5px" }}>{c.label}</div>
                      <div style={{ fontSize: "10px", color: t3, lineHeight: 1.6, fontFamily: mono }}>{c.desc}</div>
                    </div>
                  ))}
                </div>
              </SL>
              <SL label="2" title="Pick an idea — built for Arc">
                <P>Arc is a payments chain. USDC is the gas token. The best dApps here move real dollars — not just store text. These ideas are designed for that:</P>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                  {DAPP_IDEAS.map(d => (
                    <div key={d.name} style={{ padding: "12px 14px", background: surf2, border: "1px solid " + bdr, borderRadius: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: t1 }}>{d.name}</div>
                        <span style={{ fontSize: "9px", fontFamily: mono, color: usdc, background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.18)", borderRadius: "3px", padding: "1px 6px" }}>{d.tag}</span>
                      </div>
                      <div style={{ fontSize: "11px", fontFamily: mono, color: t3, lineHeight: 1.55 }}>{d.desc}</div>
                    </div>
                  ))}
                </div>
                <Note color={link}>Build anything that moves real dollars. USDC gas means your users pay in stable, predictable amounts. That is Arc&apos;s edge over every other chain.</Note>
              </SL>
              <SL label="3" title="Define your build with AI">
                <P>Open <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Claude.ai</a> and start a new conversation. On the free tier you will get <strong style={{ color: t1 }}>claude-sonnet-4-5</strong> — that is exactly what you need. Paste this prompt and fill in your idea. Claude will produce your full build spec. <strong style={{ color: t1 }}>Save the response — it is your plan for Landmarks 3 and 4.</strong></P>
                <CodeCard id="ideation" label="Ideation prompt — paste into Claude.ai" code={IDEATION_PROMPT} />
              </SL>
            </LM>

            {/* L3 */}
            <LM id="L3" n="L3" title="Your contract is live on Arc" deliverable="A deployed contract address starting with 0x" time="30-60 min"
              aiBest="Claude — claude-sonnet-4-5" aiBestHref="https://claude.ai" aiAlt="Gemini 2.5 Pro" aiWhy="Best model for writing clean, safe Solidity — reads your spec and produces deployable code"
              done={done.has("L3")} onToggle={toggleDone}
              checkpoint={["You have a contract address (0x...) from Remix", "You can find it on ArcLens Explorer — your deploy transaction is there", "You saved the contract ABI — you need it in Landmark 4"]}>
              <SL label="1" title="Generate your contract with AI">
                <P>Open <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Claude.ai</a> (free — use <strong style={{ color: t1 }}>claude-sonnet-4-5</strong>, or claude-sonnet-4-6 if you have Pro) and paste this prompt. Fill in the spec from your Landmark 2 session. The more specific you are, the better the contract.</P>
                <CodeCard id="contractprompt" label="Contract generation prompt" code={CONTRACT_PROMPT} />
                <Note color={link}>Stay in the same chat. Ask follow-ups: &quot;add a pause mechanism&quot;, &quot;make the fee configurable&quot;, &quot;add a function to delete entries&quot;.</Note>
              </SL>
              <SL label="2" title="No idea yet? Use this starter">
                <P>Copy this complete, deployable contract. The owner stores a message — anyone can read it, only owner updates it. Ask AI to modify it for your use case.</P>
                <CodeCard id="starter" label="HelloArc.sol — working starter contract" code={HELLO_ARC} />
              </SL>
              <SL label="3" title="Deploy on Remix — browser only, nothing to install">
                <P><a href="https://remix.ethereum.org" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Remix IDE</a> runs entirely in your browser. Paste the contract, click deploy. Your contract is live on Arc in under a second.</P>
                <div style={{ background: surf2, borderRadius: "10px", overflow: "hidden", marginBottom: "12px" }}>
                  {[
                    ["Open",          "remix.ethereum.org in a new tab"],
                    ["New file",      "name it MyContract.sol"],
                    ["Paste",         "the Solidity code from the AI"],
                    ["Ctrl+S",        "compile — green tick means ready"],
                    ["Left panel",    "click the Deploy & Run icon (plug shape)"],
                    ["Environment",   "select Injected Provider - MetaMask — this is correct even if you use Rabby. Rabby injects into the same slot. Do not look for a Rabby option."],
                    ["Wallet",        "confirm it shows Arc Testnet (Chain 5042002)"],
                    ["Deploy",        "click it — confirm in your wallet"],
                    ["Copy address",  "the 0x address shown after deploy"],
                    ["Copy ABI",      "copy icon next to ABI at bottom of compiler panel"],
                  ].map(([k, v], i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "9px 16px", borderBottom: i < 9 ? "1px solid rgba(255,255,255,0.03)" : "none", fontSize: "11px", fontFamily: mono, gap: "12px" }}>
                      <span style={{ color: link, fontWeight: 700 }}>{k}</span>
                      <span style={{ color: t2 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <Note color={usdc}>The contract address and ABI are critical. Save both in a text file before moving on — you need them both to build the frontend.</Note>
                <Row><FlatLink href="https://remix.ethereum.org" label="Open Remix IDE" /></Row>
              </SL>
              <div style={{ marginTop: "8px" }}>
                <button
                  onClick={() => setShowLocal(v => !v)}
                  style={{ fontSize: "11px", fontFamily: mono, color: t3, background: "none", border: "1px solid " + bdr, borderRadius: "6px", padding: "6px 14px", cursor: "pointer", marginBottom: showLocal ? "12px" : 0 }}
                >
                  {showLocal ? "▾ Hide local setup" : "▸ I prefer working locally (Cursor + Hardhat)"}
                </button>
                {showLocal && (
                  <SL label="4" title="Deploy locally with Cursor + Hardhat">
                    <P>Install <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Node.js</a> and <a href="https://cursor.com" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Cursor</a>. Open Cursor, describe your project — it scaffolds everything. Add Arc to Hardhat:</P>
                    <CodeCard id="hardhat" label="hardhat.config.js" code={HARDHAT_CFG} />
                    <div style={{ padding: "12px 14px", background: surf2, borderRadius: "8px", fontSize: "11px", fontFamily: mono, color: t3, lineHeight: 1.9, marginBottom: "12px" }}>
                      <div><span style={{ color: t2 }}>$ npx hardhat init</span> — scaffold project</div>
                      <div><span style={{ color: t2 }}>$ npx hardhat compile</span> — compile contracts</div>
                      <div><span style={{ color: t2 }}>$ npx hardhat run scripts/deploy.js --network arc</span></div>
                    </div>
                    <Row>
                      <FlatLink href="https://nodejs.org" label="Node.js" />
                      <FlatLink href="https://cursor.com" label="Cursor" />
                      <FlatLink href="https://hardhat.org" label="Hardhat docs" />
                    </Row>
                  </SL>
                )}
              </div>
            </LM>

            {/* L4 */}
            <LM id="L4" n="L4" title="Your app has a URL" deliverable="A live frontend anyone can open in a browser" time="20-45 min"
              aiBest="Bolt.new" aiBestHref="https://bolt.new" aiAlt="Cursor + Netlify" aiWhy="1M free tokens/month — describe your app, it builds and hosts it immediately"
              done={done.has("L4")} onToggle={toggleDone}
              checkpoint={["You have a URL you can send to someone right now", "The page loads — it is not blank or erroring", "The connect wallet button is visible"]}>
              <SL label="1" title="Build online — Bolt.new (easiest, hosted instantly)">
                <P>Go to <a href="https://bolt.new" target="_blank" rel="noopener noreferrer" style={{ color: link }}>bolt.new</a>. Paste this prompt — fill in your contract address, ABI, and describe the features. Bolt builds the full frontend and gives you a live URL with no deploy steps needed.</P>
                <CodeCard id="frontendprompt" label="Frontend prompt — paste into Bolt.new" code={FRONTEND_PROMPT} />
                <div style={{ background: surf2, borderRadius: "10px", overflow: "hidden", marginBottom: "12px", marginTop: "4px" }}>
                  {[
                    ["ABI",       "In Remix: Solidity Compiler panel, scroll to bottom, copy icon next to ABI"],
                    ["Paste",     "Contract address and ABI into the prompt above"],
                    ["Describe",  "Exactly what buttons and features you want"],
                    ["Preview",   "Click the preview URL — test every button"],
                    ["Fix",       "If broken, describe the issue to Bolt — it fixes inline"],
                    ["Deploy",    "Click Deploy in Bolt for a permanent public URL"],
                  ].map(([k, v], i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr", padding: "9px 16px", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.03)" : "none", fontSize: "11px", fontFamily: mono, gap: "12px" }}>
                      <span style={{ color: link, fontWeight: 700 }}>{k}</span>
                      <span style={{ color: t2 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <Row>
                  <FlatLink href="https://bolt.new" label="Open Bolt.new" />
                  <FlatLink href="https://replit.com" label="Replit (alternative)" />
                </Row>
              </SL>
              <SL label="2" title="Build locally — Cursor + Netlify">
                <P>Download <a href="https://cursor.com" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Cursor</a> — it uses <strong style={{ color: t1 }}>claude-sonnet-4-5</strong> under the hood by default (free tier included). Open Cursor and paste this in the AI chat: <em style={{ color: t2 }}>&quot;Build a Next.js dApp connected to my contract at [address] on Arc Testnet (Chain ID 5042002, RPC https://rpc.testnet.arc.network). ABI: [paste ABI]. Use ethers.js. Support Rabby and MetaMask. The app should [features]. Add wallet connect, network switching, loading states.&quot;</em> Then deploy to Netlify — sign up, drag your build folder to deploy, done.</P>
                <Row>
                  <FlatLink href="https://cursor.com" label="Download Cursor" />
                  <FlatLink href="https://netlify.com" label="Deploy on Netlify" />
                </Row>
              </SL>
            </LM>

            {/* L5 */}
            <LM id="L5" n="L5" title="It works end-to-end" deliverable="Tested, working dApp — ready for real users" time="1-2 hrs"
              aiBest="Claude — claude-sonnet-4-5" aiBestHref="https://claude.ai" aiAlt="Gemini 2.5 Pro" aiWhy="Paste error + code — Claude reads the full context and gives you the exact fix"
              done={done.has("L5")} onToggle={toggleDone}
              checkpoint={["Every button works with your main wallet", "Tested with a second wallet — owner-only actions blocked correctly", "Transactions confirm and UI updates without refreshing", "Tested on your phone — nothing broken"]}>
              <SL label="1" title="Test checklist — do not skip this">
                <P>You are on testnet. Mistakes cost nothing. Test every scenario before real users find the issues.</P>
                <div style={{ background: surf2, borderRadius: "10px", padding: "16px 18px", fontSize: "12px", fontFamily: mono, lineHeight: 2.2, color: t2, marginBottom: "14px" }}>
                  {[
                    "Wallet connects and shows the right address",
                    "App detects wrong network and asks to switch to Arc",
                    "Every button and function works correctly",
                    "Transactions show a loading state while pending",
                    "UI updates after confirming — without a page refresh",
                    "Test with a second wallet — owner-only things are blocked",
                    "Open on your phone — everything still works",
                    "Reject a transaction in Rabby — app handles it cleanly",
                    "What happens at zero USDC balance — does the app say something useful?",
                  ].map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: "12px" }}>
                      <span style={{ color: t3 }}>□</span><span>{s}</span>
                    </div>
                  ))}
                </div>
              </SL>
              <SL label="2" title="Fix errors with AI">
                <P>Open browser console (F12 → Console tab). Copy the full error. Paste this prompt into <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" style={{ color: link }}>Claude.ai</a> (claude-sonnet-4-5, free) with the error and your code:</P>
                <CodeCard id="debug" label="Debug prompt — paste into Claude.ai" code={DEBUG_PROMPT} />
                <Note color={link}>Rabby wallet errors appear in the popup before you sign — copy those too. The more detail you give Claude, the faster and more precise the fix.</Note>
              </SL>
              <SL label="3" title="Still stuck? Arc Discord">
                <P>Paste your error in the Arc Discord builders channel. Include what you were trying to do, the error, and what you tried. Someone who has built on Arc will respond.</P>
                <Row><FlatLink href="https://discord.gg/buildonarc" label="Join Arc Discord" /></Row>
              </SL>
            </LM>

            {/* L6 */}
            <LM id="L6" n="L6" title="You are in the ecosystem" deliverable="Your project has a page on ArcLens" time="15 min"
              aiBest={null} done={done.has("L6")} onToggle={toggleDone}
              checkpoint={["Contract is registered on ArcLens Registry", "Project appears on arclenz.xyz/ecosystem", "You have a founder dashboard for your listing"]}>
              <SL label="1" title="Register your contract">
                <P>Add your deployed contract to the ArcLens Contract Registry. This verifies it is legitimate, makes it discoverable, and lets other builders find your code.</P>
                <Row><FlatLink href="/registry" label="Contract Registry" /></Row>
              </SL>
              <SL label="2" title="Submit your project">
                <P>List your dApp on ArcLens Ecosystem. Get a public project page, a founder dashboard, community reviews, and visibility to every Arc user from day one.</P>
                <Row><FlatLink href="/ecosystem" label="Submit Your Project" /></Row>
              </SL>
              <SL label="3" title="Tell the community — your first users are there">
                <P>Post in Arc Discord #showcase and tag @arc on X. The Arc community actively looks for new projects to try. Go meet your first users.</P>
                <Row>
                  <FlatLink href="https://discord.gg/buildonarc" label="Arc Discord" />
                  <FlatLink href="https://x.com/arc" label="@arc on X" />
                </Row>
              </SL>

              {/* Architects CTA */}
              <a href="https://www.arc.network/blog/introducing-arc-house-and-the-architects-program"
                target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", gap: "20px", padding: "24px 26px", background: "linear-gradient(135deg, rgba(26,86,255,0.1) 0%, rgba(26,86,255,0.04) 100%)", border: "1px solid rgba(26,86,255,0.28)", borderRadius: "14px", textDecoration: "none", alignItems: "flex-start", marginTop: "8px" }}>
                <div style={{ fontSize: "32px", lineHeight: 1, flexShrink: 0, marginTop: "2px" }}>◈</div>
                <div>
                  <div style={{ fontSize: "10px", fontFamily: mono, color: link, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>The next level</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: t1, marginBottom: "8px", letterSpacing: "-0.03em", lineHeight: 1.2 }}>The Arc Architects Program</div>
                  <div style={{ fontSize: "13px", color: t2, lineHeight: 1.75, fontWeight: 300, marginBottom: "12px" }}>
                    Architects are not chosen by application — they are found worthy. The program recognizes builders
                    who show up, ship real projects, and contribute to the Arc ecosystem. Keep building.
                    Stay active in the community. The recognition finds you.
                  </div>
                  <div style={{ fontSize: "12px", fontFamily: mono, color: link }}>Learn about the Architects Program →</div>
                </div>
              </a>
            </LM>

          </div>
        )}

        {/* ════════════════════════════════════════════════════
            DEV PATH
        ════════════════════════════════════════════════════ */}
        {path === "dev" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>

            <DevSection title="Network — Arc Testnet" mono={mono} t3={t3}>
              <div style={{ background: "#04060f", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "10px", overflow: "hidden" }}>
                {[
                  ["Chain ID",   "5042002  (0x4cef52)"],
                  ["RPC",        "https://rpc.testnet.arc.network"],
                  ["WebSocket",  "wss://rpc.testnet.arc.network"],
                  ["Explorer",   "https://arclenz.xyz"],
                  ["Gas token",  "USDC — ERC-20 native, not ETH"],
                  ["EVM parity", "Full — Solidity ^0.8.x, all opcodes"],
                  ["Finality",   "< 1s"],
                  ["Chain type", "Circle L1 — built for onchain payments"],
                ].map(([k, v], i) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "150px 1fr", padding: "9px 16px", borderBottom: i < 7 ? "1px solid rgba(255,255,255,0.03)" : "none", fontSize: "11px", fontFamily: mono }}>
                    <span style={{ color: t3 }}>{k}</span><span style={{ color: link }}>{v}</span>
                  </div>
                ))}
              </div>
            </DevSection>

            <DevSection title="Wallet + Faucet" mono={mono} t3={t3}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                <AddNetBtn added={netAdded} error={netError} onAdd={addNetwork} />
              </div>
              <Row>
                <FlatLink href="https://faucets.chain.link/arc-testnet" label="Chainlink Faucet" />
                <FlatLink href="https://faucet.circle.com" label="Circle Faucet" />
              </Row>
            </DevSection>

            <DevSection title="Framework Configs" mono={mono} t3={t3}>
              <CodeCard id="d-hardhat" label="hardhat.config.js" code={HARDHAT_CFG} />
              <CodeCard id="d-foundry" label="foundry.toml" code={FOUNDRY_CFG} />
              <CodeCard id="d-wagmi"   label="wagmi v2 + viem — Arc chain definition" code={WAGMI_CFG} />
              <CodeCard id="d-ethers"  label="ethers.js v6 — provider + signer" code={ETHERS_CFG} />
            </DevSection>

            <DevSection title="OpenZeppelin" mono={mono} t3={t3}>
              <CodeCard id="d-oz" label="install + common imports" code={`npm install @openzeppelin/contracts\n\nimport "@openzeppelin/contracts/token/ERC20/ERC20.sol";\nimport "@openzeppelin/contracts/token/ERC721/ERC721.sol";\nimport "@openzeppelin/contracts/access/Ownable.sol";\nimport "@openzeppelin/contracts/utils/ReentrancyGuard.sol";\nimport "@openzeppelin/contracts/utils/Pausable.sol";`} />
            </DevSection>

            <DevSection title="Tooling" mono={mono} t3={t3}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  { cat: "IDEs & Editors", tools: [
                    { name: "Cursor",          href: "https://cursor.com",              note: "AI-native editor — best local DX" },
                    { name: "Remix IDE",       href: "https://remix.ethereum.org",      note: "Browser IDE — fastest iteration" },
                    { name: "VS Code",         href: "https://code.visualstudio.com",  note: "+ Hardhat + Solidity extensions" },
                    { name: "Windsurf",        href: "https://windsurf.com",            note: "AI editor, good for large codebases" },
                  ]},
                  { cat: "Testing & Security", tools: [
                    { name: "Hardhat Network", href: "https://hardhat.org",                note: "Local EVM fork for unit tests" },
                    { name: "Foundry Forge",   href: "https://book.getfoundry.sh",         note: "Fast Solidity-native test suite" },
                    { name: "Slither",         href: "https://github.com/crytic/slither", note: "Static analysis — catch vulns before deploy" },
                    { name: "Tenderly",        href: "https://tenderly.co",                note: "Simulation, debugging, alerting" },
                  ]},
                  { cat: "Frontend & Wallet", tools: [
                    { name: "wagmi + viem",    href: "https://wagmi.sh",          note: "React hooks for wallet + contracts" },
                    { name: "RainbowKit",      href: "https://rainbowkit.com",    note: "Drop-in wallet connect UI" },
                    { name: "ethers.js v6",    href: "https://docs.ethers.org",   note: "Classic provider/signer library" },
                    { name: "web3modal",       href: "https://web3modal.com",     note: "Multi-wallet connect modal" },
                  ]},
                  { cat: "Hosting & Backend", tools: [
                    { name: "Netlify",         href: "https://netlify.com",    note: "Free — commercial use allowed" },
                    { name: "Vercel",          href: "https://vercel.com",     note: "Free — non-commercial on free tier" },
                    { name: "Supabase",        href: "https://supabase.com",   note: "Free Postgres — 500MB, 2 projects" },
                    { name: "Railway",         href: "https://railway.app",    note: "Backend APIs — generous free tier" },
                  ]},
                ].map(g => (
                  <div key={g.cat} style={{ padding: "14px 16px", background: surf, border: "1px solid " + bdr, borderRadius: "10px" }}>
                    <div style={{ fontSize: "9px", fontFamily: mono, color: usdc, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>{g.cat}</div>
                    {g.tools.map(t => (
                      <div key={t.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid " + bdr }}>
                        <a href={t.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: link, textDecoration: "none", fontWeight: 600, fontFamily: mono }}>{t.name}</a>
                        <span style={{ fontSize: "10px", fontFamily: mono, color: t3, textAlign: "right", maxWidth: "120px", lineHeight: 1.4 }}>{t.note}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </DevSection>

            <DevSection title="AI — Honest Assessment" mono={mono} t3={t3}>
              <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "10px", overflow: "hidden" }}>
                {[
                  { tool: "Claude claude-sonnet-4-6",  tier: "Pro $20/mo",  use: "Best coding model available. Claude Code CLI (included) writes, runs, deploys entire projects from your terminal." },
                  { tool: "Claude claude-sonnet-4-5",  tier: "Free",        use: "Best free model for smart contracts, architecture, debugging. Use this first — it handles 90% of what you need." },
                  { tool: "Cursor (claude-sonnet-4-5)", tier: "Free / $20",  use: "Best local AI editor. Claude claude-sonnet-4-5 under the hood. Tab completion + file edits + terminal agent." },
                  { tool: "Gemini 2.5 Pro",    tier: "Free",              use: "Google AI Studio — fast, unlimited free tier. Great for concepts, EVM questions, second opinions." },
                  { tool: "Bolt.new",          tier: "Free / $20",        use: "Claude-powered browser builder. Best for full frontend + contract in one shot. 1M tokens/month free." },
                  { tool: "GitHub Copilot",    tier: "Free for students", use: "OK for completions in VS Code. Use Cursor instead — it is significantly more capable." },
                ].map((r, i) => (
                  <div key={r.tool} style={{ display: "grid", gridTemplateColumns: "150px 110px 1fr", padding: "10px 16px", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)", borderBottom: i < 5 ? "1px solid " + bdr : "none", fontSize: "11px", fontFamily: mono, alignItems: "center", gap: "8px" }}>
                    <span style={{ color: t2, fontWeight: 700 }}>{r.tool}</span>
                    <span style={{ color: usdc, fontSize: "10px" }}>{r.tier}</span>
                    <span style={{ color: t3, lineHeight: 1.5, fontSize: "10px" }}>{r.use}</span>
                  </div>
                ))}
              </div>
            </DevSection>

            <DevSection title="ArcLens API" mono={mono} t3={t3}>
              <div style={{ background: "#04060f", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "10px", overflow: "hidden", marginBottom: "8px" }}>
                {[
                  ["GET", "/api/ecosystem",          "All live projects"],
                  ["GET", "/api/ecosystem/[slug]",   "Single project + related"],
                  ["GET", "/api/search?q=",          "Search projects and addresses"],
                  ["GET", "/api/names?addresses=[]", "Resolve wallet display names"],
                  ["GET", "/api/reviews?project=",   "Community reviews for a project"],
                ].map(([m, p, d], i) => (
                  <div key={p} style={{ display: "grid", gridTemplateColumns: "36px 210px 1fr", padding: "9px 16px", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none", fontSize: "11px", fontFamily: mono, alignItems: "center" }}>
                    <span style={{ color: usdc, fontSize: "9px", fontWeight: 700 }}>{m}</span>
                    <span style={{ color: link }}>{p}</span>
                    <span style={{ color: t3 }}>{d}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>Base: arclenz.xyz — no API key needed</div>
            </DevSection>

            <DevSection title="Pre-Deploy Checklist" mono={mono} t3={t3}>
              <div style={{ padding: "16px 18px", background: surf, border: "1px solid rgba(224,51,72,0.12)", borderRadius: "10px", fontSize: "11px", fontFamily: mono, lineHeight: 2.1, color: t2 }}>
                {["Run Slither — fix all high and medium severity findings", "Test every access control path — wrong caller must always revert", "ReentrancyGuard on every function that transfers value", "No hardcoded private keys or secrets anywhere in the code", "Handle all external call failures — never assume they succeed", "Test at zero USDC balance — USDC is the gas token on Arc", "Emit events on every state change — frontends and indexers need them", "Deploy to testnet — test with real wallets before mainnet", "Consider a timelock on sensitive owner functions", "Get a second pair of eyes before mainnet"].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: "12px" }}>
                    <span style={{ color: "rgba(224,51,72,0.4)" }}>□</span><span>{s}</span>
                  </div>
                ))}
              </div>
            </DevSection>

            <DevSection title="Key Links" mono={mono} t3={t3}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  ["https://discord.gg/buildonarc",   "Arc Discord"],
                  ["https://community.arc.network",   "Community Hub"],
                  ["https://openzeppelin.com/contracts", "OpenZeppelin"],
                  ["https://hardhat.org",             "Hardhat"],
                  ["https://book.getfoundry.sh",      "Foundry"],
                  ["https://wagmi.sh",                "wagmi"],
                  ["https://rainbowkit.com",          "RainbowKit"],
                  ["https://remix.ethereum.org",      "Remix"],
                  ["/registry",                       "Contract Registry"],
                  ["/ecosystem",                      "Submit Project"],
                  ["https://www.arc.network/blog/introducing-arc-house-and-the-architects-program", "Architects Program"],
                ].map(([href, label]) => <FlatLink key={label} href={href} label={label + " →"} />)}
              </div>
            </DevSection>

          </div>
        )}

        {/* ── NODE GUIDE ────────────────────────────────────── */}
        <div style={{ marginTop: "64px", paddingTop: "40px", borderTop: "1px solid " + bdr }}>
          <NodeGuideSection c={nodeColors} />
        </div>

        {/* ── COMMUNITY ─────────────────────────────────────── */}
        <div style={{ marginTop: "64px", paddingTop: "40px", borderTop: "1px solid " + bdr }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "16px" }}>Community & Official Links</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px,1fr))", gap: "10px" }}>
            {COMMUNITY.map(c => (
              <a key={c.label} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                style={{ display: "flex", gap: "12px", padding: "14px 16px", background: surf, border: "1px solid " + bdr, borderRadius: "10px", textDecoration: "none", transition: "all .13s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.35)"; e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.transform = "none" }}>
                <div style={{ fontSize: "14px", color: link, flexShrink: 0, marginTop: "2px", fontFamily: mono }}>{c.icon}</div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: t1, marginBottom: "3px" }}>{c.label}</div>
                  <div style={{ fontSize: "11px", color: t3, lineHeight: 1.5, fontFamily: mono }}>{c.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>

      </div>
    </ArcLayout>
  )
}

/* ═══════════════════════════════════════════════════════════
   Landmark component
═══════════════════════════════════════════════════════════ */
function LM({
  id, n, title, deliverable, time, aiBest, aiBestHref, aiAlt, aiWhy,
  checkpoint, children, last, done, onToggle,
}: {
  id: string; n: string; title: string; deliverable: string; time: string
  aiBest: string | null; aiBestHref?: string; aiAlt?: string; aiWhy?: string
  checkpoint: string[]; children: React.ReactNode; last?: boolean
  done: boolean; onToggle: (id: string) => void
}) {
  const mono = "'DM Mono', monospace"
  const t1   = "var(--t1, #e8ecff)"
  const t2   = "var(--t2, #6b7da8)"
  const t3   = "var(--t3, #2e3a5c)"
  const bdr  = "var(--bdr, rgba(255,255,255,0.06))"
  const surf = "var(--surf, #0a0e1a)"
  const arc  = "#1a56ff"
  const usdc = "#00b87a"
  const link = "#8aaeff"

  return (
    <div id={"landmark-" + id} style={{ marginBottom: last ? 0 : "60px" }}>
      {/* Header row */}
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "20px" }}>
        <div style={{ minWidth: "58px", height: "58px", borderRadius: "12px", background: done ? "rgba(0,184,122,0.1)" : "rgba(26,86,255,0.08)", border: "1px solid " + (done ? "rgba(0,184,122,0.35)" : "rgba(26,86,255,0.28)"), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .25s" }}>
          <div style={{ fontSize: "8px", fontFamily: mono, color: done ? usdc : t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1px" }}>LANDMARK</div>
          <div style={{ fontSize: "18px", fontWeight: 900, color: done ? usdc : arc, fontFamily: mono, letterSpacing: "-0.04em", lineHeight: 1 }}>{done ? "✓" : n}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "17px", fontWeight: 800, color: t1, letterSpacing: "-0.03em" }}>{title}</div>
            <span style={{ fontSize: "10px", fontFamily: mono, color: t3, background: surf, border: "1px solid " + bdr, borderRadius: "20px", padding: "2px 10px", whiteSpace: "nowrap" }}>{time}</span>
          </div>
          <div style={{ fontSize: "12px", fontFamily: mono, color: usdc, opacity: 0.8 }}>Deliverable: {deliverable}</div>
        </div>
      </div>

      {/* AI callout */}
      {aiBest && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", background: "rgba(0,184,122,0.04)", border: "1px solid rgba(0,184,122,0.1)", borderRadius: "8px", marginBottom: "22px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>Best AI here</div>
          <a href={aiBestHref} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "11px", fontFamily: mono, color: usdc, fontWeight: 700, textDecoration: "none", background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: "4px", padding: "3px 10px", whiteSpace: "nowrap" }}>
            {aiBest}
          </a>
          {aiAlt && <div style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>alt: {aiAlt}</div>}
          {aiWhy && <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginLeft: "auto", textAlign: "right", lineHeight: 1.4, maxWidth: "240px" }}>{aiWhy}</div>}
        </div>
      )}

      {/* Content */}
      <div>{children}</div>

      {/* Checkpoint */}
      <div style={{ marginTop: "20px", padding: "18px 20px", background: done ? "rgba(0,184,122,0.06)" : "rgba(0,184,122,0.03)", border: "1px solid " + (done ? "rgba(0,184,122,0.25)" : "rgba(0,184,122,0.12)"), borderRadius: "10px", transition: "all .25s" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "9px", fontFamily: mono, color: usdc, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
            Checkpoint — done when:
          </div>
          <button onClick={() => onToggle(id)}
            style={{ fontSize: "10px", fontFamily: mono, color: done ? usdc : t3, background: done ? "rgba(0,184,122,0.1)" : "transparent", border: "1px solid " + (done ? "rgba(0,184,122,0.3)" : bdr), borderRadius: "6px", padding: "4px 12px", cursor: "pointer", transition: "all .2s", fontWeight: 700 }}>
            {done ? "✓ Landmark complete" : "Mark complete"}
          </button>
        </div>
        {checkpoint.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: "12px", fontSize: "12px", fontFamily: mono, color: t2, lineHeight: 1.6, marginBottom: i < checkpoint.length - 1 ? "6px" : 0 }}>
            <span style={{ color: done ? usdc : "rgba(0,184,122,0.35)", flexShrink: 0 }}>{done ? "✓" : "□"}</span>
            <span style={{ textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{c}</span>
          </div>
        ))}
      </div>

      {!last && <div style={{ marginTop: "48px", height: "1px", background: "linear-gradient(to right, rgba(26,86,255,0.2), transparent)" }} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Sub-step
═══════════════════════════════════════════════════════════ */
function SL({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  const mono = "'DM Mono', monospace"
  const t1   = "var(--t1, #e8ecff)"
  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
        <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: "rgba(26,86,255,0.08)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "10px", fontFamily: mono, color: "#8aaeff", fontWeight: 800 }}>{label}</div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: t1, letterSpacing: "-0.02em" }}>{title}</div>
      </div>
      {children}
    </div>
  )
}

/* Inline helpers */
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: "13px", color: "var(--t2, #6b7da8)", lineHeight: 1.8, fontWeight: 300, margin: "0 0 12px" }}>{children}</p>
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>{children}</div>
}
function Note({ children, color }: { children: React.ReactNode; color: string }) {
  return <div style={{ margin: "8px 0 4px", padding: "10px 14px", background: color + "08", border: "1px solid " + color + "18", borderRadius: "8px", fontSize: "11px", fontFamily: "'DM Mono', monospace", color, lineHeight: 1.75 }}>{children}</div>
}
function DevSection({ title, children, mono, t3 }: { title: string; children: React.ReactNode; mono: string; t3: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "12px" }}>{title}</div>
      {children}
    </div>
  )
}
function NetBox({ mono, surf2, t2, t3, link, usdc }: { mono: string; surf2: string; t2: string; t3: string; link: string; usdc: string }) {
  return (
    <div style={{ marginTop: "12px", padding: "12px 14px", background: surf2, borderRadius: "8px", fontSize: "11px", fontFamily: mono, color: t3, lineHeight: 1.9 }}>
      <div>RPC &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: t2 }}>https://rpc.testnet.arc.network</span></div>
      <div>Chain ID &nbsp;&nbsp;<span style={{ color: link }}>5042002</span></div>
      <div>Symbol &nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: usdc }}>USDC (gas token)</span></div>
    </div>
  )
}
function AddNetBtn({ added, error, onAdd }: { added: boolean; error: string; onAdd: () => void }) {
  const mono = "'DM Mono', monospace"
  return (
    <div>
      <button onClick={onAdd} style={{ height: "38px", padding: "0 22px", background: added ? "rgba(0,184,122,0.1)" : "rgba(26,86,255,0.1)", color: added ? "#00b87a" : "#8aaeff", fontSize: "12px", fontFamily: mono, border: "1px solid " + (added ? "rgba(0,184,122,0.3)" : "rgba(26,86,255,0.3)"), borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
        {added ? "✓ Arc Network Added" : "+ Add Arc Network to Wallet"}
      </button>
      {error && <div style={{ fontSize: "11px", color: "#e03348", fontFamily: mono, marginTop: "6px" }}>{error}</div>}
    </div>
  )
}
function FlatLink({ href, label }: { href: string; label: string }) {
  const mono = "'DM Mono', monospace"
  const t2   = "var(--t2, #6b7da8)"
  const bdr  = "var(--bdr, rgba(255,255,255,0.06))"
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", height: "34px", padding: "0 16px", color: t2, fontSize: "12px", fontFamily: mono, border: "1px solid " + bdr, borderRadius: "8px", textDecoration: "none", transition: "all .12s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)"; e.currentTarget.style.color = "#8aaeff" }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.color = t2 }}>
      {label}
    </a>
  )
}
function CodeCard({ id, label, code }: { id: string; label: string; code: string }) {
  const mono = "'DM Mono', monospace"
  const t3   = "var(--t3, #2e3a5c)"
  const usdc = "#00b87a"
  const [ok, setOk] = useState(false)
  return (
    <div style={{ background: "#04060f", border: "1px solid rgba(26,86,255,0.14)", borderRadius: "10px", overflow: "hidden", marginBottom: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>{label}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 2200) }}
          style={{ fontSize: "10px", fontFamily: mono, color: ok ? usdc : t3, background: "none", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: "4px", transition: "color .15s" }}>
          {ok ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre style={{ padding: "14px 16px", fontSize: "11px", fontFamily: mono, color: "#8aaeff", lineHeight: 1.75, margin: 0, overflowX: "auto", whiteSpace: "pre-wrap" }}>{code}</pre>
    </div>
  )
}
