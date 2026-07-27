// scripts/search-card.mjs
// Announcement card (1600x900) for the ecosystem search change. Shows the
// product answering the exact question a user asked — not a feature blurb.
// Hairline rows rather than a grid of boxes; the results are real projects.
// Run: node scripts/search-card.mjs  ->  public/search-card.png
import sharp from "sharp"
import { fileURLToPath } from "node:url"

const SANS = "Segoe UI, Arial, sans-serif"
const MONO = "Consolas, monospace"
const ARC = "#3b6bff", GREEN = "#00b87a", DIM = "#6b7686", INK = "#eef2fb"
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const defs = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="20%" r="95%"><stop offset="0" stop-color="#0a1226"/><stop offset="62%" stop-color="#05070e"/><stop offset="100%" stop-color="#02030a"/></radialGradient>
    <radialGradient id="halo" cx="34%" cy="40%" r="52%"><stop offset="0" stop-color="rgba(59,107,255,0.13)"/><stop offset="100%" stop-color="rgba(59,107,255,0)"/></radialGradient>
    <linearGradient id="archG" x1="32" y1="6" x2="32" y2="52" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffffff"/><stop offset="35%" stop-color="#a0beff"/><stop offset="100%" stop-color="#1845cc"/></linearGradient>
    <linearGradient id="bgG" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#101c3d"/><stop offset="100%" stop-color="#060c20"/></linearGradient>
    <linearGradient id="scanG" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#00d990" stop-opacity="0"/><stop offset="50%" stop-color="#00d990"/><stop offset="100%" stop-color="#00d990" stop-opacity="0"/></linearGradient>
    <linearGradient id="fieldG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.045)"/><stop offset="100%" stop-color="rgba(255,255,255,0.015)"/></linearGradient>
  </defs>`

const logo = (x, y) => `
  <g transform="translate(${x},${y})">
    <g transform="scale(0.7)">
      <rect width="64" height="64" rx="15" fill="url(#bgG)"/>
      <path d="M10 54 C10 54 10 24 32 9 C54 24 54 54 54 54" stroke="url(#archG)" stroke-width="6" stroke-linecap="round" fill="none"/>
      <path d="M20 54 C20 54 20 32 32 21 C44 32 44 54 44 54" stroke="url(#archG)" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.35"/>
      <line x1="16" y1="38" x2="48" y2="38" stroke="url(#scanG)" stroke-width="1.5"/>
      <circle cx="32" cy="38" r="2.5" fill="#00d990" opacity="0.9"/>
    </g>
    <text x="54" y="34" font-family="${SANS}" font-size="24" font-weight="800" letter-spacing="-0.5" fill="${INK}">Arc<tspan fill="${ARC}">Lens</tspan></text>
  </g>`

// Real results, real tags — truncated to three so the row stays readable.
const results = [
  { name: "ArcStash",    tags: "Vault · Stablecoin" },
  { name: "Arc Capital", tags: "Vault · Yield · RWA" },
  { name: "HELIX",       tags: "Vault · Lending · DEX" },
  { name: "XyloNet",     tags: "Vault · Yield · DEX" },
  { name: "Lunex",       tags: "Vault · DEX · Trading" },
]

const ROW_Y = 486, ROW_H = 62
const rows = results.map((r, i) => {
  const y = ROW_Y + i * ROW_H
  return `
  <text x="150" y="${y}" font-family="${SANS}" font-size="25" font-weight="700" fill="${INK}">${esc(r.name)}</text>
  <text x="${1600 - 150}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="15" fill="${DIM}">${esc(r.tags)}</text>
  <line x1="150" y1="${y + 20}" x2="${1600 - 150}" y2="${y + 20}" stroke="rgba(255,255,255,0.07)"/>`
}).join("")

const W = 1600, H = 900
const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>

  ${logo(70, 58)}
  <text x="${W - 70}" y="78" text-anchor="end" font-family="${MONO}" font-size="15" letter-spacing="3" fill="${GREEN}">ECOSYSTEM SEARCH · LIVE</text>

  <!-- the ask -->
  <text x="150" y="212" font-family="${MONO}" font-size="13" letter-spacing="2.4" fill="${DIM}">SOMEONE ASKED</text>
  <text x="150" y="272" font-family="${SANS}" font-size="43" font-weight="800" letter-spacing="-1" fill="${INK}">Are there any USDC vaults on Arc?</text>

  <!-- the search field, mid-query -->
  <rect x="150" y="330" width="900" height="78" rx="16" fill="url(#fieldG)" stroke="rgba(59,107,255,0.34)"/>
  <g transform="translate(192,369)" stroke="${DIM}" stroke-width="2.4" fill="none">
    <circle cx="0" cy="0" r="9"/><line x1="6.5" y1="6.5" x2="13" y2="13" stroke-linecap="round"/>
  </g>
  <text x="228" y="378" font-family="${SANS}" font-size="27" fill="${INK}">usdc vault</text>
  <rect x="392" y="352" width="2.5" height="34" fill="${ARC}"/>
  <text x="1020" y="378" text-anchor="end" font-family="${MONO}" font-size="17" fill="${GREEN}">7 matches</text>

  <!-- before / after, stated plainly -->
  <text x="1090" y="362" font-family="${MONO}" font-size="14" letter-spacing="1.6" fill="#4a5568">YESTERDAY</text>
  <text x="1090" y="392" font-family="${MONO}" font-size="22" font-weight="700" fill="#4a5568">0 results</text>
  <line x1="1088" y1="384" x2="1214" y2="384" stroke="#4a5568" stroke-width="2"/>
  <text x="1290" y="362" font-family="${MONO}" font-size="14" letter-spacing="1.6" fill="${DIM}">TODAY</text>
  <text x="1290" y="392" font-family="${MONO}" font-size="22" font-weight="700" fill="${GREEN}">7 projects</text>

  <line x1="150" y1="446" x2="${W - 150}" y2="446" stroke="rgba(255,255,255,0.12)"/>
  ${rows}

  <text x="150" y="${ROW_Y + (results.length - 1) * ROW_H + 52}" font-family="${MONO}" font-size="15" fill="${DIM}">+ 2 more</text>

  <!-- footer, given room to breathe below the list -->
  <text x="150" y="852" font-family="${SANS}" font-size="23" font-weight="700" fill="#c8d2e8">Search by what a project does. <tspan fill="#8a97b0" font-weight="500">Not just what it is called.</tspan></text>
  <text x="${W - 70}" y="852" text-anchor="end" font-family="${MONO}" font-size="20" letter-spacing="0.5" fill="${GREEN}">arclenz.xyz/ecosystem?q=vault</text>
</svg>`

const out = fileURLToPath(new URL("../public/search-card.png", import.meta.url))
await sharp(Buffer.from(svg)).png().toFile(out)
console.log("wrote", out)
