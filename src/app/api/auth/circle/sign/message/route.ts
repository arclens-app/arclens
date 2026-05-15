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
    const { email, message } = await req.json()
    if (!email || !message) return NextResponse.json({ error: "email and message required" }, { status: 400 })
    const lower = String(email).toLowerCase().trim()

    const row = await pool.query(
      "SELECT circle_user_id, wallet_id FROM circle_wallet_users WHERE email=$1",
      [lower]
    )
    if (!row.rows.length || !row.rows[0].wallet_id)
      return NextResponse.json({ error: "Circle wallet not set up" }, { status: 404 })

    const { circle_user_id, wallet_id } = row.rows[0]

    const tokenRes  = await fetch(`${BASE}/v1/w3s/users/token`, {
      method:  "POST",
      headers: apiHeaders(),
      body:    JSON.stringify({ userId: circle_user_id }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) return NextResponse.json({ error: "Token failed" }, { status: 500 })
    const { userToken, encryptionKey } = tokenData.data

    const msgHex  = "0x" + Buffer.from(String(message), "utf8").toString("hex")
    const signRes = await fetch(`${BASE}/v1/w3s/user/sign/message`, {
      method:  "POST",
      headers: apiHeaders(userToken),
      body:    JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        walletId:       wallet_id,
        message:        msgHex,
      }),
    })
    const signData = await signRes.json()
    if (!signRes.ok) {
      console.error("[circle/sign/message]", signData)
      return NextResponse.json({ error: "Failed to create signing challenge" }, { status: 500 })
    }

    return NextResponse.json({ userToken, encryptionKey, challengeId: signData.data.challengeId })
  } catch (e) {
    console.error("[circle/sign/message]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
