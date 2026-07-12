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
  ]

  let projectRoutes: MetadataRoute.Sitemap = []
  let campaignRoutes: MetadataRoute.Sitemap = []

  try {
    const projects = await pool.query(
      `SELECT slug, id, updated_at FROM projects WHERE approved = true AND live = true ORDER BY created_at DESC`
    )
    projectRoutes = projects.rows.map((p: any) => ({
      url:             `${BASE}/ecosystem/${p.slug || p.id}`,
      lastModified:    p.updated_at ? new Date(p.updated_at) : new Date(),
      priority:        0.7,
      changeFrequency: "weekly" as const,
    }))
  } catch { }

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
  } catch { }

  return [...staticRoutes, ...projectRoutes, ...campaignRoutes]
}
