"use client"

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID!

async function runSDKChallenge(userToken: string, encryptionKey: string, challengeId: string): Promise<void> {
  if ((window as any).__CIRCLE_SDK_MOCK__) return
  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk")
  // Remove stale message listener before resetting the singleton (see ArcLayout connectCircle)
  const prevSdk = (W3SSdk as any).instance
  if (prevSdk) { try { prevSdk.unSubscribeMessage() } catch {} }
  ;(W3SSdk as any).instance = null
  document.getElementById("sdkIframe")?.remove()
  const sdk = new W3SSdk()
  sdk.setAppSettings({ appId: APP_ID })
  sdk.setAuthentication({ userToken, encryptionKey })
  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error: any) => {
      if (error) reject(new Error(
        error.code === 155706
          ? "Circle wallet window failed to open. Check that this site is allowed in your browser."
          : (error.message || "Circle challenge failed")
      ))
      else resolve()
    })
  })
}

// Sign a plain-text message (personal_sign equivalent).
// Returns a truthy string on success — the signature is verified via PIN completion, not bytes.
export async function circleSignMessage(email: string, message: string): Promise<string> {
  const res  = await fetch("/api/auth/circle/sign/message", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, message }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to create signing challenge")

  await runSDKChallenge(data.userToken, data.encryptionKey, data.challengeId)
  return "circle-ucw-signed"
}

// Execute a contract call (eth_sendTransaction equivalent).
// Returns the on-chain txHash once Circle broadcasts the transaction.
export async function circleSendTransaction(
  email: string,
  contractAddress: string,
  abiFunctionSignature: string,
  abiParameters: string[],
): Promise<string> {
  const res  = await fetch("/api/auth/circle/sign/transaction", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, contractAddress, abiFunctionSignature, abiParameters }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to create transaction challenge")

  await runSDKChallenge(data.userToken, data.encryptionKey, data.challengeId)

  // Give Circle 2 seconds to index, then fetch the txHash
  await new Promise(r => setTimeout(r, 2000))
  const txRes  = await fetch("/api/auth/circle/tx/latest", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email }),
  })
  const txData = await txRes.json()
  if (!txRes.ok) throw new Error(txData.error || "Transaction not confirmed")
  return txData.txHash
}
