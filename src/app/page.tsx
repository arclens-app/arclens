"use client"
import { useEffect, useState, useRef } from "react"
import ArcLayout from "@/components/ArcLayout"

interface Project {
  id: number; name: string; tagline: string; category: string; slug?: string
  logo_url: string | null; website: string | null; twitter: string | null
  badge: string | null; featured: boolean
  lat: number | null; lng: number | null; city?: string; country?: string
}

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch("https://rpc.testnet.arc.network", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  })
  return (await res.json()).result
}

/* lat/lng → Three.js Vector3 on sphere radius r */
function llToV3(THREE: any, lat: number, lng: number, r = 1.015) {
  const phi   = (90 - lat) * Math.PI / 180
  const theta = (lng + 180) * Math.PI / 180
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

/* ─── 3D GLOBE ───────────────────────────────────────────────── */
function Globe3D({ projects }: { projects: Project[] }) {
  const mountRef   = useRef<HTMLDivElement>(null)
  const refreshRef = useRef<((p: Project[]) => void) | null>(null)

  useEffect(() => { refreshRef.current?.(projects) }, [projects])

  useEffect(() => {
    if (typeof window === "undefined" || !mountRef.current) return
    const container = mountRef.current
    let animId = 0, destroyed = false

    function loadScript(src: string): Promise<void> {
      return new Promise(res => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return }
        const s = document.createElement("script")
        s.src = src; s.onload = () => res(); s.onerror = () => res()
        document.head.appendChild(s)
      })
    }

    async function init(): Promise<() => void> {
      if (!(window as any).THREE)
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js")
      if (!(window as any).topojson)
        await loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js")

      const THREE = (window as any).THREE
      if (!THREE || destroyed || !container.isConnected) return () => {}

      const W = container.clientWidth  || 600
      const H = container.clientHeight || 600

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(W, H)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setClearColor(0x000000, 0)
      container.appendChild(renderer.domElement)

      const scene  = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000)
      camera.position.z = 2.6

      scene.add(new THREE.AmbientLight(0x1a3060, 0.9))
      const sun = new THREE.DirectionalLight(0xffffff, 1.0)
      sun.position.set(5, 3, 5); scene.add(sun)
      const fill = new THREE.DirectionalLight(0x0040a0, 0.4)
      fill.position.set(-5, -2, -3); scene.add(fill)

      const globe = new THREE.Group()
      scene.add(globe)

      globe.add(new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 64),
        new THREE.MeshPhongMaterial({ color: 0x060c22, emissive: 0x020612, shininess: 25, specular: 0x1a2255 })
      ))

      const atmoMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.08, 64, 64),
        new THREE.MeshPhongMaterial({ color: 0x1a56ff, transparent: true, opacity: 0.06, side: THREE.BackSide })
      )
      scene.add(atmoMesh)
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(1.18, 64, 64),
        new THREE.MeshPhongMaterial({ color: 0x002299, transparent: true, opacity: 0.022, side: THREE.BackSide })
      ))

      const gridMat = new THREE.LineBasicMaterial({ color: 0x1a56ff, transparent: true, opacity: 0.07 })
      for (let lat = -60; lat <= 60; lat += 30) {
        const pts: any[] = []
        for (let lng = 0; lng <= 360; lng += 3) pts.push(llToV3(THREE, lat, lng, 1))
        globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat))
      }
      for (let lng = 0; lng < 360; lng += 60) {
        const pts: any[] = []
        for (let lat = -90; lat <= 90; lat += 3) pts.push(llToV3(THREE, lat, lng, 1))
        globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat))
      }

      const sa = new Float32Array(2000 * 3)
      for (let i = 0; i < sa.length; i++) sa[i] = (Math.random() - 0.5) * 30
      const sg = new THREE.BufferGeometry()
      sg.setAttribute("position", new THREE.BufferAttribute(sa, 3))
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x223366, size: 0.02 })))

      const topojson = (window as any).topojson
      if (topojson) {
        fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
          .then(r => r.json())
          .then(world => {
            if (destroyed) return
            const countries = topojson.feature(world, world.objects.countries)
            const bMat = new THREE.LineBasicMaterial({ color: 0x1a56ff, transparent: true, opacity: 0.28 })
            countries.features.forEach((feat: any) => {
              const draw = (ring: number[][]) => {
                const pts: any[] = ring.map(([lng, lat]) => llToV3(THREE, lat, lng, 1.003))
                if (pts.length < 2) return
                globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), bMat))
              }
              const g = feat.geometry; if (!g) return
              if (g.type === "Polygon") g.coordinates.forEach(draw)
              else if (g.type === "MultiPolygon") g.coordinates.forEach((p: any) => p.forEach(draw))
            })
          }).catch(() => {})
      }

      /* Builder dot sprites — logo circle or initials, clickable */
      let activeSprites: any[] = []

      function makeInitialsCanvas(name: string, color: string) {
        const canvas = document.createElement("canvas")
        canvas.width = 80; canvas.height = 80
        const ctx = canvas.getContext("2d")!
        ctx.fillStyle = "#060c22"
        ctx.beginPath(); ctx.arc(40, 40, 37, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = color; ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(40, 40, 37, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = color; ctx.font = "bold 24px sans-serif"
        ctx.textAlign = "center"; ctx.textBaseline = "middle"
        ctx.fillText(name.slice(0, 2).toUpperCase(), 40, 40)
        return canvas
      }

      function buildDots(proj: Project[]) {
        const dg = new THREE.Group(); dg.name = "dotGroup"
        activeSprites = []
        const located = proj.filter(p => p.lat != null && p.lng != null)

        located.forEach(dot => {
          const pos   = llToV3(THREE, dot.lat!, dot.lng!)
          const color = "#00d990"
          const canvas = makeInitialsCanvas(dot.name, color)
          const tex    = new THREE.CanvasTexture(canvas)
          const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true })
          const sprite = new THREE.Sprite(mat)
          sprite.scale.set(0.1, 0.1, 1)
          sprite.position.copy(pos)
          sprite.userData = { href: `/ecosystem/${dot.slug || dot.id}`, name: dot.name }
          dg.add(sprite)
          activeSprites.push(sprite)

          /* Load real logo async */
          if (dot.logo_url) {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.onload = () => {
              const c2 = document.createElement("canvas"); c2.width = 80; c2.height = 80
              const cx = c2.getContext("2d")!
              cx.beginPath(); cx.arc(40, 40, 36, 0, Math.PI * 2); cx.clip()
              cx.drawImage(img, 0, 0, 80, 80)
              cx.strokeStyle = color; cx.lineWidth = 3
              cx.beginPath(); cx.arc(40, 40, 37, 0, Math.PI * 2); cx.stroke()
              mat.map = new THREE.CanvasTexture(c2)
              mat.needsUpdate = true
            }
            img.src = `/api/image-proxy?url=${encodeURIComponent(dot.logo_url)}`
          }

          /* Pulse ring */
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.022, 0.032, 16),
            new THREE.MeshBasicMaterial({ color: 0x00d990, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
          )
          ring.position.copy(pos)
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize())
          dg.add(ring)
        })

        /* Arc lines between located projects */
        if (located.length >= 2) {
          const arcMat = new THREE.LineBasicMaterial({ color: 0x00b87a, transparent: true, opacity: 0.22 })
          const pairs: number[][] = []
          for (let i = 0; i < Math.min(located.length, 5); i++) {
            pairs.push([i, (i + 2) % Math.min(located.length, 8)])
          }
          pairs.forEach(([ai, bi]) => {
            const a = located[ai], b = located[bi]; if (!a || !b || ai === bi) return
            const pts: any[] = []
            for (let t = 0; t <= 1; t += 0.025) {
              const vA = llToV3(THREE, a.lat!, a.lng!, 1).normalize()
              const vB = llToV3(THREE, b.lat!, b.lng!, 1).normalize()
              pts.push(vA.lerp(vB, t).normalize().multiplyScalar(1.015 + 0.1 * Math.sin(t * Math.PI)))
            }
            dg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat))
          })
        }

        return dg
      }

      globe.add(buildDots([]))
      refreshRef.current = (proj: Project[]) => {
        const old = globe.getObjectByName("dotGroup")
        if (old) globe.remove(old)
        globe.add(buildDots(proj))
      }

      const el = renderer.domElement; el.style.cursor = "grab"
      let isDragging = false, prevX = 0, prevY = 0
      let rotX = 0.2, rotY = 0, velX = 0, velY = 0

      function xy(e: any) {
        return "touches" in e
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: e.clientX, y: e.clientY }
      }

      const onDown = (e: any) => {
        isDragging = true; el.style.cursor = "grabbing"
        const { x, y } = xy(e); prevX = x; prevY = y; velX = 0; velY = 0
      }
      const onMove = (e: any) => {
        if (!isDragging) return
        const { x, y } = xy(e)
        velY = (x - prevX) * 0.005; velX = (y - prevY) * 0.005
        rotY += velY; rotX = Math.max(-1.2, Math.min(1.2, rotX + velX))
        prevX = x; prevY = y
      }
      const onUp = () => { isDragging = false; el.style.cursor = "grab" }

      const onClick = (e: MouseEvent) => {
        if (activeSprites.length === 0) return
        const rect = el.getBoundingClientRect()
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        const ray = new THREE.Raycaster()
        ray.setFromCamera(mouse, camera)
        const hits = ray.intersectObjects(activeSprites)
        if (hits.length > 0) {
          const href = hits[0].object.userData.href
          if (href) window.location.href = href
        }
      }

      const onHover = (e: MouseEvent) => {
        if (isDragging || activeSprites.length === 0) return
        const rect = el.getBoundingClientRect()
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        const ray = new THREE.Raycaster()
        ray.setFromCamera(mouse, camera)
        el.style.cursor = ray.intersectObjects(activeSprites).length > 0 ? "pointer" : "grab"
      }

      const onResize = () => {
        const nW = container.clientWidth, nH = container.clientHeight
        camera.aspect = nW / nH; camera.updateProjectionMatrix(); renderer.setSize(nW, nH)
      }

      el.addEventListener("mousedown", onDown)
      el.addEventListener("mousemove", onMove)
      el.addEventListener("mousemove", onHover)
      el.addEventListener("mouseup", onUp)
      el.addEventListener("mouseleave", onUp)
      el.addEventListener("click", onClick)
      el.addEventListener("touchstart", onDown, { passive: true })
      el.addEventListener("touchmove", onMove, { passive: true })
      el.addEventListener("touchend", onUp)
      window.addEventListener("resize", onResize)

      let tick = 0
      const animate = () => {
        animId = requestAnimationFrame(animate); tick += 0.016
        if (!isDragging) {
          velY = velY * 0.97 + 0.0018 * 0.03; velX *= 0.97
          rotY += velY; rotX = Math.max(-1.2, Math.min(1.2, rotX + velX))
        } else { velX *= 0.92; velY *= 0.92 }
        globe.rotation.y = rotY; globe.rotation.x = rotX
        atmoMesh.material.opacity = 0.042 + 0.022 * Math.sin(tick * 0.8)
        renderer.render(scene, camera)
      }
      animate()

      return () => {
        cancelAnimationFrame(animId)
        el.removeEventListener("mousedown", onDown)
        el.removeEventListener("mousemove", onMove)
        el.removeEventListener("mousemove", onHover)
        el.removeEventListener("mouseup", onUp)
        el.removeEventListener("mouseleave", onUp)
        el.removeEventListener("click", onClick)
        el.removeEventListener("touchstart", onDown)
        el.removeEventListener("touchmove", onMove)
        el.removeEventListener("touchend", onUp)
        window.removeEventListener("resize", onResize)
        if (el.parentNode === container) container.removeChild(el)
        renderer.dispose()
      }
    }

    let cleanup = () => {}
    init().then(fn => { if (!destroyed) cleanup = fn ?? (() => {}) })
    return () => { destroyed = true; cancelAnimationFrame(animId); refreshRef.current = null; cleanup() }
  }, [])

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
}

/* ─── LIVE TICKER ────────────────────────────────────────────── */
function LiveTicker({ items }: { items: string[] }) {
  const [idx, setIdx]         = useState(0)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false)
      setTimeout(() => { setIdx(i => (i + 1) % items.length); setVisible(true) }, 350)
    }, 3000)
    return () => clearInterval(t)
  }, [items.length])
  return (
    <span style={{ display: "inline-block", transition: "opacity 0.35s", opacity: visible ? 1 : 0, color: "#00d990", fontFamily: "'DM Mono', monospace" }}>
      {items[idx]}
    </span>
  )
}

/* ─── BUILDER MARQUEE ────────────────────────────────────────── */
function BuilderReel({ projects }: { projects: Project[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  if (projects.length === 0) return null
  const items = [...projects, ...projects]
  const duration = Math.max(24, projects.length * 3)
  return (
    <div style={{ overflow: "hidden", position: "relative" }}
      onMouseEnter={() => { if (trackRef.current) trackRef.current.style.animationPlayState = "paused" }}
      onMouseLeave={() => { if (trackRef.current) trackRef.current.style.animationPlayState = "running" }}>
      <div ref={trackRef} style={{ display: "flex", gap: "0", width: "max-content", animation: `reelScroll ${duration}s linear infinite` }}>
        {items.map((p, i) => (
          <a key={i} href={`/ecosystem/${p.slug || p.id}`}
            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 28px", textDecoration: "none", borderRight: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, height: "64px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", overflow: "hidden", background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "#8aaeff", flexShrink: 0 }}>
              {p.logo_url
                ? <img src={`/api/image-proxy?url=${encodeURIComponent(p.logo_url)}`} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => (e.currentTarget.style.display = "none")} />
                : p.name.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: "12px", color: "#6b7da8", whiteSpace: "nowrap", fontWeight: 500 }}>{p.name}</span>
            {p.badge === "official" && <span style={{ fontSize: "8px", fontFamily: "'DM Mono',monospace", padding: "1px 5px", borderRadius: "3px", background: "rgba(26,86,255,0.1)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.2)" }}>OFFICIAL</span>}
            {p.badge === "verified" && <span style={{ fontSize: "8px", fontFamily: "'DM Mono',monospace", padding: "1px 5px", borderRadius: "3px", background: "rgba(0,184,122,0.08)", color: "#00b87a", border: "1px solid rgba(0,184,122,0.2)" }}>✓</span>}
          </a>
        ))}
      </div>
    </div>
  )
}

/* ─── HOMEPAGE ───────────────────────────────────────────────── */
export default function HomePage() {
  const [mounted, setMounted]           = useState(false)
  const [isMobile, setIsMobile]         = useState(false)
  const [projects, setProjects]         = useState<Project[]>([])
  const [blockNum, setBlockNum]         = useState("...")
  const [tps, setTps]                   = useState("...")
  const [gasCost, setGasCost]           = useState("$0.011")
  const [recentBlocks, setRecentBlocks] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (!mounted) return
    fetch("/api/ecosystem").then(r => r.json()).then(d => setProjects(d.projects || [])).catch(() => {})
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    async function load() {
      try {
        const blockHex = await rpc("eth_blockNumber")
        const num      = parseInt(blockHex, 16)
        const gasHex   = await rpc("eth_gasPrice")
        const gwei     = parseInt(gasHex, 16) / 1e9
        setBlockNum(num.toLocaleString())
        setGasCost("$" + (gwei * 46000 * 1e-9).toFixed(4))
        const blocks: any[] = []
        for (let i = 0; i < 5; i++) {
          const b = await rpc("eth_getBlockByNumber", ["0x" + (num - i).toString(16), true])
          if (b) blocks.push({ number: parseInt(b.number, 16), txCount: b.transactions.length, timestamp: parseInt(b.timestamp, 16) })
        }
        if (blocks.length >= 2) {
          const span = blocks[0].timestamp - blocks[blocks.length - 1].timestamp
          if (span > 0) setTps((blocks.reduce((s: number, b: any) => s + b.txCount, 0) / span).toFixed(1))
        }
        setRecentBlocks(blocks.slice(0, 4))
      } catch { /* ignore */ }
    }
    load()
  }, [mounted])

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#060812" }} />

  const mono        = "'DM Mono', monospace"
  const bdr         = "rgba(255,255,255,0.06)"
  const t2          = "#6b7da8"
  const t3          = "#2e3a5c"
  const arc         = "#1a56ff"
  const usdc        = "#00b87a"
  const link        = "#8aaeff"
  const featured    = projects.filter(p => p.featured).slice(0, 3)
  const builderCnt  = projects.length
  const cityCnt     = [...new Set(projects.filter((p: any) => p.city).map((p: any) => p.city))].length
  const finality    = "0.82s"

  const tickers = [
    `${gasCost} to transfer any USDC amount`,
    `${tps} transactions per second`,
    `${finality} average finality`,
    `${builderCnt} builders live on testnet`,
    "Gas paid in USDC — not ETH",
    "Sub-second confirmations, every time",
  ]

  return (
    <ArcLayout active="home">
      <div style={{ fontFamily: "'Geist',system-ui,sans-serif", background: "#060812", color: "#e8ecff", minHeight: "100vh" }}>

        {/* ── HERO ─────────────────────────────────────── */}
        <div style={{
          position: "relative",
          minHeight: isMobile ? "auto" : "100vh",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          overflow: isMobile ? "visible" : "hidden",
        }}>
          <div style={{ position: "absolute", top: "-10%", right: "-5%", width: "65%", height: "120%", background: "radial-gradient(ellipse at center, rgba(26,86,255,0.07) 0%, transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "5%", left: "2%", width: "35%", height: "60%", background: "radial-gradient(ellipse, rgba(0,184,122,0.04) 0%, transparent 65%)", pointerEvents: "none" }} />

          {/* Globe — first in DOM so it stacks on top in mobile column layout */}
          <div style={isMobile ? {
            width: "100%", height: "260px", zIndex: 1, flexShrink: 0,
          } : {
            position: "absolute", right: "-3%", top: "3%", width: "58%", height: "94vh", zIndex: 1,
          }}>
            <Globe3D projects={projects} />
          </div>

          {/* Text */}
          <div style={{
            position: "relative", zIndex: 2,
            flex: isMobile ? "none" : "0 0 44%",
            padding: isMobile ? "24px 20px 48px" : "80px 0 80px 52px",
            width: isMobile ? "100%" : undefined,
          }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 12px", background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.2)", borderRadius: "99px", marginBottom: "28px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: usdc, animation: "hpulse 2s infinite" }} />
              <span style={{ fontSize: "10px", fontFamily: mono, color: link, letterSpacing: "0.08em" }}>Arc Testnet · Chain 2588 · Live</span>
            </div>

            <h1 style={{ fontSize: "clamp(30px,3.8vw,58px)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1.04, color: "#e8ecff", margin: "0 0 22px" }}>
              Track it. Build on it.<br />
              <span style={{ color: arc }}>Discover it.</span>
            </h1>

            <p style={{ fontSize: "14px", color: t2, marginBottom: "12px", lineHeight: 1.75, fontWeight: 300, maxWidth: "400px" }}>
              ArcLens is the financial intelligence layer for Arc — block explorer, ecosystem directory, events hub, bridge monitor, contract registry, and wallet analytics.
            </p>

            <div style={{ fontSize: "13px", color: t2, marginBottom: "36px", fontWeight: 300 }}>
              Right now: <LiveTicker items={tickers} />
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <a href="/overview" style={{ display: "inline-flex", alignItems: "center", height: "44px", padding: "0 26px", background: arc, color: "#fff", fontSize: "13px", fontWeight: 600, borderRadius: "10px", textDecoration: "none" }}>
                Explore Arc →
              </a>
              <a href="/ecosystem" style={{ display: "inline-flex", alignItems: "center", height: "44px", padding: "0 24px", background: "rgba(255,255,255,0.04)", color: "#e8ecff", fontSize: "13px", fontWeight: 500, borderRadius: "10px", textDecoration: "none", border: "1px solid rgba(255,255,255,0.08)" }}>
                See Who's Building
              </a>
            </div>

            <div style={{ marginTop: "44px", paddingTop: "24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Global Builders</div>
              <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.04em", color: "#e8ecff" }}>
                {builderCnt}
                <span style={{ fontSize: "13px", color: t2, fontWeight: 400, marginLeft: "8px" }}>projects · {cityCnt} cities</span>
              </div>
            </div>
          </div>

          {/* Scroll hint */}
          <div style={{ position: "absolute", bottom: "28px", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", opacity: 0.28, animation: "hfloat 2s ease-in-out infinite", zIndex: 3, pointerEvents: "none" }}>
            <div style={{ fontSize: "9px", fontFamily: mono, color: t2, letterSpacing: "0.12em" }}>SCROLL</div>
            <div style={{ width: "1px", height: "24px", background: `linear-gradient(to bottom, ${t2}, transparent)` }} />
          </div>

          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "100px", background: "linear-gradient(to top, #060812, transparent)", pointerEvents: "none", zIndex: 2 }} />
        </div>

        {/* ── STATS — big numbers, no boxes ────────────── */}
        <div style={{ borderTop: `1px solid ${bdr}`, borderBottom: `1px solid ${bdr}` }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)" }}>
            {[
              { label: "Cost to send any USDC",  value: gasCost,         color: usdc,  sub: "Flat. In dollars. Always."  },
              { label: "Average finality",        value: finality,        color: link,  sub: "Faster than a card swipe."  },
              { label: "Active builders",         value: `${builderCnt}`, color: usdc,  sub: `across ${cityCnt} cities`   },
              { label: "USDC settled today",      value: "$2.14M",        color: link,  sub: "Real economic activity."    },
            ].map((s, i) => (
              <div key={i} style={{ padding: "44px 32px", textAlign: "center", borderRight: i < 3 ? `1px solid ${bdr}` : "none" }} className="hp-stat-cell">
                <div style={{ fontSize: "42px", fontWeight: 800, letterSpacing: "-0.05em", color: s.color, lineHeight: 1, marginBottom: "12px" }}>{s.value}</div>
                <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>{s.label}</div>
                <div style={{ fontSize: "11px", color: t2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── BUILDER REEL ─────────────────────────────── */}
        {projects.length > 0 && (
          <div style={{ borderBottom: `1px solid ${bdr}` }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em" }}>Building on Arc</div>
              <a href="/ecosystem" style={{ fontSize: "11px", fontFamily: mono, color: t3, textDecoration: "none", opacity: 0.6 }}>{builderCnt} projects →</a>
            </div>
            <BuilderReel projects={projects} />
          </div>
        )}

        {/* ── FEATURED BUILDERS — editorial, no card boxes ─ */}
        {featured.length > 0 && (
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: isMobile ? "48px 20px 0" : "96px 28px 0" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "52px" }}>
              <div>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>Featured Builders</div>
                <h2 style={{ fontSize: "30px", fontWeight: 700, letterSpacing: "-0.04em", color: "#e8ecff", margin: 0 }}>Who's Building on Arc</h2>
              </div>
              <a href="/ecosystem"
                style={{ fontSize: "12px", fontFamily: mono, color: link, textDecoration: "none", opacity: 0.6, marginBottom: "4px" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
                View all {builderCnt} →
              </a>
            </div>

            {/* List-style editorial layout — no boxes */}
            {featured.map((p, i) => {
              const tw = p.twitter ? (p.twitter.startsWith("http") ? p.twitter : "https://x.com/" + p.twitter.replace("@", "")) : null
              return (
                <div key={p.id}
                  style={{ display: "grid", gridTemplateColumns: isMobile ? "44px 1fr" : "72px 1fr auto", gap: isMobile ? "14px" : "28px", alignItems: "center", padding: "28px 0", borderBottom: `1px solid ${bdr}`, cursor: "pointer" }}
                  onClick={() => p.website && window.open(p.website, "_blank")}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                  {/* Logo */}
                  <div style={{ width: "100%", aspectRatio: "1", borderRadius: "14px", overflow: "hidden", background: "rgba(26,86,255,0.06)", border: `1px solid ${bdr}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 700, color: arc, flexShrink: 0 }}>
                    {p.logo_url
                      ? <img src={`/api/image-proxy?url=${encodeURIComponent(p.logo_url)}`} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => (e.currentTarget.style.display = "none")} />
                      : p.name[0]}
                  </div>
                  {/* Info */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.03em", color: "#e8ecff" }}>{p.name}</span>
                      {p.badge === "official" && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 6px", borderRadius: "4px", background: "rgba(26,86,255,0.12)", color: link, border: "1px solid rgba(26,86,255,0.25)" }}>OFFICIAL</span>}
                      {p.badge === "verified" && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 6px", borderRadius: "4px", background: "rgba(0,184,122,0.1)", color: usdc, border: "1px solid rgba(0,184,122,0.25)" }}>✓ VERIFIED</span>}
                      {p.featured && <span style={{ fontSize: "8px", fontFamily: mono, padding: "2px 6px", borderRadius: "4px", background: "rgba(192,136,40,0.1)", color: "#c08828", border: "1px solid rgba(192,136,40,0.25)" }}>FEATURED</span>}
                      <span style={{ fontSize: "9px", fontFamily: mono, padding: "2px 8px", borderRadius: "99px", background: "rgba(26,86,255,0.07)", color: link, border: `1px solid rgba(26,86,255,0.12)` }}>{p.category}</span>
                    </div>
                    <p style={{ fontSize: "13px", color: t2, lineHeight: 1.65, margin: 0, fontWeight: 300, maxWidth: "520px" }}>{p.tagline}</p>
                  </div>
                  {/* Links */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
                    {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: "11px", fontFamily: mono, color: link, textDecoration: "none", opacity: 0.7, whiteSpace: "nowrap" }}>Website ↗</a>}
                    {tw && <a href={tw} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: "11px", fontFamily: mono, color: t2, textDecoration: "none", opacity: 0.7, whiteSpace: "nowrap" }}>Twitter ↗</a>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── ARC INTELLIGENCE — no box styling ────────── */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: isMobile ? "48px 20px 0" : "96px 28px 0", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "40px" : "80px" }}>

          {/* Statement — pure text, no box */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "20px" }}>The Arc Difference</div>
            <div style={{ fontSize: "clamp(26px,2.8vw,36px)", fontWeight: 800, letterSpacing: "-0.045em", color: "#e8ecff", lineHeight: 1.15, marginBottom: "20px" }}>
              Gas in USDC.<br />
              <span style={{ color: usdc }}>Not ETH.</span><br />
              Not volatile.
            </div>
            <p style={{ fontSize: "14px", color: t2, lineHeight: 1.75, fontWeight: 300, margin: "0 0 32px" }}>
              Every other chain forces you to hold a volatile asset just to pay fees. Arc uses USDC as its native gas token. Costs are predictable, always in dollars, zero ETH exposure required.
            </p>
            <div style={{ display: "flex", gap: "36px" }}>
              {[{ v: gasCost, l: "per transfer" }, { v: finality, l: "finality" }, { v: tps, l: "TPS live" }].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: i % 2 === 0 ? usdc : link, letterSpacing: "-0.04em" }}>{s.v}</div>
                  <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "4px" }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Live blocks — minimal, not a box */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "16px", borderBottom: `1px solid ${bdr}`, marginBottom: "0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: usdc, animation: "hpulse 2s infinite" }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#e8ecff" }}>Live Blocks</span>
              </div>
              <a href="/overview" style={{ fontSize: "11px", fontFamily: mono, color: link, textDecoration: "none", opacity: 0.6 }}>Full explorer →</a>
            </div>
            {recentBlocks.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", fontFamily: mono, fontSize: "11px", color: t3 }}>Connecting...</div>
            ) : recentBlocks.map((b: any, i: number) => (
              <div key={b.number}
                onClick={() => window.location.href = "/overview"}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 10px", borderBottom: `1px solid rgba(255,255,255,0.03)`, cursor: "pointer", transition: "background .1s", borderRadius: "6px" }}>
                <div style={{ fontFamily: mono, fontSize: "12px", color: link, fontWeight: 600, minWidth: "70px" }}>#{b.number.toLocaleString()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", color: "#e8ecff" }}>{b.txCount} transactions</div>
                </div>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3 }}>
                  {Math.floor(Date.now() / 1000) - b.timestamp < 60
                    ? Math.floor(Date.now() / 1000) - b.timestamp + "s ago"
                    : Math.floor((Date.now() / 1000 - b.timestamp) / 60) + "m ago"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CLOSING — pure typography, no box ─────────── */}
        <div style={{ textAlign: "center", padding: isMobile ? "64px 20px 60px" : "120px 28px 100px" }}>
          <div style={{ fontSize: "10px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "20px" }}>Get Started</div>
          <h2 style={{ fontSize: "clamp(32px,4vw,52px)", fontWeight: 800, letterSpacing: "-0.05em", color: "#e8ecff", margin: "0 0 40px", lineHeight: 1.05 }}>
            Your home for<br />everything Arc.
          </h2>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/overview" style={{ height: "46px", padding: "0 32px", background: arc, color: "#fff", fontSize: "14px", fontWeight: 600, borderRadius: "10px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Explore the Chain
            </a>
            <a href="/ecosystem" style={{ height: "46px", padding: "0 32px", background: "transparent", color: "#e8ecff", fontSize: "14px", fontWeight: 500, borderRadius: "10px", textDecoration: "none", display: "inline-flex", alignItems: "center", border: `1px solid rgba(255,255,255,0.1)` }}>
              Browse Ecosystem
            </a>
            <a href="/ecosystem#submit" style={{ height: "46px", padding: "0 32px", background: "transparent", color: link, fontSize: "14px", fontWeight: 500, borderRadius: "10px", textDecoration: "none", display: "inline-flex", alignItems: "center", border: "1px solid rgba(26,86,255,0.25)" }}>
              Submit Your Project
            </a>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes hpulse  { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes hfloat  { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-6px)} }
        @keyframes reelScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
      `}</style>
    </ArcLayout>
  )
}
