// Build the branded site-wide share/OG image (1200x630): the real ArcLens logo
// on a crafted brand canvas with product-forward copy. Writes
// public/og-image-v2.png. Run: node scripts/og-build.mjs
import sharp from "sharp"

const W = 1200, H = 630
const ink = "#eef2ff", blue = "#5b8cff", mute = "#8aa0c8", green = "#00c896"

const LOGO = 300
const lx = 92, ly = Math.round((H - LOGO) / 2)
const tx = lx + LOGO + 60

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b18"/><stop offset="0.55" stop-color="#0a1024"/><stop offset="1" stop-color="#0c1230"/></linearGradient>
    <radialGradient id="halo" cx="22%" cy="50%" r="46%"><stop offset="0" stop-color="#1a56ff" stop-opacity="0.30"/><stop offset="0.6" stop-color="#1a56ff" stop-opacity="0.06"/><stop offset="1" stop-color="#1a56ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="head" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ink}"/><stop offset="1" stop-color="${blue}"/></linearGradient>
    <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M56 0H0V56" fill="none" stroke="#5b8cff" stroke-opacity="0.045" stroke-width="1"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <ellipse cx="240" cy="315" rx="540" ry="430" fill="url(#halo)"/>

  <text x="${tx}" y="200" font-family="Consolas,'DejaVu Sans Mono',monospace" font-size="16" letter-spacing="3.5" fill="${mute}">ECOSYSTEM · CAMPAIGNS · ON-CHAIN TRUST</text>

  <text x="${tx}" y="272" font-family="'Segoe UI Semibold','Segoe UI',Arial,sans-serif" font-size="56" font-weight="800" letter-spacing="-2.5" fill="url(#head)">The Ecosystem &amp;</text>
  <text x="${tx}" y="338" font-family="'Segoe UI Semibold','Segoe UI',Arial,sans-serif" font-size="56" font-weight="800" letter-spacing="-2.5" fill="url(#head)">Campaign Hub for Arc</text>

  <text x="${tx}" y="392" font-family="'Segoe UI','Segoe UI',Arial,sans-serif" font-size="22" fill="${mute}">Discover every project · Join campaigns · Earn rewards</text>

  <line x1="${tx}" y1="424" x2="${tx + 210}" y2="424" stroke="${blue}" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="${tx + 6}" cy="456" r="5" fill="${green}"/>
  <text x="${tx + 20}" y="462" font-family="Consolas,'DejaVu Sans Mono',monospace" font-size="19" letter-spacing="1.5" fill="${blue}">arclenz.xyz</text>
</svg>`

// Crop the app-icon's light outer frame, then re-round so the logo reads as a
// clean dark mark on the canvas instead of a pasted white sticker.
const inner = await sharp("public/icon-512x512.png").extract({ left: 22, top: 22, width: 468, height: 468 }).resize(LOGO, LOGO).toBuffer()
const r = Math.round(LOGO * 0.2)
const mask = Buffer.from(`<svg width="${LOGO}" height="${LOGO}"><rect width="${LOGO}" height="${LOGO}" rx="${r}" ry="${r}"/></svg>`)
const logo = await sharp(inner).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer()
await sharp(Buffer.from(svg))
  .composite([{ input: logo, left: lx, top: ly }])
  .png()
  .toFile("public/og-image-v2.png")
console.log("wrote public/og-image-v2.png")
