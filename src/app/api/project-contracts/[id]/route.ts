// src/app/api/project-contracts/[id]/route.ts
//
// DELETE — founder unregisters a tracked contract. Soft-deletes (sets
// revoked_at) so audit history is preserved and the indexer simply stops
// counting it on the next tick. Hard delete is intentionally not exposed —
// keeping the row means we can show "this contract was tracked until X"
// in any audit dispute.

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { getSession } from "@/lib/session"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const idNum = Number(id)
  if (!Number.isFinite(idNum)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  const sess = getSession(req)
  if (!sess) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  }

  // Allow the project owner to revoke. Mirrors the ownership check used by
  // /api/update-project. We also allow the original deployer wallet (the one
  // that signed the registration) so multi-owner teams aren't locked out.
  const r = await pool.query(
    `SELECT pc.id, pc.deployer_address, p.owner_wallet
     FROM project_contracts pc
     JOIN projects p ON p.id = pc.project_id
     WHERE pc.id = $1`,
    [idNum],
  )
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const row = r.rows[0]
  const owner    = (row.owner_wallet || "").toLowerCase()
  const deployer = (row.deployer_address || "").toLowerCase()
  if (sess.addr !== owner && sess.addr !== deployer) {
    return NextResponse.json(
      { error: "Only the project owner or the contract's deployer can revoke." },
      { status: 403 },
    )
  }

  await pool.query(
    `UPDATE project_contracts
     SET revoked_at = NOW(),
         revoke_reason = COALESCE(revoke_reason, 'founder-removed')
     WHERE id = $1`,
    [idNum],
  )

  // If this was the last live contract for the project, fully clear the
  // materialized metrics + flip tracking off so /ecosystem and the public
  // API don't keep showing stale numbers.
  const projectId = r.rows[0]?.id
    ? (await pool.query(
        `SELECT project_id FROM project_contracts WHERE id = $1`,
        [idNum],
      )).rows[0]?.project_id
    : null
  if (projectId) {
    await pool.query(
      `UPDATE projects p SET
         tvl_tracking_enabled    = false,
         tvl_usd_e6              = NULL,
         tvl_ath_usd_e6          = NULL,
         tvl_ath_block           = NULL,
         tvl_ath_at              = NULL,
         revenue_cum_usd_e6      = NULL,
         revenue_ath_day_usd_e6  = NULL,
         revenue_ath_day         = NULL,
         volume_cum_usd_e6       = NULL,
         volume_ath_day_usd_e6   = NULL,
         volume_ath_day          = NULL
       WHERE p.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM project_contracts pc
           WHERE pc.project_id = p.id
             AND pc.verified_at IS NOT NULL
             AND pc.revoked_at IS NULL
         )`,
      [projectId],
    )
  }

  return NextResponse.json({ success: true })
}
