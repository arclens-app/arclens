"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import ArcLayout from "@/components/ArcLayout"
import { useArcStore } from "@/store/arc"

interface Task { id: string; title: string; description: string; contract_address?: string }
interface ReviewQuestion { id: string; label: string; placeholder: string; min_words: number; required: boolean }
interface Project { id: number; name: string; logo_url: string | null }

// Types that require a deployed contract address
const CONTRACT_REQUIRED = new Set(["beta_test", "stress_test", "edge_case", "integration", "builder_audit", "payment_flow"])
// Types where contract address is not applicable (UI/product only)
const CONTRACT_HIDDEN = new Set(["ux_review", "onboarding"])

const TYPES = [
  { id: "beta_test",     abbr: "BT", label: "Beta Test",          color: "#1a56ff", tag: "Most popular",  desc: "Walk real users through your core contract flow end-to-end on Arc Testnet" },
  { id: "payment_flow",  abbr: "PF", label: "Payment Flow Test",  color: "#00d990", tag: "Arc native",    desc: "Verify USDC transfers, settlement logic, and multi-step payment sequences" },
  { id: "stress_test",   abbr: "ST", label: "Stress Test",        color: "#e08810", tag: "Concurrency",   desc: "Test rapid consecutive transactions and concurrent state changes on-chain" },
  { id: "edge_case",     abbr: "EC", label: "Edge Case Hunt",     color: "#a855f7", tag: "Deep testing",  desc: "Find the inputs and sequences that break your financial contract logic" },
  { id: "ux_review",     abbr: "UX", label: "UX Review",          color: "#00b87a", tag: "Product feel",  desc: "Capture first impressions, friction points, and clarity gaps in your UI" },
  { id: "onboarding",    abbr: "OB", label: "Onboarding Test",    color: "#06b6d4", tag: "Retention",     desc: "Test the new user journey from zero — no docs, no prior knowledge" },
  { id: "integration",   abbr: "IT", label: "Integration Test",   color: "#6366f1", tag: "Ecosystem",     desc: "Verify your protocol interoperates correctly with other Arc contracts" },
  { id: "builder_audit", abbr: "BA", label: "Builder Audit",      color: "#ec4899", tag: "Developer",     desc: "Invite builders to review your contract code, architecture, and security" },
]

const REWARDS = [
  { id: "usdc",             label: "USDC",             color: "#00d990", desc: "Paid on-chain via Arc App Kit" },
  { id: "whitelist",        label: "Whitelist Spot",   color: "#8aaeff", desc: "Guaranteed launch access" },
  { id: "early_access",     label: "Early Access",     color: "#a855f7", desc: "Beta or preview access" },
  { id: "token_allocation", label: "Token Allocation", color: "#1a56ff", desc: "Future token or airdrop" },
  { id: "discord_role",     label: "Discord Role",     color: "#6366f1", desc: "Special community status" },
  { id: "credit",           label: "Public Credit",    color: "#c08828", desc: "Named in launch and posts" },
  { id: "other",            label: "Custom",           color: "#6b7da8", desc: "Define your own reward" },
]

const TEMPLATES: Record<string, { tasks: Task[]; questions: ReviewQuestion[] }> = {
  beta_test: {
    tasks: [
      { id: "t1", title: "Connect your wallet to the app", description: "Use MetaMask or Rabby on Arc Testnet" },
      { id: "t2", title: "Complete the core action", description: "Execute the main function as a first-time user would" },
      { id: "t3", title: "Verify the outcome", description: "Confirm the result is visible and matches what was promised" },
    ],
    questions: [
      { id: "q1", label: "What worked exactly as expected?", placeholder: "Be specific — which steps, screens, or outcomes felt smooth?", min_words: 30, required: true },
      { id: "q2", label: "What confused or slowed you down?", placeholder: "Any step where you hesitated, got an error, or weren't sure what to do.", min_words: 30, required: true },
      { id: "q3", label: "If you were the founder, what would you fix first?", placeholder: "One concrete change that would most improve the experience.", min_words: 20, required: true },
    ],
  },
  stress_test: {
    tasks: [
      { id: "t1", title: "Execute 5 transactions in quick succession", description: "Send 5 separate transactions within 2 minutes — Arc finalizes in under 1 second so pace them fast" },
      { id: "t2", title: "Try minimum and maximum input values", description: "Attempt the core action at both extremes of the valid input range" },
      { id: "t3", title: "Submit a transaction while a prior one is still confirming", description: "Test concurrent state — does the contract handle overlapping nonces correctly?" },
    ],
    questions: [
      { id: "q1", label: "Did any transactions fail, revert, or produce unexpected output?", placeholder: "Which attempt, what error appeared, and at what input value?", min_words: 30, required: true },
      { id: "q2", label: "How did the contract handle rapid sequential input?", placeholder: "Nonce issues, race conditions, state inconsistencies? Describe exactly what you observed.", min_words: 30, required: true },
    ],
  },
  edge_case: {
    tasks: [
      { id: "t1", title: "Try a zero-value or minimum input", description: "Attempt the core action with the smallest theoretically valid input" },
      { id: "t2", title: "Interrupt a multi-step flow mid-way", description: "Start a process, leave, return — does state persist correctly?" },
      { id: "t3", title: "Try an out-of-order sequence", description: "Attempt a later step before earlier ones are complete" },
    ],
    questions: [
      { id: "q1", label: "What broke, reverted, or gave unexpected output?", placeholder: "Exact input, expected behavior, and what actually happened.", min_words: 40, required: true },
      { id: "q2", label: "Were error messages helpful and accurate?", placeholder: "Did the app explain what went wrong? Were the messages actionable?", min_words: 25, required: true },
    ],
  },
  ux_review: {
    tasks: [
      { id: "t1", title: "Explore the app freely for 10–15 minutes", description: "Use it as a real user — don't follow a script" },
    ],
    questions: [
      { id: "q1", label: "First impression — what stood out in the first 60 seconds?", placeholder: "Exactly what caught your attention, positive or negative.", min_words: 25, required: true },
      { id: "q2", label: "Where did you feel friction or confusion?", placeholder: "Any moment you weren't sure what to do, or something behaved unexpectedly.", min_words: 25, required: true },
      { id: "q3", label: "Would you use this with real funds on mainnet?", placeholder: "Be honest. What would need to change? What already earns your trust?", min_words: 20, required: true },
    ],
  },
  onboarding: {
    tasks: [
      { id: "t1", title: "Come in as a complete newcomer", description: "Read only the homepage — no docs, no prior knowledge. Try the first action." },
      { id: "t2", title: "Complete your first on-chain action", description: "Without asking for help, do what the product is clearly designed for" },
    ],
    questions: [
      { id: "q1", label: "Could you figure out what to do without help?", placeholder: "What you understood, what was unclear, and where you had to guess.", min_words: 30, required: true },
      { id: "q2", label: "What would have made onboarding faster?", placeholder: "A tooltip, a clearer label, a shorter required step — be specific.", min_words: 25, required: true },
    ],
  },
  integration: {
    tasks: [
      { id: "t1", title: "Acquire USDC or tokens from another Arc protocol", description: "Use a listed Arc protocol (lending, AMM, etc.) to get the assets needed for this test" },
      { id: "t2", title: "Execute the cross-contract interaction", description: "Use those assets to interact with this campaign's target contract" },
      { id: "t3", title: "Verify final state across both protocols", description: "Confirm balances, allowances, and events are consistent on both sides" },
    ],
    questions: [
      { id: "q1", label: "Did the cross-protocol flow complete correctly end-to-end?", placeholder: "Each step, any failures, and whether the final on-chain state was correct.", min_words: 35, required: true },
      { id: "q2", label: "Where did the integration feel fragile or break down?", placeholder: "Approval issues, unexpected reverts, USDC allowance problems, confusing handoffs?", min_words: 25, required: true },
    ],
  },
  payment_flow: {
    tasks: [
      { id: "t1", title: "Initiate a USDC transfer or payment through the contract", description: "Execute the primary payment function — send, deposit, or settle as the protocol intends" },
      { id: "t2", title: "Verify the recipient balance and on-chain state", description: "Confirm the correct amount landed, events were emitted, and state updated as expected" },
      { id: "t3", title: "Test a reversal, cancellation, or dispute path (if applicable)", description: "Try to reverse, cancel, or dispute the payment — does the contract handle it correctly?" },
    ],
    questions: [
      { id: "q1", label: "Did the USDC flow complete correctly and settle to the right address?", placeholder: "Exact amounts, wallet addresses involved, and whether the final balance matched.", min_words: 30, required: true },
      { id: "q2", label: "Were there any stuck states, reverts, or incorrect balances?", placeholder: "Any step where funds appeared lost, locked, or not where they should be.", min_words: 30, required: true },
      { id: "q3", label: "How did the contract handle edge amounts (zero, max, odd decimals)?", placeholder: "Did very small or very large USDC amounts behave correctly? What broke?", min_words: 20, required: true },
    ],
  },
  builder_audit: {
    tasks: [
      { id: "t1", title: "Read the source code or architecture docs", description: "Review the provided contract source, README, or architecture overview" },
      { id: "t2", title: "Run the test suite locally", description: "Clone the repo, run tests, note coverage gaps or failing cases" },
      { id: "t3", title: "Execute the most complex function on testnet", description: "Verify behavior matches spec under real conditions" },
    ],
    questions: [
      { id: "q1", label: "List any logic errors, attack vectors, or inefficiencies you found", placeholder: "Function name, severity, suggested fix. Be as specific as possible.", min_words: 50, required: true },
      { id: "q2", label: "What aspects of the architecture are well designed?", placeholder: "What would you reuse or highlight in a peer review?", min_words: 25, required: true },
    ],
  },
}

function uid() { return Math.random().toString(36).slice(2, 8) }

const DRAFT_KEY = "arclens-campaign-draft"

export default function CreateCampaignPage() {
  const router    = useRouter()
  const wallet    = useArcStore(s => s.walletAddr)
  const setWallet = useArcStore(s => s.setWallet)
  const [projects, setProjects]     = useState<Project[]>([])
  const [hasProject, setHasProject] = useState<boolean | null>(null)
  const [mounted, setMounted]       = useState(false)
  const [walletMissing, setWalletMissing] = useState(false)

  const [type, setType]                         = useState("beta_test")
  const [title, setTitle]                       = useState("")
  const [tagline, setTagline]                   = useState("")
  const [description, setDescription]           = useState("")
  const [contractAddress, setContractAddress]   = useState("")
  // For protocols that verify on-chain actions in their own backend
  // (aggregator DEXes, off-chain matchers, custodial flows). When true we
  // skip the contract requirement and the on-chain verification gate at
  // /api/trials/[id]/complete fires only on contract-bearing campaigns.
  const [externalVerify, setExternalVerify]     = useState(false)
  // Show the 2 most common types up front; everything else behind a toggle so
  // first-time founders aren't paralyzed by 8 similarly-named options.
  const [showAdvancedTypes, setShowAdvancedTypes] = useState(false)
  const [projectId, setProjectId]               = useState<number | null>(null)
  const [tasks, setTasks]                       = useState<Task[]>(TEMPLATES.beta_test.tasks)
  const [questions, setQuestions]               = useState<ReviewQuestion[]>(TEMPLATES.beta_test.questions)
  const [rewardType, setRewardType]             = useState("whitelist")
  const [rewardDesc, setRewardDesc]             = useState("")
  const [rewardUsdcAmount, setRewardUsdcAmount] = useState("")
  const [totalSlots, setTotalSlots]             = useState("")
  const [expiresAt, setExpiresAt]               = useState("")
  const [isFcfs, setIsFcfs]                     = useState(true)
  const [minRank, setMinRank]                   = useState(0)
  const [campaignLogo, setCampaignLogo]         = useState<string | null>(null)
  const [logoPreview, setLogoPreview]           = useState<string | null>(null)
  const [logoUploading, setLogoUploading]       = useState(false)
  const [bannerPos, setBannerPos]               = useState({ x: 50, y: 50 })
  const [isDragging, setIsDragging]             = useState(false)
  const dragStart                               = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const bannerRef                               = useRef<HTMLDivElement>(null)
  const logoInputRef                            = useRef<HTMLInputElement>(null)
  const [appUrl, setAppUrl]                     = useState("")
  const [submitting, setSubmitting]             = useState(false)
  const [depositing, setDepositing]             = useState(false)
  const [error, setError]                       = useState("")
  const [draftRestored, setDraftRestored]       = useState(false)
  const errorRef                                = useRef<HTMLDivElement>(null)
  const saveTimer                               = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mono  = "'DM Mono', monospace"
  const bdr   = "var(--bdr, rgba(255,255,255,0.06))"
  const surf  = "var(--surf, #0a0e1a)"
  const surf2 = "var(--surf2, #0e1224)"
  const t1    = "var(--t1, #e8ecff)"
  const t2    = "var(--t2, #6b7da8)"
  const t3    = "var(--t3, #2e3a5c)"

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [error])

  // Save draft to localStorage, debounced 600ms
  const saveDraft = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          type, title, tagline, description, contractAddress, projectId,
          tasks, questions, rewardType, rewardDesc, rewardUsdcAmount,
          totalSlots, expiresAt, isFcfs, minRank, campaignLogo, bannerPos, appUrl,
        }))
      } catch { /* storage full — silent */ }
    }, 600)
  }, [type, title, tagline, description, contractAddress, projectId, tasks, questions,
      rewardType, rewardDesc, rewardUsdcAmount, totalSlots, expiresAt, isFcfs, minRank,
      campaignLogo, bannerPos, appUrl])

  useEffect(() => {
    if (mounted) saveDraft()
  }, [mounted, saveDraft])

  useEffect(() => {
    setMounted(true)
    const w = useArcStore.getState().walletAddr || localStorage.getItem("arclens-wallet")
    if (!w) { setWalletMissing(true); return }
    if (!useArcStore.getState().walletAddr) setWallet(w)

    // Restore saved draft
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.type)             setType(d.type)
        if (d.title)            setTitle(d.title)
        if (d.tagline)          setTagline(d.tagline)
        if (d.description)      setDescription(d.description)
        if (d.contractAddress)  setContractAddress(d.contractAddress)
        if (d.tasks?.length)    setTasks(d.tasks)
        if (d.questions?.length) setQuestions(d.questions)
        if (d.rewardType)       setRewardType(d.rewardType)
        if (d.rewardDesc)       setRewardDesc(d.rewardDesc)
        if (d.rewardUsdcAmount) setRewardUsdcAmount(d.rewardUsdcAmount)
        if (d.totalSlots)       setTotalSlots(d.totalSlots)
        if (d.expiresAt)        setExpiresAt(d.expiresAt)
        if (typeof d.isFcfs === "boolean") setIsFcfs(d.isFcfs)
        if (typeof d.minRank === "number") setMinRank(d.minRank)
        if (d.campaignLogo)     { setCampaignLogo(d.campaignLogo); setLogoPreview(d.campaignLogo) }
        if (d.bannerPos)        setBannerPos(d.bannerPos)
        if (d.appUrl)           setAppUrl(d.appUrl)
        setDraftRestored(true)
      }
    } catch { /* corrupt draft — ignore */ }

    fetch("/api/claim", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: w }) })
      .then(r => r.json())
      .then(d => {
        if (d.projects?.length) {
          setProjects(d.projects)
          setHasProject(true)
          if (d.projects.length === 1) setProjectId(prev => prev ?? d.projects[0].id)
        } else setHasProject(false)
      })
      .catch(() => setHasProject(false))
  }, [])

  async function connectWallet() {
    if (!(window as any).ethereum) { setError("No wallet detected. Install MetaMask or Rabby."); return }
    try {
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" })
      const addr = accounts?.[0]
      if (!addr) return
      localStorage.setItem("arclens-wallet", addr.toLowerCase())
      setWallet(addr.toLowerCase())
      setWalletMissing(false)
      fetch("/api/claim", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: addr.toLowerCase() }) })
        .then(r => r.json())
        .then(d => {
          if (d.projects?.length) {
            setProjects(d.projects)
            setHasProject(true)
            if (d.projects.length === 1) setProjectId(d.projects[0].id)
          } else setHasProject(false)
        })
        .catch(() => setHasProject(false))
    } catch { }
  }

  async function uploadLogo(file: File) {
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB"); return }
    // Show blob URL instantly — founder sees their logo immediately, zero proxy calls
    const blob = URL.createObjectURL(file)
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoPreview(blob)
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const { url } = await res.json()
      if (url) setCampaignLogo(url)
    } finally {
      setLogoUploading(false)
    }
  }

  function applyTemplate(t: string) {
    setType(t)
    const tmpl = TEMPLATES[t as keyof typeof TEMPLATES]
    if (tmpl) { setTasks(tmpl.tasks); setQuestions(tmpl.questions) }
    // Clear contract address when switching to a no-contract type
    if (CONTRACT_HIDDEN.has(t)) setContractAddress("")
  }

  function addTask() { setTasks(p => [...p, { id: uid(), title: "", description: "", contract_address: "" }]) }
  function updateTask(id: string, f: keyof Task, v: string) { setTasks(p => p.map(t => t.id === id ? { ...t, [f]: v } : t)) }
  function removeTask(id: string) { if (tasks.length > 1) setTasks(p => p.filter(t => t.id !== id)) }
  function addQuestion() { setQuestions(p => [...p, { id: uid(), label: "", placeholder: "", min_words: 25, required: true }]) }
  function updateQuestion(id: string, f: keyof ReviewQuestion, v: string | number | boolean) { setQuestions(p => p.map(q => q.id === id ? { ...q, [f]: v } : q)) }
  function removeQuestion(id: string) { if (questions.length > 1) setQuestions(p => p.filter(q => q.id !== id)) }

  async function submit() {
    setError("")
    if (!projectId)          { setError("Select a project to link this campaign to"); return }
    if (!title.trim())       { setError("Title is required"); return }
    if (!description.trim()) { setError("Description is required"); return }
    if (tasks.some(t => !t.title.trim()))     { setError("All tasks must have a title"); return }
    if (questions.some(q => !q.label.trim())) { setError("All questions must have a label"); return }
    if (rewardType === "usdc" && !rewardUsdcAmount) { setError("Enter the USDC amount per tester"); return }
    if (rewardType === "usdc" && !totalSlots)        { setError("Set a slot count for USDC campaigns"); return }
    if (CONTRACT_REQUIRED.has(type) && !contractAddress.trim() && !externalVerify) { setError("A contract address is required for this campaign type — or enable external verification if you handle on-chain checks yourself"); return }
    if (contractAddress && !/^0x[a-fA-F0-9]{40}$/.test(contractAddress.trim())) { setError("Contract address must be a valid 0x address"); return }

    let depositTxHash: string | null = null
    if (rewardType === "usdc" && rewardUsdcAmount && totalSlots) {
      const payoutAddr = process.env.NEXT_PUBLIC_ARCLENS_PAYOUT_ADDRESS
      if (!payoutAddr) { setError("Payout address not configured"); return }
      if (!(window as any).ethereum) { setError("Connect your wallet to deposit USDC"); return }
      setDepositing(true)
      try {
        const total = (parseFloat(rewardUsdcAmount) * parseInt(totalSlots)).toFixed(2)
        const { createAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2")
        const { AppKit } = await import("@circle-fin/app-kit")
        const adapter = await createAdapterFromProvider({ provider: (window as any).ethereum })
        const kit = new AppKit()
        const result = await kit.send({ from: { adapter: adapter as any, chain: "Arc_Testnet" }, to: payoutAddr, amount: total, token: "USDC" })
        depositTxHash = (result as any).txHash || (result as any).hash || ""
      } catch (e: any) {
        setError(e?.code === 4001 || String(e).includes("user rejected") ? "Transaction cancelled" : "Deposit failed: " + (e?.message || "Unknown error"))
        setDepositing(false)
        return
      } finally { setDepositing(false) }
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/trials", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), tagline: tagline.trim() || null, description: description.trim(), type,
          contract_address: contractAddress.trim() || null,
          campaign_logo: campaignLogo || null,
          app_url: appUrl.trim() || null,
          tasks, review_questions: questions,
          reward_type: rewardType, reward_description: rewardDesc.trim() || null,
          reward_usdc_amount: rewardType === "usdc" ? parseFloat(rewardUsdcAmount) : null,
          deposit_tx_hash: depositTxHash,
          total_slots: totalSlots ? parseInt(totalSlots) : null,
          is_fcfs: isFcfs, min_rank: minRank,
          project_id: projectId, creator_wallet: wallet, expires_at: expiresAt || null,
          banner_position: `${bannerPos.x}% ${bannerPos.y}%`,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed to create campaign"); return }
      localStorage.removeItem(DRAFT_KEY)
      router.push(`/trials/${data.slug || data.id}`)
    } finally { setSubmitting(false) }
  }

  const selectedType  = TYPES.find(t => t.id === type)!
  const selectedRwd   = REWARDS.find(r => r.id === rewardType)!
  const totalUsdcCost = rewardType === "usdc" && rewardUsdcAmount && totalSlots
    ? (parseFloat(rewardUsdcAmount) * parseInt(totalSlots)).toFixed(2) : null

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#060812" }} />

  if (walletMissing) return (
    <ArcLayout active="trials">
      <div style={{ padding: "80px 28px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 20, fontFamily: mono, fontWeight: 700, color: "#8aaeff" }}>⬡</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: t1, marginBottom: 8, letterSpacing: "-0.03em" }}>Connect your wallet</div>
        <p style={{ fontSize: 13, color: t2, lineHeight: 1.8, marginBottom: 28 }}>
          You need to connect your wallet to create a campaign. This links your campaign to your project on Arc Ecosystem.
        </p>
        {error && <div style={{ fontSize: 12, color: "#e03348", marginBottom: 16, padding: "10px 14px", background: "rgba(224,51,72,0.08)", borderRadius: 8, border: "1px solid rgba(224,51,72,0.2)" }}>{error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={connectWallet} style={{ height: 44, background: "#1a56ff", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em" }}>Connect Wallet</button>
          <button onClick={() => router.push("/trials")} style={{ height: 40, background: "transparent", color: t2, border: "1px solid " + bdr, borderRadius: 10, fontSize: 13, cursor: "pointer" }}>Back to Arc Trials</button>
        </div>
        <div style={{ fontSize: 11, fontFamily: mono, color: t3, marginTop: 16 }}>Works with MetaMask, Rabby, and any injected wallet</div>
      </div>
    </ArcLayout>
  )

  if (hasProject === null) return <div style={{ minHeight: "100vh", background: "#060812", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--t3, #2e3a5c)", letterSpacing: "0.08em" }}>Checking projects...</div></div>

  if (hasProject === false) return (
    <ArcLayout active="trials">
      <div style={{ padding: "80px 28px", maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 20, fontFamily: mono, fontWeight: 700, color: "#8aaeff" }}>!</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: t1, marginBottom: 10, letterSpacing: "-0.03em" }}>List your project first</div>
        <p style={{ fontSize: 13, color: t2, lineHeight: 1.8, marginBottom: 28, maxWidth: 420, margin: "0 auto 28px" }}>
          Every campaign on Arc Trials runs under a project that's been listed and approved on the Arc Ecosystem. Two paths:
        </p>

        {/* Two-path chooser — much clearer than a single generic CTA */}
        <div style={{ display: "grid", gap: 10, marginBottom: 16, textAlign: "left" }}>
          {/* Path A — never listed before */}
          <button onClick={() => router.push("/ecosystem?submit=1")}
            style={{ padding: "14px 16px", background: "rgba(26,86,255,0.06)", border: "1px solid rgba(26,86,255,0.25)", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(26,86,255,0.15)", color: "#8aaeff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>1</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t1, marginBottom: 2 }}>Submit a new project</div>
              <div style={{ fontSize: 11, color: t2, lineHeight: 1.5 }}>Opens the listing form. Approved within 24h, then come back here.</div>
            </div>
            <span style={{ color: "#8aaeff", fontSize: 16 }}>→</span>
          </button>

          {/* Path B — listed but not claimed */}
          <button onClick={() => router.push("/ecosystem")}
            style={{ padding: "14px 16px", background: "transparent", border: "1px solid " + bdr, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(107,125,168,0.08)", color: t2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>2</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t1, marginBottom: 2 }}>Already listed but not claimed?</div>
              <div style={{ fontSize: 11, color: t2, lineHeight: 1.5 }}>Find your project on Ecosystem and click <strong style={{ color: t1 }}>Claim Dashboard</strong> to attach this wallet.</div>
            </div>
            <span style={{ color: t3, fontSize: 16 }}>→</span>
          </button>
        </div>

        <button onClick={() => router.push("/trials")} style={{ height: 38, background: "transparent", color: t3, border: "1px solid " + bdr, borderRadius: 10, fontSize: 12, fontFamily: mono, cursor: "pointer", padding: "0 16px" }}>
          ← Back to Arc Trials
        </button>
      </div>
    </ArcLayout>
  )

  return (
    <ArcLayout active="trials">
      <div style={{ padding: "36px 28px 80px", maxWidth: 1240, margin: "0 auto" }}>

        {/* Header */}
        <button onClick={() => router.push("/trials")} style={{ fontSize: 12, color: t3, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 28, fontFamily: mono, display: "flex", alignItems: "center", gap: 6 }}>
          ← Arc Trials
        </button>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 10, fontFamily: mono, color: "#8aaeff", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>New Campaign</div>
          <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.035em", color: t1, margin: "0 0 10px", lineHeight: 1.15 }}>What do you need tested?</h1>
          <p style={{ fontSize: 14, color: t2, margin: 0, lineHeight: 1.7, maxWidth: 580 }}>
            Define your tasks and questions. ArcLens reviews it, then qualified testers on Arc Testnet complete the work and submit structured feedback.
          </p>
        </div>

        {/* Draft restored banner */}
        {draftRestored && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", marginBottom: 8, background: "rgba(26,86,255,0.06)", border: "1px solid rgba(26,86,255,0.2)", borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#8aaeff", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontFamily: mono, color: "#8aaeff" }}>Draft restored — continue where you left off</span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button onClick={() => {
                localStorage.removeItem(DRAFT_KEY)
                setDraftRestored(false)
                setType("beta_test"); setTitle(""); setTagline(""); setDescription("")
                setContractAddress(""); setProjectId(null)
                setTasks(TEMPLATES.beta_test.tasks); setQuestions(TEMPLATES.beta_test.questions)
                setRewardType("whitelist"); setRewardDesc(""); setRewardUsdcAmount("")
                setTotalSlots(""); setExpiresAt(""); setIsFcfs(true); setMinRank(0)
                setCampaignLogo(null); setLogoPreview(null); setBannerPos({ x: 50, y: 50 }); setAppUrl("")
              }} style={{ fontSize: 11, fontFamily: mono, color: "var(--t3,#2e3a5c)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                Clear draft
              </button>
              <button onClick={() => setDraftRestored(false)} style={{ fontSize: 14, color: "var(--t3,#2e3a5c)", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            </div>
          </div>
        )}

        {/* Two-column layout on wide screens — form on left, sticky preview on right.
            Collapses to single column below 960px via the .createLayout media query. */}
        <div className="createLayout" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 28, alignItems: "start" }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

          {/* ── 01 Campaign Type ── */}
          <Card step="01" title="Campaign type" sub="Pick the closest match — we'll pre-fill tasks and review questions you can edit. Most founders pick one of the two below.">
            {(() => {
              // Two most common picks visible by default. Everything else is one
              // click away. If the founder has an advanced type already selected
              // (e.g. from a saved draft), expand automatically so they see it.
              const PRIMARY  = new Set(["beta_test", "ux_review"])
              const primary  = TYPES.filter(t => PRIMARY.has(t.id))
              const advanced = TYPES.filter(t => !PRIMARY.has(t.id))
              const hasAdvancedSelected = !PRIMARY.has(type)
              const expanded = showAdvancedTypes || hasAdvancedSelected
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
                    {primary.map(ct => {
                      const active = type === ct.id
                      return (
                        <button key={ct.id} onClick={() => applyTemplate(ct.id)}
                          style={{ padding: 0, textAlign: "left", borderRadius: 10, cursor: "pointer", overflow: "hidden",
                            background: active ? `${ct.color}0c` : surf2,
                            border: `1px solid ${active ? ct.color + "55" : bdr}`,
                            transition: "all 0.1s",
                          }}>
                          <div style={{ height: 2, background: active ? ct.color : "transparent" }} />
                          <div style={{ padding: "14px 15px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                              <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: active ? ct.color : t3,
                                background: active ? `${ct.color}15` : "rgba(107,125,168,0.06)",
                                border: `1px solid ${active ? ct.color + "30" : bdr}`,
                                padding: "3px 7px", borderRadius: 5, letterSpacing: "0.04em" }}>
                                {ct.abbr}
                              </div>
                              <span style={{ fontSize: 8, fontFamily: mono, color: active ? ct.color : t3, letterSpacing: "0.06em", textTransform: "uppercase" }}>{ct.tag}</span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: active ? t1 : t2, marginBottom: 4, letterSpacing: "-0.01em" }}>{ct.label}</div>
                            <div style={{ fontSize: 11, color: t3, lineHeight: 1.5 }}>{ct.desc}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <button type="button" onClick={() => setShowAdvancedTypes(s => !s)}
                    style={{ background: "transparent", border: "1px dashed " + bdr, borderRadius: 8, padding: "8px 12px", width: "100%", fontSize: 11, fontFamily: mono, color: t3, letterSpacing: "0.04em", cursor: "pointer", textAlign: "center" }}>
                    {expanded ? "− Hide advanced types" : `+ More campaign types (${advanced.length})`}
                  </button>

                  {expanded && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginTop: 10 }}>
                      {advanced.map(ct => {
                        const active = type === ct.id
                        return (
                          <button key={ct.id} onClick={() => applyTemplate(ct.id)}
                            style={{ padding: 0, textAlign: "left", borderRadius: 10, cursor: "pointer", overflow: "hidden",
                              background: active ? `${ct.color}0c` : surf2,
                              border: `1px solid ${active ? ct.color + "55" : bdr}`,
                              transition: "all 0.1s",
                            }}>
                            <div style={{ height: 2, background: active ? ct.color : "transparent" }} />
                            <div style={{ padding: "12px 13px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                                <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: active ? ct.color : t3,
                                  background: active ? `${ct.color}15` : "rgba(107,125,168,0.06)",
                                  border: `1px solid ${active ? ct.color + "30" : bdr}`,
                                  padding: "3px 7px", borderRadius: 5, letterSpacing: "0.04em" }}>
                                  {ct.abbr}
                                </div>
                                <span style={{ fontSize: 8, fontFamily: mono, color: active ? ct.color : t3, letterSpacing: "0.06em", textTransform: "uppercase" }}>{ct.tag}</span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: active ? t1 : t2, marginBottom: 4, letterSpacing: "-0.01em" }}>{ct.label}</div>
                              <div style={{ fontSize: 11, color: t3, lineHeight: 1.5 }}>{ct.desc}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()}
          </Card>

          {/* ── 02 Campaign Details ── */}
          <Card step="02" title="Campaign details" sub="The more context you give, the better feedback you'll get. Be specific about what stage you're at.">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Campaign banner upload — the live preview is now in the sidebar
                  (no more duplicate card preview next to the uploader) */}
              <div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: t1, marginBottom: 6 }}>
                    Campaign banner
                    <span style={{ fontSize: 10, fontFamily: mono, color: t3, fontWeight: 400, marginLeft: 6 }}>
                      {logoPreview ? "· drag to reposition · exact size as live page" : "· full-width cover on campaign page (200px tall)"}
                    </span>
                  </div>
                  {/* Banner preview — drag to reposition when image loaded */}
                  <div
                    ref={bannerRef}
                    onClick={() => { if (!logoPreview) logoInputRef.current?.click() }}
                    onMouseDown={logoPreview ? (e) => {
                      e.preventDefault()
                      dragStart.current = { mx: e.clientX, my: e.clientY, px: bannerPos.x, py: bannerPos.y }
                      setIsDragging(true)
                      const onMove = (ev: MouseEvent) => {
                        if (!dragStart.current || !bannerRef.current) return
                        const rect = bannerRef.current.getBoundingClientRect()
                        const dx = ((ev.clientX - dragStart.current.mx) / rect.width) * 100
                        const dy = ((ev.clientY - dragStart.current.my) / rect.height) * 100
                        setBannerPos({
                          x: Math.max(0, Math.min(100, dragStart.current.px - dx)),
                          y: Math.max(0, Math.min(100, dragStart.current.py - dy)),
                        })
                      }
                      const onUp = () => {
                        dragStart.current = null
                        setIsDragging(false)
                        window.removeEventListener("mousemove", onMove)
                        window.removeEventListener("mouseup", onUp)
                      }
                      window.addEventListener("mousemove", onMove)
                      window.addEventListener("mouseup", onUp)
                    } : undefined}
                    style={{
                      position: "relative", width: "100%", height: 200, borderRadius: 10, overflow: "hidden",
                      background: `linear-gradient(135deg, ${selectedType.color}18 0%, ${selectedType.color}06 100%)`,
                      border: `1px dashed ${logoPreview ? "rgba(0,184,122,0.35)" : selectedType.color + "40"}`,
                      cursor: logoPreview ? (isDragging ? "grabbing" : "grab") : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      userSelect: "none",
                    }}
                  >
                    {logoPreview ? (
                      <>
                        <img
                          src={logoPreview} alt="" draggable={false}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${bannerPos.x}% ${bannerPos.y}%`, pointerEvents: "none" }}
                        />
                        {/* Drag hint overlay */}
                        {!isDragging && (
                          <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "3px 10px", fontSize: 10, color: "rgba(255,255,255,0.8)", fontFamily: mono, whiteSpace: "nowrap", pointerEvents: "none" }}>
                            ⠿ drag to reposition
                          </div>
                        )}
                      </>
                    ) : logoUploading ? (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #1a56ff", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
                    ) : (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 26, fontWeight: 900, fontFamily: mono, color: `${selectedType.color}35`, letterSpacing: "-0.04em", lineHeight: 1 }}>{selectedType.abbr}</div>
                        <div style={{ fontSize: 11, color: t2, marginTop: 10, fontWeight: 500 }}>Click to upload banner</div>
                        <div style={{ fontSize: 10, fontFamily: mono, color: t3, marginTop: 4 }}>Recommended: 16:9 — e.g. 1920 × 1080 or 4824 × 2714 high-res</div>
                        <div style={{ fontSize: 10, fontFamily: mono, color: t3, marginTop: 2 }}>PNG, JPG, WebP, GIF · max 5MB · renders full-width, 200px tall — drag to crop after upload</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                      style={{ height: 30, padding: "0 14px", background: surf2, border: "1px solid " + bdr, borderRadius: 7, fontSize: 12, color: logoUploading ? t3 : t1, cursor: logoUploading ? "default" : "pointer" }}>
                      {logoUploading ? "Uploading..." : campaignLogo ? "Change" : "Upload"}
                    </button>
                    <span style={{ fontSize: 10, fontFamily: mono, color: t3 }}>PNG, JPG, GIF · max 5MB</span>
                    {campaignLogo && (
                      <button type="button" onClick={() => { setCampaignLogo(null); if (logoPreview) { URL.revokeObjectURL(logoPreview); setLogoPreview(null) }; setBannerPos({ x: 50, y: 50 }) }}
                        style={{ fontSize: 10, fontFamily: mono, color: "#e03348", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        Remove
                      </button>
                    )}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
                </div>

              </div>

              <Field label="Title" required>
                <input type="text" value={title} onChange={e => setTitle(e.target.value.slice(0,80))}
                  placeholder={`e.g. ${selectedType.label} — Core Swap Flow`}
                  style={inp} />
                {title.length > 45 && <Ctr n={title.length} max={80} />}
              </Field>

              <Field label="Tagline" hint="One line that tells testers why this is worth their time">
                <input type="text" value={tagline} onChange={e => setTagline(e.target.value.slice(0,160))}
                  placeholder="e.g. Help us stress-test our AMM before we go live with $500k TVL"
                  style={inp} />
              </Field>

              <Field label="Description" required hint="What you're building, what stage it's at, what feedback matters most">
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}
                  placeholder={"Tell testers what your protocol does, where it is in development, and exactly what you need them to focus on.\n\nExample: We just shipped v2 of our AMM. The swap flow is live on Arc Testnet at [url]. We want to find gas inefficiencies and edge cases around slippage before launch."}
                  style={{ ...inp, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.7, fontFamily: "inherit", minHeight: 110 }} />
              </Field>

              <Field label="App / testnet URL" hint="Link shown as a CTA button for testers to open the app">
                <input type="url" value={appUrl} onChange={e => setAppUrl(e.target.value)}
                  placeholder="https://app.yourproject.xyz"
                  style={inp} />
              </Field>

              {/* External-verification opt-in — for aggregator DEXes, off-chain matchers,
                  custodial flows. When on, contract fields are hidden and the on-chain
                  participation gate in /complete is skipped. */}
              {!CONTRACT_HIDDEN.has(type) && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: externalVerify ? "rgba(0,184,122,0.05)" : surf2, border: `1px solid ${externalVerify ? "rgba(0,184,122,0.25)" : bdr}`, borderRadius: 8, cursor: "pointer", marginBottom: 12 }}>
                  <input type="checkbox" checked={externalVerify}
                    onChange={e => { setExternalVerify(e.target.checked); if (e.target.checked) setContractAddress("") }}
                    style={{ marginTop: 2, accentColor: "#00b87a" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: externalVerify ? "#00d990" : t1 }}>External verification</div>
                    <div style={{ fontSize: 11, color: t2, lineHeight: 1.6, marginTop: 3 }}>
                      I'll verify tester actions in my own backend. Skip ArcLens's on-chain checks and don't ask testers for a contract.
                    </div>
                  </div>
                </label>
              )}

              <div className="twoColGrid" style={{ display: "grid", gridTemplateColumns: (CONTRACT_HIDDEN.has(type) || externalVerify) ? "1fr" : "1fr 1fr", gap: 12 }}>
                {/* Primary contract — hidden when type is UI-only OR external verification is on */}
                {!CONTRACT_HIDDEN.has(type) && !externalVerify && (
                  <Field
                    label="Primary contract"
                    required={CONTRACT_REQUIRED.has(type)}
                    hint={CONTRACT_REQUIRED.has(type) ? "Main contract — tasks can each add their own" : "Optional — enables auto-verification"}
                  >
                    <input type="text" value={contractAddress} onChange={e => setContractAddress(e.target.value.trim())}
                      placeholder="0x..."
                      style={{ ...inp, fontFamily: mono, fontSize: 12,
                        borderColor: CONTRACT_REQUIRED.has(type) && !contractAddress ? "rgba(224,136,16,0.35)" : undefined }} />
                  </Field>
                )}
                <Field label="Linked project" required>
                  <select value={projectId ?? ""} onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
                    style={{ ...inp, borderColor: !projectId ? "rgba(224,136,16,0.35)" : undefined }}>
                    <option value="">Select your project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              </div>

              {/* Verification summary */}
              {CONTRACT_REQUIRED.has(type) && (() => {
                const taskContracts = tasks.filter(t => t.contract_address && /^0x[a-fA-F0-9]{40}$/.test(t.contract_address))
                const primaryValid  = contractAddress && /^0x[a-fA-F0-9]{40}$/.test(contractAddress)
                const total         = new Set([...(primaryValid ? [contractAddress] : []), ...taskContracts.map(t => t.contract_address!)]).size
                if (!total) return null
                return (
                  <div style={{ padding: "10px 14px", background: "rgba(0,184,122,0.05)", border: "1px solid rgba(0,184,122,0.15)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00b87a", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#00b87a", fontFamily: mono }}>
                      Auto-verification active across {total} contract{total > 1 ? "s" : ""} — tester wallets checked against all on Arc Testnet
                    </span>
                  </div>
                )
              })()}
            </div>
          </Card>

          {/* ── 03 Tester Tasks ── */}
          <Card step="03" title="What should testers do?" sub={CONTRACT_REQUIRED.has(type) ? "Each step can have its own contract address — expand a step to set it. Testers are verified on-chain against every contract you add." : "Walk testers through exactly what to do, step by step. Be specific — the clearer the task, the better the feedback."}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {tasks.map((task, i) => {
                const taskContractValid = task.contract_address && /^0x[a-fA-F0-9]{40}$/.test(task.contract_address)
                return (
                <div key={task.id} style={{ background: surf2, border: "1px solid " + bdr, borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#8aaeff", fontFamily: mono, flexShrink: 0 }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <input type="text" value={task.title} placeholder={`Step ${i + 1} — e.g. Deposit USDC into the lending pool`}
                      onChange={e => updateTask(task.id, "title", e.target.value)}
                      style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: t1, fontFamily: "inherit" }} />
                    {tasks.length > 1 && (
                      <button onClick={() => removeTask(task.id)} style={{ fontSize: 13, color: t3, background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                  <div style={{ padding: "0 14px 8px 48px" }}>
                    <input type="text" value={task.description} placeholder="Detail — what exactly to do, what to look for, or any relevant link"
                      onChange={e => updateTask(task.id, "description", e.target.value)}
                      style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 12, color: t2, fontFamily: "inherit", boxSizing: "border-box" as const }} />
                  </div>
                  {/* Per-task contract address — also hidden when external verification is on */}
                  {CONTRACT_REQUIRED.has(type) && !externalVerify && (
                    <div style={{ padding: "8px 14px 10px 48px", borderTop: "1px solid " + bdr, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 9, fontFamily: mono, color: t3, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>Contract</span>
                      <input type="text" value={task.contract_address || ""} placeholder={contractAddress || "0x... (inherits primary if blank)"}
                        onChange={e => updateTask(task.id, "contract_address", e.target.value.trim())}
                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 11, fontFamily: mono,
                          color: taskContractValid ? "#00b87a" : t3 }} />
                      {taskContractValid && (
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#00b87a", flexShrink: 0 }} />
                      )}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
            <button onClick={addTask}
              style={{ height: 36, width: "100%", background: "transparent", color: t3, border: "1px dashed " + bdr, borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: mono, letterSpacing: "0.04em" }}>
              + Add step
            </button>
          </Card>

          {/* ── 04 Review Questions ── */}
          <Card step="04" title="What feedback do you need?" sub="Testers answer these after completing your tasks. Specific questions get specific answers — set a minimum word count to filter low-effort responses.">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {questions.map((q, i) => (
                <div key={q.id} style={{ background: surf2, border: "1px solid " + bdr, borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid " + bdr }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#00b87a", fontFamily: mono, flexShrink: 0 }}>
                      Q{i + 1}
                    </div>
                    <input type="text" value={q.label} placeholder={`Question — e.g. What was the most confusing part?`}
                      onChange={e => updateQuestion(q.id, "label", e.target.value)}
                      style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: t1, fontFamily: "inherit" }} />
                    {questions.length > 1 && (
                      <button onClick={() => removeQuestion(q.id)} style={{ fontSize: 13, color: t3, background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                  <div style={{ padding: "8px 14px 10px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <input type="text" value={q.placeholder} placeholder="Hint shown inside the answer box (optional)"
                      onChange={e => updateQuestion(q.id, "placeholder", e.target.value)}
                      style={{ flex: 1, minWidth: 180, background: "transparent", border: "none", outline: "none", fontSize: 12, color: t2, fontFamily: "inherit" }} />
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t3, cursor: "pointer", fontFamily: mono, whiteSpace: "nowrap" }}>
                        Min words
                        <input type="number" value={q.min_words} min={5} max={200}
                          onChange={e => updateQuestion(q.id, "min_words", parseInt(e.target.value) || 20)}
                          style={{ width: 48, height: 26, background: surf, border: "1px solid " + bdr, borderRadius: 5, padding: "0 6px", fontSize: 11, color: t1, outline: "none", textAlign: "center", fontFamily: mono, marginLeft: 4 }} />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: t3, cursor: "pointer", fontFamily: mono }}>
                        <input type="checkbox" checked={q.required} onChange={e => updateQuestion(q.id, "required", e.target.checked)} />
                        Required
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addQuestion}
              style={{ height: 36, width: "100%", background: "transparent", color: t3, border: "1px dashed rgba(0,184,122,0.2)", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: mono, letterSpacing: "0.04em" }}>
              + Add question
            </button>
          </Card>

          {/* ── 05 Reward ── */}
          <Card step="05" title="What do testers earn?" sub="Better rewards attract higher-quality testers. Be specific about how and when rewards are distributed.">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Reward type selection */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {REWARDS.map(r => {
                  const active = rewardType === r.id
                  return (
                    <button key={r.id} onClick={() => setRewardType(r.id)}
                      style={{ padding: "11px 12px", textAlign: "left", borderRadius: 9, cursor: "pointer",
                        background: active ? `${r.color}0e` : surf2,
                        border: `1px solid ${active ? r.color + "45" : bdr}`,
                        transition: "all 0.1s",
                      }}>
                      <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 700, color: active ? r.color : t3,
                        marginBottom: 5, letterSpacing: "0.04em",
                        background: active ? `${r.color}15` : "transparent",
                        display: "inline-block", padding: active ? "2px 6px" : "0", borderRadius: 4 }}>
                        {r.label}
                      </div>
                      <div style={{ fontSize: 10, fontFamily: mono, color: t3, lineHeight: 1.5 }}>{r.desc}</div>
                    </button>
                  )
                })}
              </div>

              {/* USDC config */}
              {rewardType === "usdc" && (
                <div style={{ padding: "16px", background: "rgba(0,217,144,0.04)", border: "1px solid rgba(0,217,144,0.14)", borderRadius: 10 }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: "#00d990", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>USDC configuration</div>
                  <div className="twoColGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <Field label="Per tester" required>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="number" value={rewardUsdcAmount} onChange={e => setRewardUsdcAmount(e.target.value)} placeholder="5.00" min="0.01" step="0.01" style={{ ...inp, flex: 1 }} />
                        <span style={{ fontSize: 11, fontFamily: mono, color: t3, flexShrink: 0 }}>USDC</span>
                      </div>
                    </Field>
                    <Field label="Total slots" required>
                      <input type="number" value={totalSlots} onChange={e => setTotalSlots(e.target.value)} placeholder="20" min={1} style={inp} />
                    </Field>
                  </div>
                  {totalUsdcCost && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,217,144,0.07)", borderRadius: 8, border: "1px solid rgba(0,217,144,0.15)", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: t2 }}>Total deposit at submission</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#00d990", fontFamily: mono }}>${totalUsdcCost} USDC</span>
                    </div>
                  )}
                  <div style={{ fontSize: 10, fontFamily: mono, color: t3, lineHeight: 1.7 }}>
                    Deposited via Arc App Kit when you submit · automatically refunded to your wallet if your campaign is rejected
                  </div>
                </div>
              )}

              <Field label={rewardType === "usdc" ? "Additional notes (optional)" : "Reward details"} hint={rewardType !== "usdc" ? "Exactly what testers get and how they'll receive it" : undefined}>
                <textarea value={rewardDesc} onChange={e => setRewardDesc(e.target.value)} rows={2}
                  placeholder={rewardType === "usdc"
                    ? "Any extra context about this reward..."
                    : "e.g. Top 10 testers by quality score get a guaranteed whitelist spot + Discord role. Distributed within 48h of campaign close."}
                  style={{ ...inp, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />
              </Field>

              {rewardType !== "usdc" && (
                <div className="twoColGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Total slots" hint="Leave blank for unlimited">
                    <input type="number" value={totalSlots} onChange={e => setTotalSlots(e.target.value)} placeholder="Unlimited" min={1} style={inp} />
                  </Field>
                  <Field label="Expires">
                    <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inp} />
                  </Field>
                </div>
              )}

              {/* Access settings */}
              <div style={{ padding: "12px 14px", background: surf2, border: "1px solid " + bdr, borderRadius: 9, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={isFcfs} onChange={e => setIsFcfs(e.target.checked)} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: isFcfs ? t1 : t2 }}>First come, first served</div>
                    <div style={{ fontSize: 10, fontFamily: mono, color: t3 }}>{isFcfs ? "Open to all until slots fill" : "You manually select testers"}</div>
                  </div>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: mono, color: t3 }}>Minimum rank</span>
                  <select value={minRank} onChange={e => setMinRank(Number(e.target.value))} style={{ ...inp, width: "auto", height: 32, fontSize: 12 }}>
                    {["Any rank", "Builder", "Verified", "Trusted", "Arc Proven"].map((l, i) => <option key={i} value={i}>{l}</option>)}
                  </select>
                </div>
              </div>
              {minRank > 0 && (
                <div style={{ padding: "12px 14px", background: "rgba(192,136,40,0.05)", border: "1px solid rgba(192,136,40,0.25)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c08828", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#c08828", fontFamily: mono }}>
                      Rank gate active — {["","Builder","Verified","Trusted","Arc Proven"][minRank]} required
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: t2, margin: 0, lineHeight: 1.7, fontFamily: mono }}>
                    ArcLens is early — most testers are currently <strong style={{ color: t1 }}>Scout</strong> rank with no campaigns completed yet. Setting a rank requirement now will significantly shrink your tester pool.
                  </p>
                  <p style={{ fontSize: 11, color: t3, margin: 0, lineHeight: 1.7, fontFamily: mono }}>
                    Recommended: leave at <strong style={{ color: t2 }}>Any rank</strong> while the platform grows. You can raise the bar once the tester community has built reputation.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* ── Submit ── */}
          {error && (
            <div ref={errorRef} style={{ fontSize: 13, color: "#e03348", padding: "12px 16px", background: "rgba(224,51,72,0.08)", borderRadius: 8, border: "1px solid rgba(224,51,72,0.2)" }}>{error}</div>
          )}

          <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t1, marginBottom: 3, letterSpacing: "-0.01em" }}>
                {rewardType === "usdc" && totalUsdcCost ? `Deposit $${totalUsdcCost} USDC and submit for review` : "Submit for Arclens review"}
              </div>
              <div style={{ fontSize: 11, fontFamily: mono, color: t3 }}>
                {rewardType === "usdc" ? "Funds held until campaign ends · refunded if rejected" : "Reviewed within 24h · goes live once approved"}
              </div>
            </div>
            <button onClick={submit} disabled={submitting || depositing}
              style={{ height: 44, padding: "0 30px", background: (submitting || depositing) ? surf2 : "#1a56ff",
                color: (submitting || depositing) ? t2 : "#fff", border: "none", borderRadius: 9,
                fontSize: 14, fontWeight: 700, cursor: (submitting || depositing) ? "default" : "pointer",
                letterSpacing: "-0.01em", flexShrink: 0 }}>
              {depositing ? "Confirming deposit..." : submitting ? "Submitting..." : rewardType === "usdc" && totalUsdcCost ? `Deposit $${totalUsdcCost} & Submit` : "Submit Campaign"}
            </button>
          </div>

        </div>
        {/* ─── End form column ─── */}

        {/* Live preview aside — sticks to the right as the founder scrolls.
            ArcLayout's main wrapper now uses overflow-x:clip (not overflow:hidden),
            so sticky works as expected here. Updates as you type. */}
        <aside
          className="createPreviewAside"
          style={{
            position: "sticky",
            top: 24,
            alignSelf: "start",
            // Constrain to viewport so a tall preview can scroll internally
            // instead of overflowing past the bottom of the viewport
            maxHeight: "calc(100vh - 48px)",
            overflowY: "auto",
          }}>
          {(() => {
            // Defensive defaults — never throw out of this block, the preview must
            // always render so it can't "disappear" mid-interaction even if some
            // upstream state is briefly inconsistent (stale draft, race, etc).
            const tm  = selectedType || TYPES[0]
            const rm  = REWARDS.find(r => r.id === rewardType) || REWARDS.find(r => r.id === "credit") || REWARDS[0]
            // If blank, slots is null → treated as unlimited (matches backend behavior:
            // total_slots stays null in DB and the public feed shows the campaign as Open).
            const parsedSlots = parseInt(totalSlots || "", 10)
            const slots = Number.isFinite(parsedSlots) && parsedSlots > 0 ? parsedSlots : null
            // Prefer the local blob URL (logoPreview) over the remote imgbb URL
            // (campaignLogo). The remote URL can be blocked by ad-blockers /
            // privacy extensions / strict DNS — when that happened the preview
            // appeared to "disappear" because the imgbb image silently failed.
            // The blob URL is always reachable since it's local to the browser.
            // For any remote URL we still need to render (e.g. after a draft
            // restore), route through /api/image-proxy so the request goes to
            // our own origin instead of imgbb directly.
            const rawLogo = logoPreview || campaignLogo || ""
            const previewLogo = rawLogo.startsWith("blob:") || rawLogo.startsWith("data:")
              ? rawLogo
              : rawLogo
                ? `/api/image-proxy?url=${encodeURIComponent(rawLogo)}`
                : ""
            const bx = Number.isFinite(bannerPos?.x) ? bannerPos.x : 50
            const by = Number.isFinite(bannerPos?.y) ? bannerPos.y : 50
            return (
              <div>
                <div style={{ fontSize: 10, fontFamily: mono, color: t3, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00b87a" }} />
                  Live preview
                </div>
                <div style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}>
                  {/* Banner */}
                  <div style={{ position: "relative", width: "100%", height: 130, background: `linear-gradient(135deg, ${tm.color}20 0%, ${tm.color}08 60%, #0a0e1a 100%)`, overflow: "hidden", flexShrink: 0 }}>
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64, fontWeight: 900, fontFamily: mono, color: `${tm.color}15`, letterSpacing: "-0.04em", userSelect: "none" }}>{tm.abbr}</span>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${tm.color}, ${tm.color}30)` }} />
                    {previewLogo && (
                      // Background-image div instead of <img> so we never have an
                      // "image failed to load → element hidden" state. The div
                      // always renders at full size; if the URL is bad the BT
                      // placeholder behind it just stays visible.
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          backgroundImage: `url("${previewLogo.replace(/"/g, '\\"')}")`,
                          backgroundSize: "cover",
                          backgroundPosition: `${bx}% ${by}%`,
                          backgroundRepeat: "no-repeat",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, background: "linear-gradient(0deg, #0a0e1a 0%, transparent 100%)" }} />
                    {!externalVerify && contractAddress && /^0x[a-fA-F0-9]{40}$/.test(contractAddress) && (
                      <span style={{ position: "absolute", top: 10, right: 10, fontSize: 9, fontFamily: mono, background: "rgba(0,0,0,0.65)", color: "#00d990", border: "1px solid #00b87a40", padding: "3px 8px", borderRadius: 4, backdropFilter: "blur(4px)" }}>on-chain</span>
                    )}
                  </div>
                  {/* Body */}
                  <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#e8ecff", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0, letterSpacing: "-0.01em" }}>{title.trim() || "Untitled campaign"}</div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: tm.color, fontFamily: mono, padding: "2px 7px", borderRadius: 4, background: `${tm.color}15`, border: `1px solid ${tm.color}30`, flexShrink: 0, letterSpacing: "0.04em" }}>{tm.abbr}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7da8", fontFamily: mono }}>
                        {projects.find(p => p.id === projectId)?.name || "Your project"}
                      </div>
                    </div>
                    {tagline.trim() && (
                      <p style={{ fontSize: 12.5, color: "#6b7da8", margin: 0, lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>{tagline.trim()}</p>
                    )}
                    <div>
                      {rewardType === "usdc" && rewardUsdcAmount ? (
                        <div>
                          <span style={{ fontSize: 20, fontWeight: 700, color: "#00d990", fontFamily: mono, letterSpacing: "-0.02em" }}>${rewardUsdcAmount}</span>
                          <span style={{ fontSize: 11, color: "#6b7da8", marginLeft: 6 }}>USDC per tester</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, background: `${rm.color}15`, color: rm.color, border: `1px solid ${rm.color}30`, padding: "4px 10px", borderRadius: 4, fontFamily: mono, letterSpacing: "0.03em" }}>{rm.label}</span>
                      )}
                    </div>
                    {slots !== null ? (
                      <div>
                        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
                          <div style={{ height: "100%", width: "0%", background: tm.color, borderRadius: 2 }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono }}>
                          <span style={{ fontSize: 10, color: "#2e3a5c" }}>0/{slots} filled</span>
                          <span style={{ fontSize: 10, color: "#2e3a5c" }}>{slots} left</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: "#2e3a5c", fontFamily: mono }}>
                        Open · unlimited testers
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: "auto" }}>
                      <span style={{ fontSize: 10, color: "#2e3a5c", fontFamily: mono }}>{tasks.length} task{tasks.length !== 1 ? "s" : ""} · 0 done</span>
                      <span style={{ fontSize: 10, color: "#2e3a5c", fontFamily: mono }}>just now</span>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 14, fontSize: 11, color: t3, lineHeight: 1.6, padding: "0 2px" }}>
                  Updates as you type. This is exactly the card testers see in their feed.
                </div>

                {/* ─── DETAIL PAGE PREVIEW — exactly what testers see when they
                     click into the campaign. Banner → stats → tasks → review
                     questions → submit. Mirrors /trials/[id] for testers. ─── */}
                <div style={{ marginTop: 28, fontSize: 10, fontFamily: mono, color: t3, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#8aaeff" }} />
                  Tester detail view
                </div>
                <div style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}>
                  {/* Detail hero — wider banner, same as the real /trials/[id] page */}
                  <div style={{ position: "relative", width: "100%", height: 110, background: `linear-gradient(135deg, ${tm.color}22 0%, ${tm.color}08 50%, #0a0e1a 100%)`, overflow: "hidden" }}>
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, fontWeight: 900, fontFamily: mono, color: `${tm.color}18`, letterSpacing: "-0.04em", userSelect: "none" }}>{tm.abbr}</span>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${tm.color}, ${tm.color}40)` }} />
                    {previewLogo && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          backgroundImage: `url("${previewLogo.replace(/"/g, '\\"')}")`,
                          backgroundSize: "cover",
                          backgroundPosition: `${bx}% ${by}%`,
                          backgroundRepeat: "no-repeat",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 50, background: "linear-gradient(0deg, #0a0e1a 0%, transparent 100%)" }} />
                  </div>

                  {/* Title + tagline + badges */}
                  <div style={{ padding: "14px 16px 12px" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: t1, lineHeight: 1.3, marginBottom: 4, letterSpacing: "-0.015em" }}>{title.trim() || "Untitled campaign"}</div>
                    {tagline.trim() && (
                      <p style={{ fontSize: 11, color: t2, margin: "0 0 8px", lineHeight: 1.55 }}>{tagline.trim()}</p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 9, fontFamily: mono, background: `${tm.color}15`, color: tm.color, border: `1px solid ${tm.color}25`, padding: "2px 6px", borderRadius: 4 }}>{tm.label}</span>
                      <span style={{ fontSize: 9, fontFamily: mono, background: `${rm.color}15`, color: rm.color, border: `1px solid ${rm.color}25`, padding: "2px 6px", borderRadius: 4 }}>{rm.label}</span>
                    </div>
                  </div>

                  {/* Stat bar — exactly the same one testers see on the real detail page */}
                  <div style={{ display: "grid", gridTemplateColumns: expiresAt ? "1fr 1fr 1fr" : "1fr 1fr", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {[
                      { label: "slots left", value: slots !== null ? String(slots) : "Open", color: "#00b87a" },
                      { label: "completed",  value: "0", color: t1 },
                      ...(expiresAt ? [{ label: "closes", value: new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }), color: t2 }] : []),
                    ].map((s, i, arr) => (
                      <div key={i} style={{ padding: "12px 0", textAlign: "center", borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: s.color, fontFamily: mono, lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontSize: 8, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4, fontFamily: mono }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* What to do — task list as testers see it */}
                  <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 10, fontFamily: mono, color: t3, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                      {tasks.length} step{tasks.length !== 1 ? "s" : ""} to complete
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {tasks.map((task, i) => (
                        <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 7 }}>
                          <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${tm.color}15`, border: `1px solid ${tm.color}30`, color: tm.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, fontFamily: mono, flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: task.title.trim() ? t1 : t3, lineHeight: 1.4 }}>{task.title.trim() || `Step ${i + 1} title…`}</div>
                            {task.description?.trim() && (
                              <div style={{ fontSize: 10, color: t2, lineHeight: 1.5, marginTop: 2 }}>{task.description.trim()}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Review questions — what testers will answer */}
                  <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 10, fontFamily: mono, color: t3, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                      {questions.length} feedback question{questions.length !== 1 ? "s" : ""}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {questions.map((q, i) => (
                        <div key={q.id}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: q.label.trim() ? t1 : t3, marginBottom: 4, lineHeight: 1.4 }}>
                            {q.label.trim() || `Question ${i + 1}…`}
                            {q.required && <span style={{ color: "#e03348", marginLeft: 3 }}>*</span>}
                          </div>
                          <div style={{ height: 36, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, padding: "8px 10px", fontSize: 10, color: t3, lineHeight: 1.4, fontStyle: "italic" }}>
                            {q.placeholder?.trim() || "Tester's answer…"} {q.min_words ? `(${q.min_words}+ words)` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submit CTA — what testers click when done */}
                  <div style={{ padding: "12px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ height: 36, background: tm.color + "22", border: `1px solid ${tm.color}40`, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: tm.color, fontFamily: mono, letterSpacing: "-0.01em" }}>
                      Submit Completion →
                    </div>
                    <div style={{ fontSize: 10, color: t3, textAlign: "center", marginTop: 6, fontFamily: mono }}>
                      Testers earn {rm.label.toLowerCase()} after submission{externalVerify ? "" : contractAddress ? " · on-chain verified" : ""}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 14, fontSize: 11, color: t3, lineHeight: 1.6, padding: "0 2px" }}>
                  Every step shown above is exactly what testers will see when they click into your campaign.
                </div>
              </div>
            )
          })()}
        </aside>

        </div>
        {/* ─── End two-column layout ─── */}
      </div>

      {/* Responsive overrides:
          - .createLayout: 2-col on wide (form + sticky preview) → 1-col below 960px
          - .createPreviewAside: drops out of sticky and centers itself on narrow
          - .twoColGrid: 2-col field rows → 1-col below 560px
          All purely additive media queries so desktop is unchanged. */}
      <style>{`
        @media (max-width: 960px) {
          .createLayout {
            grid-template-columns: 1fr !important;
          }
          .createPreviewAside {
            position: static !important;
            max-width: 380px;
            margin: 0 auto;
            width: 100%;
          }
        }
        @media (max-width: 560px) {
          .twoColGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </ArcLayout>
  )
}

// ── Micro-components ──
const inp: React.CSSProperties = {
  width: "100%", height: 38, background: "var(--surf2,#0e1224)",
  border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 8,
  padding: "0 12px", fontSize: 13, color: "var(--t1,#e8ecff)", outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
}

function Card({ step, title, sub, children }: { step: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--surf,#0a0e1a)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 18px", borderBottom: "1px solid var(--bdr,rgba(255,255,255,0.06))", display: "flex", alignItems: "flex-start", gap: 14 }}>
        {step ? (
          <span style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", padding: "4px 9px", borderRadius: 5, background: "rgba(26,86,255,0.08)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.18)", flexShrink: 0, marginTop: 3, letterSpacing: "0.08em", fontWeight: 600 }}>{step}</span>
        ) : null}
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--t1,#e8ecff)", marginBottom: 4, letterSpacing: "-0.015em", lineHeight: 1.3 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--t2,#6b7da8)", lineHeight: 1.6 }}>{sub}</div>
        </div>
      </div>
      <div style={{ padding: "22px 24px 24px" }}>{children}</div>
    </section>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--t2,#6b7da8)", letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "'DM Mono',monospace" }}>
          {label}{required && <span style={{ color: "#e03348", marginLeft: 3 }}>*</span>}
        </label>
        {hint && <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--t3,#2e3a5c)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Ctr({ n, max }: { n: number; max: number }) {
  return <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: n > max * 0.9 ? "#e08810" : "var(--t3,#2e3a5c)", textAlign: "right", marginTop: 3 }}>{n}/{max}</div>
}
