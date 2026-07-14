// src/lib/aiContext.ts
// Pure helpers that build the AI's awareness of WHO is asking, WHERE they're
// asking from, and WHAT relevant data + knowledge applies. No LLM calls here —
// the chat route consumes this and passes it as the system prompt context.

import type { SessionData } from "@/lib/session"
import { getPool } from "@/lib/dbPool"

const pool = getPool()

export type AiRole = "founder" | "tester" | "admin" | "visitor"

export interface RecentChat {
  id:           number
  created_at:   string
  first_message: string
  last_q:       string   // the user's most recent question in that chat
  last_a:       string   // a snippet of the AI's most recent answer
}

export interface AiContext {
  route:        string
  role:         AiRole
  userAddr:     string | null
  pageData:     Record<string, any> | null  // route-specific live data
  kbHits:       Array<{ topic: string; fact: string; source_url: string | null }>
  recentChats:  RecentChat[]
}

// Whichever Gemini key is set. The AI SDK's google() provider natively reads
// GOOGLE_GENERATIVE_AI_API_KEY; we also accept the common GEMINI_API_KEY name.
export function getGeminiKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || undefined
}

/**
 * Infer role from session + route. The same wallet can be a 'founder' on
 * /dashboard/their-slug and a 'visitor' elsewhere — role is contextual.
 */
export async function inferRole(route: string, session: SessionData | null): Promise<AiRole> {
  if (!session) return "visitor"

  // Admin check — no clean session flag for admin yet; we rely on the
  // separate ADMIN_PASSWORD header on admin requests. For chat we default
  // to founder/tester/visitor.
  if (route.startsWith("/admin")) return "admin"

  // Founder check — does the signed-in wallet own a project that matches
  // the current dashboard slug?
  if (route.startsWith("/dashboard/")) {
    const slug = route.split("/")[2]
    if (slug) {
      const r = await pool.query(
        `SELECT 1 FROM projects WHERE owner_wallet = $1 AND (slug = $2 OR id::text = $2) LIMIT 1`,
        [session.addr.toLowerCase(), slug],
      )
      if (r.rowCount && r.rowCount > 0) return "founder"
    }
  }

  // Tester check — has the wallet completed any campaigns?
  const tr = await pool.query(
    `SELECT 1 FROM campaign_completions WHERE LOWER(tester_wallet) = $1 LIMIT 1`,
    [session.addr.toLowerCase()],
  )
  if (tr.rowCount && tr.rowCount > 0) return "tester"

  return "visitor"
}

/**
 * Load whatever data is most relevant given the current route — the
 * AI uses this as immediate context so it can answer about "this project"
 * without the user having to type the slug.
 */
export async function loadPageData(route: string): Promise<Record<string, any> | null> {
  try {
    // /ecosystem/[slug] → load the project + its TVL row
    const projMatch = route.match(/^\/ecosystem\/([^\/?]+)/)
    if (projMatch) {
      const slug = projMatch[1]
      const r = await pool.query(
        `SELECT id, slug, name, tagline, category, tvl_tracking_enabled,
                tvl_usd_e6::text AS tvl_usd_e6, volume_cum_usd_e6::text AS volume_cum_usd_e6,
                revenue_cum_usd_e6::text AS revenue_cum_usd_e6
         FROM projects
         WHERE (slug = $1 OR id::text = $1) AND approved = true AND live = true
         LIMIT 1`,
        [slug],
      )
      if (r.rows[0]) return { kind: "project", project: r.rows[0] }
    }

    // /trials/[id] → load the campaign
    const trialMatch = route.match(/^\/trials\/([^\/?]+)/)
    if (trialMatch) {
      const id = trialMatch[1]
      const isNumeric = /^\d+$/.test(id)
      const r = await pool.query(
        `SELECT id, slug, title, tagline, status, total_slots, filled_slots,
                reward_type, reward_usdc_amount, ended_at, ended_reason
         FROM campaigns
         WHERE ${isNumeric ? "id = $1" : "slug = $1"}
         LIMIT 1`,
        [isNumeric ? Number(id) : id],
      )
      if (r.rows[0]) return { kind: "campaign", campaign: r.rows[0] }
    }

    // /dashboard/[slug] → load the project (founder context)
    const dashMatch = route.match(/^\/dashboard\/([^\/?]+)/)
    if (dashMatch) {
      const slug = dashMatch[1]
      const r = await pool.query(
        `SELECT id, slug, name, tvl_tracking_enabled
         FROM projects WHERE (slug = $1 OR id::text = $1) LIMIT 1`,
        [slug],
      )
      if (r.rows[0]) return { kind: "dashboard", project: r.rows[0] }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Naive but effective keyword search over the knowledge base. The KB stays
 * small (~40 facts at launch, slowly growing) so we don't need vector search
 * yet — a tokenized OR-match across topic + fact catches every relevant row
 * in <5ms.
 */
// Common English stopwords + question words filtered so "what is Arc?" matches
// facts about Arc instead of every row that happens to contain "is".
const STOPWORDS = new Set([
  "what","when","where","who","why","how","which","the","and","but","for","not","yet",
  "this","that","with","from","into","onto","over","about","its","you","your","our",
  "can","does","did","has","have","are","was","were","will","would","should","could",
])

type KbHit = { topic: string; fact: string; source_url: string | null }

/**
 * Hybrid retrieval: try semantic (embedding) search first; if embeddings
 * aren't backfilled yet or no API key is set, fall back to keyword search.
 * As the KB grows past ~100 facts, semantic is what keeps recall good — but
 * keyword is a robust floor so the AI never loses its grounding facts.
 */
export async function searchKnowledgeBase(query: string, limit = 6): Promise<KbHit[]> {
  if (!query || query.trim().length < 2) return []
  try {
    const sem = await semanticSearch(query, limit)
    if (sem && sem.length > 0) return sem
  } catch {
    // fall through to keyword
  }
  return keywordSearch(query, limit)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function semanticSearch(query: string, limit: number): Promise<KbHit[] | null> {
  const apiKey = getGeminiKey()
  if (!apiKey) return null
  const rows = await pool.query<{ topic: string; fact: string; source_url: string | null; embedding: number[] | null }>(
    `SELECT topic, fact, source_url, embedding FROM ai_knowledge_base WHERE embedding IS NOT NULL`,
  )
  if (rows.rowCount === 0) return null
  const [{ embed }, { createGoogleGenerativeAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/google"),
  ])
  const google = createGoogleGenerativeAI({ apiKey })
  const { embedding } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: query,
  })
  const scored = rows.rows
    .filter(r => Array.isArray(r.embedding))
    .map(r => ({ r, score: cosine(embedding as number[], r.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  // Drop very weak matches so we don't feed irrelevant facts.
  return scored
    .filter(s => s.score > 0.55)
    .map(({ r }) => ({ topic: r.topic, fact: r.fact, source_url: r.source_url }))
}

function keywordSearch(query: string, limit: number): Promise<KbHit[]> {
  const tokens = query.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
  if (tokens.length === 0) return Promise.resolve([])
  // OR semantics: a row matches if ANY substantive token appears in topic
  // or fact. Counts how many tokens matched per row → higher = more relevant.
  const placeholders = tokens.map((_, i) => `$${i + 1}`).join(", ")
  return pool.query<{ topic: string; fact: string; source_url: string | null; score: number }>(
    `SELECT topic, fact, source_url,
            (
              SELECT COUNT(*) FROM unnest(ARRAY[${placeholders}]::text[]) AS t
              WHERE LOWER(ai_knowledge_base.topic) LIKE '%' || t || '%'
                 OR LOWER(ai_knowledge_base.fact)  LIKE '%' || t || '%'
            ) AS score
     FROM ai_knowledge_base
     WHERE EXISTS (
       SELECT 1 FROM unnest(ARRAY[${placeholders}]::text[]) AS t
       WHERE LOWER(ai_knowledge_base.topic) LIKE '%' || t || '%'
          OR LOWER(ai_knowledge_base.fact)  LIKE '%' || t || '%'
     )
     ORDER BY score DESC, useful_count DESC, id DESC
     LIMIT $${tokens.length + 1}`,
    [...tokens, limit],
  ).then(r => r.rows.map(({ topic, fact, source_url }) => ({ topic, fact, source_url })))
}

/**
 * Pull the 3 most recent prior conversations for this user so the AI can say
 * things like "you asked about Tower last week — their TVL has changed by X%".
 */
export async function recentConversations(userAddr: string | null, limit = 3): Promise<RecentChat[]> {
  if (!userAddr) return []
  const r = await pool.query<{ id: number; created_at: string; messages: any }>(
    `SELECT id, created_at::text, messages
     FROM ai_conversations
     WHERE user_addr = $1
     ORDER BY last_used_at DESC
     LIMIT $2`,
    [userAddr.toLowerCase(), limit],
  )
  return r.rows.map(row => {
    const msgs: any[] = Array.isArray(row.messages) ? row.messages : []
    const userMsgs = msgs.filter(m => m?.role === "user")
    const asstMsgs = msgs.filter(m => m?.role === "assistant")
    const first  = userMsgs[0]?.content ?? ""
    const lastQ  = userMsgs[userMsgs.length - 1]?.content ?? ""
    const lastA  = asstMsgs[asstMsgs.length - 1]?.content ?? ""
    return {
      id: row.id,
      created_at: row.created_at,
      first_message: String(first).slice(0, 140),
      last_q: String(lastQ).slice(0, 160),
      last_a: String(lastA).slice(0, 240),
    }
  })
}

/** One call to build the full context object the AI needs for a turn. */
export async function buildContext(args: {
  route:    string
  session:  SessionData | null
  userQuery: string
}): Promise<AiContext> {
  const role = await inferRole(args.route, args.session)
  const userAddr = args.session?.addr ?? null
  const [pageData, kbHits, recentChats] = await Promise.all([
    loadPageData(args.route),
    searchKnowledgeBase(args.userQuery),
    recentConversations(userAddr),
  ])
  return { route: args.route, role, userAddr, pageData, kbHits, recentChats }
}

/**
 * Remembers what it learns. After an answer grounded in real projects, Lens AI
 * writes a DURABLE fact about each cited project into its knowledge base
 * (added_by='ai-self-fill') and embeds it — so next time it answers from learned
 * knowledge instead of re-deriving, getting cumulatively wiser. We only store
 * durable facts (what a project IS, who built it, its trust standing) — never
 * volatile live metrics like TVL, which would go stale.
 */
function learnedTrustLabel(p: any): string {
  if (p.hard_risk) return "flagged as risky — not trustworthy"
  const base =
    p.recognition === "official" ? "Arc Official" :
    p.recognition === "partner"  ? "Arc Partner"  :
    p.trust_level === "verified" ? "Verified" :
    p.trust_level === "claimed"  ? "Claimed (the team controls the listing; not independently audited)" :
    "Listed"
  return p.established ? `${base}, Established (a proven on-chain track record)` : base
}

async function embedFact(id: number, topic: string, fact: string): Promise<void> {
  const apiKey = getGeminiKey()
  if (!apiKey) return // no key → leave NULL; embed-kb.mjs backfills it later
  try {
    const [{ embed }, { createGoogleGenerativeAI }] = await Promise.all([import("ai"), import("@ai-sdk/google")])
    const google = createGoogleGenerativeAI({ apiKey })
    const { embedding } = await embed({ model: google.textEmbeddingModel("gemini-embedding-001"), value: `[${topic}] ${fact}` })
    await pool.query(`UPDATE ai_knowledge_base SET embedding = $2::jsonb WHERE id = $1`, [id, JSON.stringify(embedding)])
  } catch { /* embedding is best-effort */ }
}

// Self-healing embeddings: opportunistically embed a few knowledge rows that are
// missing an embedding. Curated facts added or edited by admin become searchable
// on their own as the agent runs — no manual "re-embed" step. Called fire-and-forget
// after answers, and capped so it never adds latency or cost spikes.
export async function backfillEmbeddings(max = 3): Promise<void> {
  if (!getGeminiKey()) return
  try {
    const rows = await pool.query<{ id: number; topic: string; fact: string }>(
      `SELECT id, topic, fact FROM ai_knowledge_base WHERE embedding IS NULL ORDER BY id LIMIT $1`,
      [Math.max(1, Math.min(max, 10))],
    )
    for (const r of rows.rows) await embedFact(r.id, r.topic, r.fact)
  } catch { /* best-effort */ }
}

// Which approved projects does the ANSWER actually name? Lens AI often answers
// from its knowledge base and cites projects in prose without a tool card, so
// card-only payouts miss the builders it just learned from. This resolves the
// projects mentioned in the answer text so they get paid too. Whole-word,
// case-insensitive, names >= 4 chars to avoid false positives; the payout layer
// still trust-gates, caps, and de-dups, so over-matching is harmless.
export async function projectSlugsInText(text: string): Promise<string[]> {
  const t = String(text || "")
  if (t.length < 4) return []
  try {
    const r = await pool.query<{ slug: string; name: string }>(
      `SELECT slug, name FROM projects WHERE approved AND live`,
    )
    const out: string[] = []
    for (const row of r.rows) {
      const name = String(row.name || "").trim()
      if (name.length < 4) continue
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const re = new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, "i")
      if (re.test(t)) out.push(String(row.slug).toLowerCase())
    }
    return Array.from(new Set(out))
  } catch { return [] }
}

export async function rememberProjects(slugs: string[]): Promise<number> {
  const list = Array.from(new Set((slugs || []).map(s => String(s || "").trim().toLowerCase()).filter(Boolean)))
  if (!list.length) return 0
  try {
    const r = await pool.query(
      `SELECT p.name, p.slug, p.category, p.tagline,
              p.trust_level, p.recognition, p.established,
              COALESCE((p.trust_profile->>'hard_risk')::bool, false) AS hard_risk,
              b.display_name AS builder
         FROM projects p LEFT JOIN builder_profiles b ON b.address = LOWER(p.owner_wallet)
        WHERE p.approved AND p.live AND LOWER(p.slug) = ANY($1::text[])`,
      [list],
    )
    let learned = 0
    for (const p of r.rows) {
      const trust = learnedTrustLabel(p)
      const topic = `${p.name} — Arc project`
      const cat = (p.category || "project").trim()
      const fact = `${p.name} is a ${cat} on Arc${p.tagline ? ` — ${String(p.tagline).trim()}` : ""}. Trust standing on ArcLens: ${trust}.${p.builder ? ` Built by ${p.builder}.` : ""}`.slice(0, 500)
      const src = `/ecosystem/${p.slug}`
      // Refresh the single self-filled fact per project; never touch curated rows.
      await pool.query(`DELETE FROM ai_knowledge_base WHERE source_url = $1 AND added_by = 'ai-self-fill'`, [src])
      const ins = await pool.query<{ id: number }>(
        `INSERT INTO ai_knowledge_base (topic, fact, source_url, added_by)
         VALUES ($1, $2, $3, 'ai-self-fill')
         ON CONFLICT (topic, fact) DO NOTHING
         RETURNING id`,
        [topic, fact, src],
      )
      learned++
      const newId = ins.rows[0]?.id
      if (newId) void embedFact(newId, topic, fact)
    }
    return learned
  } catch (e: any) {
    console.error("[rememberProjects]", e?.message || e)
    return 0
  }
}

/** Log a question the AI couldn't fully answer so an admin can fill the gap later. */
export async function logKnowledgeGap(args: {
  question:  string
  userAddr:  string | null
  route:     string
}) {
  try {
    await pool.query(
      `INSERT INTO ai_knowledge_gaps (question, user_addr, route) VALUES ($1, $2, $3)`,
      [args.question.slice(0, 500), args.userAddr, args.route],
    )
  } catch {
    // never let logging fail the response
  }
}
