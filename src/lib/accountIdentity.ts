import type { PoolClient } from "pg"
import { getPool } from "@/lib/dbPool"
import { ARC_CHAIN_ID } from "@/lib/constants"

const pool = getPool()

type Queryable = Pick<PoolClient, "query">

// Best-effort and deliberately non-blocking: wallet sign-in must succeed even
// when payouts are paused or Circle's settlement rail is temporarily down.
async function settleOwnedProjectCredits(wallet: string): Promise<void> {
  try {
    const projects = await pool.query<{ slug: string }>(
      `SELECT slug FROM projects
        WHERE LOWER(owner_wallet) = $1 AND approved = true AND live = true`,
      [wallet],
    )
    if (!projects.rows.length) return
    const { settleAccruedOnClaim } = await import("@/lib/lensPay")
    for (const project of projects.rows) {
      await settleAccruedOnClaim(project.slug, wallet)
    }
  } catch (error: any) {
    console.error("[accountIdentity] accrued payout retry:", error?.message || error)
  }
}

/** Return the private ArcLens account shared by all verified Circle wallets. */
export async function ensureCircleAccount(email: string, db: Queryable = pool): Promise<number> {
  const normalized = String(email || "").toLowerCase().trim()
  if (!normalized) throw new Error("Email required")

  const result = await db.query<{ id: string }>(
    `INSERT INTO arclens_accounts (normalized_email)
     VALUES ($1)
     ON CONFLICT (normalized_email) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [normalized],
  )
  return Number(result.rows[0].id)
}

/** Attach the active Circle environment row to the user's ArcLens account. */
export async function attachCircleAccount(email: string, db: Queryable = pool): Promise<number> {
  const normalized = String(email || "").toLowerCase().trim()
  const accountId = await ensureCircleAccount(normalized, db)
  await db.query(
    `UPDATE circle_wallet_users
        SET account_id = $1
      WHERE LOWER(email) = $2 AND chain_id = $3`,
    [accountId, normalized, ARC_CHAIN_ID],
  )
  return accountId
}

/**
 * Make a newly verified LIVE Circle wallet the visible ArcLens identity.
 * Original completion/review wallet columns remain untouched as proof; only
 * their display alias changes. Derived profiles and project ownership move to
 * the current wallet so the product remains one continuous experience.
 */
export async function promoteCircleWallet(email: string, currentWallet: string): Promise<void> {
  const normalized = String(email || "").toLowerCase().trim()
  const current = String(currentWallet || "").toLowerCase()
  if (!normalized || !/^0x[a-f0-9]{40}$/.test(current)) throw new Error("Invalid Circle identity")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const accountId = await ensureCircleAccount(normalized, client)
    await client.query(
      `UPDATE circle_wallet_users
          SET account_id = $1
        WHERE LOWER(email) = $2`,
      [accountId, normalized],
    )

    const account = await client.query<{ primary_wallet: string | null }>(
      `SELECT primary_wallet FROM arclens_accounts WHERE id = $1 FOR UPDATE`,
      [accountId],
    )
    if (account.rows[0]?.primary_wallet?.toLowerCase() === current) {
      await client.query("COMMIT")
      void settleOwnedProjectCredits(current)
      return
    }

    const walletRows = await client.query<{ wallet_address: string }>(
      `SELECT DISTINCT LOWER(wallet_address) AS wallet_address
         FROM circle_wallet_users
        WHERE account_id = $1 AND wallet_address IS NOT NULL`,
      [accountId],
    )
    const aliases = Array.from(new Set(walletRows.rows.map(r => r.wallet_address).filter(Boolean).concat(current)))

    // Keep immutable proof authors in tester_wallet/wallet, but never surface a
    // retired test wallet as the user's current identity.
    await client.query(
      `UPDATE campaign_completions
          SET profile_wallet = $1
        WHERE LOWER(tester_wallet) = ANY($2::text[])
           OR LOWER(COALESCE(profile_wallet, tester_wallet)) = ANY($2::text[])`,
      [current, aliases],
    )
    await client.query(
      `UPDATE reviews
          SET profile_wallet = $1
        WHERE LOWER(wallet) = ANY($2::text[])
           OR LOWER(COALESCE(profile_wallet, wallet)) = ANY($2::text[])`,
      [current, aliases],
    )

    // These are ArcLens ownership/profile pointers, not blockchain proof data.
    await client.query(`UPDATE projects SET owner_wallet = $1 WHERE LOWER(owner_wallet) = ANY($2::text[])`, [current, aliases])
    await client.query(`UPDATE campaigns SET creator_wallet = $1 WHERE LOWER(creator_wallet) = ANY($2::text[])`, [current, aliases])

    const hasBuilder = await client.query(`SELECT 1 FROM builder_profiles WHERE LOWER(address) = $1 LIMIT 1`, [current])
    if (!hasBuilder.rows.length) {
      await client.query(
        `UPDATE builder_profiles SET address = $1, updated_at = NOW()
          WHERE LOWER(address) = (
            SELECT LOWER(address) FROM builder_profiles
             WHERE LOWER(address) = ANY($2::text[]) AND LOWER(address) <> $1
             ORDER BY claimed_at NULLS LAST LIMIT 1
          )`,
        [current, aliases],
      )
    }

    const hasReputation = await client.query(`SELECT 1 FROM tester_reputation WHERE LOWER(wallet) = $1 LIMIT 1`, [current])
    if (!hasReputation.rows.length) {
      await client.query(
        `UPDATE tester_reputation SET wallet = $1, updated_at = NOW()
          WHERE LOWER(wallet) = (
            SELECT LOWER(wallet) FROM tester_reputation
             WHERE LOWER(wallet) = ANY($2::text[]) AND LOWER(wallet) <> $1
             ORDER BY updated_at DESC NULLS LAST LIMIT 1
          )`,
        [current, aliases],
      )
    }

    await client.query(
      `UPDATE arclens_accounts SET primary_wallet = $1, updated_at = NOW() WHERE id = $2`,
      [current, accountId],
    )

    await client.query("COMMIT")
    void settleOwnedProjectCredits(current)
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
