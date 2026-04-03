import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "ArcLens — Arc Testnet Explorer",
  description: "The block explorer + ecosystem hub built for Arc builders. Live blocks, transactions, USDC gas tracker and ecosystem directory.",
  keywords: ["Arc", "Arc Testnet", "USDC", "blockchain explorer", "Circle", "ArcLens", "arclenz"],
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
    title: "ArcLens — Arc Testnet Explorer",
    description: "The block explorer + ecosystem hub built for Arc builders.",
    url: "https://arclenz.xyz",
    siteName: "ArcLens",
    images: [
      {
        url: "https://arclenz.xyz/og-image.png",
        width: 1200,
        height: 630,
        alt: "ArcLens — The Arc Ecosystem Hub",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ArcLens — Arc Testnet Explorer",
    description: "The block explorer + ecosystem hub built for Arc builders.",
    images: ["https://arclenz.xyz/og-image.png"],
    creator: "@arclens_app",
    site: "@arclens_app",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable}`} style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}