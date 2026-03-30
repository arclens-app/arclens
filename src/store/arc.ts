// src/store/arc.ts
// Zustand store — live Arc chain state.
// This is the single source of truth for all live data in the UI.
// The WebSocket hook writes here. Every component reads from here.

import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface LiveBlock {
  number:    number
  hash:      string
  timestamp: number
  txCount:   number
  gasUsed:   bigint
  feeUSDC:   string     // "$0.42"
  validator: string
}

export interface LiveTx {
  hash:      string
  from:      string
  to:        string | null
  toName?:   string        // from contract registry
  toLogo?:   string
  toVerified?: boolean
  toFlagged?:  boolean
  value:     bigint
  valueUSDC: string        // "$1,200"
  gasUSDC:   string        // "$0.011"
  status:    "pending" | "confirmed" | "failed"
  timestamp: number
}

export interface GasInfo {
  baseFeeGwei:   number
  transfer:      string   // "$0.009"
  erc20Transfer: string   // "$0.011"
  contractCall:  string   // "$0.020"
  contractDeploy:string   // "$0.048"
}

export interface ArcStore {
  // Live data
  latestBlock:    number
  latestBlocks:   LiveBlock[]
  latestTxs:      LiveTx[]
  pendingTxCount: number
  gasInfo:        GasInfo
  usdcSupply:     string    // "$48.3M"
  activeAddresses:number
  usdcSettled24h: string    // "$2.14M"
  cctp24h:        string    // "$1.84M"
  finality:       number    // seconds, e.g. 0.82
  newTxCount:     number    // increments since page load — "429 more incoming"

  // Connection state
  wsConnected:    boolean
  lastUpdated:    number    // timestamp

  // Actions (called by useArcSocket)
  addBlock:       (block: LiveBlock) => void
  addTx:          (tx: LiveTx) => void
  setGasInfo:     (gas: GasInfo) => void
  setUSDCSupply:  (s: string) => void
  setMetrics:     (m: Partial<ArcStore>) => void
  setWsConnected: (connected: boolean) => void
  setFinality:    (f: number) => void
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useArcStore = create<ArcStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state — shown while WebSocket connects
    latestBlock:    0,
    latestBlocks:   [],
    latestTxs:      [],
    pendingTxCount: 0,
    gasInfo: {
      baseFeeGwei:    160,
      transfer:       "$0.009",
      erc20Transfer:  "$0.011",
      contractCall:   "$0.020",
      contractDeploy: "$0.048",
    },
    usdcSupply:     "$48.3M",
    activeAddresses:41820,
    usdcSettled24h: "$2.14M",
    cctp24h:        "$1.84M",
    finality:       0.82,
    newTxCount:     0,
    wsConnected:    false,
    lastUpdated:    Date.now(),

    // ── ACTIONS ──────────────────────────────────────────────────────────────

    addBlock: (block) => set(state => ({
      latestBlock:  block.number,
      latestBlocks: [block, ...state.latestBlocks].slice(0, 20),  // keep last 20
      lastUpdated:  Date.now(),
    })),

    addTx: (tx) => set(state => ({
      latestTxs:  [tx, ...state.latestTxs].slice(0, 30),  // keep last 30
      newTxCount: state.newTxCount + 1,
      lastUpdated: Date.now(),
    })),

    setGasInfo: (gas) => set({ gasInfo: gas }),

    setUSDCSupply: (s) => set({ usdcSupply: s }),

    setMetrics: (m) => set(m),

    setWsConnected: (connected) => set({ wsConnected: connected }),

    setFinality: (f) => set({ finality: f }),
  }))
)

// ─── SELECTORS ────────────────────────────────────────────────────────────────
// Use these instead of selecting the whole store to avoid unnecessary rerenders.

export const selectLatestBlock     = (s: ArcStore) => s.latestBlock
export const selectLatestBlocks    = (s: ArcStore) => s.latestBlocks
export const selectLatestTxs       = (s: ArcStore) => s.latestTxs
export const selectGasInfo         = (s: ArcStore) => s.gasInfo
export const selectFinality        = (s: ArcStore) => s.finality
export const selectUSDCSupply      = (s: ArcStore) => s.usdcSupply
export const selectUsdcSettled     = (s: ArcStore) => s.usdcSettled24h
export const selectActiveAddresses = (s: ArcStore) => s.activeAddresses
export const selectNewTxCount      = (s: ArcStore) => s.newTxCount
export const selectWsConnected     = (s: ArcStore) => s.wsConnected
