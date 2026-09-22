import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/dbPool"
import { enforce } from "@/lib/ratelimit"
import { readOtpProof } from "@/lib/session"
import { ARC_CHAIN_ID, CIRCLE_BLOCKCHAIN } from "@/lib/constants"
import { getCircleEnvironmentError } from "@/lib/circleEnvironment"
import { ensureCircleAccount, promoteCircleWallet } from "@/lib/accountIdentity"

const pool = getPool()
const BASE = "https://api.circle.com"

function apiHeaders(userToken?: string) {
  const h: Record<string, string> = {
    "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
    "Content-Type":  "application/json",
  }
  if (userToken) h["X-User-Token"] = userToken
  return h
}

async function getUserToken(circleUserId: string) {
  const res  = await fetch(`${BASE}/v1/w3s/users/token`, {
    method:  "POST",
    headers: apiHeaders(),
    body:    JSON.stringify({ userId: circleUserId }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || "Token failed")
  return data.data as { userToken: string; encryptionKey: string }
}

async function fetchCircleWallet(userToken: string) {
  const res  = await fetch(`${BASE}/v1/w3s/wallets?blockchain=${encodeURIComponent(CIRCLE_BLOCKCHAIN)}&pageSize=1`, { headers: apiHeaders(userToken) })
  const data = await res.json()
  return data.data?.wallets?.[0] as { id: string; address: string } | undefined
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "circle-session", { limit: 10, windowMs: 60_000 })
  if (blocked) return blocked
  const environmentError = getCircleEnvironmentError()
  if (environmentError) return NextResponse.json({ error: environmentError }, { status: 503 })
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })
    const lower = String(email).toLowerCase().trim()
    if (readOtpProof(req) !== lower) {
      return NextResponse.json({ error: "Verify the code sent to your email first" }, { status: 401 })
    }
    const accountId = await ensureCircleAccount(lower)

    const row = await pool.query(
      "SELECT circle_user_id, wallet_id, wallet_address FROM circle_wallet_users WHERE email = $1 AND chain_id = $2",
      [lower, ARC_CHAIN_ID]
    )

    // ── PATH 1: Cached address + wallet_id → sign-in challenge (PIN required) ──
    if (row.rows.length && row.rows[0].wallet_id) {
      const { circle_user_id, wallet_id, wallet_address } = row.rows[0]
      const { userToken, encryptionKey } = await getUserToken(circle_user_id)
      await pool.query("UPDATE circle_wallet_users SET account_id=$1 WHERE email=$2 AND chain_id=$3", [accountId, lower, ARC_CHAIN_ID])
      if (wallet_address) await promoteCircleWallet(lower, wallet_address)

      const nonce   = crypto.randomUUID()
      const message = `ArcLens Sign-In\n\nWallet: ${wallet_address}\nNonce: ${nonce}`
      const msgHex  = "0x" + Buffer.from(message, "utf8").toString("hex")

      const signRes  = await fetch(`${BASE}/v1/w3s/user/sign/message`, {
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
        console.error("[circle/session] sign/message:", signData)
        return NextResponse.json({ error: "Failed to create sign-in challenge" }, { status: 500 })
      }

      return NextResponse.json({
        userToken,
        encryptionKey,
        challengeId: signData.data.challengeId,
        address:     wallet_address,
        isSignIn:    true,
      })
    }

    // ── PATH 2: Known user but no wallet_id → check Circle for existing wallet ──
    if (row.rows.length) {
      const { circle_user_id } = row.rows[0]
      const { userToken, encryptionKey } = await getUserToken(circle_user_id)
      const existingWallet = await fetchCircleWallet(userToken)

      if (existingWallet) {
        // Store wallet_id + address so next time we use Path 1
        await pool.query(
          "UPDATE circle_wallet_users SET wallet_id=$1, wallet_address=$2, account_id=$3 WHERE email=$4 AND chain_id=$5",
          [existingWallet.id, existingWallet.address.toLowerCase(), accountId, lower, ARC_CHAIN_ID]
        )
        await promoteCircleWallet(lower, existingWallet.address)

        const nonce   = crypto.randomUUID()
        const message = `ArcLens Sign-In\n\nWallet: ${existingWallet.address}\nNonce: ${nonce}`
        const msgHex  = "0x" + Buffer.from(message, "utf8").toString("hex")

        const signRes  = await fetch(`${BASE}/v1/w3s/user/sign/message`, {
          method:  "POST",
          headers: apiHeaders(userToken),
          body:    JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            walletId:       existingWallet.id,
            message:        msgHex,
          }),
        })
        const signData = await signRes.json()
        if (!signRes.ok) {
          console.error("[circle/session] sign/message (path2):", signData)
          return NextResponse.json({ error: "Failed to create sign-in challenge" }, { status: 500 })
        }

        return NextResponse.json({
          userToken,
          encryptionKey,
          challengeId: signData.data.challengeId,
          address:     existingWallet.address.toLowerCase(),
          isSignIn:    true,
        })
      }

      // No wallet on Circle either — user abandoned setup, re-initialize
      // Check only this Circle environment. TEST and LIVE users are separate,
      // even when ArcLens associates both records with the same email account.
      const anyWalletRes = await fetch(`${BASE}/v1/w3s/wallets?pageSize=1`, {
        headers: apiHeaders(userToken),
      })
      const anyWalletData = await anyWalletRes.json()
      if (!anyWalletRes.ok) {
        console.error("[circle/session] list existing wallets:", anyWalletData)
        return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 })
      }
      const hasExistingCircleWallet = !!anyWalletData.data?.wallets?.[0]

      // Existing initialized users add a network; uninitialized users create
      // their PIN and first wallet.
      const walletEndpoint = hasExistingCircleWallet ? "user/wallets" : "user/initialize"
      const initRes  = await fetch(`${BASE}/v1/w3s/${walletEndpoint}`, {
        method:  "POST",
        headers: apiHeaders(userToken),
        body:    JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType:    "EOA",
          blockchains:    [CIRCLE_BLOCKCHAIN],
        }),
      })
      const initData = await initRes.json()
      if (!initRes.ok) {
        console.error("[circle/session] re-initialize:", initData)
        return NextResponse.json({ error: "Failed to create wallet setup", detail: initData }, { status: 500 })
      }
      return NextResponse.json({
        userToken,
        encryptionKey,
        challengeId: initData.data.challengeId,
        walletAction: hasExistingCircleWallet ? "add_network" : "initialize",
      })
    }

    // ── PATH 3: Brand new user → create Circle account + initialize wallet ──
    const circleUserId = crypto.randomUUID()
    const createRes    = await fetch(`${BASE}/v1/w3s/users`, {
      method:  "POST",
      headers: apiHeaders(),
      body:    JSON.stringify({ userId: circleUserId }),
    })
    const createData = await createRes.json()
    // 155101 = user already exists — safe to continue
    if (!createRes.ok && createData.code !== 155101) {
      console.error("[circle/session] create user:", createData)
      return NextResponse.json({ error: "Failed to create Circle user" }, { status: 500 })
    }

    await pool.query(
      `INSERT INTO circle_wallet_users (email, circle_user_id, chain_id, account_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chain_id, email) DO UPDATE SET account_id = EXCLUDED.account_id`,
      [lower, circleUserId, ARC_CHAIN_ID, accountId]
    )

    const { userToken, encryptionKey } = await getUserToken(circleUserId)

    const initRes  = await fetch(`${BASE}/v1/w3s/user/initialize`, {
      method:  "POST",
      headers: apiHeaders(userToken),
      body:    JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        accountType:    "EOA",
        blockchains:    [CIRCLE_BLOCKCHAIN],
      }),
    })
    const initData = await initRes.json()
    if (!initRes.ok) {
      console.error("[circle/session] initialize:", initData)
      return NextResponse.json({ error: "Failed to create wallet setup", detail: initData }, { status: 500 })
    }

    return NextResponse.json({
      userToken,
      encryptionKey,
      challengeId: initData.data.challengeId,
      walletAction: "initialize",
    })
  } catch (e) {
    console.error("[circle/session]", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
