// src/app/api/mcp/route.ts
//
// ArcLens as an MCP server, so a builder can list their project from inside
// Claude Code, Cursor, Codex or any other MCP client:
//
//   claude mcp add --transport http arclens https://arclenz.xyz/api/mcp
//
// Stateless Streamable HTTP: every POST carries one JSON-RPC message and gets a
// plain JSON reply (no SSE stream, no session). Free tools only — submitting a
// project and reading what the public directory already shows. The paid trust,
// risk and metrics oracle stays behind x402 at /api/agent.
//
// submit_project hands the request to the directory's own POST handler, so an
// agent goes through exactly the same validation, email code and admin review
// as the web form — and shares its rate limits.

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { POST as submitToDirectory } from "@/app/api/ecosystem/route"
import { enforce, getIp } from "@/lib/ratelimit"
import { getPool } from "@/lib/dbPool"
import { ARC_MAINNET_CHAIN_ID } from "@/lib/constants"
import { isCuratedMainnetProject } from "@/lib/mainnetAvailability"
import { checkLogo, storeLogo, LOGO_MIN_PX, LOGO_RECOMMENDED_PX } from "@/lib/agentLogo"

const pool = getPool()

const SERVER_INFO = { name: "arclens", title: "ArcLens", version: "1.0.0" }
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]
const MAX_BODY_BYTES = 64 * 1024

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, mcp-protocol-version, mcp-session-id, authorization",
}

const CATEGORIES = ["Infrastructure", "DeFi", "AI", "Payments", "NFT", "Gaming", "Social", "Developer Tools", "Bridge", "Identity", "Wallet", "Exchange", "Lending", "Prediction Market", "RWA", "DAO", "Stablecoin", "Derivatives", "Insurance", "Launchpad", "Oracle", "Analytics", "Finance", "Trading", "Custody", "Other"]

// The full submission playbook. Sent to the agent on connect (instructions)
// and as the list_my_project prompt, so every client walks the same steps and
// a submission arrives complete the first time.
const SUBMIT_GUIDE = `How to list a project on ArcLens

Only submit a project the user builds or officially represents. Every submission is reviewed by the ArcLens team before it appears publicly; a complete, accurate submission is approved fastest.

Step 1. Gather details from the codebase.
Read the README, package.json, site config and deployment files or broadcast logs. Collect: project name, a one-line tagline, a short description, the best-fitting category, the official website, the project's X account, GitHub, Discord, the logo, and contract addresses deployed on Arc.
For the logo: files in the repo's public/ or static/ folder are served at the site root, so public/logo.png on example.com is https://example.com/logo.png. Open that URL to make sure it is live before using it.

Step 2. Check it is not already listed.
Call search_projects with the project name. If it is already listed, tell the user and stop: an existing listing is updated by resubmitting with the same contract address and the same email used originally, or managed by claiming it on arclenz.xyz.

Step 3. Ask the user for what code cannot tell you.
Never guess these: the contact email (one the user can open now, since the code goes there), the founder or authorized representative profile (X handle or a LinkedIn, GitHub or personal site URL) and whether they want it shown publicly, the project's official X account if not found, and whether the project is live on Arc mainnet today.

Step 4. Check the requirements before calling.
- website: the live official site on a domain the project owns. Free subdomains (vercel.app, netlify.app, github.io and similar), localhost and preview URLs are rejected.
- twitter: the project's own X account, not a personal one.
- tagline: plain words on what it does, at most 80 characters. No hype, no "best" or "first", no token price talk.
- description: at most 300 characters, specific about what users can do today.
- contract: a 0x address of 40 hex characters, deployed on Arc. Leave it out rather than guess.
- mainnet: true only if the product is live on Arc mainnet today.
- name: the project's public name, at most 60 characters.
- category: one of the listed values.
- logo_url: a direct https link to the image file itself (not a web page), on the live site or another public host. PNG, JPG or WebP; not SVG, GIF or ICO. Square, at least ${LOGO_MIN_PX}x${LOGO_MIN_PX}px, ideally ${LOGO_RECOMMENDED_PX}x${LOGO_RECOMMENDED_PX}px, under 5 MB. Use the logo mark that fills a square tile, not a wide wordmark or banner. ArcLens copies it into its own storage so it displays reliably. Strongly recommended: listings without a logo look unfinished.
- github: a https://github.com/... link. discord: an invite like https://discord.gg/abc123.
- email: a permanent inbox; disposable addresses are rejected.

Step 5. Confirm with the user.
Show every field you will send, including the logo URL, and wait for a clear yes. Make any edits they ask for.

Step 6. Request the verification code.
Call submit_project with the confirmed fields and no code. ArcLens emails a 6-digit code from support@mail.arclenz.xyz. Tell the user to check their inbox and spam folder. Do not call again just to resend: codes are limited to one per minute per address and five per hour.

Step 7. Finish the submission.
Ask the user for the code, then call submit_project again with exactly the same fields plus code, within 15 minutes.

Step 8. Report back.
Give the user the reference (ARC-XXXXX). Explain the project is in review and not yet public, the decision arrives by email, and they should quote the reference if they contact ArcLens at support@arclenz.xyz.

If a call fails, read the message, fix only the field it names, confirm the change with the user, and try again.`

const INSTRUCTIONS =
  "ArcLens is an independent directory of projects built on Arc (arclenz.xyz). " +
  "Use search_projects and get_project to look up listed projects, and submit_project to submit the user's own project for review.\n\n" +
  SUBMIT_GUIDE

const PROMPTS = [
  {
    name: "list_my_project",
    title: "List my project on ArcLens",
    description: "Walk through submitting this project to the ArcLens directory, step by step.",
    arguments: [],
  },
]

const TOOLS = [
  {
    name: "submit_project",
    title: "Submit a project to ArcLens",
    description:
      "Submit the user's own Arc project to the ArcLens directory for review. Before calling: gather details from the codebase, " +
      "check search_projects for an existing listing, ask the user for anything you cannot verify (email, founder profile, mainnet status), " +
      "and show them every field for confirmation. Then call once without `code` to email a verification code, and again with the same " +
      "fields plus `code` to finish. Never invent a website, X account or contract address. Resubmitting with the same contract and email updates an earlier submission.",
    inputSchema: {
      type: "object",
      properties: {
        name:        { type: "string", description: "Project public name, max 60 characters." },
        tagline:     { type: "string", description: "One line on what it does, max 80 characters." },
        website:     { type: "string", description: "Official project website (a real, resolving domain)." },
        email:       { type: "string", description: "Contact email the team controls. The verification code and review decision go here." },
        twitter:     { type: "string", description: "Official project X account, as @handle or x.com URL." },
        founder:     { type: "string", description: "Founder or authorized representative profile: X handle, or X/LinkedIn/GitHub/personal site URL." },
        category:    { type: "string", enum: CATEGORIES, description: "Directory category. Defaults to DeFi." },
        description: { type: "string", description: "Short description, max 300 characters." },
        contract:    { type: "string", description: "Main contract address on Arc (0x + 40 hex)." },
        contracts:   { type: "array", items: { type: "string" }, description: "Other contract addresses on Arc." },
        github:      { type: "string", description: "https://github.com/... org or repo link." },
        discord:     { type: "string", description: "Discord invite link, e.g. https://discord.gg/abc123." },
        logo_url:    { type: "string", description: `Direct https link to the logo image file. PNG, JPG or WebP, square, min ${LOGO_MIN_PX}x${LOGO_MIN_PX}px, ideally ${LOGO_RECOMMENDED_PX}x${LOGO_RECOMMENDED_PX}px, under 5 MB. Checked before the code is sent and copied into ArcLens storage on the final step.` },
        mainnet:     { type: "boolean", description: "True only if the project is live on Arc mainnet today." },
        founder_public: { type: "boolean", description: "Show the founder profile on the listing. Defaults to true." },
        code:        { type: "string", description: "The 6-digit code from the verification email. Omit on the first call." },
      },
      required: ["name", "tagline", "website", "email", "twitter", "founder"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "search_projects",
    title: "Search ArcLens projects",
    description: "Search projects listed on ArcLens by keyword and/or category. Returns name, slug, category, tagline, website, whether it is live on Arc mainnet, and its ArcLens page.",
    inputSchema: {
      type: "object",
      properties: {
        query:        { type: "string", description: "Keyword matched against name, tagline and description." },
        category:     { type: "string", enum: CATEGORIES },
        mainnet_only: { type: "boolean", description: "Only projects live on Arc mainnet." },
        limit:        { type: "integer", minimum: 1, maximum: 25, description: "Default 10." },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_project",
    title: "Get an ArcLens project",
    description: "Public listing details for one project on ArcLens, by slug or name.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Project slug (from search_projects) or name." } },
      required: ["slug"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

type Args = Record<string, unknown>
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { protocolVersion?: string; name?: string; arguments?: Args } }
type ProjectRow = {
  name: string; slug: string; category: string; tagline: string; website: string | null
  description?: string | null; twitter?: string | null; github?: string | null
  mainnet_claimed: boolean; has_mainnet_contract: boolean
}
type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: unknown; isError?: boolean }

const text = (t: string, data?: unknown, isError = false): ToolResult =>
  ({ content: [{ type: "text", text: t }], ...(data !== undefined ? { structuredContent: data } : {}), ...(isError ? { isError: true } : {}) })

// Turns the directory's error message into a concrete instruction, so the
// agent fixes the right thing instead of retrying blindly or burning codes.
function nextStepFor(error: string): string {
  const e = error.toLowerCase()
  if (e.includes("code isn't right")) return "Ask the user to re-read the 6-digit code from the email and call again with the corrected code. Do not request a new code."
  if (e.includes("expired") || e.includes("incorrect attempts")) return "Call submit_project again without code to email a fresh one, then ask the user for it."
  if (e.includes("seconds before requesting")) return "A code was already sent. Ask the user for the code from that email instead of requesting another."
  if (e.includes("too many verification codes")) return "Stop and tell the user to try again later. Do not retry now."
  if (e.includes("at capacity")) return "Tell the user submissions are at capacity today and to try again tomorrow, or use arclenz.xyz/ecosystem."
  if (e.includes("already uses this url")) return "Ask the user for a more specific project name, confirm it, and resubmit."
  if (e.includes("contract address already exists")) return "This contract is already submitted. Resubmit with the email used originally, or tell the user to claim the listing on arclenz.xyz."
  if (e.includes("isn't configured") || e.includes("right now") || e.includes("server error")) return "This is a temporary ArcLens issue, not a problem with the details. Tell the user and try again in a few minutes."
  // Order matters: email and founder messages also mention "domain"/"website".
  if (e.includes("email") || e.includes("send the code to that address")) return "Ask the user for a permanent email address they can open now, confirm it, and resubmit."
  if (e.includes("project x")) return "Ask the user for the project's own X account (@handle or x.com URL) and resubmit."
  if (e.includes("founder") || e.includes("representative") || e.includes("profile")) return "Ask the user for a founder or authorized representative profile (X handle, or LinkedIn, GitHub or personal site URL) and resubmit."
  if (e.includes("domain") || e.includes("website")) return "Ask the user for the project's live official website on a domain it owns, confirm it, and resubmit."
  if (e.includes("required")) return "Ask the user for the missing field named above, confirm it, and resubmit."
  return "Tell the user what happened. If it persists, they can submit at arclenz.xyz/ecosystem or email support@arclenz.xyz."
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : undefined)
const likeEscape = (s: string) => s.replace(/[\\%_]/g, m => "\\" + m)

const MAINNET_COLS = `
  COALESCE((trust_profile->>'mainnet_claimed')::bool, false) AS mainnet_claimed,
  EXISTS (SELECT 1 FROM project_contracts pc
           WHERE pc.project_id = projects.id AND pc.chain_id = ${ARC_MAINNET_CHAIN_ID}
             AND pc.verified_at IS NOT NULL AND pc.revoked_at IS NULL) AS has_mainnet_contract`
const liveOnMainnet = (p: ProjectRow) => !!p.has_mainnet_contract || !!p.mainnet_claimed || isCuratedMainnetProject(p.slug)
const pageUrl = (slug: string) => `https://arclenz.xyz/ecosystem/${slug}`

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const slugOf = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const reject = (error: string, next: string) =>
  text(`Submission not accepted: ${error}\nNext step: ${next}`, { status: "error", error, next_step: next }, true)

type SubmitBody = {
  name?: string; tagline?: string; website?: string; email?: string; twitter?: string; founder?: string
  category?: string; description?: string; contract?: string; contracts?: string[]
  github?: string; discord?: string; logo_url?: string; mainnet: boolean; founder_public: boolean; code?: string
}

// Checks the directory route would otherwise handle silently (truncating,
// defaulting) or only after the email code is spent (name and contract
// clashes). Running them first means a code is only ever emailed for a
// submission that will go through.
async function precheck(b: SubmitBody, rawCategory: unknown, rawContracts: unknown): Promise<ToolResult | null> {
  const fix = (field: string) => `Correct ${field}, show the user the change, and resubmit.`
  if (!b.name) return reject("name is required.", fix("name"))
  if (b.name.length > 60) return reject(`name is ${b.name.length} characters; the maximum is 60.`, fix("name"))
  if (!slugOf(b.name)) return reject("name must contain letters or numbers.", fix("name"))
  if (!b.tagline) return reject("tagline is required.", fix("tagline"))
  if (b.tagline.length > 80) return reject(`tagline is ${b.tagline.length} characters; the maximum is 80.`, "Shorten the tagline to 80 characters or fewer, show the user, and resubmit.")
  if (b.description && b.description.length > 300) return reject(`description is ${b.description.length} characters; the maximum is 300.`, "Shorten the description to 300 characters or fewer, show the user, and resubmit.")
  if (rawCategory !== undefined && !b.category) return reject(`category must be one of: ${CATEGORIES.join(", ")}.`, "Pick the closest category from the list, confirm it with the user, and resubmit.")
  if (b.contract && !ADDRESS_RE.test(b.contract)) return reject("contract must be a 0x address of 40 hex characters.", "Use the exact deployed address from the deployment files, or leave contract out. Never guess it.")
  if (rawContracts !== undefined && !Array.isArray(rawContracts)) return reject("contracts must be a list of addresses.", fix("contracts"))
  const badExtra = (b.contracts || []).find(c => !ADDRESS_RE.test(c))
  if (badExtra) return reject(`"${badExtra}" in contracts is not a 0x address of 40 hex characters.`, "Remove or correct that address and resubmit.")
  if (b.github && !/^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+/i.test(b.github)) return reject("github must be a https://github.com/... link.", fix("github"))
  if (b.discord && !/^https:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+/i.test(b.discord)) return reject("discord must be an invite link like https://discord.gg/abc123.", fix("discord"))

  // A contract already on file is an update when the email matches; the
  // directory route enforces that after the code, so check it here first.
  if (b.contract) {
    const existing = await pool.query("SELECT LOWER(email) AS email FROM projects WHERE contract = $1 LIMIT 1", [b.contract.toLowerCase()])
    if (existing.rows[0]) {
      if (existing.rows[0].email !== (b.email || "").toLowerCase()) {
        return reject("A project with this contract address is already on ArcLens under a different email.", "Resubmit with the email used originally, or tell the user to claim the existing listing on arclenz.xyz.")
      }
      return null
    }
  }
  const taken = await pool.query("SELECT name FROM projects WHERE slug = $1 LIMIT 1", [slugOf(b.name)])
  if (taken.rows[0]) {
    return reject(`A project named "${taken.rows[0].name}" already uses this name on ArcLens.`, "If this is the user's project, it is already listed. Otherwise ask the user for a more specific name (for example adding Labs or Protocol) and resubmit.")
  }
  return null
}

async function submitProject(req: NextRequest, args: Args): Promise<ToolResult> {
  const contracts = Array.isArray(args.contracts) ? args.contracts.map((c: unknown) => str(c, 100)).filter((c): c is string => !!c).slice(0, 20) : undefined
  const body: SubmitBody = {
    name: str(args?.name, 200), tagline: str(args?.tagline, 400), website: str(args?.website), email: str(args?.email, 254),
    twitter: str(args?.twitter), founder: str(args?.founder), category: typeof args.category === "string" && CATEGORIES.includes(args.category) ? args.category : undefined,
    description: str(args?.description, 2000), contract: str(args?.contract, 100), contracts,
    github: str(args?.github), discord: str(args?.discord), logo_url: str(args?.logo_url, 1000),
    mainnet: args?.mainnet === true, founder_public: args?.founder_public !== false, code: str(args?.code, 12),
  }

  const failed = await precheck(body, args.category, args.contracts)
  if (failed) return failed

  if (body.logo_url) {
    const logo = await checkLogo(body.logo_url)
    if (logo.ok === false) {
      return reject(logo.error, `Find a direct link to a square PNG, JPG or WebP logo (ideally ${LOGO_RECOMMENDED_PX}x${LOGO_RECOMMENDED_PX}px) on the project's live site, or ask the user for one. Or leave logo_url out and the team can add it later.`)
    }
    // Copy into ArcLens storage only on the final step, so abandoned
    // submissions never leave files behind.
    if (body.code) {
      const stored = await storeLogo(logo)
      if (!stored) return reject("The logo couldn't be saved to ArcLens right now.", "Try again in a few minutes. Do not request a new code; the current one stays valid for 15 minutes.")
      body.logo_url = stored
    }
  }

  const forwarded = new NextRequest(new URL("/api/ecosystem", req.nextUrl.origin), {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": getIp(req) },
    body: JSON.stringify(body),
  })
  const res = await submitToDirectory(forwarded)
  const data: { needsVerification?: boolean; email?: string; success?: boolean; updated?: boolean; reference?: string; error?: string } = await res.json().catch(() => ({}))

  if (data?.needsVerification) {
    return text(`A 6-digit verification code was emailed to ${data.email}. Ask the user for it, then call submit_project again with the same fields plus code. The code expires in 15 minutes.`, { status: "code_sent", email: data.email })
  }
  if (data?.success) {
    return text(
      `${data.updated ? "Listing update" : "Project"} submitted to ArcLens. Reference ${data.reference}. ` +
      "It is in the review queue and will not appear publicly until the ArcLens team approves it. A receipt was emailed to the submitter.",
      { status: data.updated ? "updated" : "submitted", reference: data.reference },
    )
  }
  const error = data?.error || `HTTP ${res.status}`
  return reject(error, nextStepFor(error))
}

async function searchProjects(args: Args): Promise<ToolResult> {
  const limit = Math.min(Math.max(Number(args?.limit) || 10, 1), 25)
  const q = str(args?.query, 100)
  const category = typeof args.category === "string" && CATEGORIES.includes(args.category) ? args.category : null
  const r = await pool.query<ProjectRow>(
    `SELECT name, slug, category, tagline, website, ${MAINNET_COLS}
       FROM projects
      WHERE approved AND live
        AND ($1::text IS NULL OR name ILIKE $1 OR slug ILIKE $1 OR tagline ILIKE $1 OR description ILIKE $1)
        AND ($2::text IS NULL OR category = $2)
      ORDER BY featured DESC, view_count DESC NULLS LAST, created_at DESC
      LIMIT 300`,
    [q ? `%${likeEscape(q)}%` : null, category],
  )
  const projects = r.rows
    .map(p => ({ name: p.name, slug: p.slug, category: p.category, tagline: p.tagline, website: p.website, live_on_mainnet: liveOnMainnet(p), url: pageUrl(p.slug) }))
    .filter(p => !args?.mainnet_only || p.live_on_mainnet)
    .slice(0, limit)
  const summary = projects.length
    ? projects.map(p => `${p.name} (${p.category}${p.live_on_mainnet ? ", live on Arc mainnet" : ""}): ${p.tagline} ${p.url}`).join("\n")
    : "No listed projects match."
  return text(summary, { count: projects.length, projects })
}

async function getProject(args: Args): Promise<ToolResult> {
  const q = str(args?.slug, 120)
  if (!q) return text("slug is required.", undefined, true)
  const r = await pool.query<ProjectRow>(
    `SELECT name, slug, category, tagline, description, website, twitter, github, ${MAINNET_COLS}
       FROM projects
      WHERE approved AND live AND (slug = LOWER($1) OR name ILIKE $2)
      ORDER BY (slug = LOWER($1)) DESC LIMIT 1`,
    [q, likeEscape(q)],
  )
  const p = r.rows[0]
  if (!p) return text(`No listed project matches "${q}". Try search_projects.`, { found: false })
  const project = { found: true, name: p.name, slug: p.slug, category: p.category, tagline: p.tagline, description: p.description, website: p.website, twitter: p.twitter, github: p.github, live_on_mainnet: liveOnMainnet(p), url: pageUrl(p.slug) }
  return text(`${p.name} (${p.category}${project.live_on_mainnet ? ", live on Arc mainnet" : ""}): ${p.tagline}\n${p.description || ""}\n${project.url}`.trim(), project)
}

async function handle(req: NextRequest, msg: Rpc): Promise<object | null> {
  const id = msg?.id ?? null
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } })

  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Invalid request")
  // Notifications (no id) never get a response body.
  if (msg.id === undefined) return null

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion
      return ok({
        protocolVersion: asked && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      })
    }
    case "ping":       return ok({})
    case "tools/list": return ok({ tools: TOOLS })
    case "prompts/list": return ok({ prompts: PROMPTS })
    case "prompts/get": {
      if (msg.params?.name !== "list_my_project") return fail(-32602, `Unknown prompt: ${msg.params?.name}`)
      return ok({
        description: PROMPTS[0].description,
        messages: [{ role: "user", content: { type: "text", text: `Help me list this project on ArcLens using the arclens tools. Follow this process exactly.\n\n${SUBMIT_GUIDE}` } }],
      })
    }
    case "tools/call": {
      const name = msg.params?.name
      const args = msg.params?.arguments ?? {}
      try {
        if (name === "submit_project")  return ok(await submitProject(req, args))
        if (name === "search_projects") return ok(await searchProjects(args))
        if (name === "get_project")     return ok(await getProject(args))
      } catch (e) {
        console.error("[mcp]", name, e instanceof Error ? e.message : e)
        return ok(text("ArcLens hit an error handling this call. Try again shortly.", undefined, true))
      }
      return fail(-32602, `Unknown tool: ${name}`)
    }
    default: return fail(-32601, `Method not found: ${msg.method}`)
  }
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "mcp", { limit: 60, windowMs: 60_000 })
  if (blocked) { for (const [k, v] of Object.entries(CORS)) blocked.headers.set(k, v); return blocked }

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413, headers: CORS })
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS })
  }

  // Older clients may still send a JSON-RPC batch; answer each message.
  if (Array.isArray(parsed)) {
    const replies = (await Promise.all(parsed.slice(0, 10).map(m => handle(req, m as Rpc)))).filter(Boolean)
    return replies.length ? NextResponse.json(replies, { headers: CORS }) : new NextResponse(null, { status: 202, headers: CORS })
  }
  const reply = await handle(req, parsed as Rpc)
  return reply ? NextResponse.json(reply, { headers: CORS }) : new NextResponse(null, { status: 202, headers: CORS })
}

// No server-initiated stream: this server only answers requests.
export async function GET() {
  return NextResponse.json({ error: "This MCP server uses Streamable HTTP over POST only.", connect: "claude mcp add --transport http arclens https://arclenz.xyz/api/mcp" }, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
