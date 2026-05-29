// One-off: reconfigure Lunex's SwapPool (contract id 8) from role=treasury to
// role=volume (Curve-style TokenExchange), then backfill ALL historical swap
// volume from its deploy block to head and set the cursor so the 5-min cron
// just maintains it forward.
//
// Safe to re-run: volume_events has UNIQUE (tx_hash, log_index); inserts use
// ON CONFLICT DO NOTHING and volume_daily is recomputed from scratch at the end.

import { readFileSync } from "node:fs"
import pg from "pg"
import { ethers } from "ethers"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const provider = new ethers.JsonRpcProvider("https://rpc.testnet.arc.network")

const CONTRACT_ID = 8
const STABLECOIN_ID = 1 // USDC, USD-pegged
const AMOUNT_ARG = 1    // tokens_sold (input side, counted once per trade)
const SIG = "TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)"
const CANONICAL = "TokenExchange(address,uint256,uint256,uint256,uint256)"
const TOPIC = ethers.id(CANONICAL)
const DATA_TYPES = ["uint256", "uint256", "uint256", "uint256"] // non-indexed args
const REORG_BUFFER = 6
const MAX_LOG_RANGE = 5_000

// toUsdE6 — identical to src/lib/tvl.ts
function toUsdE6(rawAmount, tokenDecimals, pegToUsdRate) {
  const rateScaled = BigInt(Math.round(pegToUsdRate * 1e8))
  const num = rawAmount * rateScaled * BigInt(1_000_000)
  const denom = BigInt(10) ** BigInt(tokenDecimals) * BigInt(100_000_000)
  return num / denom
}

async function getLogsBisecting(filter, from, to) {
  try {
    return await provider.getLogs({ ...filter, fromBlock: from, toBlock: to })
  } catch (e) {
    if (from >= to) { console.error(`  getLogs single-block fail @${from}: ${e.message.slice(0,60)}`); return [] }
    const mid = Math.floor((from + to) / 2)
    const a = await getLogsBisecting(filter, from, mid)
    const b = await getLogsBisecting(filter, mid + 1, to)
    return a.concat(b)
  }
}

async function gatedAll(items, concurrency, fn) {
  let i = 0
  await Promise.all(Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) { const idx = i++; if (idx >= items.length) return; await fn(items[idx]) }
  }))
}

const client = await pool.connect()
try {
  // 0. Confirm the contract + USDC stablecoin + decimals/rate.
  const pc = (await client.query(
    `SELECT id, project_id, address, role, start_block FROM project_contracts WHERE id = $1`, [CONTRACT_ID])).rows[0]
  if (!pc) throw new Error(`contract id ${CONTRACT_ID} not found`)
  const stable = (await client.query(
    `SELECT id, decimals, peg_currency, symbol FROM stablecoins WHERE id = $1`, [STABLECOIN_ID])).rows[0]
  if (!stable) throw new Error(`stablecoin id ${STABLECOIN_ID} not found`)
  const fx = (await client.query(
    `SELECT rate_to_usd::float8 r FROM forex_rates WHERE currency = $1 AND effective_date <= CURRENT_DATE
     ORDER BY effective_date DESC LIMIT 1`, [stable.peg_currency])).rows[0]
  const rate = stable.peg_currency === "USD" ? 1 : (fx ? fx.r : 1)
  console.log(`contract ${pc.address} project=${pc.project_id} role=${pc.role} start_block=${pc.start_block}`)
  console.log(`stablecoin ${stable.symbol} ${stable.decimals}d peg=${stable.peg_currency} rate=${rate}`)
  console.log(`topic ${TOPIC}`)

  // 1. Reconfigure: role -> volume + TokenExchange config.
  await client.query(
    `UPDATE project_contracts SET
       role = 'volume',
       volume_method = 'swap_event',
       volume_event_signature = $2,
       volume_event_topic = $3,
       volume_amount_arg = $4,
       volume_stablecoin_id = $5
     WHERE id = $1`,
    [CONTRACT_ID, SIG, TOPIC, AMOUNT_ARG, STABLECOIN_ID])
  console.log("✓ contract reconfigured to role=volume")

  // 2. Scan TokenExchange logs from start_block to head-buffer.
  const head = await provider.getBlockNumber()
  const target = head - REORG_BUFFER
  const start = Number(pc.start_block)
  const windows = []
  for (let f = start; f <= target; f += MAX_LOG_RANGE) windows.push([f, Math.min(f + MAX_LOG_RANGE - 1, target)])
  console.log(`scanning ${windows.length} windows (${start} → ${target})…`)

  const allLogs = []
  let done = 0
  await gatedAll(windows, 12, async ([f, t]) => {
    const logs = await getLogsBisecting({ address: pc.address, topics: [TOPIC] }, f, t)
    if (logs.length) allLogs.push(...logs)
    if (++done % 200 === 0) process.stdout.write(`  …${done}/${windows.length} windows, ${allLogs.length} swaps\n`)
  })
  console.log(`found ${allLogs.length} TokenExchange logs`)

  // 3. Block timestamps for the (small) set of blocks with swaps.
  const blockNums = [...new Set(allLogs.map(l => l.blockNumber))]
  const blockTimes = new Map()
  await gatedAll(blockNums, 20, async n => {
    const b = await provider.getBlock(n); if (b) blockTimes.set(n, new Date(b.timestamp * 1000))
  })

  // 4. Decode + insert.
  const coder = ethers.AbiCoder.defaultAbiCoder()
  const rows = []
  for (const log of allLogs) {
    let amount
    try {
      const dec = coder.decode(DATA_TYPES, log.data)
      const v = dec[AMOUNT_ARG]
      amount = typeof v === "bigint" ? v : BigInt(v)
      if (amount < 0n) amount = -amount
    } catch { continue }
    if (amount === 0n) continue
    const usdE6 = toUsdE6(amount, stable.decimals, rate)
    const ts = blockTimes.get(log.blockNumber) ?? new Date()
    rows.push([pc.project_id, CONTRACT_ID, STABLECOIN_ID, log.transactionHash, log.index, log.blockNumber, ts, amount.toString(), usdE6.toString()])
  }
  console.log(`decoded ${rows.length} non-zero swaps`)

  let inserted = 0
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const ph = [], flat = []
    chunk.forEach((r, j) => { const o = j * 9; ph.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9})`); flat.push(...r) })
    const res = await client.query(
      `INSERT INTO volume_events (project_id, contract_id, stablecoin_id, tx_hash, log_index, block_number, block_time, amount_raw, amount_usd_e6)
       VALUES ${ph.join(",")} ON CONFLICT (tx_hash, log_index) DO NOTHING`, flat)
    inserted += res.rowCount ?? 0
  }
  console.log(`✓ inserted ${inserted} volume_events (rest were dupes)`)

  // 5. Rebuild volume_daily for this project from the events table (authoritative).
  await client.query(`DELETE FROM volume_daily WHERE project_id = $1`, [pc.project_id])
  await client.query(
    `INSERT INTO volume_daily (project_id, day, total_usd_e6, event_count)
     SELECT project_id, block_time::date, SUM(amount_usd_e6), COUNT(*)
     FROM volume_events WHERE project_id = $1
     GROUP BY project_id, block_time::date`, [pc.project_id])
  console.log("✓ rebuilt volume_daily")

  // 6. Set cursor to target so the cron resumes forward, not from deploy.
  await client.query(
    `INSERT INTO indexer_cursors (kind, stablecoin_id, last_block, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (kind, stablecoin_id) DO UPDATE SET last_block = GREATEST(indexer_cursors.last_block, EXCLUDED.last_block), updated_at = NOW()`,
    [`volume_${CONTRACT_ID}`, STABLECOIN_ID, target])
  console.log(`✓ cursor volume_${CONTRACT_ID} set to ${target}`)

  // 7. Roll up onto projects (mirrors cron rollupVolumeOntoProjects).
  await client.query(
    `UPDATE projects p SET
       volume_cum_usd_e6     = COALESCE(t.cum, 0),
       volume_ath_day_usd_e6 = ath.max_day,
       volume_ath_day        = ath.max_date
     FROM (SELECT $1::int AS project_id) ids
     LEFT JOIN LATERAL (SELECT SUM(amount_usd_e6) cum FROM volume_events WHERE project_id = ids.project_id) t ON true
     LEFT JOIN LATERAL (SELECT day max_date, total_usd_e6 max_day FROM volume_daily vd WHERE vd.project_id = ids.project_id ORDER BY vd.total_usd_e6 DESC LIMIT 1) ath ON true
     WHERE p.id = ids.project_id`, [pc.project_id])

  const fin = (await client.query(
    `SELECT volume_cum_usd_e6::text cum, volume_ath_day_usd_e6::text ath, volume_ath_day FROM projects WHERE id = $1`, [pc.project_id])).rows[0]
  console.log(`\n=== RESULT ===`)
  console.log(`cumulative volume: $${(Number(fin.cum)/1e6).toLocaleString()}`)
  console.log(`best day: $${(Number(fin.ath)/1e6).toLocaleString()} on ${fin.ath_day || fin.volume_ath_day}`)
} finally {
  client.release()
  await pool.end()
}
