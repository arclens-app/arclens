// scripts/chat-card.mjs
// Chat-mockup card for X — Lens AI answering a real chain question, rendered like
// the product, with designer polish (depth, glow, gradient borders) at 2x sharpness.
// Run: node scripts/chat-card.mjs  ->  deck/chat-card.png
import sharp from "sharp"
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const SANS = "Segoe UI, Arial, sans-serif"
const MONO = "Consolas, monospace"
const T1 = "#eef1f8", T2 = "#8b93a7", T3 = "#565e72"
const ARC = "#3b6bff", USDC = "#00c896", BDR = "rgba(255,255,255,0.08)"

const face = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="rgba(0,200,150,0.16)"/>
  <g transform="translate(${cx},${cy})">
    <circle r="${r}" fill="#0e1626" stroke="#2c3a5a" stroke-width="1.5"/>
    <circle cx="${-r * 0.34}" cy="${-r * 0.06}" r="${r * 0.17}" fill="#00e6a4"/>
    <circle cx="${r * 0.34}" cy="${-r * 0.06}" r="${r * 0.17}" fill="#00e6a4"/>
    <circle cx="${-r * 0.34}" cy="${-r * 0.06}" r="${r * 0.06}" fill="#eafff7"/>
    <circle cx="${r * 0.34}" cy="${-r * 0.06}" r="${r * 0.06}" fill="#eafff7"/>
    <path d="M ${-r * 0.34} ${r * 0.34} Q 0 ${r * 0.64} ${r * 0.34} ${r * 0.34}" fill="none" stroke="#aad9ff" stroke-width="${Math.max(2, r * 0.1)}" stroke-linecap="round"/>
  </g>`

const svg = `
<svg width="3200" height="1800" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="18%" r="95%"><stop offset="0" stop-color="#0c1428"/><stop offset="62%" stop-color="#05070e"/><stop offset="100%" stop-color="#03040a"/></radialGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="46%"><stop offset="0" stop-color="rgba(59,107,255,0.20)"/><stop offset="100%" stop-color="rgba(59,107,255,0)"/></radialGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e131f"/><stop offset="100%" stop-color="#090c15"/></linearGradient>
    <linearGradient id="pborder" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,255,255,0.14)"/><stop offset="100%" stop-color="rgba(255,255,255,0.03)"/></linearGradient>
    <linearGradient id="txcard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111725"/><stop offset="100%" stop-color="#0c111c"/></linearGradient>
    <linearGradient id="archG" x1="32" y1="6" x2="32" y2="52" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="#a0beff"/><stop offset="100%" stop-color="#1845cc"/></linearGradient>
    <linearGradient id="scanG" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#00d990" stop-opacity="0"/><stop offset="50%" stop-color="#00d990"/><stop offset="100%" stop-color="#00d990" stop-opacity="0"/></linearGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="34"/></filter>
  </defs>

  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>

  <!-- brand + url -->
  <g transform="translate(352,42)">
    <g transform="scale(0.6)"><rect width="64" height="64" rx="15" fill="#101c3d"/><path d="M10 54 C10 54 10 24 32 9 C54 24 54 54 54 54" stroke="url(#archG)" stroke-width="6" stroke-linecap="round" fill="none"/><line x1="16" y1="38" x2="48" y2="38" stroke="url(#scanG)" stroke-width="1.5"/><circle cx="32" cy="38" r="2.5" fill="#00d990" opacity="0.95"/></g>
    <text x="46" y="30" font-family="${SANS}" font-size="22" font-weight="800" letter-spacing="-0.5" fill="#eef2fb">Arc<tspan fill="#3b6bff">Lens</tspan></text>
  </g>
  <text x="1248" y="68" text-anchor="end" font-family="${MONO}" font-size="15" letter-spacing="2" fill="${T3}">arclenz.xyz/lens</text>

  <!-- panel shadow + panel -->
  <rect x="360" y="132" width="880" height="676" rx="26" fill="#000" opacity="0.55" filter="url(#soft)"/>
  <rect x="352" y="104" width="896" height="700" rx="24" fill="url(#panel)"/>
  <rect x="352.75" y="104.75" width="894.5" height="698.5" rx="23.25" fill="none" stroke="url(#pborder)" stroke-width="1.5"/>
  <rect x="366" y="105.5" width="868" height="1" rx="0.5" fill="rgba(255,255,255,0.05)"/>

  <!-- header -->
  ${face(394, 160, 17)}
  <text x="424" y="153" font-family="${SANS}" font-size="19" font-weight="700" letter-spacing="-0.02em"><tspan fill="${ARC}">Lens</tspan><tspan fill="${T2}" font-weight="600" dx="7">AI</tspan></text>
  <circle cx="500" cy="147" r="8" fill="rgba(0,200,150,0.28)"/><circle cx="500" cy="147" r="4" fill="${USDC}"/>
  <text x="424" y="178" font-family="${MONO}" font-size="12" fill="${T3}">live from the chain · /lens</text>
  <line x1="352" y1="205" x2="1248" y2="205" stroke="${BDR}" stroke-width="1"/>

  <!-- user bubble -->
  <rect x="762" y="237" width="452" height="49" rx="14" fill="rgba(59,107,255,0.14)" stroke="rgba(59,107,255,0.32)" stroke-width="1"/>
  <text x="786" y="268" font-family="${SANS}" font-size="15" fill="${T1}">explain this transaction  0xb51b…105cf</text>

  <!-- answer -->
  ${face(394, 348, 15)}
  <text x="426" y="340" font-family="${SANS}" font-size="17.5" font-weight="500" fill="${T1}">Real payment, and it's on-chain.</text>
  <text x="426" y="368" font-family="${SANS}" font-size="15" fill="${T2}">Lens AI paid Lunex, settled on Arc.</text>

  <!-- transaction card -->
  <rect x="426" y="398" width="782" height="214" rx="15" fill="url(#txcard)" stroke="${BDR}" stroke-width="1"/>
  <text x="452" y="432" font-family="${MONO}" font-size="10.5" letter-spacing="1.6" fill="${T3}">TRANSACTION</text>
  <rect x="452" y="446" width="90" height="25" rx="6" fill="rgba(0,200,150,0.14)" stroke="rgba(0,200,150,0.22)" stroke-width="1"/>
  <text x="497" y="463" text-anchor="middle" font-family="${MONO}" font-size="11" font-weight="700" letter-spacing="0.5" fill="${USDC}">SUCCESS</text>
  <text x="562" y="467" font-family="${MONO}" font-size="20" font-weight="700" fill="${T1}">$0.0014</text>

  <text x="452" y="508" font-family="${MONO}" font-size="10" letter-spacing="1.2" fill="${T3}">FROM</text>
  <text x="452" y="531" font-family="${MONO}" font-size="14" fill="${T2}">0xf1bb…a6ba  ·  Lens AI</text>
  <text x="840" y="508" font-family="${MONO}" font-size="10" letter-spacing="1.2" fill="${T3}">TO</text>
  <text x="840" y="531" font-family="${MONO}" font-size="14" fill="${T2}">0xc81b…73fd  ·  Lunex</text>

  <line x1="452" y1="560" x2="1182" y2="560" stroke="${BDR}" stroke-width="1"/>
  <text x="452" y="590" font-family="${MONO}" font-size="13" fill="${T3}">Block 48,785,199</text>
  <text x="1182" y="590" text-anchor="end" font-family="${MONO}" font-size="13" fill="${ARC}">View on explorer ↗</text>

  <!-- grounded footer -->
  <circle cx="432" cy="662" r="4" fill="${USDC}"/>
  <text x="446" y="667" font-family="${MONO}" font-size="12" fill="${T3}">grounded in live Arc data</text>

  <!-- input hint -->
  <line x1="352" y1="730" x2="1248" y2="730" stroke="${BDR}" stroke-width="1"/>
  <rect x="384" y="750" width="768" height="42" rx="12" fill="#0c111c" stroke="${BDR}" stroke-width="1"/>
  <text x="406" y="776" font-family="${SANS}" font-size="14" fill="${T3}">Ask about Arc, USDC, any project…</text>
  <rect x="1164" y="750" width="52" height="42" rx="12" fill="${ARC}"/>
  <path d="M1183 763 l12 8 l-12 8 z" fill="#fff"/>
</svg>`

const dir = fileURLToPath(new URL("../deck", import.meta.url))
mkdirSync(dir, { recursive: true })
const out = `${dir}/chat-card.png`
await sharp(Buffer.from(svg)).png().toFile(out)
console.log("wrote", out)
