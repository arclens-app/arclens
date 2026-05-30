// scripts/seed-ai-knowledge.mjs
// Seeds the ai_knowledge_base table with curated facts about Arc, USDC, ArcLens,
// and Circle products. Sourced from existing pages (/about, /dev, /start, /node-guide)
// + Circle docs + Arc constants. Idempotent — re-running just upserts.
//
// Run:  node scripts/seed-ai-knowledge.mjs

import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// Each row: { topic, fact, source_url? }
// Topics are short kebab-case tags so the AI can pull related facts at once.
const FACTS = [
  // ─── Arc network basics ──────────────────────────────────────────────────
  { topic: "arc-basics", fact: "Arc is Circle's EVM-compatible L1 blockchain, purpose-built to use USDC as the native gas token instead of ETH.", source_url: "/about" },
  { topic: "arc-basics", fact: "Arc Testnet uses chain ID 5042002 (hex 0x4cef52). The RPC URL is https://rpc.testnet.arc.network.", source_url: "/dev" },
  { topic: "arc-basics", fact: "USDC on Arc has 6 decimals and is at contract address 0x3600000000000000000000000000000000000000.", source_url: "/dev" },
  { topic: "arc-basics", fact: "Arc finality is sub-second — most transactions confirm in under one second. Average block time is fetched live on the homepage.", source_url: "/" },
  { topic: "arc-basics", fact: "Average transfer cost on Arc is under $0.001 in USDC, computed live from eth_gasPrice on each pageview.", source_url: "/" },
  { topic: "arc-basics", fact: "Arc is EVM-compatible — any contract that deploys on Ethereum, Polygon, Base, etc. can deploy on Arc with no code changes.", source_url: "https://developers.circle.com" },

  // ─── USDC fundamentals ───────────────────────────────────────────────────
  { topic: "usdc", fact: "USDC is a fully-backed dollar stablecoin issued by Circle. Each USDC is redeemable 1:1 for US dollars held in regulated reserves.", source_url: "https://www.circle.com/usdc" },
  { topic: "usdc", fact: "On Arc, USDC is the native gas token — you pay for every transaction in USDC directly, no ETH wrapper needed.", source_url: "/about" },
  { topic: "usdc", fact: "USDC is available on 20+ chains. ArcLens specifically tracks the USDC on Arc Testnet (chain 5042002).", source_url: "/dev" },

  // ─── How to use Arc ──────────────────────────────────────────────────────
  { topic: "arc-howto", fact: "To add Arc Testnet to a wallet like MetaMask: Network Name = Arc Testnet, RPC URL = https://rpc.testnet.arc.network, Chain ID = 5042002, Currency Symbol = USDC, Block Explorer = https://arclenz.xyz.", source_url: "/dev" },
  { topic: "arc-howto", fact: "Anyone can sign in to ArcLens without MetaMask using email-based Circle Wallets — type your email, get a code, set a PIN, you have a wallet on Arc.", source_url: "/" },
  { topic: "arc-howto", fact: "To deploy a contract on Arc, target chain ID 5042002 and use the standard EVM toolchain (Hardhat, Foundry, Remix). No special compiler flags needed.", source_url: "https://developers.circle.com" },
  { topic: "arc-howto", fact: "ArcLens has an Arc Beginners section at /start that walks new users through their first steps on Arc.", source_url: "/start" },

  // ─── ArcLens platform — what it is ───────────────────────────────────────
  { topic: "arclens-basics", fact: "ArcLens is the ecosystem hub and intelligence layer for Arc. It tracks projects, displays deployer-verified TVL, volume, and revenue, runs trial campaigns, and provides a public dispute flow for disputed numbers.", source_url: "/about" },
  { topic: "arclens-basics", fact: "Every TVL/Volume/Revenue number on ArcLens is computed exactly from on-chain state. There is no price oracle — USDC and EURC are stable-pegged, so balanceOf calls are exact dollar values.", source_url: "/about" },
  { topic: "arclens-basics", fact: "ArcLens audits its own numbers hourly via a drift-detection cron. Any deviation between cached values and live chain state >0.01% surfaces as a public alert.", source_url: "/admin" },

  // ─── ArcLens features ────────────────────────────────────────────────────
  { topic: "arclens-features", fact: "Arc Ecosystem Directory — the curated public list of every project on Arc. Filter by category, see TVL/Volume/Revenue, find teams.", source_url: "/ecosystem" },
  { topic: "arclens-features", fact: "Protocol Metrics — deployer-verified TVL, volume, and cumulative revenue for stablecoin protocols. Each contract claim requires the deployer's signature, on-chain provable.", source_url: "/ecosystem" },
  { topic: "arclens-features", fact: "Arc Trials — testing campaign platform. Founders post tasks with USDC rewards; testers complete tasks, get rated, claim USDC rewards via the platform's Circle DCW.", source_url: "/trials" },
  { topic: "arclens-features", fact: "Public dispute flow — anyone can flag a TVL, volume, or revenue number on any project. Admin triages each report.", source_url: "/admin" },
  { topic: "arclens-features", fact: "Contract Registry — verify, submit, and discover smart contracts on Arc. Deployer-signed identity claims so impersonation is impossible.", source_url: "/registry" },
  { topic: "arclens-features", fact: "Builder Profiles — every project owner gets a profile showing the projects they own, their campaigns, and their community reputation.", source_url: "/builders" },

  // ─── How founders register projects ──────────────────────────────────────
  { topic: "founder-onboarding", fact: "Founders submit their project at /ecosystem (Submit Project button). After admin approval, they receive a magic link to activate their dashboard.", source_url: "/ecosystem" },
  { topic: "founder-onboarding", fact: "Project ownership is claimed by signing a message with the wallet that deployed the contract — proof of deployer identity via on-chain lookup.", source_url: "/registry" },
  { topic: "founder-onboarding", fact: "To enable TVL/Volume/Revenue tracking on a project, the founder opens the TVL Tracking tab on their dashboard, adds each contract address with its role (tvl/volume/revenue/treasury), and signs once with the deployer wallet.", source_url: "/dashboard/[slug]" },
  { topic: "founder-onboarding", fact: "For aggregators or routers that don't emit Swap events (like DEX aggregators), the volume method 'Outflow Transfer' tracks stablecoin transfers leaving the contract instead of decoding Swap events. Labeled approximate.", source_url: "/dashboard/[slug]" },

  // ─── How testers earn ────────────────────────────────────────────────────
  { topic: "tester-earnings", fact: "Testers participate in Arc Trials by completing tasks on a project's app, submitting transaction hashes and screenshots as proof. Auto-scoring verifies submission quality.", source_url: "/trials" },
  { topic: "tester-earnings", fact: "When a campaign offers USDC rewards, the founder deposits the reward pool to the ArcLens payout wallet (Circle DCW) upfront. Once a tester's submission scores ≥1, they can claim their USDC reward.", source_url: "/trials" },
  { topic: "tester-earnings", fact: "Tester reputation is tracked across all campaigns. Higher reputation unlocks access to campaigns with min_rank filters.", source_url: "/builders" },

  // ─── Circle products on ArcLens ──────────────────────────────────────────
  { topic: "circle-on-arclens", fact: "ArcLens uses Circle Programmable Wallets (User-Controlled) for email-based sign-in — no seed phrases, no extensions.", source_url: "/" },
  { topic: "circle-on-arclens", fact: "ArcLens uses Circle Developer-Controlled Wallets (DCW) via Circle App Kit to autonomously send USDC for trial rewards and campaign refunds.", source_url: "/admin" },
  { topic: "circle-on-arclens", fact: "Circle App Kit (@circle-fin/app-kit) is the SDK that orchestrates USDC sends from the DCW. ArcLens uses this pattern in production.", source_url: "https://developers.circle.com" },

  // ─── Compliance + trust ──────────────────────────────────────────────────
  { topic: "trust", fact: "Every deployer-signed contract claim on ArcLens is independently verifiable. The signed message + signature + on-chain deployer address are all stored, so any third party can reproduce the verification.", source_url: "/registry" },
  { topic: "trust", fact: "Public disputes against any TVL or volume number appear immediately on the project page with a warning badge. Admin resolution is visible.", source_url: "/admin" },
  { topic: "trust", fact: "ArcLens's indexer runs every 5 minutes and reconciles cached values against live chain state every hour. Drift alerts are public.", source_url: "/admin" },

  // ─── ArcLens doesn't do ──────────────────────────────────────────────────
  { topic: "arclens-scope", fact: "ArcLens is single-chain (Arc only) by design. It doesn't aggregate multi-chain data the way DeFiLlama does — but every number on Arc is provably correct because there's no oracle dependency.", source_url: "/about" },
  { topic: "arclens-scope", fact: "ArcLens tracks stablecoin-denominated metrics only (USDC, EURC when applicable). It does not track volatile-asset TVL because it deliberately avoids price-oracle estimation errors.", source_url: "/about" },
  { topic: "arclens-scope", fact: "ArcLens is not a wallet, not a bridge, and does not custody user funds. It reads chain state and stores the rest in its own database.", source_url: "/about" },

  // ─── How to ask ArcLens AI things ────────────────────────────────────────
  { topic: "ai-self", fact: "ArcLens AI can answer questions about Arc, USDC, Circle products, and any project listed on ArcLens. It cites the source of every fact and tells you when it doesn't know.", source_url: "/" },
  { topic: "ai-self", fact: "ArcLens AI never speaks numbers from memory — every TVL, volume, or revenue figure is fetched live from the database or chain at the moment of the question.", source_url: "/" },

  // ─── Stablecoins tracked ─────────────────────────────────────────────────
  { topic: "stablecoins", fact: "ArcLens tracks both USDC and EURC on Arc. EURC is Circle's euro-pegged stablecoin (6 decimals, contract 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a), valued in USD at the live EUR→USD rate so TVL and volume read in dollars.", source_url: "/about" },

  // ─── TVL vs Volume (the most common confusion) ───────────────────────────
  { topic: "metrics-explained", fact: "TVL and Volume are different metrics. TVL (Total Value Locked) is the value of stablecoins currently held in a project's contracts — a balance, a snapshot. Volume is the throughput of swaps over time, decoded from the protocol's Swap events — a flow. A project can have high TVL and low volume, or the reverse.", source_url: "/about" },
  { topic: "metrics-explained", fact: "Cumulative volume is the running total of swap notional since a contract was registered. It is NOT the same as TVL, and the two should never be added together to form a single 'total'.", source_url: "/about" },

  // ─── In-app wallet (send / receive) ──────────────────────────────────────
  { topic: "wallet", fact: "ArcLens has a built-in wallet panel — click your connected wallet to see your USDC and EURC balances. Circle email-wallet users can Send tokens to any Arc address and Receive to their own; ArcLens never custodies the funds, the user authorizes every send with their Circle PIN.", source_url: "/" },

  // ─── Plug-and-play contract registration ─────────────────────────────────
  { topic: "founder-onboarding", fact: "Registering a contract for tracking works no matter how it was deployed. ArcLens proves the founder's authority via any of: the deployer signature, the wallet that sent the deploy transaction (covers factory deploys), the contract's owner()/admin(), or its EIP-1967 proxy-admin. The founder signs once with a wallet that deployed or controls the contract.", source_url: "/dashboard/[slug]" },
]

async function main() {
  const client = await pool.connect()
  let upserted = 0
  try {
    for (const f of FACTS) {
      const r = await client.query(
        `INSERT INTO ai_knowledge_base (topic, fact, source_url, added_by)
         VALUES ($1, $2, $3, 'system')
         ON CONFLICT (topic, fact) DO UPDATE SET
           source_url  = COALESCE(EXCLUDED.source_url, ai_knowledge_base.source_url),
           updated_at  = NOW()
         RETURNING id`,
        [f.topic, f.fact, f.source_url ?? null],
      )
      if (r.rowCount) upserted++
    }
    console.log(`✓ seeded ${upserted} knowledge rows`)

    const summary = await client.query(
      `SELECT topic, COUNT(*)::int AS n FROM ai_knowledge_base GROUP BY topic ORDER BY topic`,
    )
    console.log("\nBy topic:")
    for (const row of summary.rows) console.log("  ", row.topic.padEnd(24), row.n)
  } catch (e) {
    console.error("Seed failed:", e)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}
main()
