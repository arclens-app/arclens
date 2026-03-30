# ArcLens — Arc Testnet Explorer
## Next.js 14 · TypeScript · Tailwind · ethers v6

---

## SETUP (run these in order)

```bash
npx create-next-app@latest arclens \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

cd arclens

npm install ethers@6 @tanstack/react-query zustand
```

Then copy every file below into the right paths.

---

## PROJECT STRUCTURE

```
arclens/
├── src/
│   ├── app/
│   │   ├── layout.tsx          ← root layout + providers
│   │   ├── page.tsx            ← overview (/)
│   │   ├── blocks/page.tsx
│   │   ├── transactions/page.tsx
│   │   ├── tx/[hash]/page.tsx
│   │   ├── address/[addr]/page.tsx
│   │   ├── search/page.tsx
│   │   ├── registry/page.tsx
│   │   ├── dev/page.tsx
│   │   └── api/
│   │       ├── search/route.ts       ← unified search API
│   │       ├── verify/route.ts       ← contract verification
│   │       └── contract/[addr]/route.ts
│   ├── lib/
│   │   ├── arc.ts              ← Arc RPC + WebSocket provider
│   │   ├── constants.ts        ← chain config
│   │   └── db.ts               ← Postgres (contract registry)
│   ├── hooks/
│   │   ├── useArcSocket.ts     ← live block/tx WebSocket
│   │   ├── useBlock.ts
│   │   ├── useTransaction.ts
│   │   ├── useAddress.ts
│   │   └── useGasPrice.ts
│   ├── store/
│   │   └── arc.ts              ← zustand global state
│   └── components/
│       ├── layout/
│       │   ├── Sidebar.tsx
│       │   ├── Topbar.tsx
│       │   └── SearchBar.tsx   ← THE unified search
│       ├── overview/
│       │   ├── HeroPrice.tsx
│       │   ├── StatsBand.tsx
│       │   ├── GasBand.tsx
│       │   ├── BlockFeed.tsx
│       │   └── TxFeed.tsx
│       └── shared/
│           ├── Badge.tsx
│           ├── HashLink.tsx
│           └── USDCAmount.tsx
└── .env.local
```
