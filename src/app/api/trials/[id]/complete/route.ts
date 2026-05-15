import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { getProvider } from "@/lib/arc"
import { rateLimit, getIp } from "@/lib/ratelimit"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// Ensure unique constraint exists — safe to run on every cold start
pool.query("CREATE UNIQUE INDEX IF NOT EXISTS tester_reputation_wallet_unique ON tester_reputation (wallet)").catch(() => {})

// Check if a wallet has interacted with any of the provided contracts via Arc RPC event logs.
// Checks campaign-level + per-task contract addresses in parallel.
// Any event emitted by a contract that includes the tester wallet as a topic = verified.
async function checkContractVerification(
  contractAddresses: string[],
  testerWallet: string
): Promise<boolean | null> {
  // Deduplicate and filter valid addresses
  const unique = [...new Set(
    contractAddresses.filter(a => a && /^0x[a-fA-F0-9]{40}$/i.test(a))
  )]
  if (!unique.length) return null

  try {
    const provider   = getProvider()
    const latest     = await provider.getBlockNumber()
    const fromBlock  = Math.max(0, latest - 200000)
    // Wallet address padded to 32 bytes — standard ABI topic encoding for address params
    const paddedAddr = `0x000000000000000000000000${testerWallet.replace("0x", "").toLowerCase()}`

    // Check all contracts in parallel — verified if tester wallet appears in any
    const results = await Promise.all(
      unique.map(address =>
        provider.getLogs({ address, fromBlock, toBlock: "latest" })
          .then(logs => logs.some(log =>
            log.topics.some(topic => topic.toLowerCase() === paddedAddr)
          ))
          .catch(() => false)
      )
    )

    return results.some(Boolean)
  } catch (e) {
    console.error("[arc-verify]", e)
    return null  // RPC error — don't penalise tester, allow submission unverified
  }
}

// Count meaningful unique words (>3 chars) to prevent word-stuffing / repetition gaming.
// A tester writing "great great great great" 50 times gets credit for 1 word, not 50.
function meaningfulUniqueWords(text: string): number {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const unique = new Set(words.filter(w => w.length > 3))
  // Also penalise if total words far exceed unique words (copy-paste / repetition signal)
  const total  = words.length
  const ratio  = total > 0 ? unique.size / total : 0
  // If less than 40% unique words the answer is heavily repetitive — halve the unique count
  return ratio < 0.4 ? Math.floor(unique.size * 0.5) : unique.size
}

// Compute an automatic quality score 0-100.
// Scoring is based on unique meaningful word count, not raw word count.
// contract_verified adds a 10-point bonus — rewarding testers who actually go on-chain.
function computeAutoScore(
  _tasks: unknown,
  review_questions: { id: string; min_words: number; required: boolean }[],
  _tx_hashes: unknown,
  review_answers: Record<string, string>,
  contract_verified?: boolean | null
): number {
  let score = 0

  const requiredQs = review_questions.filter(q => q.required)
  if (requiredQs.length > 0) {
    const ptsEach = 90 / requiredQs.length  // 90 pts max from answers, 10 reserved for on-chain bonus
    for (const q of requiredQs) {
      const uWords = meaningfulUniqueWords(review_answers[q.id] || "")
      const min    = Math.ceil((q.min_words || 20) * 0.6)  // unique-word target = 60% of min_words
      if (uWords >= min * 2)      score += ptsEach          // thorough: 2× unique target
      else if (uWords >= min)     score += ptsEach * 0.7    // solid: met unique target
      else if (uWords >= min / 2) score += ptsEach * 0.35   // thin: half target
      // below half: 0 — not acceptable
    }
  } else {
    const totalUnique = meaningfulUniqueWords(Object.values(review_answers).join(" "))
    score = Math.min(90, totalUnique * 3)
  }

  // On-chain verification bonus — tester actually interacted with the contract
  if (contract_verified === true) score += 10

  return Math.min(100, Math.round(score))
}

// POST /api/trials/[id]/complete — tester submits campaign completion
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Rate limit: 10 submissions per hour per IP
  const rl = rateLimit(`complete:${getIp(req)}`, 10, 3_600_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } }
    )
  }

  try {
    const body = await req.json()
    const { tester_wallet, tx_hashes = [], review_answers = {} } = body

    if (!tester_wallet?.trim()) {
      return NextResponse.json({ error: "Wallet required" }, { status: 400 })
    }

    const wallet = tester_wallet.toLowerCase()

    // Resolve slug or numeric id
    const isNumeric = /^\d+$/.test(id)
    const campaignRes = await pool.query(
      `SELECT id, status, total_slots, filled_slots, tasks, review_questions, min_rank, contract_address
       FROM campaigns WHERE ${isNumeric ? "id = $1" : "slug = $1"}`,
      [isNumeric ? Number(id) : id]
    )
    if (!campaignRes.rows.length) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }
    const campaign = campaignRes.rows[0]

    if (campaign.status !== "active") {
      return NextResponse.json({ error: "Campaign is not active" }, { status: 400 })
    }
    if (campaign.total_slots && campaign.filled_slots >= campaign.total_slots) {
      return NextResponse.json({ error: "Campaign is full" }, { status: 400 })
    }
    // Note: final atomic slot claim happens after insert (see below) to prevent race conditions

    // Check tester rank requirement
    if (campaign.min_rank > 0) {
      const repRes = await pool.query(
        `SELECT rank FROM tester_reputation WHERE wallet = $1`,
        [wallet]
      )
      const rank = repRes.rows[0]?.rank ?? 0
      if (rank < campaign.min_rank) {
        return NextResponse.json({ error: "Your rank does not meet the campaign requirement" }, { status: 403 })
      }
    }

    const campaignNumericId: number = campaign.id

    // Check for duplicate
    const dupCheck = await pool.query(
      `SELECT id FROM campaign_completions WHERE campaign_id = $1 AND tester_wallet = $2`,
      [campaignNumericId, wallet]
    )
    if (dupCheck.rows.length) {
      return NextResponse.json({ error: "You have already submitted this campaign" }, { status: 409 })
    }

    // Validate at least one review answer has meaningful content
    const totalWords = Object.values(review_answers as Record<string, string>)
      .join(" ").split(/\s+/).filter(Boolean).length
    if (totalWords < 15) {
      return NextResponse.json({ error: "Please provide more detailed feedback before submitting" }, { status: 400 })
    }

    // Collect all contract addresses: campaign-level + per-task contracts
    const taskContracts: string[] = (campaign.tasks || [])
      .map((t: { contract_address?: string }) => t.contract_address || "")
      .filter(Boolean)
    const allContracts = [campaign.contract_address || "", ...taskContracts]

    // Auto-verify on-chain interaction across all contracts via Arc RPC
    let contract_verified: boolean | null = null
    const hasContracts = allContracts.some(Boolean)
    if (hasContracts) {
      contract_verified = await checkContractVerification(allContracts, wallet)
      // Hard gate — if contracts are configured and the tester hasn't interacted, block submission
      if (contract_verified === false) {
        return NextResponse.json({
          error: "On-chain participation required. Complete the contract interaction on Arc Testnet before submitting.",
          contract_required: true,
        }, { status: 403 })
      }
    }

    // Compute auto score now that we know contract_verified
    const auto_score = computeAutoScore(
      campaign.tasks        || [],
      campaign.review_questions || [],
      tx_hashes,
      review_answers,
      contract_verified
    )

    // Insert completion — store provisional_score so rate endpoint can replace it accurately
    const provisionalScore = (auto_score / 100) * 5
    await pool.query(
      `INSERT INTO campaign_completions
         (campaign_id, tester_wallet, tx_hashes, review_answers, auto_score, contract_verified, provisional_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [campaignNumericId, wallet, tx_hashes, JSON.stringify(review_answers), auto_score, contract_verified, provisionalScore]
    )

    // Atomic slot increment — prevents race condition when two testers submit simultaneously
    if (campaign.total_slots) {
      const slotRes = await pool.query(
        `UPDATE campaigns SET filled_slots = filled_slots + 1
         WHERE id = $1 AND filled_slots < total_slots RETURNING id`,
        [campaignNumericId]
      )
      if (!slotRes.rows.length) {
        // Another tester claimed the last slot between our check and now — roll back completion
        await pool.query(`DELETE FROM campaign_completions WHERE campaign_id = $1 AND tester_wallet = $2`, [campaignNumericId, wallet])
        return NextResponse.json({ error: "Campaign is full" }, { status: 400 })
      }
    } else {
      await pool.query(`UPDATE campaigns SET filled_slots = filled_slots + 1 WHERE id = $1`, [campaignNumericId])
    }

    // Upsert reputation record (provisional — quality_score refined after builder rating)
    await pool.query(
      `INSERT INTO tester_reputation (wallet, campaigns_completed, total_score, avg_score, rank_points)
       VALUES ($1, 1, $2, $2, $3)
       ON CONFLICT (wallet) DO UPDATE SET
         campaigns_completed = tester_reputation.campaigns_completed + 1,
         total_score         = tester_reputation.total_score + $2,
         avg_score           = ROUND((tester_reputation.total_score + $2) /
                               (tester_reputation.campaigns_completed + 1), 2),
         rank_points         = tester_reputation.rank_points + $3,
         rank                = CASE
           -- Arc Proven: 50+ campaigns, avg 4.5+, currently Trusted
           WHEN tester_reputation.rank = 3
             AND (tester_reputation.campaigns_completed + 1) >= 50
             AND ROUND((tester_reputation.total_score + $2) / (tester_reputation.campaigns_completed + 1), 2) >= 4.5
             THEN 4
           -- Trusted: 25+ campaigns, avg 4.0+, currently Verified
           WHEN tester_reputation.rank = 2
             AND (tester_reputation.campaigns_completed + 1) >= 25
             AND ROUND((tester_reputation.total_score + $2) / (tester_reputation.campaigns_completed + 1), 2) >= 4.0
             THEN 3
           -- Verified: 10+ campaigns, avg 3.5+, currently Builder
           WHEN tester_reputation.rank = 1
             AND (tester_reputation.campaigns_completed + 1) >= 10
             AND ROUND((tester_reputation.total_score + $2) / (tester_reputation.campaigns_completed + 1), 2) >= 3.5
             THEN 2
           -- Builder: 3+ campaigns, avg 3.0+, currently Scout
           WHEN tester_reputation.rank = 0
             AND (tester_reputation.campaigns_completed + 1) >= 3
             AND ROUND((tester_reputation.total_score + $2) / (tester_reputation.campaigns_completed + 1), 2) >= 3.0
             THEN 1
           ELSE tester_reputation.rank
         END,
         updated_at = NOW()`,
      [wallet, provisionalScore, Math.round(auto_score / 10)]
    )

    return NextResponse.json({ success: true, auto_score, contract_verified })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
