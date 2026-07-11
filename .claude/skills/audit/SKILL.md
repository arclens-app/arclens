---
name: audit
description: Full-codebase health audit for ArcLens — security, type safety, lint, dependencies, DB hygiene. Run before big pushes or on request ("audit the codebase", "are we good", "health check").
---

# ArcLens Codebase Audit

Run every section, collect findings, then report one prioritized summary:
**✅ passing / 🔴 must fix / 🟡 should fix / ⚪ noted**. Never apply fixes during
the audit itself — report first, fix only on approval, and verify every fix
with the same gates below before calling it done.

ArcLens is a **live production app** (arclenz.xyz) handling real USDC payouts
via Lens AI. The bar for any change: zero behavior change unless explicitly
fixing a confirmed bug, and a green build before and after.

## 1. Baseline gates (run in parallel, in background)

```powershell
npx tsc --noEmit          # must exit 0
npm run lint              # must exit 0 (warnings OK, errors not)
npm run build             # must exit 0 — the real deploy gate
```

- `next.config.ts` should NOT have `typescript.ignoreBuildErrors: true` — if it
  reappears, someone is masking type errors; surface that.
- Lint config is flat-config native (`eslint.config.mjs`) — no FlatCompat. It
  ignores `docs/**` (nested sub-project) and `tournament/**`. Style rules are
  downgraded to `warn` as a ratchet; `react-hooks/rules-of-hooks` and other
  real-bug rules stay `error`. Warning count should trend DOWN over time —
  report the current count vs. the last audit if known (720 at 2026-07-11).

## 2. Secrets & git hygiene

```powershell
git ls-files | Select-String -Pattern "env|secret|pem"   # should be empty
```

- Grep `src/` and `scripts/` for `0x[a-fA-F0-9]{64}`, `sk-…`, `re_…`, `AIza…`.
  Known false positives: EIP-1967 storage-slot constants in `trustEngine.ts`,
  `project-contracts/route.ts`, and max-uint256 literals.
- `.gitignore` must cover `.env*`. Flag any `.env*` backup files lying around.
- Report untracked-file count (`git status --porcelain`) — large piles of
  uncommitted work are a data-loss risk.

## 3. API security sweep

- **Admin routes** (`src/app/api/admin/**`): every handler must check
  `Bearer ADMIN_PASSWORD` with a constant-time compare (`Buffer` +
  `timingSafeEqual`-style). Grep for plain `!==` password compares.
- **Cron routes** (`src/app/api/cron/**`): every handler must check
  `CRON_SECRET` and **fail closed** — `if (!expected) return false` must be
  present before the comparison.
- **Dynamic SQL**: grep `` query\(\s*`[^`]*\$\{ `` (multiline). Every
  interpolated identifier must come from a hardcoded allowlist (`ALLOWED`,
  `MATERIAL`/`COSMETIC` sets, literal key arrays). Values must always be
  parameterized (`$1, $2…`), never interpolated.
- **XSS**: `dangerouslySetInnerHTML` should remain absent from `src/`.
- Security headers live in `next.config.ts`; nonce-based CSP in
  `src/middleware.ts` — confirm both still present.

## 4. Dependencies

```powershell
npm audit --omit=dev
```

- Anything fixable via plain `npm audit fix` (no `--force`) is a 🔴 must-fix.
- **`next` itself**: check for a newer patch on the SAME minor line
  (`npm view next dist-tags`). Patch bumps (e.g. 16.2.1 → 16.2.10) are safe and
  often carry security fixes; keep `eslint-config-next` in lockstep.
- Known accepted risk (do not re-flag as new): the `@web3modal/ethers` /
  `@coinbase/wallet-sdk` cluster needs a breaking migration to Reown AppKit —
  tracked as future work.

## 5. Database & runtime hygiene (report-only trends)

- Count `new Pool(` in `src/` — target is consolidation into
  `src/lib/db.ts:getPool()`. 67 module-level pools as of 2026-07-11; flag if
  it grows.
- `ssl: { rejectUnauthorized: false }` is the current accepted pattern for the
  Supabase pooler — note it, don't churn it.
- Vercel cost rules (per user preference): no new client-side polling, batch
  RPC calls, prefer combined crons, CDN caching over recompute.

## 6. Verification of any fixes applied

After approved fixes: rerun ALL of section 1 and confirm identical-or-better
results (build green, tsc 0 errors, lint 0 errors, warning count not up).
Batch all fixes into ONE commit so it costs a single Vercel build. Never push
without explicit approval.
