// src/app/api/search/route.ts
// Calls OpenGradient AI microservice (og-server.py) for intelligent search
// Falls back to basic search if AI is unavailable

import { NextRequest, NextResponse } from "next/server"

async function queryOpenGradient(query: string) {
  const res = await fetch("http://localhost:8765", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000), // 15s timeout
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  const { query } = await req.json()
  if (!query?.trim()) return NextResponse.json({ error: "Missing query" }, { status: 400 })

  const q = query.trim()

  // Quick shortcuts — no AI needed
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
    return NextResponse.json({ type: "address", target: q, intent: "view address", explanation: "Loading address from Arc Testnet", suggestions: [] })
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
    return NextResponse.json({ type: "tx", target: q, intent: "view transaction", explanation: "Loading transaction from Arc Testnet", suggestions: [] })
  }
  if (/^\d+$/.test(q)) {
    return NextResponse.json({ type: "block", target: q, intent: "view block", explanation: "Loading block #" + q + " from Arc Testnet", suggestions: [] })
  }

  // Use OpenGradient AI for natural language
  try {
    const result = await queryOpenGradient(q)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[Search] OpenGradient unavailable:", err)
    return NextResponse.json({
      type: "query",
      intent: "search Arc Testnet",
      target: null,
      filter: null,
      explanation: "Searching Arc Testnet for: " + q,
      suggestions: [],
    })
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || ""
  if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 })
  const fakeReq = new Request(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  })
  return POST(new NextRequest(fakeReq))
}