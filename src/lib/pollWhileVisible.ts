// Repeats `fn` every `ms` while the tab is on screen. Background tabs stop
// calling the server, and a returning visitor gets fresh data straight away.
export function pollWhileVisible(fn: () => unknown, ms: number): () => void {
  let last = Date.now()
  const tick = () => {
    if (document.hidden) return
    last = Date.now()
    fn()
  }
  const timer = setInterval(tick, ms)
  const onVisibility = () => {
    if (!document.hidden && Date.now() - last >= ms) tick()
  }
  document.addEventListener("visibilitychange", onVisibility)
  return () => {
    clearInterval(timer)
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
