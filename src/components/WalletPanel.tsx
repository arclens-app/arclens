"use client"
//
// WalletPanel — the funds surface that slides out from the connected-wallet chip.
// Premium dark glass (fixed palette, not page-theme-dependent) so it reads like
// a top-tier wallet (Phantom / Rainbow) regardless of the page's light/dark mode.
//
// Balances are read straight from the chain via RPC balanceOf (blockscout's
// token-balances index is unreliable on Arc testnet). Send is enabled for
// Circle user-controlled wallets — their only way to move funds out.

import { useCallback, useEffect, useRef, useState } from "react"
import { JsonRpcProvider, Contract, formatUnits, parseUnits, isAddress } from "ethers"
import { circleSendTransaction } from "@/lib/circleSign"

const RPC = "https://rpc.testnet.arc.network"
const EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`

// Arc stablecoins (6-decimals). usd = rough USD value for the total line.
const TOKENS = [
  { symbol: "USDC", name: "USD Coin",  address: "0x3600000000000000000000000000000000000000", decimals: 6, usd: 1,    grad: ["#2775ca", "#4d96ff"] },
  { symbol: "EURC", name: "Euro Coin", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6, usd: 1.08, grad: ["#1f8f6f", "#2bd4a3"] },
] as const

// ── fixed premium-dark palette ───────────────────────────────────────────────
const SCRIM  = "rgba(6,8,13,0.66)"
const PANEL  = "#0b0e16"
const PANEL2 = "#0e121d"
const CARD   = "rgba(255,255,255,0.035)"
const BORDER = "rgba(255,255,255,0.08)"
const BORDER2= "rgba(255,255,255,0.12)"
const T1 = "#eef1f8"
const T2 = "#8b93a7"
const T3 = "#565e72"
const ARC  = "#3b6bff"
const ARC2 = "#6691ff"
const GREEN = "#00c896"
const SANS = "'Geist', ui-sans-serif, system-ui, sans-serif"
const MONO = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

type Bal = { symbol: string; name: string; amount: string; usd: number; grad: readonly [string, string] | string[] }
type View = "overview" | "send" | "receive"

interface Props {
  open: boolean
  onClose: () => void
  walletAddr: string
  walletType: "metamask" | "circle" | null
  email: string | null
}

const ERC20_BAL = ["function balanceOf(address) view returns (uint256)"]

export default function WalletPanel({ open, onClose, walletAddr, walletType, email }: Props) {
  const isCircle = walletType === "circle"
  const [view, setView]     = useState<View>("overview")
  const [balances, setBal]  = useState<Bal[]>([])
  const [balLoading, setBL] = useState(false)
  const [copied, setCopied] = useState(false)
  const providerRef = useRef<JsonRpcProvider | null>(null)

  // send form
  const [token, setToken]   = useState<typeof TOKENS[number]>(TOKENS[0])
  const [to, setTo]         = useState("")
  const [amount, setAmount] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState("")
  const [txHash, setTxHash]   = useState("")

  const loadBalances = useCallback(async () => {
    if (!walletAddr) return
    setBL(true)
    try {
      const p = (providerRef.current ??= new JsonRpcProvider(RPC))
      const out = await Promise.all(TOKENS.map(async t => {
        let amt = "0"
        try { amt = formatUnits(await new Contract(t.address, ERC20_BAL, p).balanceOf(walletAddr), t.decimals) } catch {}
        return { symbol: t.symbol, name: t.name, amount: amt, usd: t.usd, grad: t.grad }
      }))
      setBal(out)
    } catch {
      setBal(TOKENS.map(t => ({ symbol: t.symbol, name: t.name, amount: "0", usd: t.usd, grad: t.grad })))
    } finally { setBL(false) }
  }, [walletAddr])

  useEffect(() => { if (open) { setView("overview"); loadBalances() } }, [open, loadBalances])

  const fmt = (a: string, max = 2) => Number(a).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: max })
  const totalUsd = balances.reduce((s, b) => s + Number(b.amount) * b.usd, 0)
  const tokenBal = balances.find(b => b.symbol === token.symbol)?.amount ?? "0"

  const resetSend = () => { setTo(""); setAmount(""); setConfirming(false); setSendErr(""); setTxHash("") }

  function reviewSend() {
    setSendErr("")
    if (!isAddress(to)) return setSendErr("That's not a valid address.")
    if (to.toLowerCase() === walletAddr.toLowerCase()) return setSendErr("That's your own address.")
    let units: bigint
    try { units = parseUnits(amount || "0", token.decimals) } catch { return setSendErr("Invalid amount.") }
    if (units <= 0n) return setSendErr("Enter an amount above zero.")
    let have = 0n; try { have = parseUnits(tokenBal, token.decimals) } catch {}
    if (units > have) return setSendErr(`You only have ${fmt(tokenBal)} ${token.symbol}.`)
    setConfirming(true)
  }

  async function doSend() {
    if (!email) return setSendErr("Couldn't find your Circle email — reconnect and try again.")
    setSending(true); setSendErr("")
    try {
      const units = parseUnits(amount, token.decimals).toString()
      const hash = await circleSendTransaction(email, token.address, "transfer(address,uint256)", [to, units])
      setTxHash(hash); loadBalances()
    } catch (e: any) {
      setSendErr(e?.message || "Send failed — your funds are safe, nothing moved.")
    } finally { setSending(false) }
  }

  const copyAddr = () => navigator.clipboard.writeText(walletAddr).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) })

  if (!open) return null
  const short = `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}`

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 59, background: SCRIM, backdropFilter: "blur(8px)", animation: "wpFade .2s ease" }} />
      <div style={{
        position: "fixed", zIndex: 60, left: "50%", top: "50%",
        width: "min(420px,94vw)", maxHeight: "88vh",
        background: `radial-gradient(130% 55% at 100% 0%, rgba(59,107,255,0.14), transparent 60%), ${PANEL}`,
        border: `1px solid ${BORDER2}`, borderRadius: "26px",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 40px 100px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.06)",
        fontFamily: SANS, color: T1,
        animation: "wpIn .34s cubic-bezier(0.22,1,0.36,1)",
      }}>

        {/* HEADER */}
        <div style={{ padding: "18px 20px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", padding: 2, background: `linear-gradient(135deg,${ARC},${ARC2})`, flexShrink: 0 }}>
            <img src={`https://api.dicebear.com/9.x/identicon/svg?seed=${walletAddr}&backgroundColor=0b0e16&radius=50`} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", display: "block" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontFamily: MONO, fontSize: "13px", fontWeight: 500 }}>{short}</span>
              <button onClick={copyAddr} title="Copy address" style={iconBtn}>{copied ? <span style={{ color: GREEN }}>✓</span> : <CopyIcon />}</button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: T3, marginTop: "3px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
              {isCircle ? "Circle wallet" : "Browser wallet"} · Arc
            </div>
          </div>
          <button onClick={onClose} title="Close" style={{ ...iconBtn, width: 30, height: 30, borderRadius: 9, border: `1px solid ${BORDER}` }}>✕</button>
        </div>

        {/* TOTAL */}
        {view === "overview" && (
          <div style={{ padding: "4px 22px 18px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: T3, letterSpacing: "0.14em", textTransform: "uppercase" }}>Total balance</div>
            <div style={{ fontSize: "38px", fontWeight: 700, letterSpacing: "-0.03em", marginTop: "4px", lineHeight: 1 }}>
              <span style={{ color: T3 }}>$</span>{balLoading ? <span style={{ color: T3 }}>—</span> : totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}

        {/* BODY */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 22px" }}>

          {view === "overview" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginBottom: "18px" }}>
                {balances.map(b => (
                  <div key={b.symbol} style={{ display: "flex", alignItems: "center", gap: "13px", padding: "14px 15px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: "15px" }}>
                    <TokenBadge symbol={b.symbol} grad={b.grad} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{b.symbol}</div>
                      <div style={{ fontSize: "11px", color: T3 }}>{b.name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: MONO, fontSize: "15px", fontWeight: 600 }}>{balLoading ? "—" : fmt(b.amount)}</div>
                      <div style={{ fontFamily: MONO, fontSize: "10.5px", color: T3 }}>≈ ${ (Number(b.amount) * b.usd).toLocaleString(undefined, { maximumFractionDigits: 2 }) }</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                {isCircle
                  ? <button onClick={() => { resetSend(); setView("send") }} style={primaryBtn}><SendIcon /> Send</button>
                  : <a href={"/address/" + walletAddr} style={{ ...primaryBtn, textDecoration: "none" }}><SendIcon /> Manage</a>}
                <button onClick={() => setView("receive")} style={ghostBtn}><RecvIcon /> Receive</button>
              </div>
              {!isCircle && <div style={{ marginTop: "12px", fontSize: "11px", color: T3, lineHeight: 1.6 }}>Sending is handled by your own wallet. Receive works for everyone.</div>}
            </>
          )}

          {view === "receive" && (
            <>
              <BackBtn onClick={() => setView("overview")} />
              <div style={{ fontSize: "17px", fontWeight: 700, margin: "16px 0 6px" }}>Receive</div>
              <div style={{ fontSize: "12.5px", color: T2, lineHeight: 1.6, marginBottom: "16px" }}>Send USDC or EURC on Arc to this address.</div>
              <div style={{ padding: "16px", background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: "14px", wordBreak: "break-all", fontFamily: MONO, fontSize: "13px", lineHeight: 1.7, color: T1 }}>{walletAddr}</div>
              <button onClick={copyAddr} style={{ ...ghostBtn, width: "100%", marginTop: "12px", justifyContent: "center" }}>{copied ? "Copied ✓" : "Copy address"}</button>
            </>
          )}

          {view === "send" && (
            <>
              <BackBtn onClick={() => { setView("overview"); resetSend() }} />

              {txHash ? (
                <div style={{ textAlign: "center", padding: "26px 0" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,200,150,0.12)", color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", margin: "0 auto 16px" }}>✓</div>
                  <div style={{ fontSize: "18px", fontWeight: 700 }}>Sent {fmt(amount)} {token.symbol}</div>
                  <div style={{ fontSize: "12.5px", color: T2, margin: "6px 0 20px" }}>to {to.slice(0, 8)}…{to.slice(-6)}</div>
                  <a href={EXPLORER_TX(txHash)} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, display: "inline-flex", textDecoration: "none" }}>View on explorer ↗</a>
                  <button onClick={() => { resetSend(); setView("overview") }} style={{ ...primaryBtn, width: "100%", marginTop: "12px", justifyContent: "center" }}>Done</button>
                </div>
              ) : confirming ? (
                <>
                  <div style={{ fontSize: "17px", fontWeight: 700, margin: "16px 0 16px" }}>Confirm</div>
                  <div style={{ background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: "15px", padding: "18px", marginBottom: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: "30px", fontWeight: 700, letterSpacing: "-0.02em" }}>{fmt(amount)} <span style={{ color: T2, fontSize: "18px" }}>{token.symbol}</span></div>
                    <div style={{ fontFamily: MONO, fontSize: "12px", color: T2, marginTop: "10px", wordBreak: "break-all" }}>→ {to}</div>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#e0a020", background: "rgba(224,160,32,0.07)", border: "1px solid rgba(224,160,32,0.2)", borderRadius: "11px", padding: "11px 13px", lineHeight: 1.6, marginBottom: "14px" }}>This moves real funds and can't be undone. Check the address.</div>
                  {sendErr && <div style={errStyle}>{sendErr}</div>}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setConfirming(false)} disabled={sending} style={ghostBtn}>Back</button>
                    <button onClick={doSend} disabled={sending} style={{ ...primaryBtn, opacity: sending ? 0.7 : 1, justifyContent: "center" }}>{sending ? "Confirm in popup…" : "Confirm & send"}</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "17px", fontWeight: 700, margin: "16px 0 16px" }}>Send</div>
                  <label style={fieldLabel}>Asset</label>
                  <div style={{ display: "flex", gap: "9px", marginBottom: "16px" }}>
                    {TOKENS.map(t => (
                      <button key={t.symbol} onClick={() => setToken(t)} style={{
                        flex: 1, display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px", borderRadius: "12px", cursor: "pointer",
                        background: token.symbol === t.symbol ? "rgba(59,107,255,0.12)" : CARD,
                        border: `1px solid ${token.symbol === t.symbol ? "rgba(59,107,255,0.45)" : BORDER}`,
                        color: T1, fontFamily: SANS, fontSize: "13px", fontWeight: 600,
                      }}><TokenBadge symbol={t.symbol} grad={t.grad} size={22} />{t.symbol}</button>
                    ))}
                  </div>

                  <label style={fieldLabel}>To</label>
                  <input value={to} onChange={e => setTo(e.target.value.trim())} placeholder="0x… recipient address" style={inputStyle} />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 6px" }}>
                    <label style={{ ...fieldLabel, margin: 0 }}>Amount</label>
                    <span style={{ fontSize: "10.5px", fontFamily: MONO, color: T3 }}>
                      {fmt(tokenBal)} {token.symbol}
                      <button onClick={() => setAmount(tokenBal)} style={{ marginLeft: "7px", background: "rgba(59,107,255,0.14)", border: "none", color: ARC2, cursor: "pointer", fontFamily: MONO, fontSize: "10px", padding: "2px 7px", borderRadius: "5px" }}>MAX</button>
                    </span>
                  </div>
                  <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" inputMode="decimal" style={{ ...inputStyle, fontSize: "18px", fontWeight: 600 }} />

                  {sendErr && <div style={errStyle}>{sendErr}</div>}
                  <button onClick={reviewSend} style={{ ...primaryBtn, width: "100%", marginTop: "18px", justifyContent: "center" }}>Review</button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes wpFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes wpIn   { from { transform: translate(-50%,-46%) scale(.96); opacity: 0 } to { transform: translate(-50%,-50%) scale(1); opacity: 1 } }
      `}</style>
    </>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────────
function TokenBadge({ symbol, grad, size = 34 }: { symbol: string; grad: readonly [string, string] | string[]; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg,${grad[0]},${grad[1]})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: size * 0.4, fontWeight: 700, flexShrink: 0, boxShadow: `0 2px 10px ${grad[0]}55` }}>{symbol[0]}</span>
  )
}
function BackBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} style={{ background: "none", border: "none", color: T2, cursor: "pointer", fontFamily: MONO, fontSize: "11px", padding: 0 }}>← Back</button>
}
const CopyIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const SendIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
const RecvIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>

// ── styles ───────────────────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = { background: "transparent", border: "none", color: T2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }
const primaryBtn: React.CSSProperties = { flex: 1, height: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: `linear-gradient(135deg,${ARC},${ARC2})`, color: "#fff", border: "none", borderRadius: "13px", cursor: "pointer", fontFamily: SANS, fontSize: "14px", fontWeight: 600, boxShadow: "0 6px 18px rgba(59,107,255,0.32)" }
const ghostBtn: React.CSSProperties = { flex: 1, height: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: CARD, color: T1, border: `1px solid ${BORDER2}`, borderRadius: "13px", cursor: "pointer", fontFamily: SANS, fontSize: "14px", fontWeight: 600 }
const fieldLabel: React.CSSProperties = { display: "block", fontSize: "10px", fontFamily: MONO, color: T3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "7px" }
const inputStyle: React.CSSProperties = { width: "100%", height: "48px", background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: "13px", padding: "0 15px", fontSize: "14px", fontFamily: MONO, color: T1, outline: "none", boxSizing: "border-box" }
const errStyle: React.CSSProperties = { fontSize: "12px", color: "#ff5a6e", marginTop: "12px", fontFamily: MONO }
