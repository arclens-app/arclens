import { NextRequest, NextResponse } from "next/server"

// Use edge runtime — faster cold starts, no 10s serverless timeout on Vercel
export const runtime = "edge"

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) return new NextResponse("Missing url", { status: 400 })

  // Only allow imgbb and known image hosts — security guard
  const allowed = [
    "i.ibb.co",
    "ibb.co",
    "assets.coingecko.com",
    "arclens.app",
    "cloudflare-ipfs.com",
    "ipfs.io",
    "logo.clearbit.com",
    "icon.horse",
  ]
  try {
    const parsed = new URL(url)
    // Reject anything that isn't http/https — blocks file:// data:// javascript:// etc
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new NextResponse("Protocol not allowed", { status: 403 })
    }
    const hostname = parsed.hostname.toLowerCase()
    // Exact match or true subdomain — `endsWith("ibb.co")` alone matched evil-ibb.co
    const ok = allowed.some(h => hostname === h || hostname.endsWith("." + h))
    if (!ok) {
      return new NextResponse("Domain not allowed", { status: 403 })
    }
  } catch {
    return new NextResponse("Invalid URL", { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://ibb.co/",
        "sec-fetch-dest": "image",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "cross-site",
      },
    })

    clearTimeout(timeout)

    if (!res.ok) {
      return new NextResponse("Failed to fetch image", { status: 502 })
    }

    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get("content-type") || "image/jpeg"

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[image-proxy] failed:", url, msg)

    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    const binary = Buffer.from(pixel, "base64")

    return new NextResponse(binary, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60",
      },
    })
  }
}