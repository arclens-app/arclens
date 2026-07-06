# ArcLens

**The ecosystem, trust, and intelligence hub for [Arc](https://arc.network) — Circle's stablecoin Layer 1.**

[**Live → arclenz.xyz**](https://arclenz.xyz) · [Docs → docs.arclenz.xyz](https://docs.arclenz.xyz) · [Ask Lens AI → arclenz.xyz/lens](https://arclenz.xyz/lens)

ArcLens is where the Arc ecosystem lives: discover every project, read verified on-chain data, follow the builders shaping the chain, track events, and ask **Lens AI** anything about it.

---

## Lens AI

Lens is ArcLens's intelligence layer — and the first AI that **pays the builders it learns from**.

Ask it anything about Arc and it answers from live on-chain data, then routes a small USDC payment, on-chain, to the teams whose work grounded the answer. Every payout is public and verifiable. It's not about the amount; it's recognition, made real, for the people showing up to build on Arc. This is what an agentic economy should look like: agents that credit the people they're built on.

---

## What's inside

- **Lens AI** — live, grounded answers about Arc, projects, builders, metrics, and events; pays the builders it cites, on-chain.
- **Trust layer** — an on-chain badge ladder (Listed → Identified → Screened → Verified, plus Arc Partner / Official) so anyone can tell proven projects from unproven ones.
- **Metrics** — TVL, volume, and revenue tracking with pluggable methods; on-chain-verified figures rank the leaderboard, protocol-reported figures are clearly labeled.
- **Ecosystem directory** — every project on Arc, categorized, searchable, with live stats and builder profiles.
- **Arc Trials** — trial campaigns that connect builders with testers.
- **Events** — official Arc House events alongside community submissions, with correct local times and one-click calendar add.

---

## Stack

| Layer | Tech |
|---|---|
| **App** | Next.js 16 (App Router), TypeScript, React |
| **Data** | PostgreSQL (Supabase), a resilient on-chain indexer with rate-limit and drift handling |
| **AI** | Vercel AI SDK, Gemini, retrieval over a curated Arc knowledge base |
| **Circle + Arc** | Developer-Controlled Wallets, Gateway (x402), ERC-8004 agent identity, USDC & EURC on Arc |
| **Infra** | Vercel |

---

## Local development

```bash
npm install
npm run dev   # http://localhost:3000
```

Configure your environment first (a PostgreSQL database plus Arc RPC, Circle, and Gemini keys) in `.env.local`. See the [docs](https://docs.arclenz.xyz) for the full configuration.

---

## Links

- **Live:** https://arclenz.xyz
- **Lens AI:** https://arclenz.xyz/lens
- **Docs:** https://docs.arclenz.xyz
- **Arc:** https://arc.network
