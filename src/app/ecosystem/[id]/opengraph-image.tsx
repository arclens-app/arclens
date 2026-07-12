// Dynamic composed share card for a project: logo + name + trust badge + tagline
// on the ArcLens brand canvas. Rendered per /ecosystem/<slug> link so shares are
// designed cards, not a logo in a void. Mirrors the site-wide OG look.
import { ImageResponse } from "next/og"
import { readFile } from "fs/promises"
import { fileURLToPath } from "url"
import { getPool } from "@/lib/dbPool"

export const runtime = "nodejs"
export const alt = "Project on ArcLens"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const pool = getPool()
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://arclenz.xyz"

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Fonts (co-located, read at runtime so they're bundled into the function).
  const [regular, bold, markBuf] = await Promise.all([
    readFile(fileURLToPath(new URL("./Inter-Regular.woff", import.meta.url))),
    readFile(fileURLToPath(new URL("./Inter-Bold.woff", import.meta.url))),
    readFile(fileURLToPath(new URL("./mark.png", import.meta.url))).catch(() => null),
  ])
  const markData = markBuf ? `data:image/png;base64,${markBuf.toString("base64")}` : null
  const fonts = [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ]
  const render = (node: React.ReactElement) => new ImageResponse(node, { ...size, fonts })

  let p: any = null
  try {
    p = (await pool.query(
      `SELECT name, slug, tagline, description, category, logo_url,
              trust_level, recognition, established,
              COALESCE((trust_profile->>'hard_risk')::bool, false) AS hard_risk
         FROM projects WHERE (slug = $1 OR id::text = $1) AND approved = true AND live = true LIMIT 1`,
      [id],
    )).rows[0]
  } catch {}

  if (!p) {
    return render(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0a1024", backgroundImage: "linear-gradient(135deg,#070b18,#0c1230)", color: "#eef1f8", fontFamily: "Inter", fontSize: 56, fontWeight: 700 }}>
        ArcLens
      </div>,
    )
  }

  // Trust signal (notable tiers only; Claimed/Listed show no chip).
  const trust = p.hard_risk ? null
    : p.recognition === "official" ? { label: "Arc Official", fg: "#00c896", bg: "rgba(0,200,150,0.14)" }
    : p.recognition === "partner"  ? { label: "Arc Partner",  fg: "#00c896", bg: "rgba(0,200,150,0.14)" }
    : p.trust_level === "verified" ? { label: "Verified",     fg: "#00c896", bg: "rgba(0,200,150,0.14)" }
    : p.established                ? { label: "Established",   fg: "#5b8cff", bg: "rgba(91,140,255,0.16)" }
    : null

  const name = String(p.name || "")
  const category = String(p.category || "")
  const taglineRaw = String(p.tagline || p.description || `${category || "A project"} on Arc.`)
  let tagline = taglineRaw
  if (taglineRaw.length > 84) { const cut = taglineRaw.slice(0, 84); tagline = cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : 84).trimEnd() + "…" }
  const initial = (name[0] || "?").toUpperCase()

  // Project logo via the image proxy → data URL (falls back to an initial avatar).
  let logoData: string | null = null
  if (p.logo_url) {
    try {
      const r = await fetch(`${BASE}/api/image-proxy?url=${encodeURIComponent(p.logo_url)}`)
      const ct = r.headers.get("content-type") || ""
      if (r.ok && ct.startsWith("image/")) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 0 && buf.length < 4_000_000) logoData = `data:${ct};base64,${buf.toString("base64")}`
      }
    } catch {}
  }

  try {
    return render(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px", backgroundColor: "#0a1024", backgroundImage: "linear-gradient(135deg,#070b18 0%,#0a1024 55%,#0c1230 100%)", color: "#eef1f8", fontFamily: "Inter" }}>
        {/* tiny co-brand — the project's own logo is the hero, ArcLens just marks the source */}
        <div style={{ display: "flex", alignItems: "center", opacity: 0.9 }}>
          {markData && <img src={markData} width={28} height={28} style={{ borderRadius: 7, marginRight: 9 }} />}
          <div style={{ display: "flex", fontSize: 21, fontWeight: 700, letterSpacing: -0.3 }}>
            <span style={{ color: "#eef1f8" }}>Arc</span>
            <span style={{ color: "#5b8cff" }}>Lens</span>
          </div>
        </div>

        {/* logo + identity */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {logoData
            ? <img src={logoData} width={188} height={188} style={{ borderRadius: 40, objectFit: "cover" }} />
            : <div style={{ width: 188, height: 188, borderRadius: 40, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(135deg,#3b6bff,#00b87a)", fontSize: 100, fontWeight: 700, color: "#fff" }}>{initial}</div>}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 48, maxWidth: 820 }}>
            <div style={{ display: "flex", fontSize: 66, fontWeight: 700, letterSpacing: -2 }}>{name}</div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
              {trust && <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: trust.fg, backgroundColor: trust.bg, padding: "8px 18px", borderRadius: 12 }}>{trust.label}</div>}
              {category && <div style={{ display: "flex", fontSize: 26, color: "#8aa0c8", marginLeft: trust ? 18 : 0 }}>{category}</div>}
            </div>
            <div style={{ display: "flex", fontSize: 28, color: "#9aa8c7", marginTop: 22 }}>{tagline}</div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: "#5b8cff" }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#00c896", marginRight: 12 }} />
          arclenz.xyz/ecosystem/{p.slug || id}
        </div>
      </div>,
    )
  } catch {
    return render(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0a1024", color: "#eef1f8", fontFamily: "Inter", fontSize: 64, fontWeight: 700 }}>
        {name || "ArcLens"}
      </div>,
    )
  }
}
