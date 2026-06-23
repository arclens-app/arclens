// Builds a PROFESSIONAL, mysterious teaser of the Lens AI coin — flagship-launch
// style (Binance-tease energy): mostly black, the coin in deep shadow, a premium
// rim-light catching its edge, eyes only faint cool glows. Barely revealed.
// Run: node scripts/teaser-lens.mjs  →  public/lens-teaser.png
import sharp from "sharp"
import { fileURLToPath } from "node:url"

const svg = `
<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="72%">
      <stop offset="0" stop-color="#0a1122"/><stop offset="60%" stop-color="#050810"/><stop offset="100%" stop-color="#02030a"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="46%" r="34%">
      <stop offset="0" stop-color="rgba(59,107,255,0.28)"/><stop offset="100%" stop-color="rgba(59,107,255,0)"/>
    </radialGradient>
    <radialGradient id="orb" cx="40%" cy="32%" r="82%">
      <stop offset="0" stop-color="#1a2540"/><stop offset="50%" stop-color="#0a1122"/><stop offset="100%" stop-color="#04060d"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="rgba(168,206,255,0.95)"/><stop offset="38%" stop-color="rgba(74,120,255,0.35)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <radialGradient id="spec" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="rgba(200,222,255,0.5)"/><stop offset="100%" stop-color="rgba(200,222,255,0)"/>
    </radialGradient>
    <radialGradient id="eye" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="rgba(150,195,255,0.6)"/><stop offset="100%" stop-color="rgba(120,180,255,0)"/>
    </radialGradient>
    <radialGradient id="vig" cx="50%" cy="46%" r="60%">
      <stop offset="0" stop-color="rgba(0,0,0,0)"/><stop offset="78%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
    </radialGradient>
  </defs>

  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#halo)"/>

  <g transform="translate(800,452)">
    <!-- shadowed orb -->
    <circle r="230" fill="url(#orb)"/>
    <!-- premium rim-light catching the upper-left edge -->
    <circle r="230" fill="none" stroke="url(#rim)" stroke-width="3.5"/>
    <circle r="218" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="2"/>
    <!-- faint specular -->
    <ellipse cx="-78" cy="-120" rx="70" ry="34" fill="url(#spec)" opacity="0.5"/>
    <!-- eyes: only faint cool glows, no smile -->
    <circle cx="-66" cy="-18" r="26" fill="url(#eye)"/>
    <circle cx="66" cy="-18" r="26" fill="url(#eye)"/>
    <circle cx="-66" cy="-18" r="4.5" fill="rgba(220,235,255,0.65)"/>
    <circle cx="66" cy="-18" r="4.5" fill="rgba(220,235,255,0.65)"/>
  </g>

  <rect width="1600" height="900" fill="url(#vig)"/>
</svg>`

const out = fileURLToPath(new URL("../public/lens-teaser.png", import.meta.url))
await sharp(Buffer.from(svg)).blur(3).png().toFile(out)
console.log("wrote", out)
