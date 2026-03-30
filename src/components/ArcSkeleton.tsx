"use client"

export function SkeletonLine({ width = "100%", height = "12px", radius = "4px" }: { width?: string; height?: string; radius?: string }) {
  return (
    <div style={{ width, height, borderRadius: radius, background: "var(--surf2, #0e1224)", animation: "shimmer 1.8s infinite", flexShrink: 0 }} />
  )
}

export function SkeletonBlock({ height = "44px", radius = "8px" }: { height?: string; radius?: string }) {
  return (
    <div style={{ width: "100%", height, borderRadius: radius, background: "var(--surf2, #0e1224)", animation: "shimmer 1.8s infinite" }} />
  )
}

export function SkeletonRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 18px", borderBottom: "1px solid var(--bdr, rgba(255,255,255,0.06))" }}>
      <div style={{ width: "80px", height: "42px", borderRadius: "7px", background: "var(--surf2, #0e1224)", animation: "shimmer 1.8s infinite", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
        <SkeletonLine width="60%" height="11px" />
        <SkeletonLine width="40%" height="9px" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
        <SkeletonLine width="60px" height="11px" />
        <SkeletonLine width="40px" height="9px" />
      </div>
    </div>
  )
}

export function SkeletonStatsBand() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "1px", background: "var(--bdr, rgba(255,255,255,0.06))", borderRadius: "14px", overflow: "hidden", marginBottom: "16px", border: "1px solid var(--bdr)" }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ background: "var(--surf, #0a0e1a)", padding: "20px" }}>
          <SkeletonLine width="60%" height="9px" radius="3px" />
          <div style={{ height: "10px" }} />
          <SkeletonLine width="80%" height="22px" radius="5px" />
          <div style={{ height: "6px" }} />
          <SkeletonLine width="50%" height="9px" radius="3px" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonFeed({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ background: "var(--surf, #0a0e1a)", border: "1px solid var(--bdr, rgba(255,255,255,0.06))", borderRadius: "14px", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--bdr)", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--surf2, #0e1224)" }} />
        <SkeletonLine width="120px" height="13px" />
      </div>
      {[...Array(rows)].map((_, i) => <SkeletonRow key={i} />)}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div style={{ background: "var(--surf, #0a0e1a)", border: "1px solid var(--bdr, rgba(255,255,255,0.06))", borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--surf2, #0e1224)", animation: "shimmer 1.8s infinite", flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
          <SkeletonLine width="50%" height="13px" />
          <SkeletonLine width="70%" height="10px" />
        </div>
      </div>
      <SkeletonLine width="90%" height="10px" />
      <SkeletonLine width="75%" height="10px" />
    </div>
  )
}

// Global shimmer keyframes — add once to your global CSS or layout
export function ShimmerStyles() {
  return (
    <style>{`
      @keyframes shimmer {
        0%   { opacity: 1; }
        50%  { opacity: 0.4; }
        100% { opacity: 1; }
      }
    `}</style>
  )
}