// src/lib/deployerSig.ts
//
// Off-chain signature verification for the deployer-claim flow.
//
// Why this exists: the original /api/verify pattern required the deployer
// wallet to actively hold an ArcLens session. That's wrong — deployer wallets
// are usually hardware-protected / multisig / cold storage and shouldn't be
// touching a third-party web UI for stat verification.
//
// This module verifies an off-chain personal_sign signature against the
// contract's on-chain deployer:
//   • EOA case  — ethers.verifyMessage() recovers the signer.
//   • Contract  — falls back to EIP-1271 isValidSignature(hash, sig). This
//                 covers Safe multisigs and any other smart-contract wallet
//                 that exposes the standard interface.

import { ethers } from "ethers"

// keccak256("isValidSignature(bytes32,bytes)").slice(0, 8) — bytes4 magic value.
const EIP1271_MAGIC = "0x1626ba7e"

const EIP1271_ABI = [
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]

export interface VerifyResult {
  ok: boolean
  method: "eoa" | "eip1271" | "none"
  recovered?: string  // populated on EOA path even when it mismatches — useful for debugging
  reason?: string
}

/**
 * Verify that `signature` over `message` (EIP-191 personal_sign envelope)
 * was produced by `claimedSigner`, supporting both EOA and EIP-1271 contract
 * wallets.
 */
export async function verifyDeployerSignature(
  message: string,
  signature: string,
  claimedSigner: string,
  provider: ethers.Provider,
): Promise<VerifyResult> {
  const claimed = (claimedSigner || "").toLowerCase()
  if (!claimed) return { ok: false, method: "none", reason: "no signer claimed" }
  if (!signature || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return { ok: false, method: "none", reason: "signature is not hex" }
  }

  // 1) EOA path — direct recovery via personal_sign envelope.
  let recovered: string | undefined
  try {
    const r = ethers.verifyMessage(message, signature)
    recovered = r.toLowerCase()
    if (recovered === claimed) {
      return { ok: true, method: "eoa", recovered }
    }
  } catch {
    // verifyMessage throws on malformed signatures — fall through to EIP-1271
  }

  // 2) EIP-1271 — only meaningful when the claimed signer is itself a contract.
  let code: string
  try {
    code = await provider.getCode(claimed)
  } catch {
    return {
      ok: false, method: "eoa", recovered,
      reason: `EOA recovery returned ${recovered ?? "?"} (no contract bytecode at ${claimed} to attempt EIP-1271)`,
    }
  }
  if (code === "0x") {
    return {
      ok: false, method: "eoa", recovered,
      reason: `signature recovered to ${recovered ?? "?"}, which does not match the on-chain deployer ${claimed}`,
    }
  }

  try {
    const contract = new ethers.Contract(claimed, EIP1271_ABI, provider)
    const hash = ethers.hashMessage(message) // EIP-191 envelope hash
    const result: string = await contract.isValidSignature(hash, signature)
    if (typeof result === "string" && result.toLowerCase() === EIP1271_MAGIC) {
      return { ok: true, method: "eip1271" }
    }
    return {
      ok: false, method: "eip1271",
      reason: `deployer contract returned ${result} (expected ${EIP1271_MAGIC}) from isValidSignature`,
    }
  } catch (e: any) {
    return {
      ok: false, method: "eip1271",
      reason: `EIP-1271 call reverted: ${e?.message || e}`,
    }
  }
}

/**
 * Build the canonical, human-readable message that the deployer signs.
 * The text is deliberately self-describing so a founder pasting it into a
 * hardware-wallet prompt can tell at a glance what they're authorizing.
 *
 * Fields are formatted as "key: value" on separate lines. The exact serialization
 * is stable so the server can re-construct & string-compare without parsing.
 */
export interface ChallengePayload {
  project_slug: string
  contract_address: string   // lowercase 0x…
  role: "tvl" | "revenue" | "treasury" | "volume"
  start_block?: number | null
  label?: string | null
  // Volume-only — keep undefined when role !== 'volume'
  volume_event_signature?: string
  volume_amount_arg?: number
  volume_stablecoin_id?: number
  // Required for replay protection
  nonce: string
  issued_at: string          // ISO 8601
  expires_at: string         // ISO 8601, typically +10min
  // Audit: the hot-wallet session that requested this challenge
  issued_to_wallet: string   // lowercase 0x…
}

export function buildChallengeMessage(p: ChallengePayload): string {
  const lines: string[] = [
    "ArcLens contract registration",
    "",
    `project: ${p.project_slug}`,
    `contract: ${p.contract_address}`,
    `role: ${p.role}`,
  ]
  if (p.label) lines.push(`label: ${p.label}`)
  if (p.start_block != null) lines.push(`start_block: ${p.start_block}`)
  if (p.role === "volume") {
    if (p.volume_event_signature) lines.push(`volume_event_signature: ${p.volume_event_signature}`)
    if (p.volume_amount_arg != null) lines.push(`volume_amount_arg: ${p.volume_amount_arg}`)
    if (p.volume_stablecoin_id != null) lines.push(`volume_stablecoin_id: ${p.volume_stablecoin_id}`)
  }
  lines.push(
    "",
    `issued_at: ${p.issued_at}`,
    `expires_at: ${p.expires_at}`,
    `issued_to_wallet: ${p.issued_to_wallet}`,
    `nonce: ${p.nonce}`,
    "",
    "By signing this message you authorize ArcLens to display the contract's",
    "USDC/stablecoin metrics under this project. No on-chain action taken.",
  )
  return lines.join("\n")
}
