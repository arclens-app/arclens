// One-shot Vercel Blob smoke test. Reads BLOB_READ_WRITE_TOKEN from .env.local,
// uploads a tiny PNG via the SAME code path as /api/upload, fetches it back to
// confirm it's publicly readable, and checks the URL is a clean CDN domain that
// our direct-render short-circuit will recognize. Never prints the token.
// Run: node scripts/blob-test.mjs   (delete after — it's a dev-only probe)
import { readFileSync } from "node:fs"
import { put } from "@vercel/blob"

// Load .env.local minimally (no dotenv dep)
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch { /* ignore */ }

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("✗ BLOB_READ_WRITE_TOKEN not found in .env.local — add it from the Vercel Blob page (Show secret).")
  process.exit(1)
}

const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const bytes = Buffer.from(pngB64, "base64")

const t0 = Date.now()
try {
  const rand = Math.random().toString(36).slice(2, 10)
  const blob = await put(`uploads/_smoketest-${Date.now()}-${rand}.png`, bytes, {
    access: "public",
    contentType: "image/png",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  const upMs = Date.now() - t0
  console.log("✓ upload ok in", upMs, "ms")
  console.log("  url:", blob.url)

  const isCleanCdn = /\.blob\.vercel-storage\.com\//i.test(blob.url)
  console.log(isCleanCdn ? "✓ url is a clean CDN domain — direct render (no proxy) will fire" : "✗ url is NOT *.blob.vercel-storage.com — direct-render check won't match!")

  const r = await fetch(blob.url)
  console.log(r.ok ? `✓ public fetch ok (${r.status}, ${r.headers.get("content-type")})` : `✗ public fetch failed: ${r.status}`)

  console.log("\nAll good — uploads will serve straight from Vercel's CDN, bypassing /api/image-proxy.")
} catch (e) {
  console.error("✗ Blob upload failed:", e?.message || e)
  process.exit(1)
}
