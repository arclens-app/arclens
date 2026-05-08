import type { NextConfig } from "next"

const ContentSecurityPolicy = [
  "default-src 'self'",
  // Next.js App Router needs unsafe-inline for hydration scripts; nonce-based CSP is the strict upgrade path
  "script-src 'self' 'unsafe-inline'",
  // Inline styles are used throughout the UI; fonts are self-hosted via next/font
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Images are proxied through /api/image-proxy (same-origin); data/blob for favicons and canvas
  "img-src 'self' data: blob:",
  // All client-side fetches go to same-origin API routes; add wss:// here if direct WebSocket is added
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options",     value: "nosniff" },
  // Deny all framing (clickjacking protection) — also enforced by frame-ancestors in CSP
  { key: "X-Frame-Options",            value: "DENY" },
  // Legacy XSS filter for older browsers
  { key: "X-XSS-Protection",           value: "1; mode=block" },
  // Only send origin in Referer header — no full URL leaked to third parties
  { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
  // Restrict browser feature access
  { key: "Permissions-Policy",         value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Force HTTPS for 2 years, include subdomains, submit to preload list
  { key: "Strict-Transport-Security",  value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy",    value: ContentSecurityPolicy },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
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
