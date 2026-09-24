"use client"
//
// WalletPanel — the funds surface that slides out from the connected-wallet chip.
// Premium dark glass (fixed palette, not page-theme-dependent) so it reads like
// a top-tier wallet (Phantom / Rainbow) regardless of the page's light/dark mode.
//
// Balances are read straight from the chain via RPC balanceOf (blockscout's
// token-balances index is unreliable on Arc testnet). Send is enabled for
// Circle user-controlled wallets — their only way to move funds out.

import { useCallback, useEffect, useState } from "react"
import { parseUnits, isAddress } from "ethers"
import { circleRestorePin, circleSendTransaction } from "@/lib/circleSign"
import { CIRBTC_ADDRESS, EURC_ADDRESS, USDC_ADDRESS } from "@/lib/constants"

// Supported Arc assets. cirBTC deliberately has no guessed dollar price: the
// wallet reads its balance from chain but excludes it from the fiat total.
const TOKENS = [
  { symbol: "USDC",   name: "USDC",                   address: USDC_ADDRESS,   decimals: 6, usd: 1,    icon: "/tokens/usdc.svg" },
  { symbol: "EURC",   name: "EURC",                   address: EURC_ADDRESS,   decimals: 6, usd: 1.08, icon: "/tokens/eurc.svg" },
  { symbol: "cirBTC", name: "Circle Wrapped Bitcoin", address: CIRBTC_ADDRESS, decimals: 8, usd: null, icon: "/tokens/cirbtc.svg" },
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

type Bal = { symbol: string; name: string; amount: string; usd: number | null; icon: string }
type View = "overview" | "send" | "receive" | "security"

interface Props {
  open: boolean
  onClose: () => void
  walletAddr: string
  walletType: "metamask" | "circle" | null
  email: string | null
}

export default function WalletPanel({ open, onClose, walletAddr, walletType, email }: Props) {
  const isCircle = walletType === "circle"
  const [view, setView]     = useState<View>("overview")
  const [balances, setBal]  = useState<Bal[]>([])
  const [balLoading, setBL] = useState(false)
  const [balanceError, setBalanceError] = useState("")
  const [copied, setCopied] = useState(false)

  // send form
  const [token, setToken]   = useState<typeof TOKENS[number]>(TOKENS[0])
  const [to, setTo]         = useState("")
  const [amount, setAmount] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [feeEstimate, setFeeEstimate] = useState<string | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState("")
  const [txHash, setTxHash]   = useState("")
  const [recovering, setRecovering] = useState(false)
  const [recoveryDone, setRecoveryDone] = useState(false)
  const [recoveryErr, setRecoveryErr] = useState("")

  const loadBalances = useCallback(async () => {
    if (!walletAddr) return
    setBL(true)
    setBalanceError("")
    try {
      const response = await fetch(`/api/wallet-balances/${walletAddr}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Balance unavailable")
      const bySymbol = new Map<string, string>(data.balances.map((b: { symbol: string; amount: string }) => [b.symbol, b.amount]))
      const out = TOKENS.map(t => ({
        symbol: t.symbol,
        name: t.name,
        amount: bySymbol.get(t.symbol) || "0",
        usd: t.usd,
        icon: t.icon,
      }))
      setBal(out)
    } catch (error: any) {
      setBalanceError(error?.message || "Balance temporarily unavailable")
    } finally { setBL(false) }
  }, [walletAddr])

  useEffect(() => {
    if (!open) return
    setView("overview")
    loadBalances()
  }, [open, loadBalances])

  const fmtAmount = (a: string, symbol: string) => Number(a).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: symbol === "cirBTC" ? 8 : 6,
  })
  const totalUsd = balances.reduce((s, b) => s + (b.usd == null ? 0 : Number(b.amount) * b.usd), 0)
  const tokenBal = balances.find(b => b.symbol === token.symbol)?.amount ?? "0"

  const resetSend = () => { setTo(""); setAmount(""); setConfirming(false); setFeeEstimate(null); setFeeLoading(false); setSendErr(""); setTxHash("") }

  async function reviewSend() {
    setSendErr("")
    if (!isAddress(to)) return setSendErr("That's not a valid address.")
    if (to.toLowerCase() === walletAddr.toLowerCase()) return setSendErr("That's your own address.")
    let units: bigint
    try { units = parseUnits(amount || "0", token.decimals) } catch { return setSendErr("Invalid amount.") }
    if (units <= 0n) return setSendErr("Enter an amount above zero.")
    let have = 0n; try { have = parseUnits(tokenBal, token.decimals) } catch {}
    if (units > have) return setSendErr(`You only have ${fmtAmount(tokenBal, token.symbol)} ${token.symbol}.`)
    setConfirming(true)
    setFeeEstimate(null)
    setFeeLoading(true)
    try {
      const response = await fetch("/api/wallet-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: walletAddr, to, token: token.address, amount: units.toString() }),
      })
      const data = await response.json()
      if (response.ok && data.feeUsdc) {
        const fee = String(data.feeUsdc)
        setFeeEstimate(fee)
        const usdcBalance = Number(balances.find(b => b.symbol === "USDC")?.amount || "0")
        const requiredUsdc = Number(fee) + (token.symbol === "USDC" ? Number(amount) : 0)
        if (requiredUsdc > usdcBalance) {
          setSendErr(token.symbol === "USDC"
            ? `Leave approximately ${fee} USDC in the wallet for the Arc network fee.`
            : `You need approximately ${fee} USDC in the wallet for the Arc network fee.`)
        }
      }
    } catch {
      // Circle presents the authoritative fee before the user signs.
    } finally {
      setFeeLoading(false)
    }
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

  async function restorePin() {
    if (!email) return setRecoveryErr("Reconnect with your email to recover your PIN.")
    setRecovering(true); setRecoveryErr(""); setRecoveryDone(false)
    try {
      await circleRestorePin(email)
      setRecoveryDone(true)
    } catch (e: any) {
      setRecoveryErr(e?.message || "PIN recovery was not completed.")
    } finally {
      setRecovering(false)
    }
  }

  const copyAddr = () => navigator.clipboard.writeText(walletAddr).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) })

  if (!open) return null
  const short = `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}`

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 59, background: SCRIM, backdropFilter: "blur(8px)", animation: "wpFade .2s ease" }} />
      <div style={{
        position: "fixed", zIndex: 60, left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: T3, letterSpacing: "0.14em", textTransform: "uppercase" }}>Stablecoin balance</div>
              <button onClick={loadBalances} disabled={balLoading} style={{ background: "transparent", border: "none", color: balLoading ? T3 : ARC2, cursor: balLoading ? "wait" : "pointer", fontFamily: MONO, fontSize: 10, padding: "4px 0" }}>
                {balLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <div style={{ fontSize: "38px", fontWeight: 700, letterSpacing: "-0.03em", marginTop: "4px", lineHeight: 1 }}>
              <span style={{ color: T3 }}>$</span>{balLoading ? <span style={{ color: T3 }}>—</span> : totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {balanceError && <div style={{ marginTop: 9, fontFamily: MONO, fontSize: 10.5, color: "#ff7d8d" }}>{balanceError}. Tap Refresh to try again.</div>}
          </div>
        )}

        {/* BODY */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 22px" }}>

          {view === "overview" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginBottom: "18px" }}>
                {balances.map(b => (
                  <div key={b.symbol} style={{ display: "flex", alignItems: "center", gap: "13px", padding: "14px 15px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: "15px" }}>
                    <TokenBadge symbol={b.symbol} icon={b.icon} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{b.symbol}</div>
                      <div style={{ fontSize: "11px", color: T3 }}>{b.name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: MONO, fontSize: "15px", fontWeight: 600 }}>{balLoading ? "—" : fmtAmount(b.amount, b.symbol)}</div>
                      {b.usd == null
                        ? <div style={{ fontFamily: MONO, fontSize: "10.5px", color: T3 }}>8-decimal Arc asset</div>
                        : <div style={{ fontFamily: MONO, fontSize: "10.5px", color: T3 }}>≈ ${ (Number(b.amount) * b.usd).toLocaleString(undefined, { maximumFractionDigits: 2 }) }</div>}
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
              {isCircle && (
                <button onClick={() => { setRecoveryErr(""); setRecoveryDone(false); setView("security") }} style={{ width: "100%", marginTop: 14, padding: "9px 0", background: "none", border: "none", color: T3, cursor: "pointer", fontFamily: MONO, fontSize: 10.5 }}>
                  Wallet security &amp; PIN recovery
                </button>
              )}
            </>
          )}

          {view === "receive" && (
            <>
              <BackBtn onClick={() => setView("overview")} />
              <div style={{ fontSize: "17px", fontWeight: 700, margin: "16px 0 6px" }}>Receive</div>
              <div style={{ fontSize: "12.5px", color: T2, lineHeight: 1.6, marginBottom: "16px" }}>Send USDC, EURC or cirBTC on Arc to this address.</div>
              <div style={{ padding: "16px", background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: "14px", wordBreak: "break-all", fontFamily: MONO, fontSize: "13px", lineHeight: 1.7, color: T1 }}>{walletAddr}</div>
              <button onClick={copyAddr} style={{ ...ghostBtn, width: "100%", marginTop: "12px", justifyContent: "center" }}>{copied ? "Copied ✓" : "Copy address"}</button>
            </>
          )}

          {view === "security" && (
            <>
              <BackBtn onClick={() => setView("overview")} />
              <div style={{ fontSize: "17px", fontWeight: 700, margin: "16px 0 6px" }}>Wallet security</div>
              <div style={{ fontSize: "12.5px", color: T2, lineHeight: 1.65, marginBottom: "16px" }}>
                Forgot your Circle wallet PIN? Recover it securely using the security questions you created during wallet setup.
              </div>
              <div style={{ fontSize: "11.5px", color: T2, background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 13px", lineHeight: 1.65, marginBottom: 14 }}>
                Circle handles the recovery window. ArcLens cannot see your answers, PIN or private key.
              </div>
              {recoveryDone && <div style={{ ...errStyle, color: GREEN }}>Your PIN was restored successfully.</div>}
              {recoveryErr && <div style={errStyle}>{recoveryErr}</div>}
              <button onClick={restorePin} disabled={recovering} style={{ ...primaryBtn, width: "100%", opacity: recovering ? 0.7 : 1 }}>
                {recovering ? "Opening secure recovery…" : "Recover my PIN"}
              </button>
            </>
          )}

          {view === "send" && (
            <>
              <BackBtn onClick={() => { setView("overview"); resetSend() }} />

              {txHash ? (
                <div style={{ textAlign: "center", padding: "26px 0" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,200,150,0.12)", color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", margin: "0 auto 16px" }}>✓</div>
                  <div style={{ fontSize: "18px", fontWeight: 700 }}>Sent {fmtAmount(amount, token.symbol)} {token.symbol}</div>
                  <div style={{ fontSize: "12.5px", color: T2, margin: "6px 0 20px" }}>to {to.slice(0, 8)}…{to.slice(-6)}</div>
                  <a href={`/tx/${txHash}`} style={{ ...ghostBtn, display: "inline-flex", textDecoration: "none" }}>View on explorer</a>
                  <button onClick={() => { resetSend(); setView("overview") }} style={{ ...primaryBtn, width: "100%", marginTop: "12px", justifyContent: "center" }}>Done</button>
                </div>
              ) : confirming ? (
                <>
                  <div style={{ fontSize: "17px", fontWeight: 700, margin: "16px 0 16px" }}>Confirm</div>
                  <div style={{ background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: "15px", padding: "18px", marginBottom: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: "30px", fontWeight: 700, letterSpacing: "-0.02em" }}>{fmtAmount(amount, token.symbol)} <span style={{ color: T2, fontSize: "18px" }}>{token.symbol}</span></div>
                    <div style={{ fontFamily: MONO, fontSize: "12px", color: T2, marginTop: "10px", wordBreak: "break-all" }}>→ {to}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "11px 13px", marginBottom: 12, border: `1px solid ${BORDER}`, borderRadius: 11, background: CARD, fontFamily: MONO, fontSize: 11 }}>
                    <span style={{ color: T3 }}>Estimated network fee</span>
                    <span style={{ color: T2, textAlign: "right" }}>{feeLoading ? "Calculating…" : feeEstimate ? `≈ ${feeEstimate} USDC` : "Confirmed by Circle before signing"}</span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#e0a020", background: "rgba(224,160,32,0.07)", border: "1px solid rgba(224,160,32,0.2)", borderRadius: "11px", padding: "11px 13px", lineHeight: 1.6, marginBottom: "14px" }}>This moves real funds and can't be undone. Check the address.</div>
                  {sendErr && <div style={errStyle}>{sendErr}</div>}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setConfirming(false)} disabled={sending} style={ghostBtn}>Back</button>
                    <button onClick={doSend} disabled={sending || feeLoading || !!sendErr} style={{ ...primaryBtn, opacity: sending || feeLoading || !!sendErr ? 0.55 : 1, cursor: sending || feeLoading || !!sendErr ? "not-allowed" : "pointer", justifyContent: "center" }}>{sending ? "Confirm in popup…" : feeLoading ? "Calculating fee…" : sendErr ? "Check balance" : "Confirm & send"}</button>
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
                      }}><TokenBadge symbol={t.symbol} icon={t.icon} size={22} />{t.symbol}</button>
                    ))}
                  </div>

                  <label style={fieldLabel}>To</label>
                  <input value={to} onChange={e => setTo(e.target.value.trim())} placeholder="0x… recipient address" style={inputStyle} />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 6px" }}>
                    <label style={{ ...fieldLabel, margin: 0 }}>Amount</label>
                    <span style={{ fontSize: "10.5px", fontFamily: MONO, color: T3 }}>
                      {fmtAmount(tokenBal, token.symbol)} {token.symbol}
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
function TokenBadge({ symbol, icon, size = 34 }: { symbol: string; icon: string; size?: number }) {
  return <img src={icon} alt={`${symbol} token`} width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", display: "block", flexShrink: 0, boxShadow: "0 2px 10px rgba(11,83,191,0.25)" }} />
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
