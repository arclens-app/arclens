// scripts/lens-paying-agent.mjs
//
// DEMO: a real agent paying Lens AI per call over Circle Gateway (x402),
// settling actual test USDC on Arc — and each paid call funds the verified
// builders whose data answered it. Agent-to-agent nanopayments, live.
//
// Usage:
//   BUYER_PRIVATE_KEY=0x... node scripts/lens-paying-agent.mjs \
//       [--base https://arclenz.xyz] [--deposit 0.5]
//
// BUYER_PRIVATE_KEY = a funded Arc wallet: ERC-20 USDC (0x3600…, 6-dec) to spend
// + a little native USDC for gas. The script deposits into Gateway, waits for
// the balance to credit, then pays Lens AI per call. No subscription.

import { GatewayClient } from "@circle-fin/x402-batching/client"

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const pk = process.env.BUYER_PRIVATE_KEY
if (!pk) {
  console.error("✗ Set BUYER_PRIVATE_KEY (a funded Arc wallet: ERC-20 USDC to spend + a little native USDC for gas).")
  process.exit(1)
}

const BASE = arg("--base", "https://arclenz.xyz")
const DEPOSIT = arg("--deposit", "0.5")
const URL = `${BASE}/api/agent`
const PRICE_E6 = 1000n // $0.001/call

// What the agent asks — a human label + the structured call. Each is a distinct
// "agent" (unique x-agent-id) so builder funding fires fresh every time.
const asks = [
  { say: "who are the most trusted projects on Arc?", body: { action: "discover", trusted_only: true, limit: 5 } },
  { say: "is Lunex legit?", body: { action: "trust", target: "lunex" } },
  { say: "show me Lunex's live metrics", body: { action: "project", name: "lunex" } },
]

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: pk.startsWith("0x") ? pk : "0x" + pk })

async function ensureGatewayBalance(needE6) {
  let b = await gateway.getBalances()
  if (BigInt(b.gateway.available) >= needE6) {
    console.log(`Gateway balance ready: ${b.gateway.formattedAvailable} USDC`)
    return
  }
  console.log(`Depositing ${DEPOSIT} USDC into Circle Gateway…`)
  const dep = await gateway.deposit(DEPOSIT)
  console.log(`  deposit tx: ${dep.depositTxHash}`)
  process.stdout.write("  waiting for Gateway to credit")
  for (let i = 0; i < 40; i++) {
    await sleep(2000)
    b = await gateway.getBalances()
    if (BigInt(b.gateway.available) >= needE6) break
    process.stdout.write(".")
  }
  console.log(` ✓  available: ${b.gateway.formattedAvailable} USDC`)
}

try {
  console.log("\n🪙  Lens AI — agent-to-agent nanopayments on Arc (Circle Gateway · x402)\n")
  await ensureGatewayBalance(PRICE_E6 * BigInt(asks.length))

  console.log(`\nAgent → Lens AI  (${URL})\n`)
  let spent = 0
  let fundedCount = 0
  for (let i = 0; i < asks.length; i++) {
    const ask = asks[i]
    const agentId = `demo-agent-${Date.now()}-${i}`
    const t0 = Date.now()
    try {
      const res = await gateway.pay(URL, { method: "POST", body: ask.body, headers: { "x-agent-id": agentId } })
      const ms = Date.now() - t0
      spent += parseFloat(res.formattedAmount || "0")
      const data = res.data ?? res.body ?? {}
      const r = data.result ?? {}
      const verdict =
        r.trust ? `${r.name || ask.body.target || ask.body.name} → ${r.trust}` :
        typeof r.count === "number" ? `${r.count} projects` :
        "ok"
      console.log(`#${i + 1}  "${ask.say}"`)
      console.log(`    paid ${res.formattedAmount} USDC over Gateway (${ms}ms)  ·  Lens AI: ${verdict}`)
      const funded = Array.isArray(data.paid_to_builders) ? data.paid_to_builders : []
      if (funded.length) {
        for (const b of funded) {
          fundedCount++
          console.log(`    → funded builder: ${b.project} ${b.amount}${b.tx ? `  tx ${String(b.tx).slice(0, 14)}…` : ""}`)
        }
      } else {
        console.log(`    → (no new builder payout — trust-gated / already funded recently)`)
      }
      console.log("")
    } catch (e) {
      console.error(`#${i + 1}  "${ask.say}"  FAILED: ${e?.message || e}\n`)
    }
  }
  console.log(`Done. Paid ${spent.toFixed(6)} USDC to Lens AI across ${asks.length} calls; funded ${fundedCount} builder payout(s). Settled on Arc.`)
} catch (e) {
  console.error("✗ agent failed:", e?.message || e)
  process.exit(1)
}
