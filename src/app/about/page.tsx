"use client"
import ArcLayout from "@/components/ArcLayout"

const LAST_UPDATED = "July 27, 2026"

// Public accountability page. ArcLens is operated pseudonymously, so this page
// substitutes verifiability for identity: open source, public docs, a canonical
// channel list, and an explicit non-affiliation statement. Abuse reviewers and
// blocklist vendors land here, so every claim on it must stay independently
// checkable — do not add anything here that a reader cannot confirm themselves.
const sections = [
  {
    id: "1",
    title: "What ArcLens Is",
    body: `ArcLens is an independent ecosystem and intelligence platform for the Arc blockchain. It indexes public on-chain activity, tracks TVL, volume and revenue for projects that register their contracts, publishes a trust ladder for those projects, and answers questions about the network through Lens AI.

Everything ArcLens reports is derived from public blockchain data. We do not custody funds, we do not issue a token, and we do not run a token sale.`,
  },
  {
    id: "2",
    title: "We Are Not Arc, and We Are Not Circle",
    body: `ArcLens is operated independently. It is not affiliated with, endorsed by, sponsored by, or operated by Circle Internet Group, the Arc network, or any of their subsidiaries.

We build on Arc and write about Arc the way an independent analytics product or block explorer covers any public blockchain. The name refers to the network we cover. It is not a claim of affiliation.

For official Arc or Circle resources, go to their websites directly rather than following a link from here or from anywhere else.`,
  },
  {
    id: "3",
    title: "How to Verify Us",
    body: `ArcLens is operated pseudonymously. We ask you to verify what the platform does rather than who runs it, and we have made that possible. All of the following are independently checkable:

• Source code — the application is open source at github.com/arclens-app/arclens. You can read exactly what every page and API route does, including every wallet interaction.
• Documentation — public technical docs at docs.arclenz.xyz
• Security policy — published at arclenz.xyz/.well-known/security.txt
• On-chain attestations — project trust levels are written to the ArcLensRegistry contract on Arc, so our claims about a project can be audited on the chain itself rather than taken on trust from our database.

A phishing operation does not publish its source code. If anything on this platform behaves differently from what the repository says it does, that is a bug or a compromise, and we want to hear about it immediately.`,
  },
  {
    id: "4",
    title: "What ArcLens Will Never Do",
    body: `These are commitments, not guidelines. Any message or page that breaks one of them is not us.

• We will never ask for your seed phrase, recovery phrase, private key, or wallet password. Nobody legitimate ever will.
• We will never ask you to approve a token allowance, sign a transfer, or send funds in order to claim a listing, activate a dashboard, or verify a project.
• We will never message you first offering a listing, a reward, an airdrop, or a partnership.
• We will never ask you to connect a wallet on any domain other than arclenz.xyz.

Connecting a wallet to ArcLens links your address to a listing, or signs a message to prove ownership. It never moves funds.`,
  },
  {
    id: "5",
    title: "Official Channels",
    body: `This is the complete and canonical list. Anything else claiming to be ArcLens is not.

• Website — arclenz.xyz
• Documentation — docs.arclenz.xyz
• Source code — github.com/arclens-app/arclens
• X — x.com/arclens_app
• Email — support@arclenz.xyz. Mail we send to you comes from support@mail.arclenz.xyz

We do not operate a Telegram group, a Discord server, or any other social account. If you find one using our name, please report it to us.`,
  },
  {
    id: "6",
    title: "Reporting Abuse or Impersonation",
    body: `If you receive a message claiming to be from ArcLens that asks for keys, approvals, or funds, it is fraudulent. Please forward it to support@arclenz.xyz with full headers so we can act on it.

Security researchers should follow the policy at arclenz.xyz/.well-known/security.txt. We respond to security reports.

If you are a blocklist operator, mailbox provider, or security vendor assessing this domain, support@arclenz.xyz reaches us and we will supply whatever verification you need.`,
  },
]

export default function AboutPage() {
  const mono = "'DM Mono', monospace"
  const t1   = "var(--t1, #e8ecff)"
  const t2   = "var(--t2, #6b7da8)"
  const t3   = "var(--t3, #2e3a5c)"
  const bdr  = "var(--bdr, rgba(255,255,255,0.06))"
  const usdc = "#00b87a"

  return (
    <ArcLayout active="">
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "60px 28px 100px", fontFamily: "'Geist', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: "52px", paddingBottom: "32px", borderBottom: "1px solid " + bdr }}>
          <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "14px" }}>
            About
          </div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-0.05em", color: t1, margin: "0 0 14px" }}>
            About ArcLens
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>
              Last updated: {LAST_UPDATED}
            </span>
            <span style={{ fontSize: "11px", fontFamily: mono, padding: "3px 8px", borderRadius: "5px", background: "rgba(0,184,122,0.07)", color: usdc, border: "1px solid rgba(0,184,122,0.15)" }}>
              Open source
            </span>
            <span style={{ fontSize: "11px", fontFamily: mono, padding: "3px 8px", borderRadius: "5px", background: "rgba(26,86,255,0.07)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.15)" }}>
              Independent of Circle and Arc
            </span>
          </div>
        </div>

        {/* Intro */}
        <p style={{ fontSize: "14px", color: t2, lineHeight: 1.8, marginBottom: "48px", fontWeight: 300 }}>
          This page exists so that anyone — a user, a security researcher, or a mailbox provider — can establish what ArcLens is and what it will never ask of you. Every claim below is independently verifiable.
        </p>

        {/* Sections */}
        {sections.map((s, i) => (
          <div key={s.id} style={{ marginBottom: "44px", paddingBottom: "44px", borderBottom: i < sections.length - 1 ? "1px solid " + bdr : "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "14px" }}>
              <span style={{ fontSize: "10px", fontFamily: mono, color: usdc, minWidth: "20px" }}>{s.id}.</span>
              <h2 style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "-0.025em", color: t1, margin: 0 }}>
                {s.title}
              </h2>
            </div>
            <div style={{ paddingLeft: "32px" }}>
              {s.body.split("\n").map((line, j) => (
                line.trim() === "" ? <div key={j} style={{ height: "10px" }} /> :
                <p key={j} style={{ fontSize: "13px", color: t2, lineHeight: 1.8, margin: "0 0 6px", fontWeight: 300 }}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}

      </div>
    </ArcLayout>
  )
}
