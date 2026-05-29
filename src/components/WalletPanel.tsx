"use client"
//
// WalletPanel — the funds surface that expands from the connected-wallet chip.
// Not a separate page: a slide-in panel, themed via the same CSS vars as the
// rest of ArcLens (so it tracks light/dark).
//
// Balances (USDC + EURC) + Receive for everyone; Send is enabled for Circle
// user-controlled wallets — they have no other way to move funds out, so this
// is their exit door. MetaMask users manage funds in their own wallet, so we
// show balances + receive and point them there.

import { useCallback, useEffect, useState } from "react"
import { parseUnits, formatUnits, isAddress } from "ethers"
import { circleSendTransaction } from "@/lib/circleSign"

// Arc token registry (testnet). Both 6-decimal stablecoins.
const TOKENS = [
  { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6, color: "#2775ca" },
  { symbol: "EURC", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6, color: "#1a56ff" },
] as const

const ARC    = "#1a56ff"
const USDC_G = "#00b87a"
const MONO   = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS   = "'Geist', ui-sans-serif, system-ui, sans-serif"
const EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`

type Bal = { symbol: string; address: string; decimals: number; color: string; amount: string }
type View = "overview" | "send" | "receive"

interface Props {
  open: boolean
  onClose: () => void
  walletAddr: string
  walletType: "metamask" | "circle" | null
  email: string | null
}

export default function WalletPanel({ open, onClose, walletAddr, walletType, email }: Props) {
  const isCircle = walletType === "circle"
  const [view, setView]         = useState<View>("overview")
  const [balances, setBalances] = useState<Bal[]>([])
  const [balLoading, setBalLoading] = useState(false)
  const [copied, setCopied]     = useState(false)

  // Send form
  const [token, setToken]       = useState<typeof TOKENS[number]>(TOKENS[0])
  const [to, setTo]             = useState("")
  const [amount, setAmount]     = useState("")
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending]   = useState(false)
  const [sendErr, setSendErr]   = useState("")
  const [txHash, setTxHash]     = useState("")

  const loadBalances = useCallback(async () => {
    if (!walletAddr) return
    setBalLoading(true)
    try {
      const res = await fetch("/api/blockscout?path=" + encodeURIComponent("v2/addresses/" + walletAddr + "/token-balances"))
      const data = await res.json()
      const rows: any[] = Array.isArray(data) ? data : (data?.items ?? [])
      const out: Bal[] = TOKENS.map(t => {
        const hit = rows.find(r => {
          const a = (r?.token?.address || r?.token?.address_hash || "").toLowerCase()
          return a === t.address.toLowerCase()
        })
        const raw = hit?.value ?? "0"
        let amt = "0"
        try { amt = formatUnits(BigInt(raw), t.decimals) } catch {}
        return { symbol: t.symbol, address: t.address, decimals: t.decimals, color: t.color, amount: amt }
      })
      setBalances(out)
    } catch {
      setBalances(TOKENS.map(t => ({ symbol: t.symbol, address: t.address, decimals: t.decimals, color: t.color, amount: "0" })))
    } finally { setBalLoading(false) }
  }, [walletAddr])

  useEffect(() => { if (open) { setView("overview"); loadBalances() } }, [open, loadBalances])

  const fmtAmt = (a: string) => {
    const n = Number(a)
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const tokenBal = balances.find(b => b.symbol === token.symbol)?.amount ?? "0"

  function resetSend() {
    setTo(""); setAmount(""); setConfirming(false); setSendErr(""); setTxHash("")
  }

  // Validation before the review step.
  function reviewSend() {
    setSendErr("")
    if (!isAddress(to)) { setSendErr("That's not a valid address."); return }
    if (to.toLowerCase() === walletAddr.toLowerCase()) { setSendErr("That's your own address."); return }
    let units: bigint
    try { units = parseUnits(amount || "0", token.decimals) } catch { setSendErr("Invalid amount."); return }
    if (units <= BigInt(0)) { setSendErr("Enter an amount greater than zero."); return }
    let have: bigint
    try { have = parseUnits(tokenBal, token.decimals) } catch { have = BigInt(0) }
    if (units > have) { setSendErr(`You only have ${fmtAmt(tokenBal)} ${token.symbol}.`); return }
    setConfirming(true)
  }

  async function doSend() {
    if (!email) { setSendErr("Couldn't find your Circle email — reconnect and try again."); return }
    setSending(true); setSendErr("")
    try {
      const units = parseUnits(amount, token.decimals).toString()
      const hash = await circleSendTransaction(
        email, token.address, "transfer(address,uint256)", [to, units],
      )
      setTxHash(hash)
      loadBalances()
    } catch (e: any) {
      setSendErr(e?.message || "Send failed. Your funds are safe — nothing was moved.")
    } finally { setSending(false) }
  }

  function copyAddr() {
    navigator.clipboard.writeText(walletAddr).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) })
  }

  if (!open) return null

  const short = `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}`

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 59, background: "rgba(4,6,14,0.5)", backdropFilter: "blur(3px)", animation: "wpFade 180ms ease" }} />
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 60,
        width: "min(420px, 100vw)",
        background: "var(--surf, #0a0e1a)",
        borderLeft: "1px solid var(--bdr, rgba(255,255,255,0.06))",
        display: "flex", flexDirection: "column",
        boxShadow: "-16px 0 48px rgba(0,0,0,0.4)",
        fontFamily: SANS, color: "var(--t1, #e8ecff)",
        animation: "wpIn 260ms cubic-bezier(0.22,1,0.36,1)",
      }}>

        {/* HEADER */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--bdr,rgba(255,255,255,0.06))", display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={`https://api.dicebear.com/9.x/identicon/svg?seed=${walletAddr}&backgroundColor=0e1224&radius=50`} alt="" style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ fontFamily: MONO, fontSize: "12px", color: "var(--t1,#e8ecff)" }}>{short}</span>
              <button onClick={copyAddr} title="Copy" style={{ background: "none", border: "none", color: copied ? USDC_G : "var(--t3,#2e3a5c)", cursor: "pointer", fontSize: "11px", padding: 0 }}>{copied ? "✓" : "⧉"}</button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: "9.5px", color: "var(--t3,#2e3a5c)", marginTop: "2px" }}>
              {isCircle ? "Circle wallet" : "Browser wallet"} · Arc
            </div>
          </div>
          <button onClick={onClose} title="Close" style={{ height: "26px", width: "26px", background: "transparent", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: "6px", color: "var(--t2,#6b7da8)", cursor: "pointer" }}>✕</button>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 22px" }}>

          {view === "overview" && (
            <>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: "var(--t3,#2e3a5c)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" }}>Balances</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
                {balances.map(b => (
                  <div key={b.symbol} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "var(--surf2,#0e1224)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: "10px" }}>
                    <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: b.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "9px", fontWeight: 700, flexShrink: 0 }}>{b.symbol[0]}</span>
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>{b.symbol}</span>
                    <span style={{ fontFamily: MONO, fontSize: "14px", color: "var(--t1,#e8ecff)" }}>{balLoading ? "…" : fmtAmt(b.amount)}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                {isCircle ? (
                  <button onClick={() => { resetSend(); setView("send") }} style={primaryBtn}>Send</button>
                ) : (
                  <a href={"/address/" + walletAddr} style={{ ...primaryBtn, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>Manage in wallet</a>
                )}
                <button onClick={() => setView("receive")} style={secondaryBtn}>Receive</button>
              </div>

              {!isCircle && (
                <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--t3,#2e3a5c)", lineHeight: 1.6, fontFamily: MONO }}>
                  Sending is handled by your own wallet (MetaMask). Receive works for everyone.
                </div>
              )}
            </>
          )}

          {view === "receive" && (
            <>
              <button onClick={() => setView("overview")} style={backBtn}>← Back</button>
              <div style={{ fontSize: "15px", fontWeight: 700, margin: "14px 0 6px" }}>Receive</div>
              <div style={{ fontSize: "12px", color: "var(--t2,#6b7da8)", lineHeight: 1.6, marginBottom: "14px" }}>
                Send USDC or EURC on Arc to this address.
              </div>
              <div style={{ padding: "14px", background: "var(--surf2,#0e1224)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: "10px", wordBreak: "break-all", fontFamily: MONO, fontSize: "12.5px", lineHeight: 1.6 }}>
                {walletAddr}
              </div>
              <button onClick={copyAddr} style={{ ...secondaryBtn, width: "100%", marginTop: "10px" }}>{copied ? "Copied ✓" : "Copy address"}</button>
            </>
          )}

          {view === "send" && (
            <>
              <button onClick={() => { setView("overview"); resetSend() }} style={backBtn}>← Back</button>

              {txHash ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "rgba(0,184,122,0.12)", color: USDC_G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", margin: "0 auto 14px" }}>✓</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>Sent {fmtAmt(amount)} {token.symbol}</div>
                  <div style={{ fontSize: "12px", color: "var(--t2,#6b7da8)", marginBottom: "16px" }}>to {to.slice(0, 8)}…{to.slice(-6)}</div>
                  <a href={EXPLORER_TX(txHash)} target="_blank" rel="noopener noreferrer" style={{ ...secondaryBtn, display: "inline-block", textDecoration: "none" }}>View on explorer ↗</a>
                  <button onClick={() => { resetSend(); setView("overview") }} style={{ ...primaryBtn, width: "100%", marginTop: "10px" }}>Done</button>
                </div>
              ) : confirming ? (
                <>
                  <div style={{ fontSize: "15px", fontWeight: 700, margin: "14px 0 14px" }}>Confirm send</div>
                  <div style={{ background: "var(--surf2,#0e1224)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: "10px", padding: "14px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Row k="Amount" v={`${fmtAmt(amount)} ${token.symbol}`} big />
                    <Row k="To" v={`${to.slice(0, 10)}…${to.slice(-8)}`} mono />
                    <Row k="Network" v="Arc" />
                  </div>
                  <div style={{ fontSize: "11px", color: "#e08810", background: "rgba(224,136,16,0.06)", border: "1px solid rgba(224,136,16,0.2)", borderRadius: "8px", padding: "10px 12px", lineHeight: 1.6, marginBottom: "14px" }}>
                    This moves real funds and can't be undone. Double-check the address.
                  </div>
                  {sendErr && <div style={{ fontSize: "12px", color: "#e03348", marginBottom: "10px", fontFamily: MONO }}>{sendErr}</div>}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setConfirming(false)} disabled={sending} style={secondaryBtn}>Back</button>
                    <button onClick={doSend} disabled={sending} style={{ ...primaryBtn, opacity: sending ? 0.7 : 1 }}>
                      {sending ? "Confirm in popup…" : "Confirm & send"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "15px", fontWeight: 700, margin: "14px 0 14px" }}>Send</div>

                  <label style={fieldLabel}>Token</label>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                    {TOKENS.map(t => (
                      <button key={t.symbol} onClick={() => setToken(t)} style={{
                        flex: 1, height: "38px", borderRadius: "8px", cursor: "pointer", fontFamily: MONO, fontSize: "12px",
                        background: token.symbol === t.symbol ? "rgba(26,86,255,0.12)" : "var(--surf2,#0e1224)",
                        color: token.symbol === t.symbol ? "#8aaeff" : "var(--t2,#6b7da8)",
                        border: "1px solid " + (token.symbol === t.symbol ? "rgba(26,86,255,0.4)" : "var(--bdr,rgba(255,255,255,0.06))"),
                      }}>{t.symbol}</button>
                    ))}
                  </div>

                  <label style={fieldLabel}>Recipient address</label>
                  <input value={to} onChange={e => setTo(e.target.value.trim())} placeholder="0x…" style={inputStyle} />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 5px" }}>
                    <label style={{ ...fieldLabel, margin: 0 }}>Amount</label>
                    <span style={{ fontSize: "10px", fontFamily: MONO, color: "var(--t3,#2e3a5c)" }}>
                      Balance: {fmtAmt(tokenBal)}
                      <button onClick={() => setAmount(tokenBal)} style={{ marginLeft: "6px", background: "none", border: "none", color: "#8aaeff", cursor: "pointer", fontFamily: MONO, fontSize: "10px" }}>Max</button>
                    </span>
                  </div>
                  <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" inputMode="decimal" style={inputStyle} />

                  {sendErr && <div style={{ fontSize: "12px", color: "#e03348", marginTop: "10px", fontFamily: MONO }}>{sendErr}</div>}
                  <button onClick={reviewSend} style={{ ...primaryBtn, width: "100%", marginTop: "16px" }}>Review</button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes wpFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes wpIn   { from { transform: translateX(100%); opacity: 0.6 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
    </>
  )
}

function Row({ k, v, big, mono }: { k: string; v: string; big?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "11px", color: "var(--t3,#2e3a5c)", fontFamily: MONO }}>{k}</span>
      <span style={{ fontSize: big ? "15px" : "12.5px", fontWeight: big ? 700 : 500, color: "var(--t1,#e8ecff)", fontFamily: mono ? MONO : SANS }}>{v}</span>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  flex: 1, height: "42px", background: `linear-gradient(135deg, ${ARC} 0%, #4a78ff 100%)`,
  color: "#fff", border: "none", borderRadius: "9px", cursor: "pointer", fontFamily: SANS, fontSize: "13px", fontWeight: 600,
}
const secondaryBtn: React.CSSProperties = {
  flex: 1, height: "42px", background: "var(--surf2,#0e1224)", color: "var(--t1,#e8ecff)",
  border: "1px solid var(--bdr,rgba(255,255,255,0.06))", borderRadius: "9px", cursor: "pointer", fontFamily: SANS, fontSize: "13px", fontWeight: 600,
}
const backBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--t2,#6b7da8)", cursor: "pointer", fontFamily: MONO, fontSize: "11px", padding: 0,
}
const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: "9.5px", fontFamily: MONO, color: "var(--t3,#2e3a5c)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px",
}
const inputStyle: React.CSSProperties = {
  width: "100%", height: "42px", background: "var(--surf2,#0e1224)", border: "1px solid var(--bdr,rgba(255,255,255,0.06))",
  borderRadius: "9px", padding: "0 13px", fontSize: "13px", fontFamily: MONO, color: "var(--t1,#e8ecff)", outline: "none", boxSizing: "border-box",
}
