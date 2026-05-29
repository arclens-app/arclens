// src/app/api/ai/chat/route.ts
//
// The single LLM gateway for ArcLens AI. Receives a chat turn, builds context
// from the user's session + current route + KB + prior history, and either:
//   • calls Gemini 2.5 Flash via the Vercel AI SDK if GEMINI_API_KEY is set
//   • falls back to a deterministic stub answer that surfaces the same context,
//     so the UI ships and is testable before the key arrives
//
// Either way, the conversation is logged to ai_conversations.

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { getSession } from "@/lib/session"
import { buildContext, logKnowledgeGap, getGeminiKey, type AiContext } from "@/lib/aiContext"
import { buildTools } from "@/lib/aiTools"
import { enforce } from "@/lib/ratelimit"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

interface ChatBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>
  route:    string
  conversationId?: number | null
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "ai-chat", { limit: 20, windowMs: 60_000 })
  if (blocked) return blocked

  let body: ChatBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }) }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 })
  }
  const lastUser = [...body.messages].reverse().find(m => m.role === "user")?.content ?? ""
  if (!lastUser || lastUser.trim().length < 1) {
    return NextResponse.json({ error: "Empty user message" }, { status: 400 })
  }
  if (lastUser.length > 2000) {
    return NextResponse.json({ error: "Message too long (max 2000 chars)" }, { status: 400 })
  }

  const session = getSession(req)
  const route   = String(body.route || "/").slice(0, 200)
  const ctx     = await buildContext({ route, session, userQuery: lastUser })

  // Build the answer — real LLM or stub
  const apiKey   = getGeminiKey()
  let answerText: string
  let live       = false
  if (apiKey) {
    try {
      answerText = await callGemini(body.messages, ctx, apiKey)
      live = true
    } catch (e: any) {
      console.error("[ai/chat] Gemini error:", e?.message || e)
      answerText = stubAnswer(lastUser, ctx)
    }
  } else {
    answerText = stubAnswer(lastUser, ctx)
  }
  const usedKb = ctx.kbHits.length > 0

  // If we couldn't really answer (stub mode AND no KB hits), log the question as
  // a knowledge gap so an admin can fill it.
  if (!live && !usedKb) {
    await logKnowledgeGap({ question: lastUser, userAddr: session?.addr ?? null, route })
  }

  // Persist the conversation
  const convId = await persistConversation({
    conversationId: body.conversationId ?? null,
    userAddr: session?.addr ?? null,
    route,
    role:    ctx.role,
    messages: [...body.messages, { role: "assistant", content: answerText }],
  })

  return NextResponse.json({
    message: { role: "assistant", content: answerText },
    conversationId: convId,
    context: {
      role:        ctx.role,
      kb_hits:     ctx.kbHits.length,
      has_page_data: !!ctx.pageData,
      llm:         live ? "gemini-2.5-flash" : "stub",
    },
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Stub answer for when GEMINI_API_KEY isn't set yet. Surfaces the same context
// the real LLM would receive, so we can ship the UI + verify the pipeline
// before the key arrives.
// ────────────────────────────────────────────────────────────────────────────
function stubAnswer(userMsg: string, ctx: AiContext): string {
  const lines: string[] = []
  lines.push(`I'm ArcLens AI — I'd normally answer this with Gemini, but the API key isn't set yet, so I'll show you what context I'd have used:`)
  lines.push("")
  lines.push(`**Your question:** ${userMsg}`)
  lines.push(`**I see you as:** ${ctx.role}${ctx.userAddr ? ` (${ctx.userAddr.slice(0, 8)}…${ctx.userAddr.slice(-4)})` : ""}`)
  lines.push(`**You're on:** ${ctx.route}`)

  if (ctx.pageData) {
    lines.push("")
    lines.push(`**Page data loaded:** ${ctx.pageData.kind}`)
    if (ctx.pageData.kind === "project") {
      const p = ctx.pageData.project
      lines.push(`  ${p.name} — ${p.category} — TVL tracking ${p.tvl_tracking_enabled ? "enabled" : "off"}`)
    } else if (ctx.pageData.kind === "campaign") {
      const c = ctx.pageData.campaign
      lines.push(`  ${c.title} — ${c.status} — ${c.filled_slots}/${c.total_slots ?? "∞"} slots`)
    }
  }

  if (ctx.kbHits.length > 0) {
    lines.push("")
    lines.push(`**Relevant facts I'd cite (${ctx.kbHits.length}):**`)
    for (const k of ctx.kbHits.slice(0, 4)) {
      lines.push(`  • ${k.fact}`)
    }
  }

  if (ctx.recentChats.length > 0) {
    lines.push("")
    lines.push(`**Past chats with you:** ${ctx.recentChats.length}`)
  }

  lines.push("")
  lines.push(`*Ask the admin to set GEMINI_API_KEY and I'll start answering for real.*`)
  return lines.join("\n")
}

// ────────────────────────────────────────────────────────────────────────────
// Real LLM path — Gemini 2.5 Flash via Vercel AI SDK
// ────────────────────────────────────────────────────────────────────────────
async function callGemini(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  ctx: AiContext,
  apiKey: string,
): Promise<string> {
  const [{ generateText, stepCountIs }, { createGoogleGenerativeAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/google"),
  ])

  // Explicit key so it works whether the env var is GEMINI_API_KEY or
  // GOOGLE_GENERATIVE_AI_API_KEY — no silent fallback to stub.
  const google = createGoogleGenerativeAI({ apiKey })

  const system = buildSystemPrompt(ctx)
  const llmMessages = messages.map(m => ({ role: m.role, content: m.content }))

  const result = await generateText({
    model: google("gemini-2.5-flash"),
    system,
    messages: llmMessages as any,
    tools: buildTools(),
    // Let the model call a tool, read the data, then answer (a few hops max).
    stopWhen: stepCountIs(5),
    temperature: 0.4,
    maxOutputTokens: 1024,
  })
  return (result as any).text ?? ""
}

function buildSystemPrompt(ctx: AiContext): string {
  const parts: string[] = []
  parts.push("You are ArcLens AI — the on-platform assistant for ArcLens, the ecosystem hub for Arc (Circle's L1 blockchain).")
  parts.push("")
  parts.push("Your job: help users (visitors, testers, founders, admins) understand Arc, ArcLens, and Circle's stablecoin infrastructure. Answer concretely with cited facts. When you don't know something, say so — never invent.")
  parts.push("")
  parts.push(`The user you're talking to is: ${ctx.role}.`)
  parts.push(`They're currently on the page: ${ctx.route}.`)
  if (ctx.userAddr) parts.push(`Their wallet: ${ctx.userAddr}.`)

  if (ctx.pageData) {
    parts.push("")
    parts.push(`Current page data (use this to answer questions about "this project" / "this campaign"):`)
    parts.push("```json")
    parts.push(JSON.stringify(ctx.pageData, null, 2))
    parts.push("```")
  }

  if (ctx.kbHits.length > 0) {
    parts.push("")
    parts.push(`Relevant facts from ArcLens's knowledge base. Cite these by topic when you use them:`)
    for (const k of ctx.kbHits) {
      parts.push(`- [${k.topic}] ${k.fact}${k.source_url ? ` (see ${k.source_url})` : ""}`)
    }
  }

  if (ctx.recentChats.length > 0) {
    parts.push("")
    parts.push(`Earlier conversations with THIS user (most recent first) — reference them naturally when relevant, e.g. "last time you asked about X":`)
    for (const c of ctx.recentChats) {
      parts.push(`- (${c.created_at.slice(0, 10)}) They asked: "${c.last_q || c.first_message}"`)
      if (c.last_a) parts.push(`  You answered: "${c.last_a}"`)
    }
  }

  parts.push("")
  parts.push("Tools — you can call these to fetch LIVE data; prefer them over guessing:")
  parts.push("- list_top_projects: rank Arc projects by tvl/volume/revenue (use for 'top TVL', 'biggest by volume').")
  parts.push("- compare_projects: side-by-side metrics for named projects.")
  parts.push("- search_ecosystem: find projects by keyword/category.")
  parts.push("- get_project_metrics: one project's live numbers by name/slug.")
  parts.push("Call a tool whenever the user asks about rankings, comparisons, or a project's numbers. Only state numbers a tool or the page data returned. If a tool returns an empty list or a 'none yet' note, say so plainly.")

  parts.push("")
  parts.push("Rules:")
  parts.push("1. NEVER invent TVL, volume, or revenue numbers. Use tools or page data. If a tool returns no data, tell the user it's not being reported yet — don't fabricate.")
  parts.push("2. When you cite a knowledge-base fact, speak naturally. Don't write '[topic-tag]' verbatim.")
  parts.push("3. Keep answers short — 1-3 paragraphs unless the user explicitly asks for more.")
  parts.push("4. If you don't know, say 'I don't have that information yet' rather than guessing.")
  parts.push("5. Avoid generic crypto-speak. The audience is Arc-specific builders and analysts.")

  return parts.join("\n")
}

// ────────────────────────────────────────────────────────────────────────────
// Persist the conversation. If conversationId is provided, append. Otherwise
// create a new row. Returns the conversation id so the client can append next turn.
// ────────────────────────────────────────────────────────────────────────────
async function persistConversation(args: {
  conversationId: number | null
  userAddr:       string | null
  route:          string
  role:           string
  messages:       any[]
}): Promise<number> {
  if (args.conversationId) {
    await pool.query(
      `UPDATE ai_conversations
       SET messages = $2::jsonb,
           last_used_at = NOW()
       WHERE id = $1`,
      [args.conversationId, JSON.stringify(args.messages)],
    )
    return args.conversationId
  }
  const r = await pool.query<{ id: number }>(
    `INSERT INTO ai_conversations (user_addr, route, role, messages)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id`,
    [args.userAddr, args.route, args.role, JSON.stringify(args.messages)],
  )
  return r.rows[0].id
}
