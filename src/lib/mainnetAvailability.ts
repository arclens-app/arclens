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
  "coinbase",
  "robinhood",
  "hibachi",
  "blockdaemon",
  // Named in Arc's mainnet launch post as live today: crosschain (LayerZero,
  // Stargate), wallets (Bron) and compliance (Elliptic). Payments firms the
  // post says "will be enabling" stay out until they confirm they're live.
  "layerzero",
  "stargate",
  "bron",
  "elliptic",
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
  // Small builders need a public mainnet claim from the project itself (site or
  // post), plus project-owned mainnet contracts. Code-only evidence isn't enough.
  "wizpay",
  // Arc's own blog (Oct 6, 2026): "Pulsar is currently live on Arc mainnet."
  "pulsar-money",
  // @CashTella_ (Oct 7, 2026): "TELLA IS LIVE ON ARC MAINNET!"
  "tella",
  // @TollyLabs (Sep 16, 2026): "Arc mainnet is live. Tolly is live with it."
  "tolly",
  // aka.fun launchpad, live on Arc mainnet since launch week (KuCoin coverage,
  // ~$250K first-day volume). Applies once its submission is approved.
  "aka-fun",
  // Argus launchpad (argus.world, @Arguspad), live since Arc mainnet launch.
  // Not the Circle-partner Argus security oracle at argusarc.dev.
  "argus-world",
])

export function isCuratedMainnetProject(slug: unknown): boolean {
  return CURATED_MAINNET_SLUGS.has(String(slug || "").trim().toLowerCase())
}

export function curatedMainnetProjectSlugs(): string[] {
  return Array.from(CURATED_MAINNET_SLUGS)
}
