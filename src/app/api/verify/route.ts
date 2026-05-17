import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { enforce } from "@/lib/ratelimit"
import { getSession } from "@/lib/session"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const PROTECTED_NAMES = ["usdc","circle","arc bridge","arclens","uniswap","aave","compound","metamask"]
const ARCSCAN        = "https://testnet.arcscan.app/api/v2"

/**
 * Fetch the actual deployer address for a contract from Blockscout.
 * Server-side fetch so callers can't spoof a deployer field in the request body.
 */
async function fetchDeployer(addr: string): Promise<string | null> {
  try {
    const res = await fetch(`${ARCSCAN}/addresses/${addr}`, { headers: { Accept: "application/json" } })
    if (!res.ok) return null
    const d = await res.json()
    let dep = d?.creator_address_hash || null
    if (!dep) {
      // Some contracts only expose deployer via the smart-contracts endpoint
      const sc = await fetch(`${ARCSCAN}/smart-contracts/${addr}`, { headers: { Accept: "application/json" } })
      if (sc.ok) {
        const s = await sc.json()
        dep = s?.deployer_address || s?.creator_address_hash || null
      }
    }
    return dep ? String(dep).toLowerCase() : null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const list = req.nextUrl.searchParams.get("list")
  if (list) {
    try {
      const result = await pool.query(
        `SELECT address, name, type, description, website, twitter, badge, tx_count, created_at
         FROM contracts WHERE verified = true ORDER BY badge DESC, created_at DESC LIMIT 50`
      )
      return NextResponse.json({ contracts: result.rows })
    } catch {
      return NextResponse.json({ contracts: [] })
    }
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "contract-verify", { limit: 10, windowMs: 60_000 })
  if (blocked) return blocked

  const body = await req.json()
  const { address, name, type, description, website, twitter, email, source_code, warnings } = body

  if (!address?.trim()) return NextResponse.json({ error: "Contract address required" }, { status: 400 })
  if (!name?.trim())    return NextResponse.json({ error: "Contract name required" }, { status: 400 })
  if (!email?.trim())   return NextResponse.json({ error: "Email required" }, { status: 400 })

  const addr = address.trim().toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(addr)) {
    return NextResponse.json({ error: "Invalid contract address" }, { status: 400 })
  }

  // Must be signed in — same session cookie that protects builder profile,
  // founder claim, trials, and update-project. One sign-in covers everything.
  const sess = getSession(req)
  if (!sess) {
    return NextResponse.json({ error: "Sign in with the deployer wallet to claim a contract" }, { status: 401 })
  }

  // Deployer is fetched SERVER-SIDE so the client can't lie about it.
  // The signed-in wallet must match the on-chain deployer of this contract.
  const onChainDeployer = await fetchDeployer(addr)
  if (!onChainDeployer) {
    return NextResponse.json({ error: "Couldn't verify deployer on Arc. The contract may not exist yet, or Arcscan is unreachable." }, { status: 502 })
  }
  if (sess.addr !== onChainDeployer) {
    return NextResponse.json(
      { error: `Only the contract deployer can claim this entry. Deployer on chain is ${onChainDeployer.slice(0,10)}…${onChainDeployer.slice(-6)} — sign in with that wallet.` },
      { status: 403 }
    )
  }
  const deployer = onChainDeployer

  // Check if already claimed
  try {
    const existing = await pool.query("SELECT address, email FROM contracts WHERE address = $1", [addr])
    if (existing.rows.length > 0) {
      const existingEmail = existing.rows[0].email?.toLowerCase()
      const submittedEmail = email.trim().toLowerCase()
      if (existingEmail && existingEmail !== submittedEmail) {
        return NextResponse.json({ error: "This contract has already been claimed. If you are the owner, use the same email you registered with." }, { status: 409 })
      }
      // Same email = update
      await pool.query(
        `UPDATE contracts SET name=$1, type=$2, description=$3, website=$4, twitter=$5,
         source_code=COALESCE($6, source_code), verified=false, deployer=$7
         WHERE address=$8`,
        [name.trim(), type||null, description||null, website||null, twitter||null, source_code||null, deployer||null, addr]
      )
      return NextResponse.json({ success: true, updated: true })
    }
  } catch (e) {
    console.error("[Verify] DB error", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }

  // Check for protected name impersonation
  const lowerName = name.toLowerCase()
  const isProtected = PROTECTED_NAMES.some(p => lowerName.includes(p))

  // New submission
  try {
    await pool.query(
      `INSERT INTO contracts (address, name, type, description, website, twitter, email, source_code, verified, deployer, badge, flag_reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,'claimed',$10,NOW())`,
      [
        addr,
        name.trim(),
        type?.trim()||null,
        description?.trim()||null,
        website?.trim()||null,
        twitter?.trim()||null,
        email.trim(),
        source_code?.trim()||null,
        deployer?.toLowerCase()||null,
        warnings?.length > 0 || isProtected
          ? "⚠ " + (isProtected ? "Protected name. " : "") + (warnings||[]).join(" ")
          : null
      ]
    )
    return NextResponse.json({ success: true, updated: false, verified: false })
  } catch (e) {
    console.error("[Verify POST]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}