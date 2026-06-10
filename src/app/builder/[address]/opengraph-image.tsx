// Dynamic composed share card for a builder: avatar + name + "Verified builder"
// + what they've shipped, on the ArcLens brand canvas. Same template as the
// per-project card (tiny ArcLens mark; the builder is the hero).
import { ImageResponse } from "next/og"
import { Pool } from "pg"
import { readFile } from "fs/promises"
import { fileURLToPath } from "url"

export const runtime = "nodejs"
export const alt = "Builder on ArcLens"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://arclenz.xyz"

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const addr = (address || "").toLowerCase()

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

  let prof: any = null
  let projects: string[] = []
  try {
    const [a, b] = await Promise.all([
      pool.query(`SELECT display_name, bio, avatar_url, verified FROM builder_profiles WHERE address = $1`, [addr]),
      pool.query(`SELECT name FROM projects WHERE owner_wallet = $1 AND approved = true AND live = true ORDER BY featured DESC, view_count DESC NULLS LAST LIMIT 4`, [addr]),
    ])
    prof = a.rows[0] || null
    projects = b.rows.map((r: any) => r.name).filter(Boolean)
  } catch {}

  const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`
  const name = prof?.display_name || short
  const initial = (name[0] || "?").toUpperCase()
  const verified = !!prof?.verified
  const lineRaw = projects.length
    ? `Building ${projects.slice(0, 3).join(", ")}${projects.length > 3 ? " and more" : ""} on Arc`
    : (prof?.bio ? String(prof.bio) : "Building on Arc")
  const line = lineRaw.length > 86 ? lineRaw.slice(0, 86).replace(/\s+\S*$/, "") + "…" : lineRaw

  // Avatar via proxy → data URL (falls back to an initial avatar).
  let avatarData: string | null = null
  if (prof?.avatar_url) {
    try {
      const r = await fetch(`${BASE}/api/image-proxy?url=${encodeURIComponent(prof.avatar_url)}`)
      const ct = r.headers.get("content-type") || ""
      if (r.ok && ct.startsWith("image/")) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 0 && buf.length < 4_000_000) avatarData = `data:${ct};base64,${buf.toString("base64")}`
      }
    } catch {}
  }

  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px", backgroundColor: "#0a1024", backgroundImage: "linear-gradient(135deg,#070b18 0%,#0a1024 55%,#0c1230 100%)", color: "#eef1f8", fontFamily: "Inter" }}>
      <div style={{ display: "flex", alignItems: "center", opacity: 0.9 }}>
        {markData && <img src={markData} width={28} height={28} style={{ borderRadius: 7, marginRight: 9 }} />}
        <div style={{ display: "flex", fontSize: 21, fontWeight: 700, letterSpacing: -0.3 }}>
          <span style={{ color: "#eef1f8" }}>Arc</span><span style={{ color: "#5b8cff" }}>Lens</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
        {avatarData
          ? <img src={avatarData} width={188} height={188} style={{ borderRadius: 94, objectFit: "cover" }} />
          : <div style={{ width: 188, height: 188, borderRadius: 94, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(135deg,#a855f7,#3b6bff)", fontSize: 96, fontWeight: 700, color: "#fff" }}>{initial}</div>}
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 48, maxWidth: 820 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>{name}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: verified ? "#00c896" : "#8aa0c8", backgroundColor: verified ? "rgba(0,200,150,0.14)" : "rgba(138,160,200,0.12)", padding: "8px 18px", borderRadius: 12 }}>{verified ? "Verified Builder" : "Builder"}</div>
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#9aa8c7", marginTop: 22 }}>{line}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: "#5b8cff" }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#00c896", marginRight: 12 }} />
        arclenz.xyz/builder/{short}
      </div>
    </div>,
  )
}
