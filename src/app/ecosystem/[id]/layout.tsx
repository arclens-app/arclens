import type { Metadata } from "next"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://arclenz.xyz"

// Per-project share preview: a shared /ecosystem/<slug> link shows THIS project's
// name, trust signal, tagline, and its own logo — not the generic site banner.
// Mirrors the campaign (trials) generateMetadata pattern already used here.
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  try {
    const res = await pool.query(
      `SELECT name, slug, tagline, description, category, logo_url,
              trust_level, recognition, established,
              COALESCE((trust_profile->>'hard_risk')::bool, false) AS hard_risk
         FROM projects WHERE (slug = $1 OR id::text = $1) AND approved = true AND live = true`,
      [id]
    )
    const p = res.rows[0]
    if (!p) return { title: "Project — ArcLens" }

    // Trust signal up front so the share itself communicates standing.
    const trust = p.hard_risk ? null
      : p.recognition === "official" ? "Arc Official"
      : p.recognition === "partner"  ? "Arc Partner"
      : p.trust_level === "verified" ? "Verified"
      : p.established ? "Established"
      : p.trust_level === "claimed" ? "Claimed" : null

    const title = `${p.name} on Arc — ArcLens`
    const blurb = p.tagline || (p.description ? p.description.slice(0, 140) : `${p.category || "A project"} on Arc.`)
    const description = `${trust ? trust + " · " : ""}${blurb}`
    const url = `${BASE}/ecosystem/${p.slug || id}`

    // The composed share image is supplied by ./opengraph-image.tsx (logo + name
    // + trust badge + tagline on the brand canvas). We only set title/description
    // here; Next merges the generated image in automatically.
    return {
      title,
      description,
      openGraph: { title, description, url, siteName: "ArcLens", type: "website" },
      twitter: { card: "summary_large_image", title, description },
    }
  } catch {
    return { title: "Project — ArcLens" }
  }
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
