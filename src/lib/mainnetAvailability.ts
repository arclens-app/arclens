// Temporary editorial mainnet availability list.
//
// A project appears in the public "Live on Mainnet" directory filter when it
// either:
//   1. has a verified Arc mainnet contract in project_contracts, or
//   2. is listed here because ArcLens has confirmed that its product/integration
//      is live on Arc mainnet (wallets and other integrations may not own a
//      project-specific contract).
//
// Keep this separate from contract verification: being live on mainnet is an
// availability statement, not a claim that ArcLens verified a deployment.
const CURATED_MAINNET_SLUGS = new Set([
  "unitflow-finance",
  "tower-exchange",
  "xylonet",
  "metamask",
  // Arc ecosystem partners with explicit, publicly documented Arc mainnet
  // support. These are integrations/infrastructure, so a project-owned
  // contract is not required for the availability label.
  "across",
  "alchemy",
  "blockscout",
  "chainlink",
  "drpc",
  "quicknode",
  // Uniswap is officially live on Arc. Its slug takes effect automatically as
  // soon as the official project has a public ArcLens directory record.
  "uniswap",
  // Named live at launch in Circle's Arc mainnet announcement and day-one
  // builder coverage (Sept 2026): credit markets, DEXs, exchanges, wallets,
  // custody, and tokenized-asset issuers.
  "aave",
  "morpho",
  "curve",
  "kraken",
  "bybit",
  "bitso",
  "bitvavo",
  "ledger",
  "rainbow",
  "bitgo",
  "copper",
  "fireblocks",
  "blackrock",
  "securitize",
  "maple",
  // Centrifuge-issued Janus Henderson funds went live on Arc Oct 1, 2026.
  "centrifuge",
  // Stablecoin issuers whose coins launched natively on Arc mainnet
  // (JPYC, AUDF, EURAU, BRLA, QCAD, KRW1).
  "jpyc",
  "forte-aud",
  "allunity",
  "avenia",
  "stablecorp",
  "bdacs",
  // Ecosystem builders with project-owned contracts confirmed on Arc mainnet.
  "achswap",
  "paragonfinance",
  "wheelx",
  // Apps whose own sites run on Arc mainnet (chain 5042) and reference
  // project-specific contracts deployed on mainnet (checked Oct 11, 2026).
  "flutchfun",
  "wizpay",
  "sweep-console",
])

export function isCuratedMainnetProject(slug: unknown): boolean {
  return CURATED_MAINNET_SLUGS.has(String(slug || "").trim().toLowerCase())
}

export function curatedMainnetProjectSlugs(): string[] {
  return Array.from(CURATED_MAINNET_SLUGS)
}
