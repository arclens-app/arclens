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
  // Uniswap is officially live on Arc. Its slug takes effect automatically as
  // soon as the official project has a public ArcLens directory record.
  "uniswap",
])

export function isCuratedMainnetProject(slug: unknown): boolean {
  return CURATED_MAINNET_SLUGS.has(String(slug || "").trim().toLowerCase())
}

export function curatedMainnetProjectSlugs(): string[] {
  return Array.from(CURATED_MAINNET_SLUGS)
}
