import type { Metadata } from "next"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const isNumeric = /^\d+$/.test(id)

  try {
    const res = await pool.query(
      `SELECT title, tagline, description, type, campaign_logo, project_logo, project_name
       FROM campaigns WHERE ${isNumeric ? "id = $1" : "slug = $1"}`,
      [isNumeric ? Number(id) : id]
    )
    const c = res.rows[0]
    if (!c) return { title: "Campaign — Arc Trials" }

    const title       = `${c.title} — Arc Trials`
    const description = c.tagline || c.description?.slice(0, 160) || "A verified testing campaign on Arc Testnet."
    const image       = c.campaign_logo || c.project_logo || null

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        siteName: "ArcLens",
        type: "website",
        ...(image ? { images: [{ url: image, width: 400, height: 400 }] } : {}),
      },
      twitter: {
        card: image ? "summary_large_image" : "summary",
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    }
  } catch {
    return { title: "Campaign — Arc Trials" }
  }
}

export default function CampaignLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
