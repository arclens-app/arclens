"use client"
import ArcLayout from "@/components/ArcLayout"

export default function NotFound() {
  return (
    <ArcLayout active="">
      <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 28px" }}>
        <div style={{ textAlign: "center", maxWidth: "480px" }}>

          {/* Logo mark */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
            <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
              <defs>
                <linearGradient id="archG404" x1="32" y1="6" x2="32" y2="52" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3"/>
                  <stop offset="35%" stopColor="#a0beff" stopOpacity="0.5"/>
                  <stop offset="100%" stopColor="#1845cc" stopOpacity="0.4"/>
                </linearGradient>
                <linearGradient id="bgG404" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#101c3d"/>
                  <stop offset="100%" stopColor="#060c20"/>
                </linearGradient>
                <linearGradient id="scanG404" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                  <stop offset="0%" stopColor="#00d990" stopOpacity="0"/>
                  <stop offset="50%" stopColor="#00d990" stopOpacity="0.4"/>
                  <stop offset="100%" stopColor="#00d990" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="15" fill="url(#bgG404)"/>
              <path d="M10 54 C10 54 10 24 32 9 C54 24 54 54 54 54" stroke="url(#archG404)" strokeWidth="6" strokeLinecap="round" fill="none"/>
              <path d="M20 54 C20 54 20 32 32 21 C44 32 44 54 44 54" stroke="url(#archG404)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.35"/>
              <line x1="16" y1="38" x2="48" y2="38" stroke="url(#scanG404)" strokeWidth="1.5"/>
              <circle cx="32" cy="38" r="2.5" fill="#00d990" opacity="0.4"/>
            </svg>
          </div>

          {/* 404 */}
          <div style={{ fontSize: "72px", fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 1, marginBottom: "8px", background: "linear-gradient(135deg, #2e3a5c 0%, #1a2440 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            404
          </div>

          <div style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.03em", marginBottom: "10px", color: "var(--t1, #e8ecff)" }}>
            Block not found
          </div>

          <div style={{ fontSize: "13px", color: "var(--t2, #6b7da8)", fontWeight: 300, lineHeight: 1.7, marginBottom: "32px", fontFamily: "'DM Mono', monospace" }}>
            This address, transaction, or page doesn't exist on Arc Testnet.<br/>
            It may have been moved or never existed.
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => window.location.href = "/"}
              style={{ height: "40px", padding: "0 22px", background: "#1a56ff", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif" }}>
              Go to Overview
            </button>
            <button onClick={() => window.history.back()}
              style={{ height: "40px", padding: "0 22px", background: "transparent", color: "var(--t2, #6b7da8)", fontSize: "13px", fontWeight: 500, border: "1px solid var(--bdr, rgba(255,255,255,0.06))", borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif" }}>
              Go back
            </button>
            <button onClick={() => window.location.href = "/search"}
              style={{ height: "40px", padding: "0 22px", background: "transparent", color: "#8aaeff", fontSize: "13px", fontWeight: 500, border: "1px solid rgba(26,86,255,0.25)", borderRadius: "9px", cursor: "pointer", fontFamily: "'Geist', sans-serif" }}>
              Search Arc
            </button>
          </div>

          {/* Chain info */}
          <div style={{ marginTop: "40px", padding: "12px 20px", background: "var(--surf, #0a0e1a)", border: "1px solid var(--bdr, rgba(255,255,255,0.06))", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontSize: "9.5px", fontFamily: "'DM Mono', monospace", color: "var(--t3, #2e3a5c)", textAlign: "left" }}>
              <div style={{ marginBottom: "2px" }}>Chain ID <span style={{ color: "var(--t2, #6b7da8)" }}>5042002</span></div>
              <div>Gas token <span style={{ color: "#00b87a" }}>USDC</span></div>
            </div>
            <div style={{ width: "1px", height: "28px", background: "var(--bdr, rgba(255,255,255,0.06))" }} />
            <div style={{ fontSize: "9.5px", fontFamily: "'DM Mono', monospace", color: "var(--t3, #2e3a5c)", textAlign: "left" }}>
              <div style={{ marginBottom: "2px" }}>Network <span style={{ color: "var(--t2, #6b7da8)" }}>Arc Testnet</span></div>
              <div>Finality <span style={{ color: "#8aaeff" }}>&lt; 1 second</span></div>
            </div>
          </div>

        </div>
      </div>
    </ArcLayout>
  )
}