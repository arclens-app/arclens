export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS builder_profiles (
      address      TEXT PRIMARY KEY,
      display_name TEXT,
      bio          TEXT,
      avatar_url   TEXT,
      twitter      TEXT,
      github       TEXT,
      website      TEXT,
      telegram     TEXT,
      email        TEXT,
      verified     BOOLEAN DEFAULT false,
      claimed_at   TIMESTAMPTZ,
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  // Safe to run on existing tables — no-op if column already exists
  await pool.query(`ALTER TABLE builder_profiles ADD COLUMN IF NOT EXISTS email TEXT`)
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase()
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 })

  try {
    await ensureTable()

    const [profileRes, projectsRes, pendingRes] = await Promise.all([
      pool.query(`SELECT * FROM builder_profiles WHERE address = $1`, [address]),
      pool.query(
        `SELECT id, name, slug, tagline, category, logo_url, website, featured, badge,
                COALESCE(view_count, 0) as view_count, contract, created_at
         FROM projects WHERE owner_wallet = $1 AND approved = true AND live = true
         ORDER BY featured DESC, view_count DESC`,
        [address]
      ),
      // Detect pending projects via either source of email truth:
      // 1. Email on a project they already claimed (owner_wallet = address)
      // 2. Email they entered directly on their builder profile
      pool.query(
        `SELECT id, name, slug FROM projects
         WHERE owner_wallet IS NULL
           AND approved = true AND live = true
           AND email IN (
             SELECT email FROM projects
             WHERE owner_wallet = $1 AND email IS NOT NULL
             UNION
             SELECT email FROM builder_profiles
             WHERE address = $1 AND email IS NOT NULL
           )`,
        [address]
      ),
    ])

    const profile = profileRes.rows[0] || null

    const contractAddresses: string[] = projectsRes.rows
      .map((p: any) => p.contract as string | null)
      .filter((c): c is string => !!c && /^0x[0-9a-fA-F]{40}$/i.test(c))

    let contractsDeployed = 0
    let contractActivity  = 0
    let firstSeen: string | null = null

    try {
      const [txsRes, ...contractRes] = await Promise.all([
        fetch(`https://testnet.arcscan.app/api/v2/addresses/${address}/transactions?limit=50`, {
          headers: { Accept: "application/json" },
          next: { revalidate: 60 },
        }),
        ...contractAddresses.map(c =>
          fetch(`https://testnet.arcscan.app/api/v2/addresses/${c}`, {
            headers: { Accept: "application/json" },
            next: { revalidate: 60 },
          })
        ),
      ])

      if (txsRes.ok) {
        const data = await txsRes.json()
        const txs: any[] = data.items || []
        contractsDeployed = txs.filter(
          (t: any) => t.from?.hash?.toLowerCase() === address && t.created_contract != null
        ).length
        const oldest = txs[txs.length - 1]
        if (oldest?.timestamp) firstSeen = oldest.timestamp
      }

      for (const res of contractRes) {
        if (res?.ok) {
          const d = await res.json()
          contractActivity += parseInt(d.transactions_count || "0")
        }
      }
    } catch {}

    return NextResponse.json({
      // email is intentionally excluded from the public response — private field
      profile: profile ? { ...profile, email: undefined } : null,
      hasSubmissionEmail: !!profile?.email,
      projects:           projectsRes.rows,
      pendingProjects:    pendingRes.rows,
      stats: {
        contractsDeployed,
        projectsShipped: projectsRes.rows.length,
        contractActivity,
        firstSeen,
      },
    }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } })
  } catch (err) {
    console.error("[Builder GET]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json()
    const { address, display_name, bio, avatar_url, twitter, github, website, telegram, email } = body

    if (!address?.trim()) return NextResponse.json({ error: "Missing address" }, { status: 400 })
    const addr = address.toLowerCase().trim()

    await pool.query(
      `INSERT INTO builder_profiles (address, display_name, bio, avatar_url, twitter, github, website, telegram, email, claimed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (address) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         bio          = EXCLUDED.bio,
         avatar_url   = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), builder_profiles.avatar_url),
         twitter      = EXCLUDED.twitter,
         github       = EXCLUDED.github,
         website      = EXCLUDED.website,
         telegram     = EXCLUDED.telegram,
         email        = COALESCE(NULLIF(EXCLUDED.email, ''), builder_profiles.email),
         claimed_at   = COALESCE(builder_profiles.claimed_at, NOW()),
         updated_at   = NOW()`,
      [addr, display_name?.trim() || null, bio?.trim() || null, avatar_url?.trim() || null,
       twitter?.trim() || null, github?.trim() || null, website?.trim() || null,
       telegram?.trim() || null, email?.trim()?.toLowerCase() || null]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[Builder POST]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
