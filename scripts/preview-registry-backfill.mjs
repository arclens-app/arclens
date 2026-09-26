// Read-only comparison of ArcLens's public project trust state against the
// deployed ArcLensRegistry on Arc mainnet. This script never writes on-chain
// and never connects directly to the database.

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://arclenz.xyz"
const TIER = { listed: 1, claimed: 2, vetted: 3, verified: 4, arc_partner: 5, arc_official: 6 }

const response = await fetch(`${BASE}/api/ecosystem`, { headers: { accept: "application/json" } })
if (!response.ok) throw new Error(`Ecosystem API returned ${response.status}`)
const payload = await response.json()
const projects = Array.isArray(payload) ? payload : (payload.projects || payload.data || [])

function expected(project) {
  const key = project.recognition === "official" ? "arc_official"
    : project.recognition === "partner" ? "arc_partner"
    : (project.trust_level || "listed")
  return {
    tier: TIER[key] || 1,
    established: !!project.established,
    revoked: project.trust_profile?.hard_risk === true,
  }
}

const results = []
let cursor = 0
const workers = Array.from({ length: 4 }, async () => {
  while (cursor < projects.length) {
    const index = cursor++
    const project = projects[index]
    const r = await fetch(`${BASE}/api/attestation?slug=${encodeURIComponent(project.slug)}`, { headers: { accept: "application/json" } })
    const data = r.ok ? await r.json() : null
    const want = expected(project)
    const got = data?.attestation || null
    const matches = !!got && Number(got.tier) === want.tier && !!got.established === want.established && !!got.revoked === want.revoked
    results[index] = {
      name: project.name,
      slug: project.slug,
      subject: data?.subject || null,
      expected: want,
      current: got ? { tier: Number(got.tier), established: !!got.established, revoked: !!got.revoked, issuedAt: Number(got.issuedAt || 0) } : null,
      matches,
    }
  }
})
await Promise.all(workers)

const mismatches = results.filter(x => !x.matches)
const neverAttested = mismatches.filter(x => !x.current || x.current.issuedAt === 0)
console.log(JSON.stringify({
  readOnly: true,
  projects: results.length,
  matching: results.length - mismatches.length,
  mismatched: mismatches.length,
  neverAttested: neverAttested.length,
  byExpectedTier: Object.fromEntries(Object.entries(TIER).map(([name, tier]) => [name, results.filter(x => x.expected.tier === tier).length])),
  sample: mismatches.slice(0, 15),
}, null, 2))
