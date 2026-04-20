/**
 * Simple sliding-window rate limiter.
 * Works per-instance (fine for Vercel at this scale).
 * Each key tracks a list of request timestamps within the window.
 */

interface Window {
  timestamps: number[]
}

const store = new Map<string, Window>()

// Clean up old entries every 10 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now()
  for (const [key, win] of store.entries()) {
    if (win.timestamps.length === 0 || now - win.timestamps[win.timestamps.length - 1] > 3_600_000) {
      store.delete(key)
    }
  }
}, 600_000)

/**
 * Check and record a request.
 * @param key      — unique identifier, e.g. `"complete:1.2.3.4"` or `"complete:0xabc"`
 * @param limit    — max requests allowed in the window
 * @param windowMs — window size in milliseconds
 * @returns { allowed: boolean, remaining: number, resetIn: number (ms) }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const win = store.get(key) ?? { timestamps: [] }

  // Drop timestamps outside the window
  win.timestamps = win.timestamps.filter(t => now - t < windowMs)

  if (win.timestamps.length >= limit) {
    const oldest  = win.timestamps[0]
    const resetIn = windowMs - (now - oldest)
    store.set(key, win)
    return { allowed: false, remaining: 0, resetIn }
  }

  win.timestamps.push(now)
  store.set(key, win)
  return { allowed: true, remaining: limit - win.timestamps.length, resetIn: windowMs }
}

/** Extract the real IP from a Next.js request */
export function getIp(req: Request): string {
  const h = (req as any).headers
  return (
    (typeof h.get === "function"
      ? h.get("x-forwarded-for") ?? h.get("x-real-ip")
      : h["x-forwarded-for"] ?? h["x-real-ip"]) || "unknown"
  ).split(",")[0].trim()
}
