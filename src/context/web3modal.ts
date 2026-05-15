// EIP-6963 wallet detection — each installed extension announces itself
// No third-party modal, no social logins, just the wallets the user has installed

export interface EIP6963ProviderInfo {
  uuid:  string
  name:  string
  icon:  string   // base64 data URL provided by the wallet itself
  rdns:  string
}

export interface EIP6963Provider {
  info:     EIP6963ProviderInfo
  provider: any  // EIP-1193 provider
}

export function detectWallets(): Promise<EIP6963Provider[]> {
  return new Promise(resolve => {
    if (typeof window === "undefined") { resolve([]); return }

    const found: EIP6963Provider[] = []
    const seen  = new Set<string>()

    function onAnnounce(e: Event) {
      const detail = (e as CustomEvent).detail as EIP6963Provider
      if (!seen.has(detail.info.uuid)) {
        seen.add(detail.info.uuid)
        found.push(detail)
      }
    }

    window.addEventListener("eip6963:announceProvider", onAnnounce)
    window.dispatchEvent(new Event("eip6963:requestProvider"))

    // Give wallets 150ms to announce, then resolve
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce)
      // Sort: Rabby first, then MetaMask, then others
      found.sort((a, b) => {
        const order = (rdns: string) => {
          if (rdns === "io.rabby")                return 0
          if (rdns === "io.metamask")             return 1
          if (rdns === "com.coinbase.wallet")     return 2
          return 3
        }
        return order(a.info.rdns) - order(b.info.rdns)
      })
      resolve(found)
    }, 150)
  })
}
