// Blob files load straight from their own CDN, which costs no server time.
// Everything else still goes through our proxy: browsers block some icon.horse
// responses when they are loaded directly, and imgbb needs its own Referer.
const DIRECT = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i

export function imageSrc(url: string): string {
  return DIRECT.test(url) ? url : `/api/image-proxy?url=${encodeURIComponent(url)}`
}
