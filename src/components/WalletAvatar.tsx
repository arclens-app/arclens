"use client"
import React from "react"

function walletToGradient(wallet: string): { from: string; to: string } {
  const clean = wallet.replace("0x", "").toLowerCase().padEnd(40, "0")
  const h1 = parseInt(clean.slice(0, 6), 16) % 360
  const h2 = (h1 + 140) % 360
  const s  = 60 + (parseInt(clean.slice(6, 8), 16) % 20)
  const l  = 48 + (parseInt(clean.slice(8, 10), 16) % 16)
  return { from: `hsl(${h1},${s}%,${l}%)`, to: `hsl(${h2},${s - 8}%,${l - 10}%)` }
}

export function WalletAvatar({ wallet, size = 32, pfpUrl, style }: { wallet: string; size?: number; pfpUrl?: string | null; style?: React.CSSProperties }) {
  const { from, to } = walletToGradient(wallet)
  const proxied = pfpUrl ? `/api/image-proxy?url=${encodeURIComponent(pfpUrl)}` : null
  if (proxied) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, ...style }}>
        <img src={proxied} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${from}, ${to})`, flexShrink: 0, ...style }} />
  )
}
