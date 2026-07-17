import { NextRequest, NextResponse, after } from "next/server"
import { scanUrl } from "@/lib/urlScan"
import { getPool } from "@/lib/dbPool"
import { validateEmail, validateWebsite, hostFromUrl, domainResolves } from "@/lib/submissionGuards"

const pool = getPool()

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, name, tagline,
              -- Cards show only the first ~120 chars; ship 121 (enough for the
              -- "…" check) instead of the full 300, and ship only the one
              -- trust_profile field the list uses (hard_risk) instead of the
              -- whole analysis blob. Together this ~halves the list payload —
              -- the biggest single source of DB egress. Detail page keeps both.
              LEFT(description, 121) AS description, category, logo_url,
              website, twitter, github, discord, contract,
              featured, color, launched_at, slug, badge,
              trust_level, recognition, established,
              json_build_object('hard_risk', COALESCE((trust_profile->>'hard_risk')::bool, false)) AS trust_profile,
              city, country, lat, lng,
              COALESCE(view_count, 0) as view_count,
              created_at,
              -- TVL / Revenue tracking (NULL when project hasn't opted in;
              -- the UI uses NULL vs 0 to decide whether to show a number).
              tvl_tracking_enabled,
              tvl_usd_e6::text          AS tvl_usd_e6,
              tvl_ath_usd_e6::text      AS tvl_ath_usd_e6,
              tvl_ath_block,
              tvl_ath_at,
              revenue_cum_usd_e6::text  AS revenue_cum_usd_e6,
              revenue_ath_day_usd_e6::text AS revenue_ath_day_usd_e6,
              revenue_ath_day,
              volume_cum_usd_e6::text   AS volume_cum_usd_e6,
              volume_ath_day_usd_e6::text AS volume_ath_day_usd_e6,
              volume_ath_day,
              tvl_last_indexed_at
       FROM projects
       WHERE approved = true AND live = true
       ORDER BY featured DESC, COALESCE(view_count, 0) DESC, created_at DESC`
    )

    // Trending: most unique viewers in the last ~2 weeks. project_views dedups
    // per device per week (week_num), so this is real recent interest — not the
    // frozen lifetime view_count tally, which kept the same projects on top
    // forever. Falls back to all-time views when recent data is sparse so the
    // rail is never empty. No external API calls.
    const projectsRows = result.rows
    const currentWeek  = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
    let trending: any[] = []
    try {
      const recent = await pool.query(
        `SELECT project_id, COUNT(*)::int AS recent_views
           FROM project_views
          WHERE week_num >= $1
          GROUP BY project_id
          ORDER BY recent_views DESC
          LIMIT 12`,
        [currentWeek - 1],
      )
      // projects.id is bigint (pg returns a string) while project_views.project_id
      // is integer (pg returns a number) — normalize both to String to match.
      const byId = new Map(projectsRows.map((p: any) => [String(p.id), p]))
      trending = recent.rows
        .map((r: any) => { const p = byId.get(String(r.project_id)); return p ? { ...p, tx_count: r.recent_views } : null })
        .filter(Boolean)
        .slice(0, 5)
    } catch { trending = [] }

    if (trending.length < 5) {
      const seen = new Set(trending.map((p: any) => p.id))
      const fill = [...projectsRows]
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
        .filter((p: any) => !seen.has(p.id))
        .slice(0, 5 - trending.length)
        .map((p: any) => ({ ...p, tx_count: 0 }))
      trending = [...trending, ...fill]
    }

    return NextResponse.json({ projects: projectsRows, trending }, {
      // Directory isn't real-time — 15-min CDN cache means far fewer DB
      // revalidations (egress reduction) with no visible staleness.
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    })
  } catch {
    return NextResponse.json({ projects: [], trending: [] })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, tagline, description, category, website, twitter, github, discord, contract, contracts: extraContracts, logo_url, email, city, country, founder } = body
  const founderSocial = typeof founder === "string" ? founder.trim() || null : null
  const contractsArr = Array.isArray(extraContracts) ? extraContracts.map((c: string) => c.trim()).filter(Boolean) : []
  // Cap tagline + description so cards/listings stay neat (the form enforces
  // these too; this is the server-side safety net). Tagline 80, description 300.
  const cleanTagline = typeof tagline === "string" ? tagline.trim().slice(0, 80) : ""
  const cleanDesc = typeof description === "string" ? (description.trim().slice(0, 300) || null) : null

  if (!name?.trim())    return NextResponse.json({ error: "Project name required" }, { status: 400 })
  if (!tagline?.trim()) return NextResponse.json({ error: "Tagline required" }, { status: 400 })

  // ── Intake validation ─────────────────────────────────────────────────────
  // Reject junk before it reaches the admin queue: bad emails, reserved/
  // unregisterable domains (.invalid/.example/etc), and a project with neither
  // a resolving website nor a contract. Complements the reputation scan.
  const emailCheck = validateEmail(email)
  if (emailCheck.ok === false) return NextResponse.json({ error: emailCheck.error }, { status: 400 })

  const siteCheck = validateWebsite(website)
  if (siteCheck.ok === false) return NextResponse.json({ error: siteCheck.error }, { status: 400 })

  // At least ONE verifiable link — but generously: a real website, a contract,
  // OR a social (Twitter/GitHub). Early projects often have only a Twitter, and
  // we don't want to turn them away — we just refuse the truly empty submission
  // that names no way to check the team is real (the audit-probe case).
  const hasContract = typeof contract === "string" && /^0x[a-fA-F0-9]{40}$/.test(contract.trim())
  const hasWebsite  = !!(website && website.trim())
  const hasSocial   = !!((twitter && twitter.trim()) || (github && github.trim()))
  if (!hasContract && !hasWebsite && !hasSocial) {
    return NextResponse.json({ error: "Add at least one link so we can verify your project — a website, contract address, Twitter, or GitHub." }, { status: 400 })
  }

  // If a website was given, confirm the domain actually resolves (fail-open on
  // DNS outage). Stops fabricated-but-well-formed domains like the audit probe.
  if (hasWebsite) {
    const host = hostFromUrl(website)
    if (host && !(await domainResolves(host))) {
      return NextResponse.json({ error: "That website domain doesn't resolve — check the URL and try again" }, { status: 400 })
    }
  }

  // Generate slug from name
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  try {
    if (contract?.trim()) {
      const existing = await pool.query(
        "SELECT id, email FROM projects WHERE contract = $1 LIMIT 1",
        [contract.trim().toLowerCase()]
      )

      if (existing.rows.length > 0) {
        const existingEmail = existing.rows[0].email?.toLowerCase()
        const submittedEmail = email.trim().toLowerCase()

        if (existingEmail === submittedEmail) {
          await pool.query(
            `UPDATE projects SET
               name = $1, tagline = $2, description = $3, category = $4,
               logo_url = COALESCE($5, logo_url),
               website = $6, twitter = $7, github = $8, discord = $9,
               founder_social = COALESCE($11, founder_social),
               approved = false, live = false
             WHERE contract = $10`,
            [name.trim(), cleanTagline, cleanDesc, category||"DeFi",
             logo_url||null, website?.trim()||null, twitter?.trim()||null,
             github?.trim()||null, discord?.trim()||null, contract.trim().toLowerCase(), founderSocial]
          )
          if (website?.trim()) after(() => scanUrl(website))
          return NextResponse.json({ success: true, updated: true })
        } else {
          return NextResponse.json({ error: "A project with this contract address already exists. Use the same email you registered with to update it." }, { status: 409 })
        }
      }
    }

    // New submission — slug must be derived purely from the project name.
    // If the slug is already taken, reject with a clear error so the founder
    // picks a different name (e.g. "Tower Exchange" instead of "Tower").
    // This keeps every slug human-readable and tied to the brand — no random
    // timestamps, no -2/-3 counters polluting public URLs.
    const slugCheck = await pool.query(
      "SELECT id, name FROM projects WHERE slug = $1 LIMIT 1",
      [slug]
    )
    if (slugCheck.rows.length > 0) {
      return NextResponse.json({
        error: `A project named "${slugCheck.rows[0].name}" already uses this URL. Pick a more specific project name (e.g. "${name.trim()} Labs" or "${name.trim()} Protocol") and resubmit.`,
      }, { status: 409 })
    }
    const finalSlug = slug

    await pool.query(
      `INSERT INTO projects (name, tagline, description, category, logo_url, website, twitter, github, discord, contract, contracts, email, city, country, founder_social, approved, live, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false,false,$16)`,
      [name.trim(), cleanTagline, cleanDesc, category||"DeFi",
       logo_url||null, website?.trim()||null, twitter?.trim()||null,
       github?.trim()||null, discord?.trim()||null,
       contract?.trim()?.toLowerCase()||null, contractsArr, email.trim(),
       city?.trim()||null, country?.trim()||null, founderSocial, finalSlug]
    )
    // Reputation-scan the submitted website (VirusTotal) after responding —
    // the verdict lands in url_scans and shows in the admin review panel.
    if (website?.trim()) after(() => scanUrl(website))
    return NextResponse.json({ success: true, updated: false })
  } catch (err) {
    console.error("[Ecosystem POST]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
