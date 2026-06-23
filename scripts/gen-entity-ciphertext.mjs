// Generates the ~684-char ENTITY SECRET CIPHERTEXT that Circle's console asks
// for. It encrypts your raw 32-byte entity secret with Circle's public key
// (fetched via your API key). Paste the printed value into the console.
//
// Needs CIRCLE_API_KEY in .env.local. Entity secret: arg, or CIRCLE_ENTITY_SECRET,
// or the default below.
// Run: node scripts/gen-entity-ciphertext.mjs
import { readFileSync } from "node:fs"
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const apiKey = process.env.CIRCLE_API_KEY
const entitySecret = process.argv[2] || process.env.CIRCLE_ENTITY_SECRET
if (!apiKey || !entitySecret) { console.error("✗ Need CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env.local (or pass the secret as an arg)"); process.exit(1) }

const sdk = await import("@circle-fin/developer-controlled-wallets")
const gen = sdk.generateEntitySecretCiphertext || sdk.default?.generateEntitySecretCiphertext
if (!gen) { console.error("✗ generateEntitySecretCiphertext not found. SDK exports:", Object.keys(sdk).join(", ")); process.exit(1) }

const ciphertext = await gen({ apiKey, entitySecret })
console.log("\n=== ENTITY SECRET CIPHERTEXT (paste this into the Circle console) ===\n")
console.log(typeof ciphertext === "string" ? ciphertext : (ciphertext?.data?.entitySecretCiphertext || JSON.stringify(ciphertext)))
console.log("\n(length:", (typeof ciphertext === "string" ? ciphertext.length : "?"), ")")
console.log("\nRaw entity secret to store on Vercel + .env.local (CIRCLE_ENTITY_SECRET):")
console.log(entitySecret)
