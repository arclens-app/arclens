import { MetadataRoute } from "next"

// There was no robots.txt at all — /robots.txt fell through to the not-found
// page, leaving crawlers free to walk the API and the owner-only pages. Public
// content stays crawlable; everything that is private or has no business in a
// search index is disallowed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard/",
          "/activate/",
          "/tester",
        ],
      },
    ],
    sitemap: "https://arclenz.xyz/sitemap.xml",
    host: "https://arclenz.xyz",
  }
}
