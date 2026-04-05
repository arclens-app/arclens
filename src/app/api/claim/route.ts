import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import crypto from "crypto"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function POST(req: NextRequest) {
  try {
    const { email, slug } = await req.json()

    if (!email?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: "Email and project required" }, { status: 400 })
    }

    // Find project by slug and email
    const result = await pool.query(
      `SELECT id, name, slug, email, claimed_at FROM projects 
       WHERE (slug = $1 OR id::text = $1) AND approved = true AND live = true`,
      [slug.trim()]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const project = result.rows[0]

    // Check email matches submission email
    if (project.email?.toLowerCase() !== email.trim().toLowerCase()) {
      return NextResponse.json({ error: "Email does not match the submission email for this project" }, { status: 403 })
    }

    // Generate magic link token
    const token = crypto.randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

    await pool.query(
      `UPDATE projects SET claim_token = $1, claim_token_expires = $2, owner_email = $3 WHERE id = $4`,
      [token, expires, email.trim().toLowerCase(), project.id]
    )

    // In production send email — for now return token directly for testing
    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/dashboard/${project.slug || project.id}?token=${token}`

    // TODO: Send email with dashboardUrl
    // For now log it
    console.log(`[Claim] Dashboard link for ${project.name}: ${dashboardUrl}`)

    return NextResponse.json({ 
      success: true, 
      message: "Check your email for the dashboard link",
      // Remove in production:
      debug_url: process.env.NODE_ENV === "development" ? dashboardUrl : undefined
    })
  } catch (err) {
    console.error("[Claim API]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// Verify token and return project data
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")
    const slug  = req.nextUrl.searchParams.get("slug")

    if (!token || !slug) {
      return NextResponse.json({ error: "Missing token or slug" }, { status: 400 })
    }

    const result = await pool.query(
      `SELECT id, name, slug, tagline, description, category, logo_url,
              website, twitter, github, discord, contract, featured,
              badge, color, email, claimed_at, view_count,
              claim_token, claim_token_expires
       FROM projects
       WHERE (slug = $1 OR id::text = $1) AND claim_token = $2`,
      [slug, token]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
    }

    const project = result.rows[0]

    if (new Date(project.claim_token_expires) < new Date()) {
      return NextResponse.json({ error: "Token expired — request a new link" }, { status: 403 })
    }

    // Mark as claimed
    if (!project.claimed_at) {
      await pool.query(`UPDATE projects SET claimed_at = NOW() WHERE id = $1`, [project.id])
    }

    // Get all reviews (public + private)
    const reviews = await pool.query(
      `SELECT id, wallet, category, rating, review_text, is_public, contact, badge, created_at
       FROM reviews WHERE project_id = $1 ORDER BY created_at DESC`,
      [project.id]
    )

    // Get weekly view count
    const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
    const weekViews = await pool.query(
      `SELECT COUNT(*) as cnt FROM project_views WHERE project_id = $1 AND week_num = $2`,
      [project.id, weekNum]
    )

    return NextResponse.json({
      project: {
        ...project,
        claim_token: undefined,
        claim_token_expires: undefined,
      },
      reviews: reviews.rows,
      weekViews: parseInt(weekViews.rows[0]?.cnt || "0"),
    })
  } catch (err) {
    console.error("[Claim GET]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
