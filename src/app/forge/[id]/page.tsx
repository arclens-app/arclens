"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import { WalletAvatar } from "@/components/WalletAvatar"

interface Task {
  id: string
  title: string
  description: string
  contract_address?: string
}

interface ReviewQuestion {
  id: string
  label: string
  placeholder: string
  min_words: number
  required: boolean
}

interface Campaign {
  id: number
  title: string
  tagline: string | null
  description: string
  type: string
  status: string
  reward_type: string
  reward_description: string | null
  reward_usdc_amount: number | null
  total_slots: number | null
  filled_slots: number
  is_fcfs: boolean
  min_rank: number
  project_name: string | null
  project_logo: string | null
  campaign_logo: string | null
  creator_wallet: string
  tasks: Task[]
  review_questions: ReviewQuestion[]
  created_at: string
  expires_at: string | null
  completion_count: number
  reviewed_count: number
  rejection_reason: string | null
  contract_address: string | null
  app_url: string | null
  slug: string | null
}

interface Completion {
  tester_wallet: string
  auto_score: number
  builder_rating: number | null
  quality_score: number | null
  status: string
  reward_delivered: boolean
  review_answers: Record<string, string>
  created_at: string
}

const TYPE_META: Record<string, { label: string; color: string; abbr: string }> = {
  beta_test:     { label: "Beta Test",          color: "#1a56ff", abbr: "BT" },
  stress_test:   { label: "Stress Test",        color: "#e08810", abbr: "ST" },
  edge_case:     { label: "Edge Case Hunt",     color: "#a855f7", abbr: "EC" },
  ux_review:     { label: "UX Review",          color: "#00b87a", abbr: "UX" },
  feedback:      { label: "UX Review",          color: "#00b87a", abbr: "UX" },
  onboarding:    { label: "Onboarding Test",    color: "#06b6d4", abbr: "OB" },
  integration:   { label: "Integration Test",   color: "#6366f1", abbr: "IT" },
  builder_audit: { label: "Builder Audit",      color: "#ec4899", abbr: "BA" },
  payment_flow:  { label: "Payment Flow Test",  color: "#00d990", abbr: "PF" },
}

const REWARD_META: Record<string, { label: string; color: string }> = {
  usdc:             { label: "USDC",            color: "#00d990" },
  whitelist:        { label: "Whitelist",       color: "#8aaeff" },
  early_access:     { label: "Early Access",    color: "#a855f7" },
  discord_role:     { label: "Discord Role",    color: "#6366f1" },
  credit:           { label: "Public Credit",   color: "#c08828" },
  token_allocation: { label: "Token Alloc.",    color: "#1a56ff" },
  other:            { label: "Custom Reward",   color: "#6b7da8" },
}

const RANK_LABELS = ["Scout", "Builder", "Verified", "Trusted", "Arc Proven"]
const RANK_COLORS = ["#6b7da8", "#00b87a", "#8aaeff", "#c08828", "#a855f7"]

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length
}

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [campaign, setCampaign]       = useState<Campaign | null>(null)
  const [completions, setCompletions] = useState<Completion[]>([])
  const [loading, setLoading]         = useState(true)
  const [wallet, setWallet]           = useState<string | null>(null)
  const [isOwner, setIsOwner]         = useState(false)

  // Submission flow: 0..tasks.length-1 = task steps, tasks.length = review, tasks.length+1 = done
  const [flowStep, setFlowStep]         = useState(0)
  const [answers, setAnswers]           = useState<Record<string, string>>({})
  const [submitting, setSubmitting]     = useState(false)
  const [submitError, setSubmitError]   = useState("")
  const [autoScore, setAutoScore]       = useState<number | null>(null)
  const [contractVerified, setContractVerified] = useState<boolean | null>(null)
  const [alreadyDone, setAlreadyDone]   = useState(false)
  const [testerRank, setTesterRank]     = useState<number | null>(null)
  const [testerProgress, setTesterProgress] = useState<{ label: string; campaigns_needed: number; score_needed: number } | null>(null)

  // Builder rating state
  const [ratingWallet, setRatingWallet] = useState("")
  const [ratingVal, setRatingVal]       = useState(0)
  const [ratingImpact, setRatingImpact] = useState(false)
  const [ratingLoading, setRatingLoading] = useState(false)

  // Claim state
  const [myCompletion, setMyCompletion] = useState<Completion | null>(null)
  const [claiming, setClaiming]         = useState(false)
  const [claimed, setClaimed]           = useState(false)
  const [claimError, setClaimError]     = useState("")

  // Owner edit state
  const [editOpen, setEditOpen]             = useState(false)
  const [editForm, setEditForm]             = useState<Record<string, string>>({})
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editSubmitted, setEditSubmitted]   = useState(false)
  const [editError, setEditError]           = useState("")
  const [pendingUpdate, setPendingUpdate]   = useState<{ status: string; admin_note?: string; submitted_at: string } | null>(null)

  useEffect(() => {
    const w = localStorage.getItem("arclens-wallet")
    if (w) setWallet(w)
    load()
  }, [id])

  useEffect(() => {
    if (wallet && campaign) {
      setIsOwner(campaign.creator_wallet.toLowerCase() === wallet.toLowerCase())
      checkAlreadyDone(wallet)
      // Fetch rank only if campaign has a rank requirement
      if (campaign.min_rank > 0) {
        fetch(`/api/forge/reputation?wallet=${encodeURIComponent(wallet)}`)
          .then(r => r.json())
          .then(d => {
            setTesterRank(d.reputation?.rank ?? 0)
            if (d.reputation?.next_rank) setTesterProgress(d.reputation.next_rank)
          })
          .catch(() => setTesterRank(0))
      }
    }
  }, [wallet, campaign])

  async function load() {
    setLoading(true)
    try {
      const w    = localStorage.getItem("arclens-wallet")
      const qs   = w ? `?wallet=${encodeURIComponent(w)}` : ""
      const res  = await fetch(`/api/forge/${id}${qs}`)
      const data = await res.json()
      if (data.campaign) {
        setCampaign(data.campaign)
        setCompletions(data.completions || [])
        if (data.pendingUpdate) setPendingUpdate(data.pendingUpdate)
      }
    } finally {
      setLoading(false)
    }
  }

  async function checkAlreadyDone(w: string) {
    const found = completions.find(c => c.tester_wallet.toLowerCase() === w.toLowerCase())
    if (found) {
      setAlreadyDone(true)
      setMyCompletion(found)
      if (found.reward_delivered) setClaimed(true)
    }
  }

  async function claimReward() {
    if (!wallet || !campaign) return
    setClaiming(true)
    setClaimError("")
    try {
      const res  = await fetch(`/api/forge/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tester_wallet: wallet }),
      })
      const data = await res.json()
      if (!res.ok) { setClaimError(data.error || "Claim failed"); return }
      setClaimed(true)
    } finally {
      setClaiming(false)
    }
  }

  async function submitCompletion() {
    if (!wallet) return
    setSubmitting(true)
    setSubmitError("")
    try {
      const res  = await fetch(`/api/forge/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tester_wallet: wallet,
          tx_hashes: [],
          review_answers: answers,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.contract_required) {
          setSubmitError("You haven't interacted with this campaign's contract on Arc Testnet yet. Complete the on-chain steps first, then come back to submit.")
        } else {
          setSubmitError(data.error || "Submission failed")
        }
        return
      }
      setAutoScore(data.auto_score)
      setContractVerified(data.contract_verified ?? null)
      setFlowStep(campaign!.tasks.length + 1)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitRating() {
    if (!wallet || !ratingVal) return
    setRatingLoading(true)
    try {
      await fetch(`/api/forge/${id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tester_wallet:   ratingWallet,
          rating:          ratingVal,
          founder_wallet:  wallet,
          impact_credited: ratingImpact,
        }),
      })
      setRatingWallet("")
      setRatingVal(0)
      setRatingImpact(false)
      load()
    } finally {
      setRatingLoading(false)
    }
  }

  async function connectWallet() {
    try {
      if (!(window as any).ethereum) return
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" })
      if (accounts?.[0]) { setWallet(accounts[0]); localStorage.setItem("arclens-wallet", accounts[0].toLowerCase()) }
    } catch { }
  }

  async function submitCampaignEdit() {
    if (!wallet || !campaign) return
    setEditError("")
    const changes: Record<string, any> = {}
    if (editForm.expires_at) changes.expires_at = editForm.expires_at
    if (editForm.total_slots) changes.total_slots = parseInt(editForm.total_slots)
    if (editForm.tagline?.trim()) changes.tagline = editForm.tagline.trim()
    if (editForm.description?.trim()) changes.description = editForm.description.trim()
    if (editForm.app_url?.trim()) changes.app_url = editForm.app_url.trim()
    if (editForm.reward_description?.trim()) changes.reward_description = editForm.reward_description.trim()
    if (!Object.keys(changes).length) { setEditError("No changes entered"); return }
    setEditSubmitting(true)
    try {
      const res  = await fetch(`/api/forge/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_wallet: wallet, changes }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error || "Submission failed"); return }
      setEditSubmitted(true)
      setEditOpen(false)
    } finally { setEditSubmitting(false) }
  }

  if (loading) {
    return (
      <ArcLayout active="forge">
        <div style={{ padding: "60px 28px", textAlign: "center", color: "var(--t2,#6b7da8)" }}>
          <div style={{ fontSize: 13, fontFamily: "var(--font-mono,monospace)" }}>Loading campaign...</div>
        </div>
      </ArcLayout>
    )
  }

  if (!campaign) {
    return (
      <ArcLayout active="forge">
        <div style={{ padding: "60px 28px", textAlign: "center", color: "var(--t2,#6b7da8)" }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Campaign not found</div>
          <button onClick={() => router.push("/forge")} style={{ fontSize: 13, color: "#1a56ff", background: "none", border: "none", cursor: "pointer" }}>← Back to Forge</button>
        </div>
      </ArcLayout>
    )
  }

  const tm      = TYPE_META[campaign.type]        || TYPE_META.beta_test
  const rm      = REWARD_META[campaign.reward_type] || REWARD_META.other
  const isFull  = campaign.total_slots && campaign.filled_slots >= campaign.total_slots
  const slotsLeft = campaign.total_slots ? Math.max(0, campaign.total_slots - campaign.filled_slots) : null

  const totalSteps     = campaign.tasks.length
  const isReviewStep   = flowStep === totalSteps
  const isDoneStep     = flowStep === totalSteps + 1
  const requiredQs     = campaign.review_questions.filter(q => q.required)
  const reviewComplete = requiredQs.every(q => wordCount(answers[q.id] || "") >= (q.min_words || 20))

  return (
    <ArcLayout active="forge">
      <div style={{ padding: "24px 16px", maxWidth: 860, margin: "0 auto" }}>

        {/* ── Back ── */}
        <button onClick={() => router.push("/forge")} style={{ fontSize: 12, color: "var(--t2,#6b7da8)", background: "none", border: "none", cursor: "pointer", marginBottom: 20, padding: 0 }}>
          ← Arc Trials
        </button>

        {/* ── Status Banners ── */}
        {campaign.status === "pending_approval" && (
          <div style={{ padding: "12px 16px", background: "rgba(224,136,16,0.06)", border: "1px solid rgba(224,136,16,0.2)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e08810", flexShrink: 0, boxShadow: "0 0 6px #e0881080" }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e08810", marginBottom: 2 }}>Pending Admin Approval</div>
              <div style={{ fontSize: 11, color: "var(--t2,#6b7da8)" }}>This campaign is under review. It will go live once approved and funded.</div>
            </div>
          </div>
        )}
        {campaign.status === "approved" && (
          <div style={{ padding: "12px 16px", background: "rgba(26,86,255,0.06)", border: "1px solid rgba(26,86,255,0.2)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#8aaeff", flexShrink: 0, boxShadow: "0 0 6px #8aaeff80" }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#8aaeff", marginBottom: 2 }}>Awaiting Founder Deposit</div>
              <div style={{ fontSize: 11, color: "var(--t2,#6b7da8)" }}>Approved — the founder needs to deposit USDC before this campaign goes live for testers.</div>
            </div>
          </div>
        )}
        {campaign.status === "rejected" && (
          <div style={{ padding: "12px 16px", background: "rgba(224,51,72,0.06)", border: "1px solid rgba(224,51,72,0.2)", borderRadius: 10, marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e03348", marginBottom: 4 }}>Campaign Rejected</div>
            {campaign.rejection_reason && <div style={{ fontSize: 11, color: "#e03348", opacity: 0.8, lineHeight: 1.5, marginBottom: 4 }}>{campaign.rejection_reason}</div>}
            <div style={{ fontSize: 11, color: "var(--t2,#6b7da8)" }}>Contact the Arclens team if you have questions.</div>
          </div>
        )}
        {campaign.status === "ended" && (
          <div style={{ padding: "12px 16px", background: "rgba(107,125,168,0.06)", border: "1px solid rgba(107,125,168,0.15)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6b7da8", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t2,#6b7da8)", marginBottom: 2 }}>Campaign Ended</div>
              <div style={{ fontSize: 11, color: "var(--t3,#2e3a5c)" }}>This campaign has closed. New submissions are no longer accepted.</div>
            </div>
          </div>
        )}

        {/* ── Hero Banner ── */}
        <div style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 14, marginBottom: 20, overflow: "hidden", borderTop: `2px solid ${tm.color}50` }}>
          <div style={{ padding: "24px 24px 20px", background: `linear-gradient(180deg, ${tm.color}08 0%, transparent 80%)` }}>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              {/* Logo 88x88 — abbr always rendered as fallback underneath */}
              <div style={{ position: "relative", width: 88, height: 88, borderRadius: 16, background: `${tm.color}12`, border: `1px solid ${tm.color}25`, flexShrink: 0, overflow: "hidden" }}>
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono,monospace)", color: tm.color, letterSpacing: "-0.02em" }}>{tm.abbr}</span>
                {(campaign.campaign_logo || campaign.project_logo) && (
                  <img src={`/api/image-proxy?url=${encodeURIComponent((campaign.campaign_logo || campaign.project_logo)!)}`} alt="" onError={e => (e.currentTarget.style.display = "none")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--t1,#e8ecff)", margin: "0 0 6px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>{campaign.title}</h1>
                {campaign.tagline && <p style={{ fontSize: 13, color: "var(--t2,#6b7da8)", margin: "0 0 12px", lineHeight: 1.6 }}>{campaign.tagline}</p>}
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", background: `${tm.color}15`, color: tm.color, border: `1px solid ${tm.color}25`, padding: "3px 9px", borderRadius: 4 }}>{tm.label}</span>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", background: `${rm.color}15`, color: rm.color, border: `1px solid ${rm.color}25`, padding: "3px 9px", borderRadius: 4 }}>{rm.label}</span>
                  {campaign.project_name && (
                    <span style={{ fontSize: 11, color: "var(--t3,#2e3a5c)", fontFamily: "var(--font-mono,monospace)" }}>{campaign.project_name}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Stat bar */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${campaign.expires_at ? 3 : 2}, 1fr)`, borderTop: "1px solid var(--bdr,rgba(255,255,255,0.06))" }}>
            {[
              { label: "slots left", value: slotsLeft !== null ? (slotsLeft === 0 ? "Full" : String(slotsLeft)) : "Open", color: slotsLeft === 0 ? "#e03348" : "#00b87a" },
              { label: "completed",  value: String(campaign.completion_count), color: "var(--t1,#e8ecff)" },
              ...(campaign.expires_at ? [{ label: "closes", value: new Date(campaign.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), color: "var(--t2,#6b7da8)" }] : []),
            ].map((s, i, arr) => (
              <div key={i} style={{ padding: "13px 0", textAlign: "center", borderRight: i < arr.length - 1 ? "1px solid var(--bdr,rgba(255,255,255,0.06))" : "none" }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: s.color, fontFamily: "var(--font-mono,monospace)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 9, color: "var(--t3,#2e3a5c)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 5, fontFamily: "var(--font-mono,monospace)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 20, alignItems: "start" }}
          className="forge-detail-grid"
        >

          {/* ── Left column ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Description */}
            <div style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono,monospace)", color: "var(--t2,#6b7da8)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>About this campaign</div>
              <p style={{ fontSize: 13, color: "var(--t1,#e8ecff)", lineHeight: 1.6, margin: "0 0 14px", whiteSpace: "pre-wrap" }}>{campaign.description}</p>
              {campaign.app_url && (
                <a href={campaign.app_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 18px", background: "rgba(26,86,255,0.1)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.25)", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none", letterSpacing: "-0.01em" }}>
                  Open app →
                </a>
              )}
            </div>

            {/* ── Step-by-step tester flow ── */}
            {!isOwner && (
              <div style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 12, overflow: "hidden" }}>

                {/* Campaign not active */}
                {campaign.status !== "active" ? (
                  <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--t2,#6b7da8)", fontSize: 13 }}>
                    {campaign.status === "approved"
                      ? "This campaign is approved but not yet funded — check back soon"
                      : campaign.status === "ended"
                      ? "This campaign has ended and is no longer accepting submissions"
                      : "This campaign is not currently accepting submissions"}
                  </div>

                ) : isFull ? (
                  <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--t2,#6b7da8)", fontSize: 13 }}>
                    All tester slots are filled for this campaign
                  </div>

                ) : !wallet ? (
                  <div style={{ padding: "36px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 13, color: "var(--t2,#6b7da8)", marginBottom: 16, lineHeight: 1.6 }}>
                      Connect your wallet to participate and earn <strong style={{ color: rm.color }}>{rm.label}</strong>
                    </div>
                    <button onClick={connectWallet}
                      style={{ height: 42, padding: "0 28px", background: "#1a56ff", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Connect Wallet
                    </button>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: "var(--t3,#2e3a5c)", marginTop: 12 }}>
                      MetaMask, Rabby, or any injected wallet
                    </div>
                  </div>

                ) : campaign.min_rank > 0 && testerRank !== null && testerRank < campaign.min_rank ? (
                  <div style={{ padding: "28px 24px 24px" }}>
                    {/* Lock header */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--surf2,#0e1224)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ color: "var(--t2,#6b7da8)" }}>
                          <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M7 9V6a3 3 0 016 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1,#e8ecff)", marginBottom: 5 }}>Access Restricted</div>
                      <div style={{ fontSize: 12, color: "var(--t2,#6b7da8)", textAlign: "center", lineHeight: 1.7, maxWidth: 280 }}>
                        This campaign requires <strong style={{ color: RANK_COLORS[campaign.min_rank] }}>{RANK_LABELS[campaign.min_rank]}</strong> rank. Build your reputation to unlock it.
                      </div>
                    </div>

                    {/* Rank comparison */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr", alignItems: "center", gap: 8, marginBottom: 20 }}>
                      {/* Current rank */}
                      <div style={{ background: "var(--surf2,#0e1224)", border: `1px solid ${RANK_COLORS[testerRank]}25`, borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, fontFamily: "var(--font-mono,monospace)", color: "var(--t3,#2e3a5c)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Your rank</div>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${RANK_COLORS[testerRank]}15`, border: `2px solid ${RANK_COLORS[testerRank]}50`, margin: "0 auto 8px" }} />
                        <div style={{ fontSize: 12, fontWeight: 700, color: RANK_COLORS[testerRank] }}>{RANK_LABELS[testerRank]}</div>
                      </div>
                      {/* Arrow */}
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--t3,#2e3a5c)" }}>
                          <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      {/* Required rank */}
                      <div style={{ background: "var(--surf2,#0e1224)", border: `1px solid ${RANK_COLORS[campaign.min_rank]}25`, borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, fontFamily: "var(--font-mono,monospace)", color: "var(--t3,#2e3a5c)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Required</div>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${RANK_COLORS[campaign.min_rank]}15`, border: `2px dashed ${RANK_COLORS[campaign.min_rank]}50`, margin: "0 auto 8px", position: "relative" }}>
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" style={{ color: `${RANK_COLORS[campaign.min_rank]}80` }}>
                              <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="2"/>
                              <path d="M7 9V6a3 3 0 016 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: RANK_COLORS[campaign.min_rank] }}>{RANK_LABELS[campaign.min_rank]}</div>
                      </div>
                    </div>

                    {/* What it takes */}
                    {testerProgress && (
                      <div style={{ background: "var(--surf2,#0e1224)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: "var(--t3,#2e3a5c)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                          Path to {testerProgress.label}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: 12, alignItems: "center" }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--t1,#e8ecff)", fontFamily: "var(--font-mono,monospace)", lineHeight: 1, marginBottom: 4 }}>
                              {testerProgress.campaigns_needed}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--t2,#6b7da8)", lineHeight: 1.4 }}>more campaigns<br/>to complete</div>
                          </div>
                          <div style={{ background: "var(--bdr,rgba(255,255,255,0.06))", height: "100%", minHeight: 40 }} />
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--t1,#e8ecff)", fontFamily: "var(--font-mono,monospace)", lineHeight: 1, marginBottom: 4 }}>
                              {testerProgress.score_needed}+
                            </div>
                            <div style={{ fontSize: 10, color: "var(--t2,#6b7da8)", lineHeight: 1.4 }}>avg quality<br/>score needed</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <button onClick={() => router.push("/forge")}
                      style={{ width: "100%", height: 42, background: "rgba(26,86,255,0.08)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em" }}>
                      Browse open campaigns →
                    </button>
                  </div>

                ) : alreadyDone ? (
                  /* Already submitted */
                  <div style={{ padding: "28px 20px", textAlign: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(0,184,122,0.1)", border: "1px solid rgba(0,184,122,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 16, color: "#00b87a" }}>✓</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#00b87a", marginBottom: 6 }}>Already submitted</div>
                    <div style={{ fontSize: 12, color: "var(--t2,#6b7da8)", marginBottom: campaign.reward_type === "usdc" && campaign.reward_usdc_amount && !claimed ? 18 : 0 }}>
                      Your completion is pending builder review
                    </div>
                    {campaign.reward_type === "usdc" && campaign.reward_usdc_amount ? (
                      claimed ? (
                        <div style={{ padding: "10px 16px", background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: 8, fontSize: 13, color: "#00d990", fontWeight: 600 }}>
                          ✓ ${campaign.reward_usdc_amount} USDC claimed
                        </div>
                      ) : (
                        <div>
                          {claimError && <div style={{ fontSize: 11, color: "#e03348", marginBottom: 8 }}>{claimError}</div>}
                          <button onClick={claimReward} disabled={claiming}
                            style={{ width: "100%", height: 42, background: claiming ? "var(--surf2,#0e1224)" : "rgba(0,184,122,0.12)", color: claiming ? "var(--t2,#6b7da8)" : "#00d990", border: "1px solid rgba(0,184,122,0.3)", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: claiming ? "default" : "pointer" }}>
                            {claiming ? "Claiming..." : `Claim $${campaign.reward_usdc_amount} USDC →`}
                          </button>
                        </div>
                      )
                    ) : null}
                  </div>

                ) : isDoneStep ? (
                  /* Submission complete */
                  <div style={{ padding: "28px 20px", textAlign: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(0,184,122,0.1)", border: "1px solid rgba(0,184,122,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 16, color: "#00b87a" }}>✓</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#00b87a", marginBottom: 6 }}>Submission received</div>
                    <div style={{ fontSize: 13, color: "var(--t2,#6b7da8)", marginBottom: 10 }}>
                      Quality score: <strong style={{ color: "var(--t1,#e8ecff)" }}>{autoScore}/100</strong>
                    </div>
                    {contractVerified !== null && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, marginBottom: 12,
                        background: contractVerified ? "rgba(0,184,122,0.08)" : "rgba(107,125,168,0.06)",
                        border: `1px solid ${contractVerified ? "rgba(0,184,122,0.2)" : "rgba(107,125,168,0.12)"}` }}>
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: contractVerified ? "#00d990" : "var(--t2,#6b7da8)" }}>
                          {contractVerified ? "✓ On-chain activity verified" : "On-chain activity not detected"}
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--t2,#6b7da8)", marginBottom: campaign.reward_type === "usdc" && campaign.reward_usdc_amount ? 16 : 0 }}>
                      Your reputation updates once the builder rates your feedback.
                    </div>
                    {campaign.reward_type === "usdc" && campaign.reward_usdc_amount ? (
                      claimed ? (
                        <div style={{ padding: "10px 16px", background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.2)", borderRadius: 8, fontSize: 13, color: "#00d990", fontWeight: 600 }}>
                          ✓ ${campaign.reward_usdc_amount} USDC claimed
                        </div>
                      ) : (
                        <div>
                          {claimError && <div style={{ fontSize: 11, color: "#e03348", marginBottom: 8 }}>{claimError}</div>}
                          <button onClick={claimReward} disabled={claiming}
                            style={{ width: "100%", height: 42, background: claiming ? "var(--surf2,#0e1224)" : "rgba(0,184,122,0.12)", color: claiming ? "var(--t2,#6b7da8)" : "#00d990", border: "1px solid rgba(0,184,122,0.3)", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: claiming ? "default" : "pointer" }}>
                            {claiming ? "Claiming..." : `Claim $${campaign.reward_usdc_amount} USDC →`}
                          </button>
                        </div>
                      )
                    ) : null}
                  </div>

                ) : (
                  /* Active flow — tasks + review */
                  <div>
                    {/* How this works — shown only before the first step */}
                    {flowStep === 0 && !isReviewStep && (
                      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--bdr,rgba(255,255,255,0.06))", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        {(["Do the steps", "Write feedback", `Earn ${rm.label}`] as string[]).map((s, i, arr) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#8aaeff", fontFamily: "var(--font-mono,monospace)" }}>{i + 1}</div>
                            <span style={{ fontSize: 11, color: "var(--t2,#6b7da8)", fontFamily: "var(--font-mono,monospace)" }}>{s}</span>
                            {i < arr.length - 1 && <span style={{ fontSize: 9, color: "var(--t3,#2e3a5c)" }}>→</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Progress header */}
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--bdr,rgba(255,255,255,0.06))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 11, fontFamily: "var(--font-mono,monospace)", color: "var(--t2,#6b7da8)" }}>
                        {isReviewStep
                          ? `All ${totalSteps} steps done · Share your feedback`
                          : `Step ${flowStep + 1} of ${totalSteps}`}
                      </div>
                      {/* Progress dots */}
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        {campaign.tasks.map((_, i) => (
                          <div key={i} style={{ width: i < flowStep ? 16 : 6, height: 6, borderRadius: 3,
                            background: i < flowStep ? "#00b87a" : i === flowStep ? "#1a56ff" : "var(--bdr,rgba(255,255,255,0.06))",
                            transition: "all 0.2s" }} />
                        ))}
                        <div style={{ width: isReviewStep ? 16 : 6, height: 6, borderRadius: 3,
                          background: isDoneStep ? "#00b87a" : isReviewStep ? "#1a56ff" : "var(--bdr,rgba(255,255,255,0.06))",
                          transition: "all 0.2s" }} />
                      </div>
                    </div>

                    {/* Completed steps summary */}
                    {flowStep > 0 && (
                      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--bdr,rgba(255,255,255,0.06))", display: "flex", flexDirection: "column", gap: 6 }}>
                        {campaign.tasks.slice(0, flowStep).map((task, i) => (
                          <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(0,184,122,0.1)", border: "1px solid rgba(0,184,122,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#00b87a", flexShrink: 0 }}>✓</div>
                            <span style={{ fontSize: 11, color: "var(--t2,#6b7da8)", opacity: 0.7 }}>{task.title}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Current task card OR review form */}
                    <div style={{ padding: "20px 20px 22px" }}>
                      {!isReviewStep ? (
                        /* Current task */
                        <div>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#8aaeff", fontFamily: "var(--font-mono,monospace)", flexShrink: 0 }}>
                              {String(flowStep + 1).padStart(2, "0")}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1,#e8ecff)", marginBottom: 6, lineHeight: 1.3 }}>
                                {campaign.tasks[flowStep].title}
                              </div>
                              {campaign.tasks[flowStep].description && (
                                <div style={{ fontSize: 13, color: "var(--t2,#6b7da8)", lineHeight: 1.6 }}>
                                  {campaign.tasks[flowStep].description}
                                </div>
                              )}
                            </div>
                          </div>
                          {campaign.app_url && (
                            <a href={campaign.app_url} target="_blank" rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", background: "rgba(26,86,255,0.06)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)", borderRadius: 7, fontSize: 12, textDecoration: "none", marginBottom: 10 }}>
                              Open app ↗
                            </a>
                          )}
                          <div style={{ fontSize: 11, color: "var(--t3,#2e3a5c)", fontFamily: "var(--font-mono,monospace)", marginBottom: 12, lineHeight: 1.6 }}>
                            Complete this step in the app, then mark it done below.
                          </div>
                          <button
                            onClick={() => setFlowStep(s => s + 1)}
                            style={{ width: "100%", height: 42, background: "#1a56ff", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em" }}>
                            {flowStep < totalSteps - 1 ? `Done — Next step →` : `Done — Share feedback →`}
                          </button>
                        </div>
                      ) : (
                        /* Feedback questions */
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1,#e8ecff)", marginBottom: 4 }}>Share your feedback</div>
                          <p style={{ fontSize: 12, color: "var(--t2,#6b7da8)", marginBottom: 18, lineHeight: 1.5 }}>
                            Be specific — reference what you actually did, what you saw, and what could be better.
                          </p>
                          {campaign.review_questions.map(q => {
                            const words  = wordCount(answers[q.id] || "")
                            const min    = q.min_words || 20
                            const enough = words >= min
                            return (
                              <div key={q.id} style={{ marginBottom: 16 }}>
                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                                  <label style={{ fontSize: 12, fontWeight: 500, color: "var(--t1,#e8ecff)" }}>
                                    {q.label}{q.required && <span style={{ color: "#e03348", marginLeft: 2 }}>*</span>}
                                  </label>
                                  <span style={{ fontSize: 10, color: enough ? "#00b87a" : "var(--t3,#2e3a5c)", fontFamily: "var(--font-mono,monospace)" }}>
                                    {words}/{min}
                                  </span>
                                </div>
                                <textarea
                                  placeholder={q.placeholder}
                                  value={answers[q.id] || ""}
                                  onChange={e => setAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                  rows={4}
                                  style={{ width: "100%", background: "var(--surf2,#0e1224)", border: `1px solid ${enough ? "rgba(0,184,122,0.3)" : "var(--bdr,rgba(255,255,255,0.06))"}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--t1,#e8ecff)", outline: "none", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit", boxSizing: "border-box" }}
                                />
                              </div>
                            )
                          })}
                          {submitError && (
                            <div style={{ fontSize: 12, color: "#e03348", marginBottom: 12, padding: "8px 12px", background: "rgba(224,51,72,0.08)", borderRadius: 8 }}>{submitError}</div>
                          )}
                          <button
                            onClick={submitCompletion}
                            disabled={submitting || !reviewComplete}
                            style={{ width: "100%", height: 42, background: reviewComplete ? "#1a56ff" : "var(--surf2,#0e1224)", color: reviewComplete ? "#fff" : "var(--t2,#6b7da8)", border: reviewComplete ? "none" : "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: reviewComplete && !submitting ? "pointer" : "default", letterSpacing: "-0.01em" }}>
                            {submitting ? "Submitting..." : "Submit Completion →"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Builder: Rate Testers ── */}
            {isOwner && completions.length > 0 && (
              <div style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, fontFamily: "var(--font-mono,monospace)", color: "var(--t2,#6b7da8)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
                  Rate Testers
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                    {completions.map(c => (
                      <button key={c.tester_wallet} onClick={() => setRatingWallet(ratingWallet === c.tester_wallet ? "" : c.tester_wallet)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%",
                          background: ratingWallet === c.tester_wallet ? "rgba(26,86,255,0.08)" : "var(--surf2,#0e1224)",
                          border: `1px solid ${ratingWallet === c.tester_wallet ? "rgba(26,86,255,0.3)" : "var(--bdr,rgba(255,255,255,0.06))"}` }}>
                        <WalletAvatar wallet={c.tester_wallet} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontFamily: "var(--font-mono,monospace)", color: "var(--t1,#e8ecff)" }}>
                            {c.tester_wallet.slice(0, 8)}...{c.tester_wallet.slice(-6)}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--t2,#6b7da8)", marginTop: 1 }}>
                            Score {c.auto_score}/100{c.builder_rating ? ` · rated ${c.builder_rating}★` : " · unrated"}
                          </div>
                        </div>
                        <a href={`/tester/${c.tester_wallet}`} onClick={e => e.stopPropagation()}
                          style={{ fontSize: 9, fontFamily: "var(--font-mono,monospace)", color: "var(--t3,#2e3a5c)", textDecoration: "none", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--bdr,rgba(255,255,255,0.06))", flexShrink: 0 }}>
                          Profile
                        </a>
                      </button>
                    ))}
                  </div>
                  {/* Show selected tester's feedback */}
                  {ratingWallet && (() => {
                    const sel = completions.find(c => c.tester_wallet === ratingWallet)
                    if (!sel?.review_answers || !Object.keys(sel.review_answers).length) return null
                    return (
                      <div style={{ marginBottom: 14, background: "var(--bg,#060812)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: "var(--t3,#2e3a5c)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                          Tester Feedback · Auto score: {sel.auto_score}/100
                        </div>
                        {campaign.review_questions.map(q => {
                          const ans = sel.review_answers[q.id]
                          if (!ans) return null
                          return (
                            <div key={q.id} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t1,#e8ecff)", marginBottom: 4 }}>{q.label}</div>
                              <div style={{ fontSize: 12, color: "var(--t2,#6b7da8)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{ans}</div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setRatingVal(n)}
                        style={{ flex: 1, height: 36, borderRadius: 8, background: ratingVal >= n ? "#c0882820" : "var(--surf2,#0e1224)", border: `1px solid ${ratingVal >= n ? "#c08828" : "var(--bdr,rgba(255,255,255,0.06))"}`, color: ratingVal >= n ? "#c08828" : "var(--t2,#6b7da8)", fontSize: 16, cursor: "pointer" }}
                      >★</button>
                    ))}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--t2,#6b7da8)", cursor: "pointer", marginBottom: 12 }}>
                    <input type="checkbox" checked={ratingImpact} onChange={e => setRatingImpact(e.target.checked)} />
                    Credit this tester — their feedback shaped a change
                  </label>
                  <button
                    onClick={submitRating}
                    disabled={!ratingWallet || !ratingVal || ratingLoading}
                    style={{ width: "100%", height: 38, background: ratingWallet && ratingVal ? "#1a56ff" : "var(--surf2,#0e1224)", color: ratingWallet && ratingVal ? "#fff" : "var(--t2,#6b7da8)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: ratingWallet && ratingVal ? "pointer" : "default" }}
                  >
                    {ratingLoading ? "Saving..." : "Save Rating"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Owner: Edit Campaign ── */}
            {isOwner && (
              <div style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 12, overflow: "hidden" }}>
                <button onClick={() => setEditOpen(o => !o)}
                  style={{ width: "100%", padding: "15px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1,#e8ecff)" }}>Edit Campaign</div>
                    <div style={{ fontSize: 11, fontFamily: "var(--font-mono,monospace)", color: "var(--t3,#2e3a5c)", marginTop: 2 }}>Changes go to admin for review</div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--t3,#2e3a5c)", transform: editOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▾</span>
                </button>

                {editOpen && (
                  <div style={{ borderTop: "1px solid var(--bdr,rgba(255,255,255,0.06))", padding: "16px 20px 20px" }}>
                    {/* Pending state — block form while review is in progress */}
                    {(editSubmitted || pendingUpdate?.status === "pending") ? (
                      <div style={{ textAlign: "center", padding: "8px 0" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(224,136,16,0.1)", border: "1px solid rgba(224,136,16,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 14, color: "#e08810" }}>⏳</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e08810", marginBottom: 4 }}>Edit pending admin review</div>
                        <div style={{ fontSize: 11, fontFamily: "var(--font-mono,monospace)", color: "var(--t2,#6b7da8)" }}>You'll be notified by email once approved or rejected</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {pendingUpdate?.status === "rejected" && (
                          <div style={{ padding: "10px 14px", background: "rgba(224,51,72,0.07)", border: "1px solid rgba(224,51,72,0.2)", borderRadius: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#e03348", marginBottom: pendingUpdate.admin_note ? 4 : 0 }}>Last edit request was not approved</div>
                            {pendingUpdate.admin_note && (
                              <div style={{ fontSize: 11, color: "#e03348", opacity: 0.85, lineHeight: 1.5 }}>{pendingUpdate.admin_note}</div>
                            )}
                            <div style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: "var(--t3,#2e3a5c)", marginTop: 4 }}>Submit a revised request below</div>
                          </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <EF label="Extend deadline">
                            <input type="date" value={editForm.expires_at || ""} onChange={e => setEditForm(f => ({ ...f, expires_at: e.target.value }))} style={ei} />
                          </EF>
                          <EF label={`Slots${campaign.filled_slots > 0 ? ` (${campaign.filled_slots} filled)` : ""}`}>
                            <input type="number" min={campaign.filled_slots || 1} value={editForm.total_slots || ""} onChange={e => setEditForm(f => ({ ...f, total_slots: e.target.value }))} placeholder={campaign.total_slots ? String(campaign.total_slots) : "—"} style={ei} />
                          </EF>
                        </div>
                        <EF label="Tagline">
                          <input type="text" value={editForm.tagline || ""} onChange={e => setEditForm(f => ({ ...f, tagline: e.target.value }))} placeholder={campaign.tagline || "One-line hook"} style={ei} />
                        </EF>
                        <EF label="Description">
                          <textarea value={editForm.description || ""} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Updated description..." style={{ ...ei, height: "auto", padding: "8px 10px", resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }} />
                        </EF>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <EF label="App URL">
                            <input type="url" value={editForm.app_url || ""} onChange={e => setEditForm(f => ({ ...f, app_url: e.target.value }))} placeholder={campaign.app_url || "https://"} style={ei} />
                          </EF>
                          <EF label="Reward details">
                            <input type="text" value={editForm.reward_description || ""} onChange={e => setEditForm(f => ({ ...f, reward_description: e.target.value }))} placeholder={campaign.reward_description || "What testers earn"} style={ei} />
                          </EF>
                        </div>
                        <EF label="Contract address" >
                          <input type="text" value={editForm.contract_address || ""} onChange={e => setEditForm(f => ({ ...f, contract_address: e.target.value.trim() }))} placeholder={campaign.contract_address || "0x... (leave blank to keep current)"} style={{ ...ei, fontFamily: "'DM Mono', monospace", fontSize: 11 }} />
                        </EF>
                        {editError && (
                          <div style={{ fontSize: 11, color: "#e03348", padding: "7px 10px", background: "rgba(224,51,72,0.08)", borderRadius: 6, fontFamily: "var(--font-mono,monospace)" }}>{editError}</div>
                        )}
                        <button onClick={submitCampaignEdit} disabled={editSubmitting}
                          style={{ height: 38, background: editSubmitting ? "var(--surf2,#0e1224)" : "#1a56ff", color: editSubmitting ? "var(--t2,#6b7da8)" : "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: editSubmitting ? "default" : "pointer" }}>
                          {editSubmitting ? "Submitting..." : "Submit for Review"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Reward */}
            <div style={{ background: "var(--surf,#0a0e1a)", border: `1px solid ${rm.color}30`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: rm.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>What you get</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: rm.color, marginBottom: 6 }}>{rm.label}</div>
              {campaign.reward_description && (
                <p style={{ fontSize: 12, color: "var(--t2,#6b7da8)", margin: 0, lineHeight: 1.5 }}>{campaign.reward_description}</p>
              )}
            </div>

            {/* Rank requirement */}
            {campaign.min_rank > 0 && (
              <div style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: "var(--t2,#6b7da8)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Rank Required</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#c08828" }}>{RANK_LABELS[campaign.min_rank]}</div>
                <div style={{ fontSize: 11, color: "var(--t2,#6b7da8)", marginTop: 4 }}>Complete other campaigns to unlock this one</div>
              </div>
            )}

            {/* Campaign details */}
            <div style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: "var(--t2,#6b7da8)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Details</div>
              {[
                { label: "Type",      value: TYPE_META[campaign.type]?.label || campaign.type },
                { label: "Slots",     value: campaign.total_slots ? `${campaign.filled_slots}/${campaign.total_slots}` : "Unlimited" },
                { label: "Selection", value: campaign.is_fcfs ? "First come, first served" : "Builder selects" },
                { label: "Tasks",     value: `${campaign.tasks.length} step${campaign.tasks.length !== 1 ? "s" : ""}` },
                { label: "Posted",    value: new Date(campaign.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                ...(campaign.expires_at ? [{ label: "Closes", value: new Date(campaign.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }] : []),
              ].map(d => (
                <div key={d.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--t2,#6b7da8)" }}>{d.label}</span>
                  <span style={{ fontSize: 12, color: "var(--t1,#e8ecff)", fontWeight: 500 }}>{d.value}</span>
                </div>
              ))}
            </div>

            {/* Builder info */}
            <div style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono,monospace)", color: "var(--t2,#6b7da8)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Hosted by</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ position: "relative", width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: "1px solid var(--bdr,rgba(255,255,255,0.06))", background: "var(--surf2,#0e1224)" }}>
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "var(--t3,#2e3a5c)", fontFamily: "var(--font-mono,monospace)" }}>
                    {(campaign.project_name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  {(campaign.project_logo || campaign.campaign_logo) && (
                    <img src={`/api/image-proxy?url=${encodeURIComponent((campaign.project_logo || campaign.campaign_logo)!)}`} alt="" onError={e => (e.currentTarget.style.display = "none")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {campaign.project_name
                    ? <a href={`/ecosystem/${campaign.project_name.toLowerCase().replace(/\s+/g, "-")}`}
                        style={{ fontSize: 14, fontWeight: 700, color: "var(--t1,#e8ecff)", textDecoration: "none", display: "block", marginBottom: 3 }}
                        onMouseOver={e => (e.currentTarget.style.color = "#8aaeff")}
                        onMouseOut={e => (e.currentTarget.style.color = "var(--t1,#e8ecff)")}
                      >
                        {campaign.project_name}
                      </a>
                    : <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t1,#e8ecff)", display: "block", marginBottom: 3 }}>Unknown Project</span>
                  }
                  <div style={{ fontSize: 11, color: "var(--t3,#2e3a5c)" }}>Verified on Arc Ecosystem</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ArcLayout>
  )
}

const ei: React.CSSProperties = {
  width: "100%", height: 34, background: "var(--surf2,#0e1224)",
  border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 7,
  padding: "0 10px", fontSize: 12, color: "var(--t1,#e8ecff)", outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
}

function EF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--t2,#6b7da8)", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}
