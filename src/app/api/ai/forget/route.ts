// src/app/api/ai/forget/route.ts
//
// Right-to-erasure for Lens AI. A signed-in user can delete every AI record
// tied to their wallet: conversation history is removed outright, and old
// knowledge-gap / feedback rows are anonymised (question kept for aggregate
// coverage analytics, wallet link dropped). Session-gated — you can only erase
// your OWN data. Pairs with the automatic 30-day retention purge.

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { enforce } from "@/lib/ratelimit"
import { forgetUserAiData } from "@/lib/aiContext"

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "ai-forget", { limit: 5, windowMs: 60_000 })
  if (blocked) return blocked

  const session = getSession(req)
  if (!session?.addr) {
    return NextResponse.json({ error: "Sign in with your wallet to delete your Lens AI history." }, { status: 401 })
  }

  try {
    const removed = await forgetUserAiData(session.addr)
    return NextResponse.json({ ok: true, conversationsDeleted: removed })
  } catch (e: any) {
    console.error("[ai/forget]", e?.message || e)
    return NextResponse.json({ error: "Couldn't delete your history — try again." }, { status: 500 })
  }
}
