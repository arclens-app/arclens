// Resumable Arc mainnet backfill for ArcLensRegistry.
//
// Dry run (default):
//   node --env-file=.env.local scripts/backfill-registry-mainnet.mjs
// Execute:
//   node --env-file=.env.local scripts/backfill-registry-mainnet.mjs --execute
//
// The chain is the checkpoint: every run reads current attestations and writes
// only missing/mismatched records. It never connects to or changes the database.

import { createPublicClient, createWalletClient, http, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const CHAIN_ID = 5042
const RPC = "https://rpc.mainnet.arc.io"
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://arclenz.xyz"
const EXPECTED_REGISTRY = "0x458025a5d469d46243680edbf35c98fa44a1ba2f"
const EXPECTED_ATTESTER = "0x55d73ec313ea8d5f3dee1ebe486a450e76ed597f"
const EST_MARKER = "#established"
const EXECUTE = process.argv.includes("--execute")
const TIER = { listed: 1, claimed: 2, vetted: 3, verified: 4, arc_partner: 5, arc_official: 6 }

const registry = String(process.env.ARCLENS_REGISTRY || "").toLowerCase()
if (registry !== EXPECTED_REGISTRY) throw new Error(`ARCLENS_REGISTRY must be the Arc mainnet registry ${EXPECTED_REGISTRY}`)

const privateKey = process.env.ATTESTER_PRIVATE_KEY
if (!privateKey) throw new Error("ATTESTER_PRIVATE_KEY is missing")
const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`)
if (account.address.toLowerCase() !== EXPECTED_ATTESTER) {
  throw new Error(`Wrong attester wallet. Expected ${EXPECTED_ATTESTER}, received ${account.address}`)
}

const chain = {
  id: CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
}
const publicClient = createPublicClient({ chain, transport: http(RPC) })
const walletClient = createWalletClient({ account, chain, transport: http(RPC) })
const abi = parseAbi([
  "function attester(address) view returns (bool)",
  "function get(address) view returns (uint8 tier, uint64 issuedAt, bool revoked, string ref)",
  "function attest(address subject, uint8 tier, string ref)",
  "function revoke(address subject)",
])

const code = await publicClient.getBytecode({ address: registry })
if (!code || code === "0x") throw new Error("ArcLensRegistry has no bytecode on Arc mainnet")
const authorized = await publicClient.readContract({ address: registry, abi, functionName: "attester", args: [account.address] })
if (!authorized) throw new Error(`${account.address} is not an authorized registry attester`)

const response = await fetch(`${BASE}/api/ecosystem`, { headers: { accept: "application/json" } })
if (!response.ok) throw new Error(`Ecosystem API returned ${response.status}`)
const payload = await response.json()
const projects = Array.isArray(payload) ? payload : (payload.projects || payload.data || [])

function wanted(project) {
  const key = project.recognition === "official" ? "arc_official"
    : project.recognition === "partner" ? "arc_partner"
    : (project.trust_level || "listed")
  const established = !!project.established
  return {
    tier: TIER[key] || 1,
    established,
    revoked: project.trust_profile?.hard_risk === true,
    ref: `arclenz.xyz/ecosystem/${project.slug}${established ? EST_MARKER : ""}`,
  }
}

const records = []
let cursor = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < projects.length) {
    const index = cursor++
    const project = projects[index]
    const r = await fetch(`${BASE}/api/attestation?slug=${encodeURIComponent(project.slug)}`, { headers: { accept: "application/json" } })
    if (!r.ok) throw new Error(`Could not resolve ${project.slug}: HTTP ${r.status}`)
    const data = await r.json()
    if (!/^0x[0-9a-f]{40}$/i.test(data.subject || "")) throw new Error(`Invalid subject for ${project.slug}`)
    const current = await publicClient.readContract({ address: registry, abi, functionName: "get", args: [data.subject] })
    const want = wanted(project)
    const got = { tier: Number(current[0]), issuedAt: Number(current[1]), revoked: current[2], ref: current[3] || "" }
    const matches = got.tier === want.tier && got.revoked === want.revoked && got.ref === want.ref && got.issuedAt > 0
    records[index] = { name: project.name, slug: project.slug, subject: data.subject.toLowerCase(), want, got, matches }
  }
}))

const subjects = new Map()
for (const record of records) {
  const prior = subjects.get(record.subject)
  if (prior) throw new Error(`Duplicate registry subject ${record.subject}: ${prior} and ${record.slug}`)
  subjects.set(record.subject, record.slug)
}

const pending = records.filter(record => !record.matches)
const balance = await publicClient.getBalance({ address: account.address })
console.log(JSON.stringify({
  mode: EXECUTE ? "execute" : "dry-run",
  chainId: CHAIN_ID,
  registry,
  attester: account.address,
  balanceWei: balance.toString(),
  projects: records.length,
  alreadyMatching: records.length - pending.length,
  pending: pending.length,
}, null, 2))

if (!EXECUTE) {
  console.log("Dry run only. Add --execute to publish the pending attestations.")
  process.exit(0)
}

let completed = 0
for (const record of pending) {
  const needsAttest = record.got.tier !== record.want.tier || record.got.ref !== record.want.ref || record.got.issuedAt === 0 || (record.got.revoked && !record.want.revoked)
  if (needsAttest) {
    const hash = await walletClient.writeContract({
      address: registry,
      abi,
      functionName: "attest",
      args: [record.subject, record.want.tier, record.want.ref],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
    if (receipt.status !== "success") throw new Error(`Attestation reverted for ${record.slug}: ${hash}`)
  }
  if (record.want.revoked) {
    const hash = await walletClient.writeContract({ address: registry, abi, functionName: "revoke", args: [record.subject] })
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 })
    if (receipt.status !== "success") throw new Error(`Revocation reverted for ${record.slug}: ${hash}`)
  }
  completed++
  console.log(`[${completed}/${pending.length}] ${record.slug} -> tier ${record.want.tier}${record.want.established ? " + established" : ""}${record.want.revoked ? " + revoked" : ""}`)
}

console.log(JSON.stringify({ ok: true, completed, skipped: records.length - pending.length }, null, 2))
