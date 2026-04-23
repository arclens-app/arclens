import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const PROTECTED_NAMES = ["usdc","circle","arc bridge","arclens","uniswap","aave","compound","metamask"]

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
  const body = await req.json()
  const { address, name, type, description, website, twitter, email, source_code, signature, signer, deployer, warnings } = body

  if (!address?.trim()) return NextResponse.json({ error: "Contract address required" }, { status: 400 })
  if (!name?.trim())    return NextResponse.json({ error: "Contract name required" }, { status: 400 })
  if (!email?.trim())   return NextResponse.json({ error: "Email required" }, { status: 400 })
  if (!signature)       return NextResponse.json({ error: "Wallet signature required" }, { status: 400 })

  const addr = address.trim().toLowerCase()

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