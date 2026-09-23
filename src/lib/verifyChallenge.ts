export interface VerifyChallengePayload {
  kind: "verify-claim"
  contract_address: string
  name: string
  type?: string | null
  description?: string | null
  website?: string | null
  twitter?: string | null
  email: string
  nonce: string
  issued_at: string
  expires_at: string
  issued_to_wallet: string
}

export function buildVerifyMessage(p: VerifyChallengePayload): string {
  const lines = [
    "ArcLens contract registry claim",
    "",
    `contract: ${p.contract_address}`,
    `name: ${p.name}`,
  ]
  if (p.type) lines.push(`type: ${p.type}`)
  if (p.description) lines.push(`description: ${p.description}`)
  if (p.website) lines.push(`website: ${p.website}`)
  if (p.twitter) lines.push(`twitter: ${p.twitter}`)
  lines.push(
    `email: ${p.email}`,
    "",
    `issued_at: ${p.issued_at}`,
    `expires_at: ${p.expires_at}`,
    `issued_to_wallet: ${p.issued_to_wallet}`,
    `nonce: ${p.nonce}`,
    "",
    "By signing this message you authorize ArcLens to display the contract's",
    "name and identity in the public registry. No on-chain action taken.",
  )
  return lines.join("\n")
}
