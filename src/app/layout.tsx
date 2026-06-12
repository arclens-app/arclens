import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { headers } from "next/headers"
import "./globals.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "ArcLens — The Ecosystem & Campaign Hub for Arc",
  description: "Discover every project building on Arc, join campaigns to earn rewards, and see who you can trust — all in one place.",
  keywords: ["Arc", "ArcLens", "TVL", "stablecoin", "stablecoin DEX", "DeFi", "Circle", "USDC", "ecosystem", "arclenz"],
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    other: [
      { rel: "icon", url: "/icon-512x512.png", sizes: "512x512" },
    ],
  },
  openGraph: {
    title: "ArcLens — The Ecosystem & Campaign Hub for Arc",
    description: "Discover every project building on Arc, join campaigns to earn rewards, and see who you can trust — all in one place.",
    url: "https://arclenz.xyz",
    siteName: "ArcLens",
    images: [
      {
        url: "https://arclenz.xyz/og-image-v3.png",
        width: 1200,
        height: 630,
        alt: "ArcLens — The Ecosystem & Campaign Hub for Arc",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ArcLens — The Ecosystem & Campaign Hub for Arc",
    description: "Discover every project building on Arc, join campaigns to earn rewards, and see who you can trust — all in one place.",
    images: ["https://arclenz.xyz/og-image-v3.png"],
    creator: "@arclens_app",
    site: "@arclens_app",
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers() opts this layout into dynamic rendering, which is required for
  // nonce-based CSP — nonces must be unique per request and cannot be statically cached
  // Reading headers() opts into dynamic rendering — required so nonces are never statically cached
  // Next.js uses x-nonce internally to nonce its own hydration scripts
  void (await headers()).get("x-nonce")
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable}`} style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}