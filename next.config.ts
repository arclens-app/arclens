import type { NextConfig } from "next"
import { ARC_EXPLORER_URL } from "./src/lib/constants"

const isDev = process.env.NODE_ENV === "development"

// Fixed CSP (not per-request nonces) so pages can be served from the CDN cache.
// unsafe-inline is needed for the inline scripts Next.js writes into every page
const csp = [
  "default-src 'self'",
  // unsafe-eval only in dev — React DevTools require it; production never uses eval
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Inline styles used throughout the UI via style={{}} props
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  // Client-side direct connections — RPC, CDN, Circle faucet, Circle SDK API
  "connect-src 'self' https://rpc.testnet.arc.io https://rpc.mainnet.arc.io https://cdn.jsdelivr.net https://faucet.circle.com https://api.circle.com https://pw-auth.circle.com",
  // Circle UCW SDK renders its PIN/challenge UI inside an iframe served from pw-auth.circle.com
  "frame-src 'self' https://pw-auth.circle.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy",      value: csp },
  { key: "X-Content-Type-Options",       value: "nosniff" },
  { key: "X-Frame-Options",              value: "DENY" },
  { key: "X-XSS-Protection",             value: "1; mode=block" },
  { key: "Referrer-Policy",              value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",           value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security",    value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy",   value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
  // The block explorer pages were retired in favour of the official Arc explorer
  async redirects() {
    return [
      { source: "/overview",       destination: ARC_EXPLORER_URL,                     permanent: false },
      { source: "/blocks",         destination: `${ARC_EXPLORER_URL}/blocks`,         permanent: false },
      { source: "/transactions",   destination: `${ARC_EXPLORER_URL}/txs`,            permanent: false },
      { source: "/tokens",         destination: `${ARC_EXPLORER_URL}/tokens`,         permanent: false },
      { source: "/wallets",        destination: `${ARC_EXPLORER_URL}/accounts`,       permanent: false },
      { source: "/tx/:hash",       destination: `${ARC_EXPLORER_URL}/tx/:hash`,       permanent: false },
      { source: "/address/:addr",  destination: `${ARC_EXPLORER_URL}/address/:addr`,  permanent: false },
      { source: "/bridge",         destination: "/",                                  permanent: false },
      { source: "/approvals",      destination: ARC_EXPLORER_URL,                     permanent: false },
      // The query string (?q=) is carried over to the explorer search
      { source: "/search",         destination: `${ARC_EXPLORER_URL}/search-results`, permanent: false },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/:path*",
          destination: "/tournament.html",
          has: [{ type: "host", value: "tournament.arclenz.xyz" }],
        },
      ],
    }
  },
}

export default nextConfig
