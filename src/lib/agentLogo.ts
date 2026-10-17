// src/lib/agentLogo.ts
//
// Logo intake for submissions that arrive through the MCP server. The web form
// uploads the file itself (/api/upload); an agent can only hand us a URL. The
// directory renders logos only from our own Blob store or an allowlisted proxy
// host, so a logo left on the project's own domain would show blank. Instead
// we fetch it, check it is a real square image of a sensible size, and on the
// final step copy it into Blob exactly like a form upload.
//
// The fetch reaches an address supplied by a stranger, so it is guarded:
// https only, public hosts only (checked after DNS), redirects followed by
// hand and re-checked, a hard byte cap and a timeout.

import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { put } from "@vercel/blob"

export const LOGO_MIN_PX = 180
export const LOGO_RECOMMENDED_PX = 512
const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 8000

type Kind = "png" | "jpeg" | "webp"
const MIME: Record<Kind, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }

export type LogoCheck =
  | { ok: true; bytes: Uint8Array; kind: Kind; width: number; height: number }
  | { ok: false; error: string }

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === "::1" || v === "::") return true
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  const [a, b] = ip.split(".").map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

async function assertPublicHttps(url: URL): Promise<string | null> {
  if (url.protocol !== "https:") return "The logo URL must start with https://."
  const host = url.hostname.toLowerCase()
  if (isIP(host) || host === "localhost" || /\.(local|internal|localhost)$/.test(host)) return "The logo must be hosted on a public website."
  try {
    const addrs = await lookup(host, { all: true })
    if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) return "The logo must be hosted on a public website."
  } catch {
    return "The logo URL's domain doesn't resolve. Check the link."
  }
  return null
}

/** Width and height from the file header; null if it isn't a PNG, JPEG or WebP. */
export function imageInfo(b: Uint8Array): { kind: Kind; width: number; height: number } | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1]
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { kind: "png", width: u32be(16), height: u32be(20) }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]
      if (marker === 0xff) { i++; continue }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { kind: "jpeg", width: u16be(i + 7), height: u16be(i + 5) }
      }
      i += 2 + u16be(i + 2)
    }
    return null
  }
  const tag = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3])
  if (b.length > 30 && tag(0) === "RIFF" && tag(8) === "WEBP") {
    const chunk = tag(12)
    if (chunk === "VP8 ") return { kind: "webp", width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff }
    if (chunk === "VP8L") {
      return {
        kind: "webp",
        width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
        height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
      }
    }
    if (chunk === "VP8X") {
      return { kind: "webp", width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
    }
  }
  return null
}

/** Fetch and validate a logo. Never throws; returns a message the agent can act on. */
export async function checkLogo(raw: string): Promise<LogoCheck> {
  let url: URL
  try { url = new URL(raw) } catch { return { ok: false, error: "The logo URL isn't a valid link." } }

  let res: Response | null = null
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const blocked = await assertPublicHttps(url)
    if (blocked) return { ok: false, error: blocked }
    try {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "image/png,image/jpeg,image/webp,image/*;q=0.8" } })
    } catch {
      return { ok: false, error: "The logo URL couldn't be reached. Use a direct link to the image file that opens in a browser." }
    }
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null
    if (!next) break
    try { url = new URL(next, url) } catch { return { ok: false, error: "The logo URL redirects somewhere invalid." } }
    res = null
  }
  if (!res) return { ok: false, error: "The logo URL redirects too many times. Use the direct link to the image file." }
  if (!res.ok) return { ok: false, error: `The logo URL returned HTTP ${res.status}. Use a direct link to the image file that opens in a browser.` }

  const declared = Number(res.headers.get("content-length") || 0)
  if (declared > MAX_BYTES) return { ok: false, error: "The logo is larger than 5 MB. Use a smaller file; 512x512 is ideal." }
  const reader = res.body?.getReader()
  if (!reader) return { ok: false, error: "The logo URL returned no image." }
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) { await reader.cancel().catch(() => {}); return { ok: false, error: "The logo is larger than 5 MB. Use a smaller file; 512x512 is ideal." } }
    parts.push(value)
  }
  const bytes = new Uint8Array(total)
  let off = 0
  for (const p of parts) { bytes.set(p, off); off += p.byteLength }

  const info = imageInfo(bytes)
  if (!info) return { ok: false, error: "The logo must be a PNG, JPG or WebP image file (not SVG, GIF, ICO or a web page)." }
  const { width, height } = info
  if (!width || !height) return { ok: false, error: "The logo file looks damaged. Export it again as PNG." }
  if (Math.min(width, height) < LOGO_MIN_PX) {
    return { ok: false, error: `The logo is ${width}x${height}px; the minimum is ${LOGO_MIN_PX}x${LOGO_MIN_PX}px. Use a larger version, ideally ${LOGO_RECOMMENDED_PX}x${LOGO_RECOMMENDED_PX}px.` }
  }
  const ratio = width / height
  if (ratio < 0.9 || ratio > 1.1) {
    return { ok: false, error: `The logo is ${width}x${height}px but must be square, because ArcLens shows logos in a square tile. Use the square logo mark, not a wide wordmark or banner.` }
  }
  return { ok: true, bytes, kind: info.kind, width, height }
}

/** Copy a checked logo into ArcLens Blob storage, like a web-form upload. */
export async function storeLogo(logo: { bytes: Uint8Array; kind: Kind }): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return null
  try {
    const rand = Math.random().toString(36).slice(2, 10)
    const ext = logo.kind === "jpeg" ? "jpg" : logo.kind
    const blob = await put(`uploads/${Date.now()}-${rand}.${ext}`, Buffer.from(logo.bytes), { access: "public", contentType: MIME[logo.kind], token })
    return blob.url
  } catch (e) {
    console.error("[agentLogo] blob upload failed", e)
    return null
  }
}
