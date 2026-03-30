import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "large usdc transfers"
  
  const PRIVATE_KEY = process.env.OPENGRADIENT_PRIVATE_KEY
  
  if (!PRIVATE_KEY) {
    return NextResponse.json({ error: "OPENGRADIENT_PRIVATE_KEY not set in env" })
  }

  try {
    // Step 1: probe
    const body = JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: query }],
      max_tokens: 100,
    })

    const probe = await fetch("https://llm.opengradient.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })

    const probeStatus  = probe.status
    const probeHeaders = Object.fromEntries(probe.headers.entries())
    const probeBody    = await probe.text()

    return NextResponse.json({
      privateKeyLoaded: !!PRIVATE_KEY,
      privateKeyPrefix: PRIVATE_KEY.slice(0, 6) + "...",
      probeStatus,
      probeHeaders,
      probeBody: probeBody.slice(0, 500),
    })
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : String(err),
      privateKeyLoaded: !!PRIVATE_KEY,
    })
  }
}