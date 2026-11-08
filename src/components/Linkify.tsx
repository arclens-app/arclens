import type { ReactNode } from "react"
import { safeExternalUrl } from "@/lib/submissionGuards"

// Founders paste bare links into descriptions, task steps and bios. Turn http(s)
// and www. links into safe external links; trailing punctuation stays as text.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"]+/gi
const TRAILING = /[.,;:!?)\]}'"]+$/

export function linkify(text: string, keyBase = "l"): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    const trail = m[0].match(TRAILING)?.[0] ?? ""
    const raw = trail ? m[0].slice(0, -trail.length) : m[0]
    const href = safeExternalUrl(raw)
    if (start > last) out.push(text.slice(last, start))
    out.push(href
      ? <a key={`${keyBase}-${start}`} href={href} target="_blank" rel="nofollow ugc noopener noreferrer"
          style={{ color: "#8aaeff", textDecoration: "none", wordBreak: "break-all" }}>{raw.replace(/^https?:\/\//i, "")}</a>
      : raw)
    if (trail) out.push(trail)
    last = start + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
