"use client"
import ArcLayout from "@/components/ArcLayout"

const LAST_UPDATED = "May 13, 2026"

const sections = [
  {
    id: "1",
    title: "Who We Are",
    body: `ArcLens (arclenz.xyz) is a blockchain intelligence platform operated from Nigeria. We are the data controller for personal data collected through this platform.

Data contact: support@arclenz.xyz`,
  },
  {
    id: "2",
    title: "What Data We Collect",
    body: `2.1 Information you provide voluntarily:
• Email address — collected when you submit a project to the Arc Ecosystem Directory, create an Arc Trials campaign, or contact us for support
• Project information — name, description, website, social links, and contract addresses submitted to the Ecosystem Directory
• Campaign details — titles, task descriptions, reward amounts, and associated wallet addresses for Arc Trials campaigns
• Support correspondence — messages and contact details you provide when reaching out to us

2.2 Public blockchain data:
Wallet addresses, transaction hashes, contract addresses, and on-chain activity are public data permanently recorded on the Arc blockchain. This data is not collected from you directly — it is read from the public blockchain. We do not treat public blockchain addresses as personal data.

2.3 Automatically collected technical data:
• Server logs including IP addresses, browser type, and page access times
• This data is used solely for security monitoring, rate limiting, and platform operations

2.4 Local device storage (never transmitted to our servers):
• Your preferred colour theme (light/dark), stored in browser localStorage
• Connected wallet address, stored in browser localStorage for session continuity
• This data stays on your device and is never sent to ArcLens servers`,
  },
  {
    id: "3",
    title: "How We Use Your Data",
    body: `We use your personal data for the following purposes:
• Email address: to contact you about your project listing, campaign status, or in response to a support request. We may also send important platform updates (no marketing without consent)
• Project and campaign information: to display publicly on the platform as submitted and to operate the Arc Ecosystem Directory and Arc Trials features
• Server logs: to protect the platform from abuse, enforce rate limits, and diagnose technical issues
• We do not use your data for advertising, profiling, or selling to third parties under any circumstances`,
  },
  {
    id: "4",
    title: "Legal Basis for Processing (NDPA 2023)",
    body: `We process your personal data in accordance with the Nigeria Data Protection Act 2023 (NDPA) on the following legal bases:
• Consent: where you voluntarily submit information to the platform (project submissions, campaign creation, support requests). You may withdraw consent at any time by contacting us
• Legitimate interests: for platform security, fraud prevention, spam protection, and operational monitoring, where those interests are not overridden by your rights
• Legal obligation: where we are required to process or disclose data to comply with applicable law`,
  },
  {
    id: "5",
    title: "Data Sharing",
    body: `We do not sell, rent, trade, or share your personal data with third parties for commercial purposes. We may share data only in the following limited circumstances:
• Service providers: our database and hosting providers who process data on our behalf as data processors, bound by confidentiality and data processing obligations
• Legal requirements: where we are required to disclose data by law, court order, or a lawful request from a regulatory authority including the Nigeria Data Protection Commission (NDPC)
• Platform safety: where disclosure is necessary to protect the rights, property, or safety of ArcLens, its users, or the public`,
  },
  {
    id: "6",
    title: "Data Retention",
    body: `• Email addresses and project/campaign data: retained for as long as your listing or campaign is active, and for up to 12 months following a deletion request or account removal
• Server logs: retained for 90 days, then automatically deleted
• Blockchain data: permanently recorded on the public blockchain. ArcLens does not control blockchain records and cannot delete on-chain data on your behalf
• Support correspondence: retained for 24 months from the date of last contact`,
  },
  {
    id: "7",
    title: "Your Rights Under the NDPA 2023",
    body: `Under the Nigeria Data Protection Act 2023, you have the following rights with respect to your personal data:
• Right of access — to request a copy of the personal data we hold about you
• Right to rectification — to request correction of inaccurate or incomplete data
• Right to erasure — to request deletion of your personal data where there is no lawful basis for continued processing
• Right to restriction — to request that we limit how we use your data in certain circumstances
• Right to data portability — to receive your data in a structured, machine-readable format
• Right to object — to object to processing based on legitimate interests

To exercise any of these rights, please contact us at support@arclenz.xyz with your request. We will respond within 30 days. We may need to verify your identity before processing your request.`,
  },
  {
    id: "8",
    title: "Cross-Border Data Transfers",
    body: `ArcLens's platform infrastructure and database services may be hosted on servers located outside Nigeria, including in the United States or European Union. Where we transfer personal data outside Nigeria, we take reasonable steps to ensure that such transfers comply with the cross-border transfer requirements of the NDPA 2023, including ensuring that receiving parties maintain adequate data protection standards.`,
  },
  {
    id: "9",
    title: "Data Security",
    body: `We implement appropriate technical and organisational measures to protect personal data against unauthorised access, accidental loss, destruction, or disclosure. These include access controls, encrypted database connections, and rate limiting on all public APIs.

However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to use commercially reasonable means to protect your data, we cannot guarantee absolute security.`,
  },
  {
    id: "10",
    title: "Cookies and Local Storage",
    body: `ArcLens does not use tracking cookies, advertising cookies, or third-party analytics cookies of any kind.

We use browser localStorage (not cookies) to store two functional preferences locally on your device: your chosen colour theme and your connected wallet address. This data is stored entirely on your device and is never transmitted to our servers or any third party. You can clear this data at any time through your browser settings.`,
  },
  {
    id: "11",
    title: "Children's Privacy",
    body: `ArcLens is not directed at or intended for use by persons under the age of 18. We do not knowingly collect personal data from minors. If you believe that a minor has submitted personal data to our platform, please contact us at support@arclenz.xyz and we will take prompt steps to delete such data.`,
  },
  {
    id: "12",
    title: "Changes to This Policy",
    body: `We may update this Privacy Policy from time to time to reflect changes in our practices or applicable law. The "Last updated" date at the top of this page will always reflect the most recent version. We will make reasonable efforts to notify users of material changes through the platform. Continued use of the platform after changes are posted constitutes acceptance of the updated policy.`,
  },
  {
    id: "13",
    title: "Contact and Complaints",
    body: `For questions, concerns, or requests regarding this Privacy Policy or your personal data, contact our data team at:

support@arclenz.xyz

If you are dissatisfied with our response, you have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC) at ndpc.gov.ng.`,
  },
]

export default function PrivacyPage() {
  const mono = "'DM Mono', monospace"
  const t2   = "var(--t2, #6b7da8)"
  const t3   = "var(--t3, #2e3a5c)"
  const bdr  = "var(--bdr, rgba(255,255,255,0.06))"
  const t1   = "var(--t1, #e8ecff)"
  const usdc = "#00b87a"

  return (
    <ArcLayout active="">
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "60px 28px 100px", fontFamily: "'Geist', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: "52px", paddingBottom: "32px", borderBottom: "1px solid " + bdr }}>
          <div style={{ fontSize: "9px", fontFamily: mono, color: t3, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "14px" }}>
            Legal
          </div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-0.05em", color: t1, margin: "0 0 14px" }}>
            Privacy Policy
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontFamily: mono, color: t3 }}>
              Last updated: {LAST_UPDATED}
            </span>
            <span style={{ fontSize: "11px", fontFamily: mono, padding: "3px 8px", borderRadius: "5px", background: "rgba(0,184,122,0.07)", color: usdc, border: "1px solid rgba(0,184,122,0.15)" }}>
              NDPA 2023 compliant
            </span>
            <span style={{ fontSize: "11px", fontFamily: mono, padding: "3px 8px", borderRadius: "5px", background: "rgba(26,86,255,0.07)", color: "#8aaeff", border: "1px solid rgba(26,86,255,0.15)" }}>
              No tracking cookies
            </span>
          </div>
        </div>

        {/* Intro */}
        <p style={{ fontSize: "14px", color: t2, lineHeight: 1.8, marginBottom: "48px", fontWeight: 300 }}>
          This Privacy Policy explains how ArcLens collects, uses, and protects your personal data. It is compliant with the Nigeria Data Protection Act 2023 (NDPA) and aligned with international best practices. We collect minimal data and never sell it.
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

        {/* NDPC Note */}
        <div style={{ marginTop: "16px", padding: "20px 24px", borderRadius: "10px", background: "rgba(0,184,122,0.04)", border: "1px solid rgba(0,184,122,0.12)" }}>
          <div style={{ fontSize: "9px", fontFamily: mono, color: usdc, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>NDPC Registered</div>
          <p style={{ fontSize: "12px", color: t2, lineHeight: 1.7, margin: "0 0 8px", fontWeight: 300 }}>
            ArcLens operates in compliance with the Nigeria Data Protection Act 2023. You may direct complaints to the Nigeria Data Protection Commission at{" "}
            <a href="https://ndpc.gov.ng" target="_blank" rel="noopener noreferrer" style={{ color: usdc, textDecoration: "none" }}>ndpc.gov.ng</a>.
          </p>
          <p style={{ fontSize: "12px", fontFamily: mono, color: t3, margin: 0 }}>
            Data contact:{" "}
            <a href="mailto:support@arclenz.xyz" style={{ color: "#8aaeff", textDecoration: "none" }}>support@arclenz.xyz</a>
          </p>
        </div>

      </div>
    </ArcLayout>
  )
}
