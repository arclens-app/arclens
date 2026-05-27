// src/app/api/project-contracts/route.ts
//
// Founder-facing registry for the contracts that contribute to a project's
// TVL or revenue. Security model mirrors src/app/api/verify/route.ts:
//
//   • POST is gated by a signed-in session — the connected wallet must equal
//     the contract's on-chain deployer (fetched from arcscan, never from the
//     request body). This is what prevents one project from spoofing another's
//     contracts. Same proof of ownership we already use for contract claims.
//
//   • GET allows either a magic-link token or a session that owns the project.
//
// Successful POST also flips `projects.tvl_tracking_enabled = true` so the
// indexer starts picking up the project on the next cron tick.

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { ethers } from "ethers"
import crypto from "crypto"
import { enforce } from "@/lib/ratelimit"
import { getSession } from "@/lib/session"
import { ARC_RPC_HTTP } from "@/lib/constants"
import { canonicalEventSignature, dataArgTypes } from "@/lib/tvl"
import {
  buildChallengeMessage,
  verifyDeployerSignature,
  type ChallengePayload,
} from "@/lib/deployerSig"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const ARCSCAN = "https://testnet.arcscan.app/api/v2"

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function fetchDeployer(addr: string): Promise<string | null> {
  // Identical pattern to src/app/api/verify/route.ts — single source of truth
  // for the deployer is arcscan, never the client.
  try {
    const res = await fetch(`${ARCSCAN}/addresses/${addr}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    })
    if (res.ok) {
      const d = await res.json()
      if (d?.creator_address_hash) return String(d.creator_address_hash).toLowerCase()
    }
    const sc = await fetch(`${ARCSCAN}/smart-contracts/${addr}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    })
    if (sc.ok) {
      const s = await sc.json()
      const dep = s?.deployer_address || s?.creator_address_hash
      if (dep) return String(dep).toLowerCase()
    }
  } catch {}
  return null
}

async function fetchCreationBlock(addr: string): Promise<number | null> {
  // Best-effort start_block default; founders can override in the UI.
  try {
    const res = await fetch(`${ARCSCAN}/addresses/${addr}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    })
    if (res.ok) {
      const d = await res.json()
      const txHash = d?.creation_tx_hash || d?.creation_transaction_hash
      if (txHash) {
        const txRes = await fetch(`${ARCSCAN}/transactions/${txHash}`, {
          headers: { Accept: "application/json" },
          next: { revalidate: 300 },
        })
        if (txRes.ok) {
          const tx = await txRes.json()
          const bn = tx?.block_number ?? tx?.block
          if (bn != null) return Number(bn)
        }
      }
    }
  } catch {}
  return null
}

async function resolveProject(slug: string, sess: ReturnType<typeof getSession>, token: string | null) {
  // Token path mirrors /api/update-project
  if (token) {
    const r = await pool.query(
      `SELECT id, slug, owner_wallet, claim_token_expires
       FROM projects WHERE (slug = $1 OR id::text = $1) AND claim_token = $2`,
      [slug, token],
    )
    if (r.rows.length > 0 && new Date(r.rows[0].claim_token_expires) >= new Date()) {
      return r.rows[0]
    }
  }
  if (sess) {
    const r = await pool.query(
      `SELECT id, slug, owner_wallet
       FROM projects WHERE (slug = $1 OR id::text = $1) AND owner_wallet = $2`,
      [slug, sess.addr],
    )
    if (r.rows.length > 0) return r.rows[0]
  }
  return null
}

// ─── GET — list a project's tracked contracts ────────────────────────────────
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")
  const token = req.nextUrl.searchParams.get("token")
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 })

  const sess = getSession(req)
  const project = await resolveProject(slug, sess, token)
  if (!project) return NextResponse.json({ error: "Unauthorized" }, { status: 403 })

  try {
    const r = await pool.query(
      `SELECT id, project_id, address, role, label, start_block,
              deployer_address, verified_at, revoked_at, revoke_reason, created_at
       FROM project_contracts
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [project.id],
    )
    return NextResponse.json({ contracts: r.rows })
  } catch (e) {
    console.error("[project-contracts GET]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// ─── POST — register a new contract ──────────────────────────────────────────
//
// Proof model: the project owner's hot wallet sits in the SESSION. The
// deployer wallet NEVER connects — its proof comes through an EIP-191
// off-chain signature over a canonical message issued by /challenge.
//
// We accept either an EOA signature (verified via ethers.verifyMessage)
// or an EIP-1271 contract-wallet signature (verified by calling
// isValidSignature on the deployer if it's a contract — covers Safe etc).

const CHALLENGE_TTL_MS = 10 * 60 * 1000

function challengeSecret(): Buffer {
  const s = process.env.SESSION_SECRET || ""
  if (!s || s.length < 32) {
    return crypto.createHash("sha256")
      .update("arclens-dev-challenge-fallback-do-not-use-in-prod").digest()
  }
  return crypto.createHash("sha256").update(s + "::challenge").digest()
}

function verifyChallengeToken(token: string): ChallengePayload | null {
  if (!token || typeof token !== "string") return null
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = Buffer.from(
    crypto.createHmac("sha256", challengeSecret()).update(body).digest(),
  ).toString("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ChallengePayload
    if (!payload || typeof payload !== "object") return null
    // TTL check
    const exp = Date.parse(payload.expires_at)
    if (!Number.isFinite(exp) || exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "project-contracts", { limit: 10, windowMs: 60_000 })
  if (blocked) return blocked

  try {
    const body = await req.json()
    const {
      challenge_token,
      signed_message,
      signature,
      // legacy token (magic-link) is no longer accepted for POST — read-only via GET.
    } = body

    // 1. Auth: project owner's hot-wallet session.
    const sess = getSession(req)
    if (!sess) {
      return NextResponse.json(
        { error: "Sign in first (with any wallet that owns the project)." },
        { status: 401 },
      )
    }

    // 2. Recover & TTL-check the challenge payload. This is what binds the
    //    signature to a specific (project, address, role, volume_*) tuple.
    const payload = verifyChallengeToken(challenge_token)
    if (!payload) {
      return NextResponse.json(
        { error: "Challenge token missing, expired, or tampered. Click 'Get signing message' again." },
        { status: 400 },
      )
    }

    // 3. The session that requested the challenge must equal the session
    //    submitting it. Stops one logged-in user from posting another's
    //    challenge response.
    if (payload.issued_to_wallet.toLowerCase() !== sess.addr) {
      return NextResponse.json(
        { error: "Challenge was issued to a different wallet. Re-request the signing message." },
        { status: 403 },
      )
    }

    // 4. Re-hydrate the canonical message from the payload and compare to
    //    what the founder actually signed. This catches client-side tampering.
    const expectedMessage = buildChallengeMessage(payload)
    if (typeof signed_message !== "string" || signed_message !== expectedMessage) {
      return NextResponse.json(
        { error: "Signed message doesn't match the canonical text. Sign the message exactly as shown — no edits, no extra whitespace." },
        { status: 400 },
      )
    }

    if (!signature) {
      return NextResponse.json({ error: "signature required" }, { status: 400 })
    }

    // 5. Look up the project & confirm session ownership matches.
    const proj = await pool.query(
      `SELECT id, slug FROM projects WHERE slug = $1 AND owner_wallet = $2 LIMIT 1`,
      [payload.project_slug, sess.addr],
    )
    if (proj.rows.length === 0) {
      return NextResponse.json({ error: "You don't own this project" }, { status: 403 })
    }
    const project = proj.rows[0]

    // 6. Contract sanity — must have bytecode on Arc.
    const provider = new ethers.JsonRpcProvider(ARC_RPC_HTTP)
    const code = await provider.getCode(payload.contract_address)
    if (!code || code === "0x") {
      return NextResponse.json(
        { error: "No contract bytecode found at this address on Arc. Check the network and address." },
        { status: 400 },
      )
    }

    // 7. Fetch the on-chain deployer authoritatively from arcscan — never
    //    accept a client-supplied deployer.
    const onChainDeployer = await fetchDeployer(payload.contract_address)
    if (!onChainDeployer) {
      return NextResponse.json(
        { error: "Couldn't verify the deployer on Arc. The contract may not be indexed yet, or arcscan is unreachable." },
        { status: 502 },
      )
    }

    // 8. Verify the off-chain signature against the on-chain deployer.
    //    Tries EOA personal_sign first; falls back to EIP-1271 if the deployer
    //    is itself a contract (Safe multisig and friends).
    const sigCheck = await verifyDeployerSignature(
      signed_message, signature, onChainDeployer, provider,
    )
    if (!sigCheck.ok) {
      return NextResponse.json(
        {
          error: `Signature did not match the on-chain deployer ${onChainDeployer.slice(0, 10)}…${onChainDeployer.slice(-6)}. ${sigCheck.reason ?? ""}`,
          method: sigCheck.method,
          recovered: sigCheck.recovered,
          deployer: onChainDeployer,
        },
        { status: 403 },
      )
    }

    // 9. Volume-only sanity (defense in depth — same checks the /challenge
    //    endpoint already did, but values could differ if someone hand-built
    //    a token).
    let volumeTopic: string | null = null
    if (payload.role === "volume") {
      const sig = payload.volume_event_signature
      if (!sig) {
        return NextResponse.json({ error: "Challenge payload missing volume_event_signature" }, { status: 400 })
      }
      const dataTypes = dataArgTypes(sig)
      if (dataTypes.length === 0 || (payload.volume_amount_arg ?? -1) >= dataTypes.length) {
        return NextResponse.json({ error: "Volume event arg out of range" }, { status: 400 })
      }
      const scRes = await pool.query(
        `SELECT id FROM stablecoins WHERE id = $1 AND active = true`,
        [payload.volume_stablecoin_id],
      )
      if (scRes.rows.length === 0) {
        return NextResponse.json({ error: "volume_stablecoin_id not in active registry" }, { status: 400 })
      }
      volumeTopic = ethers.id(canonicalEventSignature(sig))
    }

    // 10. Resolve start_block.
    const currentBlock = await provider.getBlockNumber()
    let sb: number
    if (payload.start_block != null) {
      sb = Math.max(0, Math.min(currentBlock, payload.start_block))
    } else {
      const creation = await fetchCreationBlock(payload.contract_address)
      sb = creation != null ? creation : currentBlock
    }
    const addr = payload.contract_address
    const role = payload.role
    const label = payload.label

    const inserted = await pool.query(
      `INSERT INTO project_contracts
         (project_id, address, role, label, start_block,
          deployer_address, signed_message, deployer_sig, verified_at,
          volume_event_signature, volume_event_topic, volume_amount_arg, volume_stablecoin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12)
       ON CONFLICT (project_id, address, role) DO UPDATE SET
         label                  = COALESCE(EXCLUDED.label, project_contracts.label),
         start_block            = EXCLUDED.start_block,
         revoked_at             = NULL,
         revoke_reason          = NULL,
         verified_at            = NOW(),
         signed_message         = EXCLUDED.signed_message,
         deployer_sig           = EXCLUDED.deployer_sig,
         volume_event_signature = EXCLUDED.volume_event_signature,
         volume_event_topic     = EXCLUDED.volume_event_topic,
         volume_amount_arg      = EXCLUDED.volume_amount_arg,
         volume_stablecoin_id   = EXCLUDED.volume_stablecoin_id
       RETURNING id`,
      [
        project.id, addr, role,
        label ?? null,
        sb,
        onChainDeployer,
        signed_message,    // full canonical text — auditable later
        signature,         // raw signature bytes — auditable later
        payload.role === "volume" ? payload.volume_event_signature ?? null : null,
        payload.role === "volume" ? volumeTopic : null,
        payload.role === "volume" ? payload.volume_amount_arg ?? null : null,
        payload.role === "volume" ? payload.volume_stablecoin_id ?? null : null,
      ],
    )

    await pool.query(
      `UPDATE projects SET tvl_tracking_enabled = true WHERE id = $1`,
      [project.id],
    )

    return NextResponse.json({
      success: true,
      contract_id: inserted.rows[0].id,
      address: addr,
      role,
      start_block: sb,
      deployer: onChainDeployer,
      verification_method: sigCheck.method,  // 'eoa' or 'eip1271' for audit
      message: "Tracked. The indexer picks it up on the next cron tick (≤5 min).",
    })
  } catch (e: any) {
    console.error("[project-contracts POST]", e)
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 })
  }
}
