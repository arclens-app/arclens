import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""

const ARC_PROJECTS = [
  { name: "Aave",                tagline: "Open source protocol to create non-custodial liquidity markets to earn interest on supplying and borrowing",   category: "Lending",        website: "https://aave.com",                                         logo: "aave.com" },
  { name: "Absa",                tagline: "Digital banking services including bank accounts, loans, and internet banking",                                 category: "Finance",        website: "https://www.absa.co.za/personal",                           logo: "absa.co.za" },
  { name: "Across",              tagline: "Fast and capital-efficient crosschain bridging protocol",                                                        category: "Bridge",         website: "https://across.to",                                         logo: "across.to" },
  { name: "Alchemy",             tagline: "Leading blockchain developer platform and infrastructure provider",                                              category: "Infrastructure", website: "https://www.alchemy.com",                                   logo: "alchemy.com" },
  { name: "AllUnity",            tagline: "Regulated e-money institute building next generation digital payments infrastructure",                           category: "Stablecoin",     website: "https://allunity.com",                                      logo: "allunity.com" },
  { name: "Auros",               tagline: "Algorithmic trading and market making firm in digital assets",                                                  category: "Trading",        website: "https://www.auros.global",                                  logo: "auros.global" },
  { name: "Avenia",              tagline: "Stablecoin infrastructure for the next generation of payments",                                                 category: "Stablecoin",     website: "https://avenia.io",                                         logo: "avenia.io" },
  { name: "AWS",                 tagline: "World's most comprehensive and broadly adopted cloud platform",                                                  category: "Infrastructure", website: "https://aws.amazon.com",                                    logo: "amazon.com" },
  { name: "Axelar",              tagline: "Decentralized network and development platform securely connecting blockchains",                                category: "Bridge",         website: "https://www.axelar.network",                                logo: "axelar.network" },
  { name: "B2C2",                tagline: "Institutional crypto liquidity provider and market maker",                                                      category: "Trading",        website: "https://www.b2c2.com",                                      logo: "b2c2.com" },
  { name: "Bank Frick",          tagline: "Blockchain-friendly private bank in Liechtenstein for digital asset businesses",                                category: "Finance",        website: "https://www.bankfrick.li/en",                               logo: "bankfrick.li" },
  { name: "BDACS",               tagline: "Only institutional-grade digital asset custody service in Korea",                                               category: "Custody",        website: "https://krw1.kr",                                           logo: "krw1.kr" },
  { name: "BitGo",               tagline: "Prime platform bringing trading, financing, collateral management, and settlement together",                    category: "Custody",        website: "https://www.bitgo.com",                                     logo: "bitgo.com" },
  { name: "Bitso",               tagline: "Leading crypto exchange and stablecoin platform in Latin America",                                              category: "Exchange",       website: "https://buildwithjuno.com/en-US",                           logo: "bitso.com" },
  { name: "Bitvavo",             tagline: "European cryptocurrency exchange for buying and selling digital assets",                                         category: "Exchange",       website: "https://bitvavo.com/en",                                    logo: "bitvavo.com" },
  { name: "BlackRock",           tagline: "World's largest asset manager providing investment management and tokenized asset solutions",                    category: "RWA",            website: "https://www.blackrock.com/us/individual",                   logo: "blackrock.com" },
  { name: "Blockdaemon",         tagline: "Institutional blockchain infrastructure for staking, nodes, and APIs",                                          category: "Infrastructure", website: "https://www.blockdaemon.com",                               logo: "blockdaemon.com" },
  { name: "Blockradar",          tagline: "Enables fast, low-cost stablecoin money transfers for individuals across borders",                              category: "Payments",       website: "https://blockradar.co",                                     logo: "blockradar.co" },
  { name: "Blockscout",          tagline: "Open source blockchain explorer for EVM-compatible chains",                                                     category: "Analytics",      website: "https://www.blockscout.com",                                logo: "blockscout.com" },
  { name: "BNY",                 tagline: "Global financial services firm providing investment management and banking",                                     category: "Finance",        website: "https://www.bny.com/corporate/global/en.html",              logo: "bny.com" },
  { name: "Brex",                tagline: "AI-powered spend management platform for modern businesses",                                                    category: "Finance",        website: "https://www.brex.com",                                      logo: "brex.com" },
  { name: "Bridge",              tagline: "Stablecoin platform built for developers enabling quick, easy global money movement",                           category: "Payments",       website: "https://www.bridge.xyz",                                    logo: "bridge.xyz" },
  { name: "Bron",                tagline: "Decentralized infrastructure for the next generation of financial systems",                                     category: "Infrastructure", website: "https://bron.org",                                          logo: "bron.org" },
  { name: "BTG Pactual",         tagline: "Leading Latin American investment bank and financial services group",                                           category: "Finance",        website: "https://www.btgpactual.us",                                 logo: "btgpactual.com" },
  { name: "Bybit",               tagline: "Global cryptocurrency exchange offering spot, derivatives, and Web3 products",                                  category: "Exchange",       website: "https://www.bybit.com/en",                                  logo: "bybit.com" },
  { name: "Careem",              tagline: "Super app for the greater Middle East providing everyday services",                                             category: "Other",          website: "https://www.careem.com",                                    logo: "careem.com" },
  { name: "Catena Labs",         tagline: "Building AI-native financial infrastructure for the next generation",                                           category: "Developer Tools",website: "https://catenalabs.com",                                    logo: "catenalabs.com" },
  { name: "Centrifuge",          tagline: "Real-world asset protocol bringing institutional finance on-chain",                                             category: "RWA",            website: "https://centrifuge.io",                                     logo: "centrifuge.io" },
  { name: "CFi",                 tagline: "Trade forex, stocks, indices, commodities, ETFs and more",                                                     category: "Trading",        website: "https://www.cfi.ag",                                        logo: "cfi.ag" },
  { name: "Chainlink",           tagline: "Leading decentralized oracle network serving as crucial blockchain infrastructure",                             category: "Oracle",         website: "https://chain.link",                                        logo: "chain.link" },
  { name: "Cloudflare",          tagline: "Global cloud platform securing and accelerating internet applications",                                         category: "Infrastructure", website: "https://www.cloudflare.com",                                logo: "cloudflare.com" },
  { name: "Coinbase",            tagline: "Secure online platform for buying, selling, transferring, and storing cryptocurrency",                          category: "Exchange",       website: "https://www.coinbase.com",                                  logo: "coinbase.com" },
  { name: "Coincheck",           tagline: "Japan's leading cryptocurrency exchange for buying and trading digital assets",                                 category: "Exchange",       website: "https://coincheck.com",                                     logo: "coincheck.com" },
  { name: "Commerzbank",         tagline: "Leading bank for the German Mittelstand and partner to corporate client groups",                                category: "Finance",        website: "https://www.commerzbank.de/group",                          logo: "commerzbank.de" },
  { name: "Copper",              tagline: "Institutional-grade digital asset custody and prime brokerage",                                                 category: "Custody",        website: "https://copper.co/en",                                      logo: "copper.co" },
  { name: "Copperx",             tagline: "Accept stablecoin payments, open financial accounts, and send money globally",                                  category: "Payments",       website: "https://copperx.io",                                        logo: "copperx.io" },
  { name: "Corpay",              tagline: "Global payment solutions for businesses of all sizes",                                                          category: "Payments",       website: "https://www.corpay.com",                                    logo: "corpay.com" },
  { name: "Crossmint",           tagline: "Enterprise blockchain infrastructure for NFTs, wallets, and payments",                                          category: "Developer Tools",website: "https://www.crossmint.com",                                 logo: "crossmint.com" },
  { name: "Cumberland",          tagline: "Provides deep, dependable liquidity in cryptoassets",                                                           category: "Trading",        website: "https://www.cumberland.io",                                 logo: "cumberland.io" },
  { name: "Curve",               tagline: "Decentralized exchange optimized for stablecoin and low-slippage trading",                                      category: "DeFi",           website: "https://www.curve.finance",                                 logo: "curve.finance" },
  { name: "Deutsche Bank",       tagline: "One of the world's leading financial services providers",                                                       category: "Finance",        website: "https://www.db.com",                                        logo: "db.com" },
  { name: "dLocal",              tagline: "Payments platform enabling businesses to accept and send money in emerging markets",                            category: "Payments",       website: "https://www.dlocal.com",                                    logo: "dlocal.com" },
  { name: "Dromos Labs",         tagline: "Builds decentralized systems and infrastructure for greater user control",                                      category: "Developer Tools",website: "https://dromos.xyz",                                        logo: "dromos.xyz" },
  { name: "dRPC",                tagline: "Modular RPC solutions to launch, scale, and monitor blockchain infrastructure",                                 category: "Infrastructure", website: "https://drpc.org",                                          logo: "drpc.org" },
  { name: "Dynamic",             tagline: "Flexible wallet and authentication platform for Web3 applications",                                             category: "Wallet",         website: "https://www.dynamic.xyz",                                   logo: "dynamic.xyz" },
  { name: "EBANX",               tagline: "Payments platform enabling access to global commerce in emerging markets",                                      category: "Payments",       website: "https://www.ebanx.com",                                     logo: "ebanx.com" },
  { name: "Elliptic",            tagline: "Blockchain analytics and crypto compliance solutions for institutions",                                         category: "Analytics",      website: "https://www.elliptic.co",                                   logo: "elliptic.co" },
  { name: "Emirates NBD",        tagline: "Leading banking group in the Middle East and North Africa",                                                     category: "Finance",        website: "https://www.emiratesnbd.com/en",                            logo: "emiratesnbd.com" },
  { name: "Exodus",              tagline: "Buy and sell crypto using credit card, bank account, Apple Pay, or Google Pay",                                category: "Wallet",         website: "https://www.exodus.com",                                    logo: "exodus.com" },
  { name: "Fireblocks",          tagline: "Enterprise grade digital asset and stablecoin infrastructure powering financial possibility",                   category: "Custody",        website: "https://fireblocks.com",                                    logo: "fireblocks.com" },
  { name: "First Abu Dhabi Bank",tagline: "Provides corporate and institutional products to large corporate clients globally",                             category: "Finance",        website: "https://www.bankfab.com/en-ae/personal",                    logo: "bankfab.com" },
  { name: "FIS",                 tagline: "Fintech transforming how we live, work and play through financial technology",                                  category: "Finance",        website: "https://www.fisglobal.com",                                 logo: "fisglobal.com" },
  { name: "Fluid",               tagline: "Makes lending and borrowing on DeFi easier, safer, and more efficient",                                        category: "Lending",        website: "https://fluid.io",                                          logo: "fluid.io" },
  { name: "Forte AUD",           tagline: "Simple, fast, cost-effective cryptocurrency access via Australian dollar stablecoin",                           category: "Stablecoin",     website: "https://www.forteaud.com",                                  logo: "forteaud.com" },
  { name: "Forte Securities",    tagline: "Independent global financial group offering brokerage, custody and asset management",                           category: "Trading",        website: "https://fortesecurities.com",                               logo: "fortesecurities.com" },
  { name: "Fun.xyz",             tagline: "High converting rails to execute blockchain actions, optimize funding and reach customers",                     category: "Developer Tools",website: "https://fun.xyz",                                           logo: "fun.xyz" },
  { name: "Galaxy",              tagline: "Global leader in digital assets and AI infrastructure serving institutions and startups",                       category: "Finance",        website: "https://www.galaxy.com",                                    logo: "galaxy.com" },
  { name: "Goldman Sachs",       tagline: "Leading global investment banking, securities, and asset and wealth management firm",                           category: "Finance",        website: "https://www.goldmansachs.com",                              logo: "goldmansachs.com" },
  { name: "Hashkey",             tagline: "Licensed digital asset exchange with institutional-grade security and compliance",                              category: "Exchange",       website: "https://www.hashkey.com/en-US",                             logo: "hashkey.com" },
  { name: "Hecto Financial",     tagline: "Fintech company providing fintech platform services in South Korea",                                            category: "Finance",        website: "https://www.hectogroup.com",                                logo: "hectogroup.com" },
  { name: "Hecto Innovation",    tagline: "IT platform company in the information security field primarily serving Korea",                                 category: "Infrastructure", website: "https://www.hectogroup.com",                                logo: "hectogroup.com" },
  { name: "HSBC",                tagline: "British universal bank and financial services group headquartered in London",                                   category: "Finance",        website: "https://www.us.hsbc.com",                                   logo: "hsbc.com" },
  { name: "Hurupay",             tagline: "Get USD and EUR bank accounts to receive or send money globally",                                              category: "Payments",       website: "https://www.hurupay.com",                                   logo: "hurupay.com" },
  { name: "JPYC",                tagline: "Stablecoin linked to the Japanese yen for NFT purchases and crypto exchange",                                  category: "Stablecoin",     website: "https://corporate.jpyc.co.jp/en",                           logo: "jpyc.co.jp" },
  { name: "Keyrock",             tagline: "Boosting digital assets with tailored liquidity solutions since 2017",                                          category: "Trading",        website: "https://keyrock.com",                                       logo: "keyrock.com" },
  { name: "Kraken",              tagline: "Own the power of your money — trading crypto, stocks, futures, staking and more",                              category: "Exchange",       website: "https://www.kraken.com",                                    logo: "kraken.com" },
  { name: "Kyobo Life",          tagline: "Provides optimum insurance coverage and ongoing financial services in South Korea",                             category: "Finance",        website: "https://www.kyobo.com/dgt/web/company-introduction/en-main", logo: "kyobo.com" },
  { name: "LayerZero",           tagline: "Builds technology making decentralization possible, scalable, and inevitable",                                  category: "Bridge",         website: "https://layerzero.network",                                 logo: "layerzero.network" },
  { name: "Ledger",              tagline: "Build your portfolio: buy, swap, stake, spend with hardware wallet security",                                  category: "Wallet",         website: "https://www.ledger.com",                                    logo: "ledger.com" },
  { name: "LianLian",            tagline: "Seamless and secure cross-border payment experience for global businesses",                                     category: "Payments",       website: "https://lianlianglobal.com/en",                             logo: "lianlianglobal.com" },
  { name: "Maple",               tagline: "Onchain asset manager with decades of traditional finance and crypto experience",                              category: "Lending",        website: "https://maple.finance",                                     logo: "maple.finance" },
  { name: "Mastercard",          tagline: "American multinational payment card services corporation",                                                      category: "Payments",       website: "https://www.mastercard.com/us/en.html",                     logo: "mastercard.com" },
  { name: "Mercoin",             tagline: "Creates products helping people unleash potential and circulate value globally",                                category: "Finance",        website: "https://about.mercoin.com/en",                              logo: "mercoin.com" },
  { name: "MetaMask",            tagline: "Secure and flexible crypto wallet trusted by millions to buy, sell, and swap assets",                           category: "Wallet",         website: "https://metamask.io",                                       logo: "metamask.io" },
  { name: "Morpho",              tagline: "Open credit network connecting lenders and borrowers to worldwide opportunities",                               category: "Lending",        website: "https://morpho.org",                                        logo: "morpho.org" },
  { name: "Noah",                tagline: "Unified API to easily integrate stablecoin payments into your platform",                                        category: "Payments",       website: "https://noah.io",                                           logo: "noah.io" },
  { name: "Nuvei",               tagline: "Unifies pay-ins, payouts, and data on one intelligent payment platform",                                        category: "Payments",       website: "https://www.nuvei.com",                                     logo: "nuvei.com" },
  { name: "Pairpoint",           tagline: "Enables IoT devices to securely connect, transact, and communicate using SIM and blockchain",                  category: "Infrastructure", website: "https://pairpoint.io",                                      logo: "pairpoint.io" },
  { name: "Paysafe",             tagline: "Payment solution for every business helping SMEs grow",                                                         category: "Payments",       website: "https://www.paysafe.com",                                   logo: "paysafe.com" },
  { name: "PhotonPay",           tagline: "Simplify global business payments: accounts, cards, online payments, and embedded finance",                     category: "Payments",       website: "https://www.photonpay.com",                                 logo: "photonpay.com" },
  { name: "Pimlico",             tagline: "Account abstraction infrastructure powering the Ethereum transition to smart accounts",                         category: "Infrastructure", website: "https://www.pimlico.io",                                    logo: "pimlico.io" },
  { name: "Privy",               tagline: "Powers complete wallet stack from key management to user onboarding",                                           category: "Wallet",         website: "https://www.privy.io",                                      logo: "privy.io" },
  { name: "QuickNode",           tagline: "Global network delivering real-time blockchain data with unmatched speed and reliability",                      category: "Infrastructure", website: "https://www.quicknode.com",                                 logo: "quicknode.com" },
  { name: "Rainbow",             tagline: "Explore NFTs and DeFi on Ethereum, Polygon, Optimism, Arbitrum, BSC, Base, and more",                         category: "Wallet",         website: "https://rainbow.me/en-us",                                  logo: "rainbow.me" },
  { name: "Ramp",                tagline: "AI-powered expense management platform simplifying spend management for businesses",                            category: "Finance",        website: "https://www.ramp.com",                                      logo: "ramp.com" },
  { name: "Ramp Network",        tagline: "Seamless crypto buying, selling, and swapping within apps and wallets with full KYC",                          category: "Payments",       website: "https://rampnetwork.com",                                   logo: "rampnetwork.com" },
  { name: "RedStone",            tagline: "Modular oracle system providing customizable data feeds for DeFi protocols",                                    category: "Oracle",         website: "https://www.redstone.finance",                              logo: "redstone.finance" },
  { name: "Robinhood",           tagline: "Financial services company providing a trading platform for stocks, ETFs, and crypto",                         category: "Exchange",       website: "https://robinhood.com",                                     logo: "robinhood.com" },
  { name: "Sasai Fintech",       tagline: "Fintech and platform service provider empowering business growth through payments",                            category: "Payments",       website: "https://sasaifintech.com",                                  logo: "sasaifintech.com" },
  { name: "SBI Holdings",        tagline: "Financial services company group based in Tokyo, Japan",                                                        category: "Finance",        website: "https://www.sbigroup.co.jp/english",                        logo: "sbigroup.co.jp" },
  { name: "Standard Chartered",  tagline: "Global bank connecting corporate and institutional clients to sustainable growth",                              category: "Finance",        website: "https://www.sc.com/en",                                     logo: "sc.com" },
  { name: "Securitize",          tagline: "Leader in tokenizing real-world assets for institutional investors",                                            category: "RWA",            website: "https://securitize.io",                                     logo: "securitize.io" },
  { name: "Sequence",            tagline: "Modular crypto infrastructure unifying wallets, cross-chain payments, and real-time data",                     category: "Infrastructure", website: "https://sequence.xyz",                                      logo: "sequence.xyz" },
  { name: "Societe Generale",    tagline: "European leader in financial services for over 150 years",                                                      category: "Finance",        website: "https://www.societegenerale.com/en",                        logo: "societegenerale.com" },
  { name: "Stablecorp",          tagline: "Leading Canadian fintech building digital money infrastructure for global payments",                            category: "Stablecoin",     website: "https://www.stablecorp.ca",                                 logo: "stablecorp.ca" },
  { name: "Stargate",            tagline: "Bridge native USDC, USDT, ETH, BTC, and OFTs across 80+ chains",                                              category: "Bridge",         website: "https://stargate.finance",                                  logo: "stargate.finance" },
  { name: "State Street",        tagline: "Premier American financial holding company headquartered in Boston, MA",                                        category: "Finance",        website: "https://www.statestreet.com/us/en",                         logo: "statestreet.com" },
  { name: "Sumitomo Corporation",tagline: "Leading integrated trading company engaged in diverse businesses globally",                                    category: "Other",          website: "https://www.sumitomocorp.com/en/global",                    logo: "sumitomocorp.com" },
  { name: "Superface",           tagline: "LLM-powered automation agent connecting to systems and enabling task automation",                               category: "Developer Tools",website: "https://superface.ai",                                      logo: "superface.ai" },
]

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()
    if (!password || password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [existingNamesRes, existingSlugsRes] = await Promise.all([
      pool.query(`SELECT LOWER(name) AS name FROM projects`),
      pool.query(`SELECT slug FROM projects`),
    ])
    const existingNames = new Set(existingNamesRes.rows.map((r: any) => r.name as string))
    const existingSlugs = new Set(existingSlugsRes.rows.map((r: any) => r.slug as string))

    const toInsert: { name: string; tagline: string; category: string; logo_url: string; website: string; slug: string }[] = []
    let skipped = 0

    for (const p of ARC_PROJECTS) {
      if (existingNames.has(p.name.toLowerCase())) { skipped++; continue }

      let slug = toSlug(p.name)
      const base = slug
      let i = 1
      while (existingSlugs.has(slug)) slug = `${base}-${++i}`
      existingSlugs.add(slug)

      toInsert.push({
        name:     p.name,
        tagline:  p.tagline,
        category: p.category,
        logo_url: `https://logo.clearbit.com/${p.logo}`,
        website:  p.website,
        slug,
      })
    }

    if (toInsert.length > 0) {
      const placeholders = toInsert.map((_, i) => {
        const b = i * 6
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},'official',true,true,false)`
      }).join(",")

      const params = toInsert.flatMap(p => [p.name, p.tagline, p.category, p.logo_url, p.website, p.slug])

      await pool.query(
        `INSERT INTO projects (name, tagline, category, logo_url, website, slug, badge, approved, live, featured)
         VALUES ${placeholders}`,
        params
      )
    }

    return NextResponse.json({
      success:  true,
      inserted: toInsert.length,
      skipped,
      total:    ARC_PROJECTS.length,
    })
  } catch (err) {
    console.error("[SeedArc]", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
