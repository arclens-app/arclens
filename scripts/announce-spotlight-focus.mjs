// Concept B — "lens focus": a blurred bokeh field of the ecosystem with the live
// Spotlight banner snapped into sharp focus. Plays on ArcLens = a lens.
import sharp from "sharp"

const SRC = "C:/Users/eobi6/OneDrive/Pictures/Screenshots/Screenshot 2026-06-11 002503.png"
const W = 1600, H = 900
const ink = "#eef1f8", blue = "#5b8cff", mute = "#9fb0d0", green = "#00c896"
const PAL = ["#3b6bff", "#00b87a", "#a855f7", "#e0883b", "#2775ca", "#e0506e", "#5b8cff", "#00c896", "#7c5cff", "#e0b03b"]

// ── bokeh field: scattered soft circles, blurred + dimmed ──────────────────────
let circles = ""
let seed = 7
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
for (let i = 0; i < 42; i++) {
  const r = 36 + rnd() * 110
  const cx = rnd() * W, cy = rnd() * H
  const c = PAL[Math.floor(rnd() * PAL.length)]
  circles += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${c}" opacity="${(0.4 + rnd() * 0.5).toFixed(2)}"/>`
}
const bokehSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#060810"/>${circles}</svg>`
const bg = await sharp(Buffer.from(bokehSvg)).blur(38).modulate({ brightness: 0.5, saturation: 1.1 }).toBuffer()

// ── focused banner (sharp): crop the Spotlight card out of the live screenshot ─
const banner = await sharp(SRC).extract({ left: 20, top: 204, width: 1873, height: 245 }).toBuffer()
const bw = 1180, bh = Math.round(bw * 245 / 1873)
const bx = Math.round((W - bw) / 2), by = 392
const rad = 14
const bMask = Buffer.from(`<svg width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${rad}" ry="${rad}"/></svg>`)
const bannerR = await sharp(banner).resize(bw, bh).composite([{ input: bMask, blend: "dest-in" }]).png().toBuffer()

// ── overlays: vignette (darken edges), light pool on focus, frame, text ───────
const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="vig" cx="50%" cy="48%" r="62%"><stop offset="0" stop-color="#060810" stop-opacity="0"/><stop offset="0.7" stop-color="#060810" stop-opacity="0.25"/><stop offset="1" stop-color="#040509" stop-opacity="0.85"/></radialGradient>
    <radialGradient id="pool" cx="50%" cy="${((by + bh / 2) / H * 100).toFixed(0)}%" r="44%"><stop offset="0" stop-color="#1a56ff" stop-opacity="0.30"/><stop offset="0.6" stop-color="#1a56ff" stop-opacity="0.06"/><stop offset="1" stop-color="#1a56ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="head" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ink}"/><stop offset="1" stop-color="${blue}"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect width="${W}" height="${H}" fill="url(#pool)"/>

  <g text-anchor="middle">
    <circle cx="${W / 2 - 92}" cy="143" r="5" fill="${green}"/>
    <text x="${W / 2 + 6}" y="149" font-family="Consolas,'DejaVu Sans Mono',monospace" font-size="18" letter-spacing="4" fill="${mute}">NEW ON ARCLENS</text>
    <text x="${W / 2}" y="240" font-family="'Segoe UI Semibold','Segoe UI',Arial,sans-serif" font-size="56" font-weight="800" letter-spacing="-2.5" fill="url(#head)">Everything worth seeing on Arc — in focus.</text>
  </g>

  <rect x="${bx - 1}" y="${by - 1}" width="${bw + 2}" height="${bh + 2}" rx="${rad + 1}" fill="none" stroke="#7ea2ff" stroke-opacity="0.5" stroke-width="2"/>

  <g text-anchor="middle">
    <text x="${W / 2}" y="${by + bh + 70}" font-family="'Segoe UI','Segoe UI',Arial,sans-serif" font-size="26" fill="${ink}">The Ecosystem Spotlight — curated, trust-gated, never noise.</text>
    <text x="${W / 2}" y="${by + bh + 116}" font-family="Consolas,'DejaVu Sans Mono',monospace" font-size="20" letter-spacing="2" fill="${blue}">arclenz.xyz/ecosystem</text>
  </g>
</svg>`

await sharp(bg)
  .composite([{ input: bannerR, left: bx, top: by }, { input: Buffer.from(overlay), left: 0, top: 0 }])
  .png()
  .toFile("arclens-spotlight-announce.png")
console.log("wrote arclens-spotlight-announce.png")
