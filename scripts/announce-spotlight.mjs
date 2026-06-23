// Original clean style: the Spotlight banner framed large on the Arc-navy brand
// backdrop. Crops to the banner itself so it dominates the frame.
import sharp from "sharp"

const SRC = "C:/Users/eobi6/OneDrive/Pictures/Screenshots/Screenshot 2026-06-11 002503.png"
const W = 1600, H = 900
const ink = "#eef1f8", blue = "#5b8cff", mute = "#8aa0c8", green = "#00c896"

// Crop to just the Spotlight banner (drop the page heading), so it's the hero.
const cropW = 1873, cropH = 245
const banner = await sharp(SRC).extract({ left: 20, top: 204, width: cropW, height: cropH }).toBuffer()

const shotW = 1500
const shotH = Math.round(shotW * cropH / cropW)
const fx = Math.round((W - shotW) / 2)
const fy = 372
const radius = 14
const mask = Buffer.from(`<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="${radius}" ry="${radius}"/></svg>`)
const shot = await sharp(banner).resize(shotW, shotH).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer()

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b18"/><stop offset="0.55" stop-color="#0a1024"/><stop offset="1" stop-color="#0c1230"/></linearGradient>
    <radialGradient id="halo" cx="50%" cy="22%" r="60%"><stop offset="0" stop-color="#1a56ff" stop-opacity="0.26"/><stop offset="0.6" stop-color="#1a56ff" stop-opacity="0.05"/><stop offset="1" stop-color="#1a56ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="head" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ink}"/><stop offset="1" stop-color="${blue}"/></linearGradient>
    <pattern id="grid" width="58" height="58" patternUnits="userSpaceOnUse"><path d="M58 0H0V58" fill="none" stroke="#5b8cff" stroke-opacity="0.045" stroke-width="1"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <ellipse cx="${W / 2}" cy="170" rx="900" ry="360" fill="url(#halo)"/>

  <circle cx="${fx + 5}" cy="180" r="5" fill="${green}"/>
  <text x="${fx + 20}" y="186" font-family="Consolas,'DejaVu Sans Mono',monospace" font-size="18" letter-spacing="3" fill="${mute}">NEW ON ARCLENS</text>
  <text x="${fx}" y="270" font-family="'Segoe UI Semibold','Segoe UI',Arial,sans-serif" font-size="60" font-weight="800" letter-spacing="-2.5" fill="url(#head)">The Ecosystem Spotlight</text>
  <text x="${fx}" y="324" font-family="'Segoe UI','Segoe UI',Arial,sans-serif" font-size="25" fill="${mute}">What's live on Arc — campaigns, events &amp; standout projects, curated and trust-gated.</text>

  <rect x="${fx - 1}" y="${fy - 1}" width="${shotW + 2}" height="${shotH + 2}" rx="${radius + 1}" fill="none" stroke="#5b8cff" stroke-opacity="0.3" stroke-width="1.5"/>

  <text x="${W / 2}" y="${fy + shotH + 70}" text-anchor="middle" font-family="Consolas,'DejaVu Sans Mono',monospace" font-size="20" letter-spacing="2" fill="${blue}">arclenz.xyz/ecosystem</text>
</svg>`

await sharp(Buffer.from(svg)).composite([{ input: shot, left: fx, top: fy }]).png().toFile("arclens-spotlight-announce.png")
console.log("wrote arclens-spotlight-announce.png", `(banner ${shotW}x${shotH})`)
