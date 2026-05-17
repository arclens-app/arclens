import { NextRequest, NextResponse } from "next/server"
import { enforce } from "@/lib/ratelimit"

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "search", { limit: 60, windowMs: 60_000 })
  if (blocked) return blocked
  try {
    const { query } = await req.json()
    if (!query?.trim()) {
      return NextResponse.json({
        type: "query",
        intent: "",
        target: null,
        filter: "recent_transfers",
        explanation: "Showing recent USDC transfers on Arc Testnet.",
        suggestions: ["bridge activity", "large USDC transfers", "top USDC holders"],
      })
    }

    // Try the OpenGradient AI server if available
    const ogUrl = process.env.OG_SERVER_URL || "http://localhost:8765"
    try {
      const res = await fetch(ogUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(4000),
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json(data)
      }
    } catch {
      // OG server unavailable — fall through to basic classifier
    }

    // Basic intent classifier fallback
    const q = query.toLowerCase()
    let filter = "recent_transfers"
    let explanation = "Showing recent USDC transfers on Arc Testnet."

    if (q.includes("bridge") || q.includes("cross-chain")) {
      filter = "bridge"
      explanation = "Showing recent CCTP V2 bridge activity to and from Arc Testnet."
    } else if (q.includes("large") || q.includes("whale") || q.includes("big")) {
      filter = "large_transfers"
      explanation = "Showing the largest USDC transfers on Arc Testnet."
    } else if (q.includes("holder") || q.includes("rich") || q.includes("top wallet")) {
      filter = "top_holders"
      explanation = "Showing the top USDC holders on Arc Testnet."
    } else if (q.includes("deploy") || q.includes("contract") || q.includes("new")) {
      filter = "contract_deploys"
      explanation = "Showing recent smart contract deployments on Arc Testnet."
    } else if (q.includes("whale") || q.includes("active")) {
      filter = "whale_wallets"
      explanation = "Showing the most active wallets on Arc Testnet."
    }

    return NextResponse.json({
      type: "query",
      intent: query,
      target: null,
      filter,
      explanation,
      suggestions: ["bridge activity", "large USDC transfers", "top USDC holders"],
    })
  } catch (err) {
    console.error("[Search API]", err)
    return NextResponse.json({
      type: "query",
      intent: "",
      target: null,
      filter: "recent_transfers",
      explanation: "Showing recent USDC transfers on Arc Testnet.",
      suggestions: ["bridge activity", "large USDC transfers", "top USDC holders"],
    })
  }
}