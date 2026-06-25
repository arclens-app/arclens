// scripts/lens-paying-agent.mjs
//
// A real paying AGENT that pays Lens AI's /api/agent over Circle Gateway (x402),
// settling actual test USDC on Arc — and every payment funds the verified
// builders whose data answers the call. Agent-to-agent nanopayments, live.
//
// Usage:
//   BUYER_PRIVATE_KEY=0x... node scripts/lens-paying-agent.mjs \
//       [--base https://arclenz.xyz] [--count 6] [--deposit 0.5]
//
// BUYER_PRIVATE_KEY = a funded Arc wallet: needs ERC-20 USDC (0x3600…, 6-dec) to
// spend, plus a little native USDC for gas. The script deposits into Gateway,
// then pays Lens AI per call. No subscription — pure pay-per-call.

import { GatewayClient } from "@circle-fin/x402-batching/client"

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

const pk = process.env.BUYER_PRIVATE_KEY
if (!pk) {
  console.error("✗ Set BUYER_PRIVATE_KEY (a funded Arc wallet: ERC-20 USDC to spend + a little native USDC for gas).")
  process.exit(1)
}

const BASE = arg("--base", "https://arclenz.xyz")
const COUNT = Number(arg("--count", "6"))
const DEPOSIT = arg("--deposit", "0.5")
const URL = `${BASE}/api/agent`

// The agent decides what to ask — rotating through Lens AI's actions.
const calls = [
  { action: "trust", target: "lunex" },
  { action: "discover", trusted_only: true, limit: 5 },
  { action: "project", name: "lunex" },
]

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: pk.startsWith("0x") ? pk : "0x" + pk })

try {
  console.log(`Depositing ${DEPOSIT} USDC into Circle Gateway…`)
  const dep = await gateway.deposit(DEPOSIT)
  console.log("  deposit tx:", dep.depositTxHash)
  const bal = await gateway.getBalances()
  console.log("  gateway available:", bal.gateway.formattedAvailable)

  console.log(`\nPaying Lens AI at ${URL} — ${COUNT} calls:\n`)
  let spent = 0
  for (let i = 0; i < COUNT; i++) {
    const body = calls[i % calls.length]
    const t0 = Date.now()
    try {
      const res = await gateway.pay(URL, { method: "POST", body })
      const ms = Date.now() - t0
      spent += parseFloat(res.formattedAmount || "0")
      const data = res.data ?? res.body ?? null
      const fundedArr = data?.paid_to_builders ?? []
      const funded = Array.isArray(fundedArr) ? fundedArr.map((b) => `${b.project} ${b.amount}`).join(", ") : ""
      console.log(`#${i + 1} ${body.action} → paid ${res.formattedAmount} USDC (${ms}ms)${funded ? ` · funded: ${funded}` : ""}`)
    } catch (e) {
      console.error(`#${i + 1} ${body.action} FAILED: ${e?.message || e}`)
    }
  }
  console.log(`\n✅ Done. Total paid to Lens AI: ${spent.toFixed(6)} USDC — each call also funded the builders it learned from.`)
} catch (e) {
  console.error("✗ agent failed:", e?.message || e)
  process.exit(1)
}
