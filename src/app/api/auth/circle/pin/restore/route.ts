import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { authorizeCircleUser } from "@/lib/circleAuth"
import { getCircleEnvironmentError } from "@/lib/circleEnvironment"
import { enforce } from "@/lib/ratelimit"

const BASE = "https://api.circle.com"

function headers(userToken?: string) {
  const value: Record<string, string> = {
    Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
    "Content-Type": "application/json",
  }
  if (userToken) value["X-User-Token"] = userToken
  return value
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "circle-pin-restore", { limit: 5, windowMs: 15 * 60_000 })
  if (blocked) return blocked

  const environmentError = getCircleEnvironmentError()
  if (environmentError) return NextResponse.json({ error: environmentError }, { status: 503 })

  try {
    const { email } = await req.json()
    const lower = String(email || "").toLowerCase().trim()
    if (!lower) return NextResponse.json({ error: "Email required" }, { status: 400 })

    // A supplied email is never accepted as identity. The signed, httpOnly
    // Circle session must belong to the wallet mapped to this email.
    const user = await authorizeCircleUser(req, lower, { requireWallet: true })
    if (!user) return NextResponse.json({ error: "Sign in with this Circle wallet first" }, { status: 401 })

    const tokenRes = await fetch(`${BASE}/v1/w3s/users/token`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ userId: user.circle_user_id }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) return NextResponse.json({ error: "Could not start secure recovery" }, { status: 502 })

    const { userToken, encryptionKey } = tokenData.data
    const restoreRes = await fetch(`${BASE}/v1/w3s/user/pin/restore`, {
      method: "POST",
      headers: headers(userToken),
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    })
    const restoreData = await restoreRes.json()
    if (!restoreRes.ok || !restoreData.data?.challengeId) {
      console.error("[circle/pin/restore]", restoreData)
      return NextResponse.json({ error: "Circle could not create a PIN recovery challenge" }, { status: 502 })
    }

    return NextResponse.json({
      userToken,
      encryptionKey,
      challengeId: restoreData.data.challengeId,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[circle/pin/restore]", error)
    return NextResponse.json({ error: "PIN recovery could not be started" }, { status: 500 })
  }
}
