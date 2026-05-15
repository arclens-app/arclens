import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const BASE = "https://api.circle.com"

function apiHeaders(userToken?: string) {
  const h: Record<string, string> = {
    "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
    "Content-Type":  "application/json",
  }
  if (userToken) h["X-User-Token"] = userToken
  return h
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })
    const lower = String(email).toLowerCase().trim()

    const row = await pool.query(
      "SELECT circle_user_id, wallet_id, wallet_address FROM circle_wallet_users WHERE email = $1",
      [lower]
    )
    if (!row.rows.length)
      return NextResponse.json({ error: "User not found" }, { status: 404 })

    // Cached already
    if (row.rows[0].wallet_address)
      return NextResponse.json({ address: row.rows[0].wallet_address })

    const { circle_user_id } = row.rows[0]

    const tokenRes  = await fetch(`${BASE}/v1/w3s/users/token`, {
      method:  "POST",
      headers: apiHeaders(),
      body:    JSON.stringify({ userId: circle_user_id }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error("[circle/wallet] token:", tokenData)
      return NextResponse.json({ error: "Failed to authenticate with Circle" }, { status: 500 })
    }
    const { userToken } = tokenData.data

    const walletsRes  = await fetch(`${BASE}/v1/w3s/wallets?pageSize=1`, { headers: apiHeaders(userToken) })
    const walletsData = await walletsRes.json()
    if (!walletsRes.ok) {
      console.error("[circle/wallet] wallets:", walletsData)
      return NextResponse.json({ error: "Failed to fetch wallet" }, { status: 500 })
    }

    const wallet  = walletsData.data?.wallets?.[0]
    const address = wallet?.address?.toLowerCase()
    const walletId = wallet?.id

    if (!address)
      return NextResponse.json({ error: "Wallet not ready yet. Please try again." }, { status: 404 })

    // Cache address + wallet_id for future operations
    await pool.query(
      "UPDATE circle_wallet_users SET wallet_address=$1, wallet_id=$2 WHERE email=$3",
      [address, walletId, lower]
    )

    return NextResponse.json({ address })
  } catch (e) {
    console.error("[circle/wallet]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
