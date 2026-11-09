// Our own static logos (public/logos) and Blob files load directly, which costs
// no server time. Everything else still goes through our proxy: browsers block
// some icon.horse responses when they are loaded directly, and imgbb needs its
// own Referer.
const DIRECT = /^(https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/|https:\/\/arclenz\.xyz\/logos\/|\/logos\/)/i

export function imageSrc(url: string): string {
  return DIRECT.test(url) ? url : `/api/image-proxy?url=${encodeURIComponent(url)}`
}
