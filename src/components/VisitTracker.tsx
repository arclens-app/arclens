"use client"
// Cookieless page-visit tracker. Fires one /api/track call per path per browser
// session (sessionStorage-guarded) so DB writes stay minimal; the server also
// dedupes per device/path/day. Reuses the same anonymous device id as Lens AI —
// no cookies, no PII.
import { useEffect } from "react"
import { usePathname } from "next/navigation"

const DEVICE_KEY = "arclens-device-id"

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch { return "" }
}

export default function VisitTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname) return
    // Dedupe on the CLIENT to match the server's (device, path, day) key: each
    // device pings each path at most ONCE per day, across all tabs/sessions — so
    // we never fire a call the server would just no-op. Minimal by construction.
    const day = new Date().toISOString().slice(0, 10)
    const key = "arclens-tracked:" + pathname + ":" + day
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1") } catch {}
    const id = deviceId()
    if (!id) return
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-arclens-device": id },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {})
  }, [pathname])
  return null
}
