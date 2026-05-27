"use client"
//
// Founder tab for managing the contracts that count toward this project's
// TVL and Revenue tracking on /ecosystem. Authentication is the existing
// session cookie (already required to render this dashboard).
//
// Mirrors the styling vocab of the surrounding dashboard — same vars, same
// mono font, same border/surface tokens — so it blends with the existing
// tabs instead of looking bolted-on.

import { useCallback, useEffect, useMemo, useState } from "react"
import { id as keccakId } from "ethers"

// Common Swap-event presets so founders don't have to type the full Solidity
// signature from memory. Picking one auto-fills the signature + a sensible
// default amount-arg index; the founder can still tweak either field.
const VOLUME_PRESETS = {
  custom:     { label: "Custom (I'll fill it in myself)", sig: "",   arg: ""  },
  uniswap_v2: {
    label: "Uniswap V2 / fork — Swap(amount0In, amount1In, …)",
    sig:   "Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
    arg:   "0",
  },
  uniswap_v3: {
    label: "Uniswap V3 / fork — Swap(amount0, amount1, …)",
    sig:   "Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
    arg:   "0",
  },
} as const

// Compute the topic[0] hash exactly as the indexer does — strip `indexed` and
// arg names, then keccak. Lets the founder eyeball the topic and confirm it
// matches what their contract actually emits.
function topicForSignature(sig: string): string | null {
  if (!sig) return null
  const m = sig.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/)
  if (!m) return null
  const args = m[2].split(",").map(a => a.trim()).filter(Boolean)
    .map(a => a.replace(/\bindexed\b/g, " ").trim().split(/\s+/)[0])
  try { return keccakId(`${m[1]}(${args.join(",")})`) } catch { return null }
}

interface ProjectContract {
  id: number
  project_id: number
  address: string
  role: "tvl" | "revenue" | "treasury" | "volume"
  label: string | null
  start_block: number
  deployer_address: string | null
  verified_at: string | null
  revoked_at: string | null
  revoke_reason: string | null
  created_at: string
  volume_event_signature?: string | null
  volume_event_topic?: string | null
  volume_amount_arg?: number | null
  volume_stablecoin_id?: number | null
}

interface Stablecoin {
  id: number
  symbol: string
  address: string
  decimals: number
  peg_currency: string
}

interface Theme {
  mono: string
  bdr: string
  surf: string
  surf2: string
  t1: string
  t2: string
  t3: string
  green: string
}

interface Props {
  slug: string
  token: string | null
  connectedWallet: string | null
  theme: Theme
}

export default function TvlTrackingPanel({ slug, token, connectedWallet, theme }: Props) {
  const { mono, bdr, surf, surf2, t1, t2, t3, green } = theme

  const [contracts, setContracts] = useState<ProjectContract[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [addr, setAddr] = useState("")
  const [role, setRole] = useState<"tvl" | "revenue" | "treasury" | "volume">("tvl")
  const [label, setLabel] = useState("")
  const [startBlock, setStartBlock] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [submitSuccess, setSubmitSuccess] = useState("")

  // Volume-only subform
  const [stables, setStables] = useState<Stablecoin[]>([])
  const [volMethod, setVolMethod] = useState<"swap_event" | "outflow_transfer">("swap_event")
  const [volPreset, setVolPreset] = useState<keyof typeof VOLUME_PRESETS>("custom")
  const [volSignature, setVolSignature] = useState("")
  const [volAmountArg, setVolAmountArg] = useState("")
  const [volStablecoinId, setVolStablecoinId] = useState<string>("")

  function applyPreset(p: keyof typeof VOLUME_PRESETS) {
    setVolPreset(p)
    const preset = VOLUME_PRESETS[p]
    if (p !== "custom") {
      setVolSignature(preset.sig)
      setVolAmountArg(preset.arg)
    }
  }

  // Step-2 state: the canonical message + opaque token issued by /challenge,
  // plus the on-chain deployer the signature must come from. When the
  // connected wallet equals the deployer, we offer a one-click in-browser
  // signing path; otherwise the founder uses the copy/paste flow.
  const [challenge, setChallenge] = useState<{
    message: string
    token: string
    expires_at: string
    deployer: string | null
    deployer_status: "found" | "unindexed" | "not_a_contract"
  } | null>(null)
  const [signaturePaste, setSignaturePaste] = useState("")
  const [copiedMsg, setCopiedMsg] = useState(false)
  const [inlineSigning, setInlineSigning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      const qs = new URLSearchParams({ slug })
      if (token) qs.set("token", token)
      const res = await fetch(`/api/project-contracts?${qs.toString()}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load")
      setContracts(data.contracts || [])
    } catch (e: any) {
      setLoadError(e?.message || "Network error")
    } finally {
      setLoading(false)
    }
  }, [slug, token])

  useEffect(() => { load() }, [load])

  // Load the active stablecoin registry so the volume subform can offer them
  // as the denomination choice. Cached aggressively — the registry rarely
  // changes and a stale list still produces correct numbers (just doesn't
  // surface newly-added stables).
  useEffect(() => {
    fetch("/api/stablecoins", { cache: "force-cache" })
      .then(r => r.ok ? r.json() : { stablecoins: [] })
      .then(d => setStables(d.stablecoins || []))
      .catch(() => {})
  }, [])

  const live = useMemo(
    () => contracts.filter(c => c.verified_at && !c.revoked_at),
    [contracts],
  )
  const revoked = useMemo(
    () => contracts.filter(c => c.revoked_at),
    [contracts],
  )

  // Step 1 of submit flow: request a canonical signing message from the
  // server. No wallet interaction yet — the founder is free to take that
  // message OFFLINE and sign it with their deployer wallet however they
  // prefer (Frame, Rabby, hardware wallet, Safe Tx Builder, cast).
  async function requestChallenge() {
    setSubmitError("")
    setSubmitSuccess("")
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr.trim())) {
      setSubmitError("Enter a valid 0x… contract address.")
      return
    }
    if (role === "volume") {
      if (!volStablecoinId) {
        setSubmitError("Pick the stablecoin the amount is denominated in.")
        return
      }
      // Swap-event method needs the canonical signature + amount arg index.
      // Outflow-transfer method only needs the stablecoin (universal Transfer event).
      if (volMethod === "swap_event") {
        if (!volSignature.trim() || !/^[A-Za-z_][A-Za-z0-9_]*\(.*\)$/.test(volSignature.trim())) {
          setSubmitError('Volume needs an event signature like "Swap(address indexed sender, uint256 amount0, ...)".')
          return
        }
        const argIdx = Number(volAmountArg)
        if (!Number.isFinite(argIdx) || argIdx < 0) {
          setSubmitError("Volume needs the index (0-based) of the amount arg in log.data.")
          return
        }
      }
    }

    setSubmitting(true)
    try {
      const body: any = {
        slug,
        address: addr.trim(),
        role,
        label: label.trim() || null,
      }
      if (startBlock.trim()) body.start_block = Number(startBlock)
      if (role === "volume") {
        body.volume_method        = volMethod
        body.volume_stablecoin_id = Number(volStablecoinId)
        if (volMethod === "swap_event") {
          body.volume_event_signature = volSignature.trim()
          body.volume_amount_arg      = Number(volAmountArg)
        }
      }
      const res = await fetch("/api/project-contracts/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to issue challenge")
      setChallenge({
        message: data.message,
        token: data.token,
        expires_at: data.expires_at,
        deployer: data.deployer ?? null,
        deployer_status: data.deployer_status ?? "unindexed",
      })
    } catch (e: any) {
      setSubmitError(e?.message || "Network error")
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2: send the message + an off-chain signature back. Used by the
  // copy/paste flow (cold/multisig deployers). Inline-signing has its own
  // direct call to submitWithSignatureRaw so the user gets a single click.
  async function submitWithSignature() {
    setSubmitError("")
    setSubmitSuccess("")
    if (!signaturePaste.trim() || !/^0x[0-9a-fA-F]+$/.test(signaturePaste.trim())) {
      setSubmitError("Paste the signature as 0x-prefixed hex.")
      return
    }
    try { await submitWithSignatureRaw(signaturePaste.trim()) }
    catch {}
  }

  // One-click in-browser signing — only available when the connected wallet
  // equals the on-chain deployer. Uses standard EIP-191 personal_sign; the
  // resulting signature is identical in shape to one produced offline, so
  // the server doesn't care which path was used.
  async function signInBrowser() {
    if (!challenge) return
    setSubmitError("")
    setInlineSigning(true)
    try {
      const eth = (typeof window !== "undefined") ? (window as any).ethereum : null
      if (!eth) throw new Error("No injected wallet. Use a copy/paste signature instead.")
      const sig = await eth.request({
        method: "personal_sign",
        params: [challenge.message, connectedWallet],
      })
      if (typeof sig !== "string" || !/^0x[0-9a-fA-F]+$/.test(sig)) {
        throw new Error("Wallet returned an unexpected signature format.")
      }
      setSignaturePaste(sig)
      // Fire the verify+register immediately so the founder gets a single click.
      await submitWithSignatureRaw(sig)
    } catch (e: any) {
      // User rejects show up as code=4001 — surface a friendly message
      if (e?.code === 4001) setSubmitError("Sign request cancelled in wallet.")
      else setSubmitError(e?.message || "Wallet signing failed")
    } finally {
      setInlineSigning(false)
    }
  }

  // Shared core of the verify+register call — used by both signInBrowser
  // and the paste-signature button.
  async function submitWithSignatureRaw(sig: string) {
    if (!challenge) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/project-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_token: challenge.token,
          signed_message: challenge.message,
          signature: sig,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to register")
      setSubmitSuccess(`${data.message || "Tracked."} (verified via ${data.verification_method ?? "signature"})`)
      setAddr("")
      setLabel("")
      setStartBlock("")
      setVolMethod("swap_event")
      setVolPreset("custom")
      setVolSignature("")
      setVolAmountArg("")
      setVolStablecoinId("")
      setChallenge(null)
      setSignaturePaste("")
      await load()
    } catch (e: any) {
      setSubmitError(e?.message || "Network error")
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  function cancelChallenge() {
    setChallenge(null)
    setSignaturePaste("")
    setSubmitError("")
  }

  async function revoke(id: number) {
    setSubmitError("")
    try {
      const res = await fetch(`/api/project-contracts/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to revoke")
      await load()
    } catch (e: any) {
      setSubmitError(e?.message || "Network error")
    }
  }

  // ── styles ─────────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "9.5px",
    fontFamily: mono,
    color: t3,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "5px",
  }
  const inputStyle: React.CSSProperties = {
    height: "38px",
    background: surf2,
    border: "1px solid " + bdr,
    borderRadius: "7px",
    padding: "0 12px",
    fontSize: "13px",
    fontFamily: mono,
    color: t1,
    outline: "none",
    width: "100%",
  }
  const roleColor = (r: ProjectContract["role"]) =>
    r === "tvl" ? "#8aaeff" : r === "revenue" ? "#c08828" : "#a855f7"

  return (
    <div style={{ background: surf, border: "1px solid " + bdr, borderRadius: "12px", padding: "24px 26px" }}>
      <div style={{ fontSize: "14px", fontWeight: 600, color: t1, marginBottom: "4px" }}>
        TVL &amp; Revenue tracking
      </div>
      <div style={{ fontSize: "11px", fontFamily: mono, color: t3, marginBottom: "22px", lineHeight: 1.6 }}>
        Register the contracts that hold user deposits (TVL) or collect fees (Revenue).
        We verify your ownership by matching the contract&apos;s on-chain deployer to your signed-in wallet —
        the same gate used for contract claims. Numbers appear on /ecosystem within 5 minutes.
      </div>

      {/* ── LIVE LIST ── */}
      {loading ? (
        <div style={{ fontSize: "12px", fontFamily: mono, color: t3, padding: "16px 0" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ fontSize: "12px", fontFamily: mono, color: "#e03348", padding: "10px 0" }}>{loadError}</div>
      ) : live.length === 0 ? (
        <div style={{
          padding: "16px",
          background: "rgba(26,86,255,0.04)",
          border: "1px dashed " + bdr,
          borderRadius: "8px",
          fontSize: "12px",
          fontFamily: mono,
          color: t3,
          marginBottom: "22px",
          lineHeight: 1.6,
        }}>
          No contracts registered yet. Add one below to enable TVL/Revenue on your /ecosystem page.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "22px" }}>
          {live.map(c => (
            <div key={c.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 14px",
              background: surf2,
              border: "1px solid " + bdr,
              borderRadius: "8px",
              flexWrap: "wrap",
            }}>
              <span style={{
                fontSize: "9px",
                fontFamily: mono,
                padding: "2px 7px",
                borderRadius: "4px",
                background: roleColor(c.role) + "1a",
                color: roleColor(c.role),
                border: "1px solid " + roleColor(c.role) + "33",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                flexShrink: 0,
              }}>{c.role}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontFamily: mono, color: t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.label || c.address}
                </div>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "2px" }}>
                  {c.label ? c.address + " · " : ""}from block {Number(c.start_block).toLocaleString()}
                </div>
              </div>
              <span style={{ fontSize: "9px", fontFamily: mono, color: green, padding: "2px 7px", borderRadius: "4px", background: "rgba(0,184,122,0.08)", border: "1px solid rgba(0,184,122,0.25)", flexShrink: 0 }}>
                ✓ verified by deployer
              </span>
              <button
                onClick={() => revoke(c.id)}
                style={{
                  height: "28px",
                  padding: "0 10px",
                  background: "rgba(224,51,72,0.08)",
                  color: "#e03348",
                  border: "1px solid rgba(224,51,72,0.2)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "10px",
                  fontFamily: mono,
                  flexShrink: 0,
                }}
                title="Stop tracking this contract"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── ADD FORM ── */}
      <div style={{ borderTop: "1px solid " + bdr, paddingTop: "20px" }}>
        <div style={{ fontSize: "11px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
          Add a contract
        </div>

        <div style={{
          padding: "10px 14px",
          background: "rgba(138,174,255,0.05)",
          border: "1px solid rgba(138,174,255,0.2)",
          borderRadius: "7px",
          fontSize: "11px",
          fontFamily: mono,
          color: "#8aaeff",
          marginBottom: "14px",
          lineHeight: 1.7,
        }}>
          <strong style={{ color: "#a8c2ff" }}>Security note.</strong> You stay signed in with any wallet
          that owns this project. To prove the contract is yours, you sign an off-chain message with
          your <em>deployer wallet</em> wherever it lives — hardware wallet, Safe multisig, cast,
          Frame, anything that signs EIP-191. The deployer wallet never connects to a URL.
        </div>
        {!connectedWallet && (
          <div style={{
            padding: "8px 14px",
            background: "rgba(192,136,40,0.06)",
            border: "1px solid rgba(192,136,40,0.25)",
            borderRadius: "7px",
            fontSize: "11px",
            fontFamily: mono,
            color: "#c08828",
            marginBottom: "14px",
            lineHeight: 1.6,
          }}>
            Sign in with any wallet (top-right) — it just needs to be the project&apos;s owner wallet.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Contract address</label>
            <input
              value={addr}
              onChange={e => setAddr(e.target.value)}
              placeholder="0x…"
              style={{ ...inputStyle, fontFamily: mono }}
              disabled={submitting}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
            <div>
              <label style={labelStyle}>Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as "tvl" | "revenue" | "treasury" | "volume")}
                style={{ ...inputStyle, cursor: "pointer" }}
                disabled={submitting}
              >
                <option value="tvl">TVL — holds user deposits</option>
                <option value="volume">Volume — emits Swap events</option>
                <option value="revenue">Revenue — collects fees</option>
                <option value="treasury">Treasury — protocol-owned</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Label (optional)</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder='e.g. "Main vault"'
                style={inputStyle}
                disabled={submitting}
              />
            </div>
            <div>
              <label style={labelStyle}>Start block (optional)</label>
              <input
                value={startBlock}
                onChange={e => setStartBlock(e.target.value)}
                placeholder="auto-detect"
                style={inputStyle}
                disabled={submitting}
              />
            </div>
          </div>

          {role === "volume" && (
            <div style={{
              padding: "14px 16px",
              background: "rgba(138,174,255,0.05)",
              border: "1px solid rgba(138,174,255,0.2)",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}>
              <div style={{ fontSize: "11px", fontFamily: mono, color: "#8aaeff", letterSpacing: "0.05em", lineHeight: 1.6 }}>
                Two ways to track volume on Arc. Pick the one that fits your contract.
              </div>
              <div>
                <label style={labelStyle}>Tracking method</label>
                <select
                  value={volMethod}
                  onChange={e => setVolMethod(e.target.value as "swap_event" | "outflow_transfer")}
                  style={{ ...inputStyle, cursor: "pointer" }}
                  disabled={submitting}
                >
                  <option value="swap_event">Swap event — precise. Your contract emits a Swap log per trade.</option>
                  <option value="outflow_transfer">Outflow Transfer — approximate. For aggregators / routers without Swap events.</option>
                </select>
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "6px", lineHeight: 1.6 }}>
                  {volMethod === "swap_event"
                    ? "Decodes your declared Swap event. Cards show ✓ swap-event precise."
                    : "Sums stablecoin Transfer events leaving your router. Approximate — cards show “Outflow method” badge. Best for aggregators (Tower, 1inch, Paraswap) whose router contracts don’t emit Swap events."}
                </div>
              </div>
              {volMethod === "swap_event" && (
              <div>
                <label style={labelStyle}>What does your protocol look like?</label>
                <select
                  value={volPreset}
                  onChange={e => applyPreset(e.target.value as keyof typeof VOLUME_PRESETS)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                  disabled={submitting}
                >
                  {(Object.keys(VOLUME_PRESETS) as Array<keyof typeof VOLUME_PRESETS>).map(k => (
                    <option key={k} value={k}>{VOLUME_PRESETS[k].label}</option>
                  ))}
                </select>
                {volPreset !== "custom" && (
                  <div style={{ fontSize: "10px", fontFamily: mono, color: "#00b87a", marginTop: "6px" }}>
                    ✓ Auto-filled below. Edit if your contract&apos;s event differs.
                  </div>
                )}
              </div>
              )}
              {volMethod === "swap_event" && (
                <div>
                  <label style={labelStyle}>Event signature</label>
                  <input
                    value={volSignature}
                    onChange={e => { setVolSignature(e.target.value); setVolPreset("custom") }}
                    placeholder='Swap(address indexed sender, uint256 amount0, ...)'
                    style={{ ...inputStyle, fontSize: "12px" }}
                    disabled={submitting}
                  />
                  {volSignature && topicForSignature(volSignature) && (
                    <div style={{ fontSize: "10px", fontFamily: mono, color: t3, marginTop: "6px", wordBreak: "break-all", lineHeight: 1.5 }}>
                      Topic[0]: <span style={{ color: t2 }}>{topicForSignature(volSignature)}</span>
                      <br />
                      <span style={{ color: t3 }}>↑ This is the hash we filter chain logs for. It should match what your contract actually emits.</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: volMethod === "swap_event" ? "120px 1fr" : "1fr", gap: "10px" }}>
                {volMethod === "swap_event" && (
                  <div>
                    <label style={labelStyle}>Amount arg #</label>
                    <input
                      value={volAmountArg}
                      onChange={e => setVolAmountArg(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="1"
                      style={inputStyle}
                      disabled={submitting}
                    />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Denominated in</label>
                  <select
                    value={volStablecoinId}
                    onChange={e => setVolStablecoinId(e.target.value)}
                    style={{ ...inputStyle, cursor: "pointer" }}
                    disabled={submitting}
                  >
                    <option value="">Choose stablecoin…</option>
                    {stables.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.symbol} ({s.peg_currency}-pegged · {s.decimals}d)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {volMethod === "swap_event" && (
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, lineHeight: 1.6 }}>
                  If your event has indexed args, supply the <em>non-indexed subset</em> as the signature.
                  The amount index counts from 0 across the args that appear in <code>log.data</code>.
                </div>
              )}
              {volMethod === "outflow_transfer" && (
                <div style={{ fontSize: "10px", fontFamily: mono, color: t3, lineHeight: 1.6 }}>
                  We&apos;ll count every stablecoin Transfer event with <code>from = {addr ? addr.slice(0,10)+"…" : "your contract"}</code>.
                  No on-chain event from your contract is required. The resulting volume is an approximation
                  (over-counts internal hops) and the project page will show an <em>Outflow method · approximate</em> badge.
                </div>
              )}
            </div>
          )}

          {submitError && (
            <div style={{ fontSize: "12px", color: "#e03348", fontFamily: mono, lineHeight: 1.6 }}>
              {submitError}
            </div>
          )}
          {submitSuccess && (
            <div style={{
              padding: "16px 18px",
              background: "rgba(0,184,122,0.07)",
              border: "1px solid rgba(0,184,122,0.3)",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "22px", height: "22px",
                  borderRadius: "50%",
                  background: green,
                  color: "#04201a",
                  fontSize: "13px", fontWeight: 700,
                  flexShrink: 0,
                }}>✓</span>
                <div style={{ fontSize: "13px", fontWeight: 600, color: t1 }}>
                  Verified by deployer
                </div>
              </div>
              <div style={{ fontSize: "12px", fontFamily: mono, color: t2, lineHeight: 1.7 }}>
                Your numbers will appear at{" "}
                <a href={`/ecosystem/${slug}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#8aaeff", textDecoration: "underline" }}>
                  /ecosystem/{slug}
                </a>{" "}
                within 5 minutes — the indexer picks it up on the next tick.
                <br />
                <span style={{ color: t3 }}>{submitSuccess}</span>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <a
                  href={`/ecosystem/${slug}`} target="_blank" rel="noopener noreferrer"
                  style={{
                    height: "32px", padding: "0 14px",
                    background: green, color: "#04201a",
                    fontSize: "12px", fontWeight: 600,
                    border: "none", borderRadius: "7px",
                    fontFamily: mono, textDecoration: "none",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                  Open project page →
                </a>
                <button
                  onClick={() => setSubmitSuccess("")}
                  style={{
                    height: "32px", padding: "0 14px",
                    background: "transparent", color: t2,
                    fontSize: "12px", fontFamily: mono,
                    border: "1px solid " + bdr, borderRadius: "7px",
                    cursor: "pointer",
                  }}>
                  Add another contract
                </button>
              </div>
            </div>
          )}

          {/* Step 1 button: request a signing message */}
          {!challenge && (
            <button
              onClick={requestChallenge}
              disabled={submitting || !connectedWallet}
              style={{
                height: "42px",
                background: "#1a56ff",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                border: "none",
                borderRadius: "8px",
                cursor: submitting || !connectedWallet ? "not-allowed" : "pointer",
                fontFamily: mono,
                opacity: submitting || !connectedWallet ? 0.6 : 1,
              }}
            >
              {submitting ? "Generating signing message…" : "Get signing message"}
            </button>
          )}
        </div>

        {/* Step 2: copy message + paste signature */}
        {challenge && (
          <div style={{
            marginTop: "18px",
            padding: "18px 18px 16px",
            background: surf2,
            border: "1px solid rgba(0,184,122,0.25)",
            borderRadius: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}>
            {(() => {
              const conn = (connectedWallet || "").toLowerCase()
              const dep = (challenge.deployer || "").toLowerCase()
              const matched = !!dep && conn === dep
              return (
                <>
                  <div style={{ fontSize: "10px", fontFamily: mono, color: green, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Step 2 of 2 · Sign as the deployer
                  </div>

                  {/* Deployer banner — tells the founder exactly what address is expected. */}
                  <div style={{
                    padding: "10px 14px",
                    background: matched ? "rgba(0,184,122,0.08)" : "rgba(192,136,40,0.06)",
                    border: "1px solid " + (matched ? "rgba(0,184,122,0.3)" : "rgba(192,136,40,0.25)"),
                    borderRadius: "8px",
                    fontSize: "11.5px",
                    fontFamily: mono,
                    color: matched ? green : "#c08828",
                    lineHeight: 1.7,
                  }}>
                    {challenge.deployer_status === "found" ? (
                      <>
                        On-chain deployer: <span style={{ color: t1, fontWeight: 600 }}>{challenge.deployer}</span>
                        <br />
                        {matched
                          ? "✓ That's your connected wallet — sign in-browser with one click below."
                          : `Your connected wallet (${conn.slice(0,8)}…${conn.slice(-6)}) is different. Sign the message offline with the deployer wallet and paste the signature.`}
                      </>
                    ) : challenge.deployer_status === "not_a_contract" ? (
                      <>No bytecode at that address on Arc — this isn&apos;t a contract.</>
                    ) : (
                      <>Couldn&apos;t reach arcscan to look up the deployer. You can still sign + submit — the server re-checks on submission.</>
                    )}
                  </div>
                </>
              )
            })()}

            <div style={{ fontSize: "12px", fontFamily: mono, color: t2, lineHeight: 1.7 }}>
              Two ways to sign: (1) <strong style={{ color: t1 }}>connect the deployer wallet</strong> to this site
              and click <em>Sign with connected wallet</em> for a single click, or (2) take the message
              offline and sign with anything that produces EIP-191 <code>personal_sign</code> — Frame,
              Rabby, Ledger Live, <code>cast wallet sign</code>, a Safe multisig (EIP-1271). Paste the
              resulting 0x-hex signature below. Message expires at {new Date(challenge.expires_at).toLocaleTimeString()}.
            </div>

            {/* One-click in-browser sign — only shown when the connected
                wallet is itself the on-chain deployer. */}
            {(() => {
              const conn = (connectedWallet || "").toLowerCase()
              const dep = (challenge.deployer || "").toLowerCase()
              if (!dep || conn !== dep) return null
              return (
                <button
                  onClick={signInBrowser}
                  disabled={inlineSigning || submitting}
                  style={{
                    height: "44px",
                    padding: "0 20px",
                    background: green,
                    color: "#04201a",
                    fontSize: "13px",
                    fontWeight: 700,
                    border: "none",
                    borderRadius: "8px",
                    cursor: inlineSigning || submitting ? "not-allowed" : "pointer",
                    fontFamily: mono,
                    opacity: inlineSigning || submitting ? 0.6 : 1,
                  }}>
                  {inlineSigning || submitting ? "Signing & verifying…" : "Sign with connected wallet"}
                </button>
              )
            })()}

            <div>
              <label style={labelStyle}>Message to sign</label>
              <textarea
                readOnly
                value={challenge.message}
                style={{
                  width: "100%",
                  minHeight: "180px",
                  background: surf,
                  border: "1px solid " + bdr,
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontFamily: mono,
                  fontSize: "11.5px",
                  color: t1,
                  lineHeight: 1.6,
                  outline: "none",
                  resize: "vertical",
                  whiteSpace: "pre",
                } as React.CSSProperties}
                onClick={e => (e.target as HTMLTextAreaElement).select()}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(challenge.message)
                    setCopiedMsg(true)
                    setTimeout(() => setCopiedMsg(false), 1500)
                  } catch {}
                }}
                style={{
                  marginTop: "8px",
                  height: "30px",
                  padding: "0 14px",
                  background: "rgba(26,86,255,0.07)",
                  color: "#8aaeff",
                  fontSize: "11px",
                  fontFamily: mono,
                  border: "1px solid rgba(26,86,255,0.25)",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}>
                {copiedMsg ? "✓ Copied" : "Copy message"}
              </button>
            </div>

            <div>
              <label style={labelStyle}>Signature (0x…hex)</label>
              <textarea
                value={signaturePaste}
                onChange={e => setSignaturePaste(e.target.value)}
                placeholder="0x… paste the deployer-wallet signature here"
                style={{
                  width: "100%",
                  minHeight: "70px",
                  background: surf,
                  border: "1px solid " + bdr,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontFamily: mono,
                  fontSize: "11.5px",
                  color: t1,
                  outline: "none",
                  resize: "vertical",
                  wordBreak: "break-all",
                } as React.CSSProperties}
                disabled={submitting}
              />
            </div>

            {/* Offline signing reference — collapsed by default so the form
                stays compact for the inline-sign path. */}
            <details style={{ marginTop: "-4px" }}>
              <summary style={{ fontSize: "11px", fontFamily: mono, color: "#8aaeff", cursor: "pointer", padding: "4px 0", listStyle: "none" }}>
                ▸ How do I sign with a hardware wallet / Safe / cast?
              </summary>
              <div style={{
                marginTop: "8px",
                padding: "12px 14px",
                background: surf,
                border: "1px solid " + bdr,
                borderRadius: "8px",
                fontSize: "11px",
                fontFamily: mono,
                color: t2,
                lineHeight: 1.7,
              }}>
                <div style={{ marginBottom: "8px" }}>
                  <strong style={{ color: t1 }}>Ledger / Trezor</strong> — open Ledger Live (My Ledger → Sign Message)
                  or Trezor Suite (Sign &amp; Verify → Sign Message). Paste the message, approve on device, copy the
                  resulting <code>0x…</code> hex back here.
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <strong style={{ color: t1 }}>Frame desktop</strong> — connects hardware wallets natively. Has a
                  built-in Sign Message panel.
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <strong style={{ color: t1 }}>Safe multisig</strong> — open your Safe → Apps → Sign Message.
                  Each signer approves; Safe returns an EIP-1271 signature blob. Paste it like any other — we detect
                  contract wallets automatically.
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <strong style={{ color: t1 }}>Foundry CLI</strong> — for devs in the terminal:
                  <div style={{ marginTop: "4px", padding: "8px 10px", background: surf2, borderRadius: "5px", fontSize: "10.5px", color: t1, whiteSpace: "pre-wrap" }}>
                    cast wallet sign --ledger &quot;&lt;paste message&gt;&quot;{"\n"}
                    cast wallet sign --account my-deployer &quot;&lt;paste message&gt;&quot;
                  </div>
                </div>
                <div>
                  <strong style={{ color: t1 }}>Wallet already in MetaMask / Rabby but a different account?</strong>{" "}
                  Easiest: switch to the deployer account, refresh this page, and use the one-click inline button instead.
                </div>
              </div>
            </details>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={submitWithSignature}
                disabled={submitting || !signaturePaste.trim()}
                style={{
                  height: "40px",
                  padding: "0 18px",
                  background: green,
                  color: "#04201a",
                  fontSize: "13px",
                  fontWeight: 700,
                  border: "none",
                  borderRadius: "8px",
                  cursor: submitting || !signaturePaste.trim() ? "not-allowed" : "pointer",
                  fontFamily: mono,
                  opacity: submitting || !signaturePaste.trim() ? 0.6 : 1,
                }}>
                {submitting ? "Verifying signature…" : "Verify & register"}
              </button>
              <button
                onClick={cancelChallenge}
                disabled={submitting}
                style={{
                  height: "40px",
                  padding: "0 16px",
                  background: "transparent",
                  color: t2,
                  fontSize: "12px",
                  fontFamily: mono,
                  border: "1px solid " + bdr,
                  borderRadius: "8px",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}>
                Change details
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── REVOKED HISTORY (collapsed by default) ── */}
      {revoked.length > 0 && (
        <details style={{ marginTop: "22px" }}>
          <summary style={{ fontSize: "10px", fontFamily: mono, color: t3, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Revoked ({revoked.length}) — kept for audit history
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
            {revoked.map(c => (
              <div key={c.id} style={{
                padding: "8px 12px",
                background: surf2,
                border: "1px solid " + bdr,
                borderRadius: "6px",
                fontSize: "11px",
                fontFamily: mono,
                color: t3,
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
              }}>
                <span style={{ color: t2 }}>{c.role}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                  {c.label || c.address}
                </span>
                <span>revoked {c.revoked_at ? new Date(c.revoked_at).toLocaleDateString() : ""}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
