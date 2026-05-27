"use client"
import ArcLayout from "@/components/ArcLayout"

const LAST_UPDATED = "May 13, 2026"

const sections = [
  {
    id: "1",
    title: "Acceptance of Terms",
    body: `By accessing or using ArcLens (arclens.xyz), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the platform. These Terms apply to all visitors, users, and builders who access or use any part of the ArcLens platform.`,
  },
  {
    id: "2",
    title: "About ArcLens",
    body: `ArcLens is an independent blockchain intelligence platform providing the following services:

• Arc Ecosystem Directory — a curated public directory of projects building on Arc
• Protocol Metrics — deployer-verified TVL, volume, and revenue tracking for stablecoin protocols on Arc, with hourly reconciliation against on-chain state and an auditable trail down to the transaction hash
• Arc Trials — a testing campaign platform where builders post tasks and reward community testers in USDC
• Events Hub — community events, hackathons, workshops, and announcements across the Arc ecosystem
• Contract Registry — verification and discovery of smart contracts deployed on Arc, with deployer-signed identity claims
• Wallet Analytics — on-chain wallet intelligence including holdings and transaction activity
• Network Explorer — real-time access to blocks, transactions, addresses, and gas analytics on the Arc network
• Developer Tools — RPC console and developer resources for building on Arc

ArcLens is independently operated and is not affiliated with, endorsed by, or operated by Arc Network or Circle Internet Financial, Inc.`,
  },
  {
    id: "3",
    title: "Testnet Disclaimer",
    body: `ArcLens currently operates primarily on Arc Testnet (Chain ID 2588). Testnet assets, transactions, and balances have no real monetary value unless explicitly stated otherwise. Blockchain data displayed on the platform is sourced from third-party nodes and may be subject to delays, inaccuracies, or gaps. ArcLens makes no warranty as to the accuracy, completeness, or timeliness of any data presented. You should independently verify all on-chain data before relying on it for any purpose.`,
  },
  {
    id: "4",
    title: "Not Financial Advice",
    body: `Nothing on ArcLens constitutes financial, investment, legal, or tax advice. All information is provided for informational and educational purposes only. ArcLens does not recommend or endorse any project, token, campaign, or financial activity listed or displayed on the platform. You are solely responsible for your own financial decisions and should consult qualified professionals before making any investment or financial decision.`,
  },
  {
    id: "5",
    title: "Arc Trials — Campaign Platform",
    body: `5.1 Builders. When you create a campaign on Arc Trials, you are solely responsible for:
• The accuracy and completeness of all campaign descriptions, task requirements, and reward terms
• Delivering USDC rewards to qualifying testers in accordance with your stated campaign terms
• Ensuring that your application, smart contracts, and linked resources are safe for testers to interact with
• Compliance with all applicable laws and regulations in your jurisdiction

5.2 Testers. When you complete a campaign on Arc Trials:
• USDC rewards are funded and managed by the campaign creator, not by ArcLens
• ArcLens facilitates the platform infrastructure but does not hold, control, or guarantee any reward funds
• You agree to provide honest, accurate, and independent feedback
• Submitting fraudulent, plagiarised, or deliberately low-quality submissions may result in your account being restricted or removed from the platform

5.3 Platform Role. ArcLens is a neutral technology facilitator. We do not act as a party to any agreement between builders and testers, do not custody campaign funds, and are not liable for any failure by a builder to pay rewards.`,
  },
  {
    id: "6",
    title: "Ecosystem Directory Submissions",
    body: `When you submit a project to the Arc Ecosystem Directory, you represent and warrant that:
• All information submitted is accurate, current, and not misleading
• You have the authority to submit the project on behalf of the relevant entity
• The project does not infringe any third-party intellectual property rights
• You will not submit false, competing, or fraudulent project listings

ArcLens reserves the right to approve, reject, edit, or remove any submission at its sole discretion without prior notice. Submission of a project does not guarantee approval or continued listing.`,
  },
  {
    id: "7",
    title: "USDC Payments and Transfers",
    body: `Where ArcLens facilitates USDC transfers between users — including campaign rewards, community tips, and other peer-to-peer payments:
• All transfers occur directly between user wallets on the Arc network
• ArcLens does not hold, escrow, or custody any funds at any time
• All confirmed on-chain transactions are final, irreversible, and cannot be refunded by ArcLens
• You are solely responsible for ensuring the accuracy of recipient wallet addresses before initiating any transfer
• ArcLens is not liable for funds sent to incorrect addresses or lost due to user error`,
  },
  {
    id: "8",
    title: "Acceptable Use",
    body: `You agree not to use ArcLens to:
• Abuse, scrape, crawl, or overload the platform's APIs, infrastructure, or database
• Submit false, misleading, defamatory, or harmful content
• Circumvent rate limits, access controls, or security measures
• Impersonate another person, project, or organisation
• Use the platform for any unlawful purpose or in violation of any applicable law or regulation
• Interfere with other users' access to or use of the platform

ArcLens reserves the right to suspend or permanently restrict access to any user who violates these terms.`,
  },
  {
    id: "9",
    title: "Intellectual Property",
    body: `9.1 ArcLens owns all rights, title, and interest in the platform, its design, codebase, and original content, including all trademarks and branding.

9.2 You retain ownership of content you voluntarily submit to the platform (including project listings, campaign descriptions, and reviews). By submitting content, you grant ArcLens a worldwide, non-exclusive, royalty-free licence to display, reproduce, and distribute that content solely for the purpose of operating the platform.

9.3 On-chain blockchain data (transactions, addresses, contract code) is public information and not subject to copyright protection.`,
  },
  {
    id: "10",
    title: "Disclaimers",
    body: `THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, OR NON-INFRINGEMENT.

ARCLENS DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS. BLOCKCHAIN DATA IS SOURCED FROM THIRD-PARTY NODES AND ARCLENS MAKES NO REPRESENTATIONS AS TO ITS ACCURACY OR COMPLETENESS.`,
  },
  {
    id: "11",
    title: "Limitation of Liability",
    body: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ARCLENS AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM OR RELATED TO YOUR USE OF THE PLATFORM, INCLUDING BUT NOT LIMITED TO LOSS OF FUNDS, LOSS OF DATA, LOSS OF PROFITS, OR BUSINESS INTERRUPTION, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

IN NO EVENT SHALL ARCLENS'S TOTAL LIABILITY TO YOU EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO USE THE PLATFORM IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) USD $100.`,
  },
  {
    id: "12",
    title: "Governing Law and Dispute Resolution",
    body: `These Terms are governed by and construed in accordance with the laws of the British Virgin Islands, without regard to its conflict of law principles.

Any dispute, controversy, or claim arising out of or relating to these Terms or the platform shall be resolved by binding arbitration administered under the LCIA Arbitration Rules, with proceedings conducted in English. The seat of arbitration shall be the British Virgin Islands. Nothing in this clause prevents either party from seeking emergency injunctive relief from a court of competent jurisdiction.`,
  },
  {
    id: "13",
    title: "Changes to These Terms",
    body: `ArcLens may update these Terms at any time. The "Last updated" date at the top of this page will reflect the most recent revision. We will make reasonable efforts to notify users of material changes via the platform. Your continued use of the platform after any change constitutes your acceptance of the updated Terms.`,
  },
  {
    id: "14",
    title: "Contact",
    body: `For questions, concerns, or legal notices regarding these Terms, contact us at:\n\nsupport@arclens.xyz`,
  },
]

export default function TermsPage() {
  const mono = "'DM Mono', monospace"
  const arc  = "#1a56ff"
  const t2   = "var(--t2, #6b7da8)"
  const t3   = "var(--t3, #2e3a5c)"
  const bdr  = "var(--bdr, rgba(255,255,255,0.06))"
  const t1   = "var(--t1, #e8ecff)"

  return (
    <ArcLayout active="">
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "60px 28px 100px", fontFamily: "'Geist', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: "52px", paddingBottom: "32px", borderBottom: "1px solid " + bdr }}>
          <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "14px" }}>
            Legal
          </div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-0.05em", color: t1, margin: "0 0 14px" }}>
            Terms of Service
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>
              Last updated: {LAST_UPDATED}
            </span>
            <span style={{ fontSize: "11px", fontFamily: mono, padding: "3px 8px", borderRadius: "5px", background: "rgba(26,86,255,0.08)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.15)" }}>
              Governing law: British Virgin Islands
            </span>
          </div>
        </div>

        {/* Intro */}
        <p style={{ fontSize: "14px", color: t2, lineHeight: 1.8, marginBottom: "48px", fontWeight: 300 }}>
          These Terms of Service govern your access to and use of ArcLens, the financial intelligence layer for the Arc blockchain network. Please read them carefully before using the platform.
        </p>

        {/* Sections */}
        {sections.map((s, i) => (
          <div key={s.id} style={{ marginBottom: "44px", paddingBottom: "44px", borderBottom: i < sections.length - 1 ? "1px solid " + bdr : "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "14px" }}>
              <span style={{ fontSize: "10px", fontFamily: mono, color: arc, minWidth: "20px" }}>{s.id}.</span>
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

        {/* Footer note */}
        <div style={{ marginTop: "16px", padding: "20px", borderRadius: "10px", background: "rgba(26,86,255,0.04)", border: "1px solid rgba(26,86,255,0.1)", textAlign: "center" }}>
          <p style={{ fontSize: "12px", fontFamily: mono, color: t3, margin: 0 }}>
            Questions? Contact us at{" "}
            <a href="mailto:support@arclens.xyz" style={{ color: "#8aaeff", textDecoration: "none" }}>support@arclens.xyz</a>
          </p>
        </div>

      </div>
    </ArcLayout>
  )
}
