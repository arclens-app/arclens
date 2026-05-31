// src/lib/aiContext.ts
// Pure helpers that build the AI's awareness of WHO is asking, WHERE they're
// asking from, and WHAT relevant data + knowledge applies. No LLM calls here —
// the chat route consumes this and passes it as the system prompt context.

import { Pool } from "pg"
import type { SessionData } from "@/lib/session"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

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
