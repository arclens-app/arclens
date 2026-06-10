import type { Metadata } from "next"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://arclenz.xyz"

// Per-builder share preview: a shared /builder/<address> link shows the builder's
// name, what they've shipped, and their avatar — not the generic site banner.
export async function generateMetadata(
  { params }: { params: Promise<{ address: string }> }
): Promise<Metadata> {
  const { address } = await params
  const addr = (address || "").toLowerCase()
  try {
    const [profRes, projRes] = await Promise.all([
      pool.query(`SELECT display_name, bio, avatar_url, verified FROM builder_profiles WHERE address = $1`, [addr]),
      pool.query(`SELECT name FROM projects WHERE owner_wallet = $1 AND approved = true AND live = true ORDER BY featured DESC, view_count DESC NULLS LAST LIMIT 4`, [addr]),
    ])
    const prof = profRes.rows[0]
    const projects: string[] = projRes.rows.map((r: any) => r.name).filter(Boolean)

    const name = prof?.display_name || `${addr.slice(0, 6)}…${addr.slice(-4)}`
    const verified = prof?.verified ? "Verified builder" : "Builder"
    const title = `${name} — ${verified} on Arc · ArcLens`
    const shipped = projects.length ? `Building ${projects.slice(0, 3).join(", ")}${projects.length > 3 ? " and more" : ""} on Arc.` : "Building on Arc."
    const description = prof?.bio ? prof.bio.slice(0, 160) : shipped
    const url = `${BASE}/builder/${addr}`

    // The composed share image is supplied by ./opengraph-image.tsx.
    return {
      title,
      description,
      openGraph: { title, description, url, siteName: "ArcLens", type: "profile" },
      twitter: { card: "summary_large_image", title, description },
    }
  } catch {
    return { title: "Builder — ArcLens" }
  }
}

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
