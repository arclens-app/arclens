// scripts/sync-ai-knowledge.mjs
//
// ONE command to keep ArcLens AI's knowledge fresh. Run it on every ship:
//
//   node scripts/sync-ai-knowledge.mjs
//
// It is the single source of truth for ArcLens AI's CONCEPTUAL knowledge —
// what the product is, how it works, what we shipped. (Live numbers — TVL,
// counts, prices — are NOT here; the AI fetches those with tools at query time,
// so they're never stale.)
//
// How it stays fresh, durably:
//   • Each fact has a stable `key`. Editing a fact's text updates it IN PLACE
//     and re-embeds just that one — no duplicate rows piling up.
//   • Reconcile is scoped to added_by='system': retired facts (keys removed
//     from this file) are pruned, but admin/human-added knowledge is NEVER
//     touched.
//   • After reconciling, only rows whose embedding is NULL get (re)embedded.
//
// To update the AI's knowledge after shipping a feature: edit FACTS below, run
// this script. That's the whole workflow.

import { readFileSync } from "node:fs"
import pg from "pg"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// ── SOURCE OF TRUTH ──────────────────────────────────────────────────────────
// { key, topic, fact, source_url? }. `key` is stable — never reuse one for a
// different fact. Keep facts CONCEPTUAL and evergreen; never bake in live counts
// or dollar values (those are tool-fetched). Never reveal gameable mechanics
// (e.g. the exact thresholds behind Established or the risk engine).
const FACTS = [
  // ─── Arc network basics ──────────────────────────────────────────────────
  { key: "arc-evm-l1",      topic: "arc-basics", fact: "Arc is Circle's EVM-compatible L1 blockchain, purpose-built to use USDC as the native gas token instead of ETH.", source_url: "/about" },
  { key: "arc-chain-id",    topic: "arc-basics", fact: "Arc Testnet uses chain ID 5042002 (hex 0x4cef52). The RPC URL is https://rpc.testnet.arc.network.", source_url: "/dev" },
  { key: "arc-usdc-addr",   topic: "arc-basics", fact: "USDC on Arc has 6 decimals and is at contract address 0x3600000000000000000000000000000000000000.", source_url: "/dev" },
  { key: "arc-finality",    topic: "arc-basics", fact: "Arc finality is sub-second — most transactions confirm in under one second.", source_url: "/" },
  { key: "arc-cheap",       topic: "arc-basics", fact: "Average transfer cost on Arc is a fraction of a cent in USDC, computed live from gas price.", source_url: "/" },
  { key: "arc-evm-compat",  topic: "arc-basics", fact: "Arc is EVM-compatible — any contract that deploys on Ethereum, Polygon, Base, etc. can deploy on Arc with no code changes.", source_url: "https://developers.circle.com" },

  // ─── USDC fundamentals ───────────────────────────────────────────────────
  { key: "usdc-backed",     topic: "usdc", fact: "USDC is a fully-backed dollar stablecoin issued by Circle. Each USDC is redeemable 1:1 for US dollars held in regulated reserves.", source_url: "https://www.circle.com/usdc" },
  { key: "usdc-native-gas", topic: "usdc", fact: "On Arc, USDC is the native gas token — you pay for every transaction in USDC directly, no ETH wrapper needed.", source_url: "/about" },

  // ─── How to use Arc ──────────────────────────────────────────────────────
  { key: "arc-add-wallet",  topic: "arc-howto", fact: "To add Arc Testnet to a wallet like MetaMask: Network Name = Arc Testnet, RPC URL = https://rpc.testnet.arc.network, Chain ID = 5042002, Currency Symbol = USDC.", source_url: "/dev" },
  { key: "arc-email-wallet",topic: "arc-howto", fact: "Anyone can sign in to ArcLens without MetaMask using email-based Circle Wallets — type your email, get a code, set a PIN, and you have a wallet on Arc.", source_url: "/" },
  { key: "arc-deploy",      topic: "arc-howto", fact: "To deploy a contract on Arc, target chain ID 5042002 with the standard EVM toolchain (Hardhat, Foundry, Remix). No special compiler flags needed.", source_url: "https://developers.circle.com" },
  { key: "arc-start",       topic: "arc-howto", fact: "ArcLens has an Arc Beginners section at /start that walks new users through their first steps on Arc.", source_url: "/start" },

  // ─── ArcLens platform — what it is ───────────────────────────────────────
  { key: "arclens-what",    topic: "arclens-basics", fact: "ArcLens is the ecosystem hub and intelligence layer for Arc. It tracks every project, displays deployer-verified TVL, volume and revenue, runs trial campaigns, and provides a published on-chain trust layer.", source_url: "/about" },
  { key: "arclens-exact",   topic: "arclens-basics", fact: "Every TVL/Volume/Revenue number on ArcLens is computed exactly from on-chain state. There is no price oracle — USDC and EURC are stable-pegged, so balanceOf calls are exact dollar values.", source_url: "/about" },
  { key: "arclens-audit",   topic: "arclens-basics", fact: "ArcLens audits its own numbers hourly with a drift-detection cron; any deviation beyond a small tolerance between cached values and live chain state surfaces as an alert for review.", source_url: "/admin" },

  // ─── The Trust Layer (shipped) ───────────────────────────────────────────
  { key: "trust-overview",  topic: "trust-layer", fact: "ArcLens has a trust layer: every project carries a single clear trust signal, and the verdict is published on-chain so any wallet, app, or agent can verify it independently rather than taking it on faith.", source_url: "/ecosystem" },
  { key: "trust-claimed",   topic: "trust-layer", fact: "Claimed: the team has proven they control the listing by signing with the wallet that deployed or controls the contract. It is an objective, on-chain-provable fact, not an endorsement.", source_url: "/ecosystem" },
  { key: "trust-verified",  topic: "trust-layer", fact: "Verified: an independent security audit is on record for the project. Verified means 'independently audited', not that ArcLens vouches for the team's identity.", source_url: "/ecosystem" },
  { key: "trust-partner",   topic: "trust-layer", fact: "Arc Partner: an officially recognized partner in the Arc ecosystem.", source_url: "/ecosystem" },
  { key: "trust-official",  topic: "trust-layer", fact: "Arc Official: built by Arc or Circle themselves.", source_url: "/ecosystem" },
  { key: "trust-established",topic: "trust-layer", fact: "Established: the project has earned a real, sustained on-chain track record over time. It is granted from objective on-chain history, not bought or self-declared.", source_url: "/ecosystem" },
  { key: "trust-risk",      topic: "trust-layer", fact: "Risk: a safety check has flagged the project, and users are advised to interact with caution. ArcLens is conservative — only confirmed problems are shown publicly, to avoid flagging honest projects.", source_url: "/ecosystem" },
  { key: "trust-onchain",   topic: "trust-layer", fact: "Every project's trust standing is attested on-chain to the ArcLensRegistry contract — both contract-backed projects and those without a contract — so the record is complete and anyone can read it on-chain.", source_url: "/ecosystem" },
  { key: "trust-api",       topic: "trust-layer", fact: "ArcLens exposes a read endpoint so any wallet, app, or agent can fetch a project's on-chain attestation (its tier and whether it is verified) by slug or subject address.", source_url: "/api/attestation" },
  { key: "trust-gated",     topic: "trust-layer", fact: "Trust tiers like Verified, Arc Partner and Arc Official are granted by ArcLens review, never self-assigned. Claimed and the on-chain track record behind Established are earned objectively.", source_url: "/ecosystem" },

  // ─── ArcLens features ────────────────────────────────────────────────────
  { key: "feat-directory",  topic: "arclens-features", fact: "Arc Ecosystem Directory — the curated public list of every project on Arc. Filter by category, see TVL/Volume/Revenue and trust signals, and find teams.", source_url: "/ecosystem" },
  { key: "feat-metrics",    topic: "arclens-features", fact: "Protocol Metrics — deployer-verified TVL, volume, and cumulative revenue. Each contract claim requires the deployer's signature, on-chain provable.", source_url: "/ecosystem" },
  { key: "feat-trials",     topic: "arclens-features", fact: "Arc Trials — a testing campaign platform. Founders post tasks with USDC rewards; testers complete tasks, get rated, and claim USDC rewards through the platform.", source_url: "/trials" },
  { key: "feat-disputes",   topic: "arclens-features", fact: "Public dispute flow — anyone can report a problem or flag a TVL, volume, or revenue number on any project, and an admin triages each report.", source_url: "/ecosystem" },
  { key: "feat-builders",   topic: "arclens-features", fact: "Builder Profiles — every project owner gets a profile showing the projects they own, their campaigns, and their reputation.", source_url: "/builders" },

  // ─── ArcLens AI (itself) ─────────────────────────────────────────────────
  { key: "ai-what",         topic: "ai-self", fact: "ArcLens AI answers questions about Arc, USDC, Circle products, and any project listed on ArcLens. It reads live data, cites its sources, and says when it doesn't know rather than guessing.", source_url: "/" },
  { key: "ai-live-numbers", topic: "ai-self", fact: "ArcLens AI never speaks numbers from memory — every TVL, volume, or revenue figure is fetched live from the database or chain at the moment of the question.", source_url: "/" },
  { key: "ai-free-limit",   topic: "ai-self", fact: "ArcLens AI includes a free daily message allowance per user. Signing in (email or wallet) keeps your conversation history and is the way to get the most out of it.", source_url: "/" },
  { key: "ai-discretion",   topic: "ai-self", fact: "ArcLens AI explains how trust works in general terms but does not disclose the exact internal thresholds or mechanics behind tiers like Established or the risk engine.", source_url: "/" },

  // ─── How founders onboard ────────────────────────────────────────────────
  { key: "onboard-submit",  topic: "founder-onboarding", fact: "Founders submit their project from the Ecosystem page (Submit Project). After admin approval they receive a magic link to activate their dashboard.", source_url: "/ecosystem" },
  { key: "onboard-claim",   topic: "founder-onboarding", fact: "A project is claimed by signing a message with the wallet that deployed or controls the contract — proof of authorization verified on-chain. Claiming promotes the project to the Claimed trust tier and is recorded on-chain.", source_url: "/ecosystem" },
  { key: "onboard-tracking",topic: "founder-onboarding", fact: "To enable TVL/Volume/Revenue tracking, a founder opens the TVL Tracking tab on their dashboard, adds each contract with its role (tvl/volume/revenue/treasury), and signs once with the deployer wallet.", source_url: "/dashboard/[slug]" },
  { key: "onboard-agg",     topic: "founder-onboarding", fact: "For aggregators or routers that don't emit Swap events, the volume method 'Outflow Transfer' tracks stablecoin transfers leaving the contract instead of decoding Swap events. It is labeled approximate.", source_url: "/dashboard/[slug]" },
  { key: "onboard-anydeploy",topic: "founder-onboarding", fact: "Registering a contract for tracking works no matter how it was deployed — directly, via a factory, or behind a proxy. You sign a quick message with the wallet that deployed or controls it, and ArcLens verifies authorization automatically.", source_url: "/dashboard/[slug]" },

  // ─── How testers earn ────────────────────────────────────────────────────
  { key: "tester-how",      topic: "tester-earnings", fact: "Testers join Arc Trials by completing tasks on a project's app and submitting transaction hashes and screenshots as proof. Auto-scoring verifies submission quality.", source_url: "/trials" },
  { key: "tester-reward",   topic: "tester-earnings", fact: "When a campaign offers USDC rewards, the founder deposits the reward pool upfront. Once a tester's submission scores high enough, they can claim their USDC reward.", source_url: "/trials" },
  { key: "tester-rep",      topic: "tester-earnings", fact: "Tester reputation is tracked across all campaigns; higher reputation unlocks campaigns with minimum-rank filters.", source_url: "/builders" },

  // ─── Circle products on ArcLens ──────────────────────────────────────────
  { key: "circle-ucw",      topic: "circle-on-arclens", fact: "ArcLens uses Circle Programmable Wallets (User-Controlled) for email-based sign-in — no seed phrases, no extensions.", source_url: "/" },
  { key: "circle-dcw",      topic: "circle-on-arclens", fact: "ArcLens uses Circle Developer-Controlled Wallets to autonomously send USDC for trial rewards and campaign refunds.", source_url: "/admin" },

  // ─── Trust + integrity ───────────────────────────────────────────────────
  { key: "trust-verifiable",topic: "trust", fact: "Every deployer-signed contract claim on ArcLens is independently verifiable: the signed message, signature, and on-chain deployer address are stored so any third party can reproduce the verification.", source_url: "/ecosystem" },
  { key: "trust-indexer",   topic: "trust", fact: "ArcLens's indexer runs every few minutes and reconciles cached values against live chain state hourly.", source_url: "/admin" },

  // ─── Scope ───────────────────────────────────────────────────────────────
  { key: "scope-singlechain",topic: "arclens-scope", fact: "ArcLens is single-chain (Arc only) by design. It doesn't aggregate multi-chain data like DeFiLlama — but every Arc number is provably correct because there's no oracle dependency.", source_url: "/about" },
  { key: "scope-stables",   topic: "arclens-scope", fact: "ArcLens tracks stablecoin-denominated metrics only (USDC, EURC). It deliberately avoids volatile-asset TVL to prevent price-oracle estimation errors.", source_url: "/about" },
  { key: "scope-nocustody", topic: "arclens-scope", fact: "ArcLens is not a wallet, not a bridge, and does not custody user funds. It reads chain state and stores the rest in its own database.", source_url: "/about" },

  // ─── Stablecoins ─────────────────────────────────────────────────────────
  { key: "stable-both",     topic: "stablecoins", fact: "ArcLens tracks both USDC and EURC on Arc. EURC is Circle's euro-pegged stablecoin, valued in USD at the live EUR→USD rate so TVL and volume read in dollars.", source_url: "/about" },

  // ─── Metrics explained ───────────────────────────────────────────────────
  { key: "metrics-tvl-vol", topic: "metrics-explained", fact: "TVL and Volume are different. TVL (Total Value Locked) is the stablecoins currently held in a project's contracts — a balance/snapshot. Volume is the throughput of swaps over time — a flow. A project can have high TVL and low volume, or the reverse.", source_url: "/about" },
  { key: "metrics-cumvol",  topic: "metrics-explained", fact: "Cumulative volume is the running total of swap notional since a contract was registered. It is NOT the same as TVL and the two should never be added into a single 'total'.", source_url: "/about" },

  // ─── Wallet ──────────────────────────────────────────────────────────────
  { key: "wallet-panel",    topic: "wallet", fact: "ArcLens has a built-in wallet panel — click your connected wallet to see USDC and EURC balances. Circle email-wallet users can Send to any Arc address and Receive to their own; ArcLens never custodies funds and the user authorizes every send with their Circle PIN.", source_url: "/" },

  // ─── Support ─────────────────────────────────────────────────────────────
  { key: "support-contact", topic: "support", fact: "Need help or want to reach the ArcLens team? Email support@arclenz.xyz. Founders manage their project from the dashboard; testers browse and join campaigns on the Trials page.", source_url: "/about" },
]

async function main() {
  const client = await pool.connect()
  try {
    // 0) Stable-key column + unique index (idempotent).
    await client.query(`ALTER TABLE ai_knowledge_base ADD COLUMN IF NOT EXISTS key TEXT`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ai_kb_key_uniq ON ai_knowledge_base(key)`)

    const keys = FACTS.map(f => f.key)

    // 1) Prune retired SYSTEM facts — anything system-owned not in this file,
    //    including legacy keyless rows. Human/admin facts are never touched.
    const pruned = await client.query(
      `DELETE FROM ai_knowledge_base
        WHERE added_by = 'system' AND (key IS NULL OR NOT (key = ANY($1::text[])))`,
      [keys],
    )

    // 2) Upsert by key. Changing a fact's text nulls its embedding so step 3
    //    re-embeds only what changed.
    let changed = 0
    for (const f of FACTS) {
      const r = await client.query(
        `INSERT INTO ai_knowledge_base (key, topic, fact, source_url, added_by)
         VALUES ($1, $2, $3, $4, 'system')
         ON CONFLICT (key) DO UPDATE SET
           topic      = EXCLUDED.topic,
           source_url = EXCLUDED.source_url,
           fact       = EXCLUDED.fact,
           embedding  = CASE WHEN ai_knowledge_base.fact IS DISTINCT FROM EXCLUDED.fact
                             THEN NULL ELSE ai_knowledge_base.embedding END,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted, embedding IS NULL AS needs_embed`,
        [f.key, f.topic, f.fact, f.source_url ?? null],
      )
      if (r.rows[0]?.needs_embed) changed++
    }
    console.log(`Reconciled: ${FACTS.length} system facts, pruned ${pruned.rowCount}, ${changed} need (re)embedding.`)

    // 3) Embed only NULL-embedding rows (new or changed). Skips cleanly if no key.
    if (!apiKey) {
      console.log("No Gemini key set — skipped embedding. Set one and run scripts/embed-kb.mjs to finish.")
    } else {
      const { embed } = await import("ai")
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
      const google = createGoogleGenerativeAI({ apiKey })
      const model = google.textEmbeddingModel("gemini-embedding-001")
      const todo = await client.query(`SELECT id, topic, fact FROM ai_knowledge_base WHERE embedding IS NULL ORDER BY id`)
      console.log(`Embedding ${todo.rows.length} row(s)…`)
      let done = 0
      for (const row of todo.rows) {
        try {
          const { embedding } = await embed({ model, value: `[${row.topic}] ${row.fact}` })
          await client.query(`UPDATE ai_knowledge_base SET embedding = $2::jsonb WHERE id = $1`, [row.id, JSON.stringify(embedding)])
          if (++done % 10 === 0) console.log(`  ${done}/${todo.rows.length}`)
        } catch (e) {
          console.error(`  ! id ${row.id} failed: ${e?.message || e}`)
        }
      }
      console.log(`Embedded ${done}/${todo.rows.length}.`)
    }

    const summary = await client.query(
      `SELECT topic, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
         FROM ai_knowledge_base GROUP BY topic ORDER BY topic`)
    console.log("\nBy topic (rows / embedded):")
    for (const r of summary.rows) console.log("  ", r.topic.padEnd(20), `${r.n} / ${r.embedded}`)
  } catch (e) {
    console.error("Sync failed:", e)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}
main()
