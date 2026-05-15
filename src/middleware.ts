import { NextRequest, NextResponse } from "next/server"

const isDev = process.env.NODE_ENV === "development"

export function middleware(request: NextRequest) {
  // Generate a fresh nonce for every page request
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")

  const csp = [
    "default-src 'self'",
    // nonce replaces unsafe-inline; strict-dynamic lets nonce-tagged scripts load further scripts
    // unsafe-eval only in dev — React DevTools require it; production never uses eval
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline styles used throughout the UI via style={{}} props
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    // Client-side direct connections — RPC, CDN, Circle faucet, Circle SDK API
    "connect-src 'self' https://rpc.testnet.arc.network https://cdn.jsdelivr.net https://faucet.circle.com https://api.circle.com https://pw-auth.circle.com",
    // Circle UCW SDK renders its PIN/challenge UI inside an iframe served from pw-auth.circle.com
    "frame-src 'self' https://pw-auth.circle.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ")

  // Forward nonce to server components via request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("content-security-policy", csp)
  return response
}

export const config = {
  matcher: [
    {
      // Run on page routes only — skip static assets and API routes
      source: "/((?!api|_next/static|_next/image|favicon\\.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
