import type { Metadata } from "next"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://arclenz.xyz"

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const isNumeric = /^\d+$/.test(id)

  try {
    const res = await pool.query(
      `SELECT title, tagline, description, type, campaign_logo, project_logo, project_name,
              slug, reward_type, reward_usdc_amount
       FROM campaigns WHERE ${isNumeric ? "id = $1" : "slug = $1"}`,
      [isNumeric ? Number(id) : id]
    )
    const c = res.rows[0]
    if (!c) return { title: "Campaign — Arc Trials" }

    // Title format includes project name so shared previews don't all look alike
    const title       = c.project_name
      ? `${c.title} — ${c.project_name} on Arc Trials`
      : `${c.title} — Arc Trials`
    const reward = c.reward_type === "usdc" && c.reward_usdc_amount
      ? `$${c.reward_usdc_amount} USDC per tester · `
      : ""
    const description = `${reward}${c.tagline || c.description?.slice(0, 140) || "A verified testing campaign on Arc Testnet."}`
    const image       = c.campaign_logo || c.project_logo || null
    const url         = `${BASE}/trials/${c.slug || id}`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        siteName: "ArcLens",
        type: "website",
        // 1200x630 is the standard for Twitter / OG large-card previews. Even if
        // the underlying banner is 16:9 high-res, declaring this hints platforms
        // to render it as a large card instead of a small square.
        ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: c.title }] } : {}),
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
