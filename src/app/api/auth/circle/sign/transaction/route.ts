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

// Accepts a generic contract execution request.
// Caller supplies contractAddress, abiFunctionSignature, abiParameters.
export async function POST(req: NextRequest) {
  try {
    const { email, contractAddress, abiFunctionSignature, abiParameters } = await req.json()
    if (!email || !contractAddress || !abiFunctionSignature)
      return NextResponse.json({ error: "email, contractAddress, abiFunctionSignature required" }, { status: 400 })
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

    const txRes  = await fetch(`${BASE}/v1/w3s/user/transactions/contractExecution`, {
      method:  "POST",
      headers: apiHeaders(userToken),
      body:    JSON.stringify({
        idempotencyKey:       crypto.randomUUID(),
        walletId:             wallet_id,
        contractAddress,
        abiFunctionSignature,
        abiParameters:        abiParameters ?? [],
        feeLevel:             "MEDIUM",
      }),
    })
    const txData = await txRes.json()
    if (!txRes.ok) {
      console.error("[circle/sign/transaction]", txData)
      return NextResponse.json({ error: "Failed to create transaction challenge", detail: txData }, { status: 500 })
    }

    return NextResponse.json({ userToken, encryptionKey, challengeId: txData.data.challengeId })
  } catch (e) {
    console.error("[circle/sign/transaction]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
