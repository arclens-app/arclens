"use client"
import { useEffect, useState } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"

interface Project {
  name: string
  slug: string
  logo_url: string | null
  category: string
  tagline: string
  owner_wallet: string | null
}

function imgSrc(url: string | null) {
  if (!url) return null
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

export default function ActivatePage() {
  const { slug }     = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const token        = searchParams.get("token")

  const [project, setProject]   = useState<Project | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState("")
  const [step, setStep]         = useState<"connect"|"linking"|"done">("connect")
  const [wallet, setWallet]     = useState<string | null>(null)
  const [linkError, setLinkError] = useState("")
  const [imgErr, setImgErr]     = useState(false)
  const [mounted, setMounted]   = useState(false)

  const mono = "'DM Mono', monospace"
  const t1   = "#e8ecff"
  const t2   = "#6b7da8"
  const t3   = "#2e3a5c"
  const bdr  = "rgba(255,255,255,0.06)"
  const surf = "#080c1a"

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || !token) return
    async function load() {
      try {
        const res  = await fetch(`/api/claim?slug=${slug}&token=${token}`)
        const data = await res.json()
        if (!res.ok) { setError(data.error || "Invalid or expired link"); return }
        // Already claimed — send straight to dashboard
        if (data.project.owner_wallet) {
          router.replace(`/dashboard/${slug}`)
          return
        }
        setProject(data.project)
      } catch { setError("Failed to verify link") }
      finally { setLoading(false) }
    }
    load()
  }, [mounted, slug, token])

  async function connectWallet() {
    setLinkError("")
    try {
      if (!(window as any).ethereum) {
        setLinkError("No wallet detected. Install MetaMask or Rabby and try again.")
        return
      }
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" })
      const addr = accounts?.[0]
      if (!addr) { setLinkError("No account selected."); return }
      setWallet(addr)
      await linkWallet(addr)
    } catch (e: any) {
      if (e?.code === 4001) setLinkError("Connection rejected. Try again.")
      else setLinkError("Wallet connection failed. Try again.")
    }
  }

  async function linkWallet(addr: string) {
    setStep("linking")
    setLinkError("")
    try {
      const res  = await fetch("/api/claim", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, slug, wallet: addr }),
      })
      const data = await res.json()
      if (!res.ok) { setLinkError(data.error || "Failed to link wallet"); setStep("connect"); return }
      setStep("done")
      setTimeout(() => router.replace(`/dashboard/${slug}`), 1800)
    } catch { setLinkError("Network error. Try again."); setStep("connect") }
  }

  if (!mounted) return <div style={{ minHeight: "100vh", background: "#05070f" }} />

  if (!token) return (
    <div style={{ minHeight: "100vh", background: surf, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: t2, fontFamily: mono, fontSize: 13 }}>Invalid activation link.</div>
    </div>
  )

  if (loading) return (
    <div style={{ minHeight: "100vh", background: surf, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: mono, fontSize: 11, color: t3, letterSpacing: "0.08em" }}>Verifying link...</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: "100vh", background: surf, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: t1, marginBottom: 8 }}>Link expired or invalid</div>
        <div style={{ fontSize: 13, color: t2, lineHeight: 1.7, marginBottom: 24 }}>{error}</div>
        <button onClick={() => router.push("/ecosystem")}
          style={{ height: 40, padding: "0 24px", background: "transparent", color: t2, border: "1px solid " + bdr, borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: mono }}>
          Back to Ecosystem
        </button>
      </div>
    </div>
  )

  const color   = "#1a56ff"
  const proxied = imgSrc(project?.logo_url || null)

  return (
    <div style={{ minHeight: "100vh", background: surf, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Wordmark */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: t1 }}>Arc</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#1a56ff" }}>Lens</span>
        </div>

        {/* Card */}
        <div style={{ background: "#0c1122", border: "1px solid rgba(26,86,255,0.2)", borderRadius: 16, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #1a56ff, #4070ff 40%, transparent)" }} />

          {step === "done" ? (
            <div style={{ padding: "48px 32px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,184,122,0.12)", border: "1px solid rgba(0,184,122,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24 }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: t1, marginBottom: 8 }}>Dashboard activated</div>
              <div style={{ fontSize: 12, color: t2, fontFamily: mono }}>Taking you there now...</div>
            </div>
          ) : (
            <>
              {/* Project identity */}
              <div style={{ padding: "28px 28px 20px", borderBottom: "1px solid " + bdr, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, overflow: "hidden", background: color + "18", border: "1px solid " + color + "28", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, fontFamily: mono, color, flexShrink: 0 }}>
                  {proxied && !imgErr
                    ? <img src={proxied} alt={project?.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setImgErr(true)} />
                    : project?.name?.[0]
                  }
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t1, marginBottom: 4 }}>{project?.name}</div>
                  <span style={{ fontSize: 9, fontFamily: mono, padding: "2px 8px", borderRadius: 99, background: color + "14", color, border: "1px solid " + color + "28" }}>{project?.category}</span>
                </div>
              </div>

              {/* Activation body */}
              <div style={{ padding: "28px" }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: t1, marginBottom: 8, letterSpacing: "-0.02em" }}>Activate your dashboard</div>
                <div style={{ fontSize: 13, color: t2, lineHeight: 1.75, marginBottom: 28 }}>
                  Connect your wallet to link it to <strong style={{ color: t1 }}>{project?.name}</strong>. You'll use it to log in directly from now on — no email link needed.
                </div>

                {linkError && (
                  <div style={{ padding: "10px 14px", background: "rgba(224,51,72,0.08)", border: "1px solid rgba(224,51,72,0.2)", borderRadius: 8, fontSize: 12, color: "#e03348", marginBottom: 16, fontFamily: mono }}>
                    {linkError}
                  </div>
                )}

                <button
                  onClick={connectWallet}
                  disabled={step === "linking"}
                  style={{ width: "100%", height: 46, background: step === "linking" ? "rgba(26,86,255,0.5)" : "#1a56ff", color: "#fff", fontSize: 14, fontWeight: 600, border: "none", borderRadius: 10, cursor: step === "linking" ? "not-allowed" : "pointer", fontFamily: "'Geist', sans-serif", marginBottom: 12, transition: "opacity .15s" }}>
                  {step === "linking" ? "Linking wallet..." : "Connect Wallet"}
                </button>

                <div style={{ fontSize: 11, color: t3, textAlign: "center", fontFamily: mono, lineHeight: 1.7 }}>
                  Works with MetaMask, Rabby, and any injected wallet.<br />
                  Your wallet address is never shared publicly.
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: t3, fontFamily: mono }}>
          ArcLens · arclenz.xyz
        </div>
      </div>
    </div>
  )
}
