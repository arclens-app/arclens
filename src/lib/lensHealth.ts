// src/lib/lensHealth.ts
//
// Daily Lens AI health check. When Gemini fails (spend cap hit, credits
// depleted, key revoked), chat quietly serves the "busy" fallback to every
// user, so an outage can run for days unnoticed. This sends one tiny prompt
// with the same key and model chat uses and emails the team if it fails.
// Called from the daily trust-recheck cron, so it adds no cron of its own.

import { getGeminiKey } from "@/lib/aiContext"
import { sendEmail, FROM_ADDRESS } from "@/lib/mailer"

const ALERT_TO = process.env.TEAM_EMAIL || "support@arclenz.xyz"

export async function checkLensAiHealth(): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getGeminiKey()
  let error: string | undefined
  if (!apiKey) {
    error = "No Gemini API key is configured."
  } else {
    try {
      const [{ generateText }, { createGoogleGenerativeAI }] = await Promise.all([import("ai"), import("@ai-sdk/google")])
      const google = createGoogleGenerativeAI({ apiKey })
      const res = await generateText({
        model: google("gemini-2.5-flash"),
        prompt: "Reply with the single word OK.",
        maxOutputTokens: 256,
        abortSignal: AbortSignal.timeout(30_000),
      })
      if (!res.text.trim()) error = "Gemini returned an empty reply."
    } catch (e: any) {
      error = String(e?.message || e).slice(0, 500)
    }
  }
  if (!error) return { ok: true }

  console.error("[lensHealth] Lens AI is down:", error)
  try {
    await sendEmail({
      from: FROM_ADDRESS,
      to: ALERT_TO,
      subject: "Lens AI is down: chat is serving the fallback reply",
      text: `The daily Lens AI health check failed, so users are getting the "couldn't put that together" fallback and builder payouts are paused.\n\nError from Gemini:\n${error}\n\nCommon fixes: raise the monthly spend cap at https://ai.studio/spend, or top up credits at https://ai.studio/projects. Lens AI recovers on its own once Gemini answers again; no redeploy needed.`,
    })
  } catch (e) {
    console.error("[lensHealth] alert email failed:", e)
  }
  return { ok: false, error }
}
