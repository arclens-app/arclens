import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "ArcLens — Arc Testnet Explorer",
  description: "The Arc Testnet explorer. AI-powered search, USDC gas fees, real-time blocks and transactions. Built for Arc builders.",
  keywords: ["Arc", "Arc Testnet", "USDC", "blockchain explorer", "Circle", "ArcLens"],
  openGraph: {
    title: "ArcLens — Arc Testnet Explorer",
    description: "Explore Arc Testnet. AI-powered search, USDC gas, real-time data.",
    siteName: "ArcLens",
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