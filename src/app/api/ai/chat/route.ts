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

export const runtime = "nodejs"
export const maxDuration = 60

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

  // Stream the answer token-by-token. Protocol: raw UTF-8 answer text, then a
  // RECORD-SEPARATOR (\x1e) followed by a JSON trailer with conversationId +
  // context. The stub path streams too, so the client has one contract.
  const apiKey = getGeminiKey()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let answerText = ""
      let live = false
      let cards: Array<{ tool: string; data: any }> = []
      try {
        if (apiKey) {
          try {
            const result = await streamGemini(body.messages, ctx, apiKey)
            for await (const delta of result.textStream) {
              answerText += delta
              controller.enqueue(encoder.encode(delta))
            }
            live = answerText.length > 0
            // Capture structured tool results so the client can render data cards.
            try {
              let trs: any[] = []
              try { trs = await (result as any).toolResults } catch {}
              if (!trs || trs.length === 0) {
                // Multi-step runs surface results per-step; flatten as a fallback.
                try {
                  const steps: any[] = await (result as any).steps
                  trs = (steps || []).flatMap(s => s.toolResults || [])
                } catch {}
              }
              const KNOWN = new Set(["list_top_projects", "compare_projects", "search_ecosystem", "get_project_metrics", "get_top_movers", "get_project_builder", "list_projects"])
              cards = (trs || [])
                .map(tr => ({ tool: tr.toolName, data: tr.output ?? tr.result }))
                .filter(c => KNOWN.has(c.tool) && c.data)
            } catch { /* no tool results */ }
          } catch (e: any) {
            console.error("[ai/chat] Gemini error:", e?.message || e)
            answerText = stubAnswer(lastUser, ctx)
            controller.enqueue(encoder.encode(answerText))
          }
        } else {
          answerText = stubAnswer(lastUser, ctx)
          controller.enqueue(encoder.encode(answerText))
        }

        // Knowledge-gap log when we couldn't really answer.
        if (!live && ctx.kbHits.length === 0) {
          await logKnowledgeGap({ question: lastUser, userAddr: session?.addr ?? null, route })
        }

        const convId = await persistConversation({
          conversationId: body.conversationId ?? null,
          userAddr: session?.addr ?? null,
          route,
          role:    ctx.role,
          messages: [...body.messages, { role: "assistant", content: answerText }],
        })

        const trailer = {
          conversationId: convId,
          context: {
            role:          ctx.role,
            kb_hits:       ctx.kbHits.length,
            has_page_data: !!ctx.pageData,
            llm:           live ? "gemini-2.5-flash" : "stub",
          },
          cards,
        }
        controller.enqueue(encoder.encode("\x1e" + JSON.stringify(trailer)))
      } catch (e: any) {
        console.error("[ai/chat] stream error:", e?.message || e)
        if (answerText.length === 0) controller.enqueue(encoder.encode("Something went wrong — try again."))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
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
async function streamGemini(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  ctx: AiContext,
  apiKey: string,
) {
  const [{ streamText, stepCountIs }, { createGoogleGenerativeAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/google"),
  ])

  // Explicit key so it works whether the env var is GEMINI_API_KEY or
  // GOOGLE_GENERATIVE_AI_API_KEY — no silent fallback to stub.
  const google = createGoogleGenerativeAI({ apiKey })

  // streamText returns synchronously with a `.textStream` async iterable that
  // yields the final user-facing text deltas (after any tool steps resolve).
  return streamText({
    model: google("gemini-2.5-flash"),
    system: buildSystemPrompt(ctx),
    messages: messages.map(m => ({ role: m.role, content: m.content })) as any,
    tools: buildTools(),
    // Let the model call a tool, read the data, then answer (a few hops max).
    stopWhen: stepCountIs(5),
    temperature: 0.4,
    maxOutputTokens: 1024,
  })
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
    parts.push(`Relevant facts from ArcLens's knowledge base. Weave them into natural prose — never show an internal tag. When a fact lists a source path, link to it.`)
    for (const k of ctx.kbHits) {
      parts.push(`- ${k.fact}${k.source_url ? ` (source: ${k.source_url})` : ""}`)
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
  parts.push("- get_top_movers: rank by GROWTH over a period — use for 'who gained the most TVL this week', 'fastest growing', 'who's up this week'. (tvl = change vs window start; volume/revenue = total over the window.)")
  parts.push("- get_project_builder: who built/owns a project — use for 'who built X', 'who's behind X', 'who's the team'.")
  parts.push("- list_projects: list/filter projects — use for 'which projects are claimed by a builder', 'verified builders', 'newest projects', 'show me <category> projects', 'what's featured'.")
  parts.push("Call a tool whenever the user asks about rankings, comparisons, growth/this-week, or a project's numbers. Only state numbers a tool or the page data returned. If a tool returns an empty list or a 'none yet' note, say so plainly.")

  parts.push("")
  parts.push("Rules:")
  parts.push("1. NEVER invent TVL, volume, or revenue numbers. Use tools or page data. If a tool returns no data, tell the user it's not being reported yet — don't fabricate.")
  parts.push("2. NEVER show internal labels or topic tags (e.g. 'arc-basics', 'usdc') in your reply — weave facts in as natural prose.")
  parts.push("3. Link users to the right place. When a fact lists a source path (e.g. /start, /ecosystem, /trials) or you mention an ArcLens page, write it as a markdown link like [Arc Beginners](/start). Prefer a link over just describing where to go.")
  parts.push("4. Be warm, concise, and skimmable — 1-3 short paragraphs, and end with a helpful next step or link when it fits.")
  parts.push("5. If you don't know, say so plainly rather than guessing. Avoid generic crypto-speak — the audience is Arc-specific builders and analysts.")
  parts.push("6. Never mention which AI model or provider powers you. You are simply ArcLens AI.")

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
