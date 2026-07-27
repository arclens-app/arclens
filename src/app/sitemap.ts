import { MetadataRoute } from "next"
import { getPool } from "@/lib/dbPool"

const pool = getPool()

const BASE = "https://arclenz.xyz"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,            priority: 1.0,  changeFrequency: "daily"   },
    { url: `${BASE}/ecosystem`,   priority: 0.9,  changeFrequency: "daily"   },
    { url: `${BASE}/trials`,      priority: 0.9,  changeFrequency: "daily"   },
    { url: `${BASE}/events`,      priority: 0.8,  changeFrequency: "weekly"  },
    { url: `${BASE}/overview`,    priority: 0.7,  changeFrequency: "hourly"  },
    { url: `${BASE}/blocks`,      priority: 0.6,  changeFrequency: "always"  },
    { url: `${BASE}/transactions`,priority: 0.6,  changeFrequency: "always"  },
    { url: `${BASE}/tokens`,      priority: 0.6,  changeFrequency: "daily"   },
    { url: `${BASE}/wallets`,     priority: 0.5,  changeFrequency: "weekly"  },
    { url: `${BASE}/registry`,    priority: 0.5,  changeFrequency: "weekly"  },
    { url: `${BASE}/search`,      priority: 0.5,  changeFrequency: "weekly"  },
    { url: `${BASE}/start`,       priority: 0.6,  changeFrequency: "monthly" },
    { url: `${BASE}/node-guide`,  priority: 0.5,  changeFrequency: "monthly" },
    { url: `${BASE}/about`,       priority: 0.6,  changeFrequency: "monthly" },
    { url: `${BASE}/terms`,       priority: 0.3,  changeFrequency: "yearly"  },
    { url: `${BASE}/privacy`,     priority: 0.3,  changeFrequency: "yearly"  },
  ]

  let projectRoutes: MetadataRoute.Sitemap = []
  let campaignRoutes: MetadataRoute.Sitemap = []

  try {
    // `projects` has no updated_at column — asking for one threw, and the empty
    // catch below hid it, so every project page silently dropped out of the
    // sitemap. Derive lastModified from the columns that do exist.
    const projects = await pool.query(
      `SELECT slug, id, COALESCE(trust_updated_at, created_at) AS updated_at
         FROM projects WHERE approved = true AND live = true ORDER BY created_at DESC`
    )
    projectRoutes = projects.rows.map((p: any) => ({
      url:             `${BASE}/ecosystem/${p.slug || p.id}`,
      lastModified:    p.updated_at ? new Date(p.updated_at) : new Date(),
      priority:        0.7,
      changeFrequency: "weekly" as const,
    }))
  } catch (e) {
    console.error("[sitemap] project routes failed:", e)
  }

  try {
    const campaigns = await pool.query(
      `SELECT slug, id, updated_at FROM campaigns WHERE status = 'active' ORDER BY created_at DESC`
    )
    campaignRoutes = campaigns.rows.map((c: any) => ({
      url:             `${BASE}/trials/${c.slug || c.id}`,
      lastModified:    c.updated_at ? new Date(c.updated_at) : new Date(),
      priority:        0.7,
      changeFrequency: "daily" as const,
    }))
  } catch (e) {
    console.error("[sitemap] campaign routes failed:", e)
  }

  return [...staticRoutes, ...projectRoutes, ...campaignRoutes]
}
