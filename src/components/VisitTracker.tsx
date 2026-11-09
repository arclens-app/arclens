"use client"
// Cookieless page-visit tracker. Each device records each path at most once per
// day (localStorage-guarded, matching the server's device/path/day key). Paths
// are queued and sent together in ONE request when the tab is hidden or closed,
// so a whole browsing session costs one server call instead of one per page.
// Reuses the same anonymous device id as Lens AI — no cookies, no PII.
import { useEffect } from "react"
import { usePathname } from "next/navigation"

const DEVICE_KEY = "arclens-device-id"
const QUEUE_KEY  = "arclens-track-queue"

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

function readQueue(): string[] {
  try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); return Array.isArray(q) ? q : [] }
  catch { return [] }
}

function flush() {
  const paths = readQueue()
  if (!paths.length) return
  const device = deviceId()
  if (!device) return
  const body = JSON.stringify({ device, paths: paths.slice(0, 20) })
  let sent = false
  try { sent = navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" })) ?? false } catch {}
  if (!sent) fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {})
  try { localStorage.removeItem(QUEUE_KEY) } catch {}
}

export default function VisitTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    const day = new Date().toISOString().slice(0, 10)
    const key = "arclens-tracked:" + pathname + ":" + day
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, "1")
      const q = readQueue()
      if (!q.includes(pathname)) localStorage.setItem(QUEUE_KEY, JSON.stringify([...q, pathname]))
    } catch {}
  }, [pathname])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush() }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", flush)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", flush)
    }
  }, [])

  return null
}
