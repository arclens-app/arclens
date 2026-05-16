export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import crypto from "crypto"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const BASE = "https://api.circle.com"

const PEPPER = process.env.OTP_PEPPER || "arclens-otp-pepper-v1"

const CIRCLE_HEADERS = {
  "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
  "Content-Type":  "application/json",
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code + PEPPER).digest("hex")
}

function hashesMatch(a: string, b: string): boolean {
  // Constant-time comparison defeats timing-attack guesses on the hash
  const ba = Buffer.from(a, "hex")
  const bb = Buffer.from(b, "hex")
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

function apiHeaders(userToken?: string) {
  const h: Record<string, string> = { ...CIRCLE_HEADERS }
  if (userToken) h["X-User-Token"] = userToken
  return h
}

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json()
    if (!email || !code) return NextResponse.json({ error: "Email and code required" }, { status: 400 })

    const lower = String(email).toLowerCase().trim()
    const cleanCode = String(code).replace(/\D/g, "")
    if (!/^\d{6}$/.test(cleanCode)) {
      return NextResponse.json({ error: "Code must be 6 digits" }, { status: 400 })
    }

    const otpRow = await pool.query(
      "SELECT code_hash, expires_at, attempts FROM otp_codes WHERE email = $1",
      [lower]
    )
    if (!otpRow.rows.length) {
      return NextResponse.json({ error: "No code found. Request a new one." }, { status: 400 })
    }

    const { code_hash, expires_at, attempts } = otpRow.rows[0]

    if (new Date(expires_at) < new Date()) {
      await pool.query("DELETE FROM otp_codes WHERE email = $1", [lower])
      return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 400 })
    }
    if (attempts >= 5) {
      await pool.query("DELETE FROM otp_codes WHERE email = $1", [lower])
      return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 400 })
    }
    if (!hashesMatch(hashCode(cleanCode), code_hash)) {
      await pool.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE email = $1", [lower])
      return NextResponse.json({ error: "Incorrect code" }, { status: 400 })
    }

    // Code valid — consume it
    await pool.query("DELETE FROM otp_codes WHERE email = $1", [lower])

    // Look up or create Circle user
    const userRow = await pool.query(
      "SELECT circle_user_id, wallet_address FROM circle_wallet_users WHERE email = $1",
      [lower]
    )

    let circleUserId: string
    let cachedAddress: string | null = null

    if (userRow.rows.length) {
      circleUserId  = userRow.rows[0].circle_user_id
      cachedAddress = userRow.rows[0].wallet_address
    } else {
      circleUserId = crypto.randomUUID()
      const createRes = await fetch(`${BASE}/v1/w3s/users`, {
        method:  "POST",
        headers: CIRCLE_HEADERS,
        body:    JSON.stringify({ userId: circleUserId }),
      })
      const createData = await createRes.json()
      if (!createRes.ok && createData.code !== 155101) {
        console.error("[otp/verify] create user:", createData)
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
      }
      await pool.query(
        "INSERT INTO circle_wallet_users (email, circle_user_id) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
        [lower, circleUserId]
      )
    }

    // Mint a Circle user session token (server-side, no iframe)
    const tokenRes = await fetch(`${BASE}/v1/w3s/users/token`, {
      method:  "POST",
      headers: CIRCLE_HEADERS,
      body:    JSON.stringify({ userId: circleUserId }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error("[otp/verify] user token:", tokenData)
      return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
    }
    const { userToken, encryptionKey } = tokenData.data

    // Returning user with a cached wallet — done. No iframe needed.
    // Do NOT return userToken/encryptionKey: client doesn't need them and
    // they would let a network observer trigger PIN challenges on this user.
    if (cachedAddress) {
      return NextResponse.json({
        success:       true,
        address:       cachedAddress,
        needsPinSetup: false,
      })
    }

    // Check if Circle already has a wallet for this user
    const walletsRes  = await fetch(`${BASE}/v1/w3s/wallets?pageSize=1`, { headers: apiHeaders(userToken) })
    const walletsData = await walletsRes.json()
    const existing    = walletsData.data?.wallets?.[0]

    if (walletsRes.ok && existing?.address) {
      const addr = String(existing.address).toLowerCase()
      await pool.query(
        "UPDATE circle_wallet_users SET wallet_address = $1, wallet_id = $2 WHERE email = $3",
        [addr, existing.id, lower]
      )
      return NextResponse.json({
        success:       true,
        address:       addr,
        needsPinSetup: false,
      })
    }

    // First-time user — needs to set a PIN via Circle's iframe
    const initRes = await fetch(`${BASE}/v1/w3s/user/initialize`, {
      method:  "POST",
      headers: apiHeaders(userToken),
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        blockchains:    ["ARC-TESTNET"],
        accountType:    "EOA",
      }),
    })
    const initData = await initRes.json()
    if (!initRes.ok) {
      console.error("[otp/verify] user initialize:", initData)
      return NextResponse.json({ error: "Failed to initialize wallet" }, { status: 500 })
    }

    return NextResponse.json({
      success:        true,
      address:        null,
      userToken,
      encryptionKey,
      needsPinSetup:  true,
      challengeId:    initData.data.challengeId,
    })
  } catch (e: any) {
    console.error("[otp/verify]", e)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}
