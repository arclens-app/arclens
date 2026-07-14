// src/lib/submissionGuards.ts
//
// Shared intake validation for founder-submitted content (projects, campaigns).
// Rejects junk BEFORE it reaches the admin queue: reserved/unregisterable
// domains, malformed or disposable emails, and (optionally) domains that don't
// resolve. Complements the VirusTotal reputation scan — this catches the ones
// that never had a real domain to scan in the first place.

// RFC 2606 / 6761 reserved TLDs — technically unregisterable, so any URL or
// email using them is fake by definition. The AUDIT-TEST probe used .example
// and .invalid; this closes that whole class.
const RESERVED_TLDS = new Set(["invalid", "example", "test", "localhost", "local"])

// Throwaway/disposable email domains — a project we can't reach isn't a project.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwaway.email", "yopmail.com", "trashmail.com",
  "getnada.com", "sharklasers.com", "maildrop.cc", "dispostable.com",
])

function tldOf(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ""
}

export function hostFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.hostname.toLowerCase()
  } catch { return null }
}

/** A URL is acceptable when it parses, is http(s), and isn't a reserved TLD. */
export function validateWebsite(raw: string | null | undefined): { ok: true } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: true } // website is optional at this layer
  const host = hostFromUrl(raw)
  if (!host) return { ok: false, error: "Website must be a valid http(s) URL" }
  if (RESERVED_TLDS.has(tldOf(host))) return { ok: false, error: "Website domain is not a real, registrable domain" }
  if (!host.includes(".")) return { ok: false, error: "Website domain looks incomplete" }
  return { ok: true }
}

/** Email must be well-formed, not a reserved TLD, and not a known disposable host. */
export function validateEmail(raw: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const e = (raw || "").trim().toLowerCase()
  if (!e) return { ok: false, error: "Email is required so we can reach you" }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "Enter a valid email address" }
  const domain = e.split("@")[1] || ""
  if (RESERVED_TLDS.has(tldOf(domain))) return { ok: false, error: "Email domain is not a real domain" }
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return { ok: false, error: "Please use a permanent email — disposable inboxes aren't accepted" }
  return { ok: true }
}

/**
 * Does the domain actually resolve? Uses DNS-over-HTTPS (no local resolver
 * dependency, works on serverless). Best-effort: on any network error we return
 * true (fail-open) so a DoH outage never blocks a legitimate submission.
 */
export async function domainResolves(host: string): Promise<boolean> {
  try {
    const [a, aaaa] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()).catch(() => null),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=AAAA`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()).catch(() => null),
    ])
    const hasA = !!(a?.Answer?.length)
    const hasAAAA = !!(aaaa?.Answer?.length)
    // Status 0 = NOERROR. If both queries error out (null), fail open.
    if (a == null && aaaa == null) return true
    return hasA || hasAAAA
  } catch { return true }
}
