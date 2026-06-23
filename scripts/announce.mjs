import sharp from "sharp"
import { writeFileSync } from "fs"

const SRC = "C:/Users/eobi6/OneDrive/Pictures/Screenshots/Screenshot 2026-06-07 140956.png"
const W = 1600, H = 900
const ink = "#eef2ff", blue = "#5b8cff", mute = "#8a9bc4", green = "#00d68f"

const meta = await sharp(SRC).metadata()
const shotW = 1380
const shotH = Math.round(shotW * meta.height / meta.width)
const fx = Math.round((W - shotW) / 2)
const fy = 178
const radius = 14

const mask = Buffer.from(`<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="${radius}" ry="${radius}"/></svg>`)
const shot = await sharp(SRC).resize(shotW, shotH).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer()

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b18"/><stop offset="0.55" stop-color="#0a1024"/><stop offset="1" stop-color="#0c1230"/></linearGradient>
    <radialGradient id="halo" cx="50%" cy="18%" r="60%"><stop offset="0" stop-color="#1a56ff" stop-opacity="0.30"/><stop offset="0.6" stop-color="#1a56ff" stop-opacity="0.05"/><stop offset="1" stop-color="#1a56ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="head" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ink}"/><stop offset="1" stop-color="${blue}"/></linearGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#5b8cff" stroke-opacity="0.04" stroke-width="1"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <ellipse cx="${W/2}" cy="120" rx="820" ry="360" fill="url(#halo)"/>

  <circle cx="${fx}" cy="60" r="5" fill="${green}"/>
  <text x="${fx + 16}" y="66" font-family="Consolas,'DejaVu Sans Mono',monospace" font-size="18" fill="${mute}" letter-spacing="3">ARCLENS</text>
  <text x="${fx}" y="132" font-family="'Segoe UI Semibold','Segoe UI',Arial,sans-serif" font-size="50" font-weight="800" letter-spacing="-2" fill="url(#head)">The trust layer for Arc is live.</text>

  <rect x="${fx - 1}" y="${fy - 1}" width="${shotW + 2}" height="${shotH + 2}" rx="${radius + 1}" fill="none" stroke="#5b8cff" stroke-opacity="0.25" stroke-width="1.5"/>

  <text x="${W/2}" y="868" text-anchor="middle" font-family="Consolas,'DejaVu Sans Mono',monospace" font-size="16" fill="${mute}" letter-spacing="2">recognized · audited · established — every verification published on-chain · arclenz.xyz</text>
</svg>`

writeFileSync("scripts/announce.svg", svg)
await sharp(Buffer.from(svg)).composite([{ input: shot, left: fx, top: fy }]).png().toFile("arclens-announce.png")
console.log("wrote arclens-announce.png")
