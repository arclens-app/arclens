"use strict";
const { Pool } = require("pg");

const ARC_NETWORK = (process.env.ARC_NETWORK || process.env.NEXT_PUBLIC_ARC_NETWORK || "testnet").toLowerCase() === "mainnet" ? "mainnet" : "testnet";
const ARC_CHAIN_ID = ARC_NETWORK === "mainnet" ? 5042 : 5042002;
const ARC_RPC = process.env.ARC_RPC_HTTP || (ARC_NETWORK === "mainnet" ? "https://rpc.mainnet.arc.io" : "https://rpc.testnet.arc.io");
const DATABASE_URL = process.env.DATABASE_URL || "";
const POLL_INTERVAL = 2000;
const BATCH_SIZE = 5;

const pool = new Pool({ connectionString: DATABASE_URL });

async function rpc(method, params = []) {
  const res = await fetch(ARC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const data = await res.json();
  return data.result;
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS indexed_transactions (
      chain_id     INTEGER NOT NULL DEFAULT 5042002,
      hash         TEXT NOT NULL,
      block_number BIGINT NOT NULL,
      block_time   TIMESTAMPTZ NOT NULL,
      from_addr    TEXT NOT NULL,
      to_addr      TEXT,
      value_raw    NUMERIC DEFAULT 0,
      gas_used     BIGINT DEFAULT 0,
      gas_price    NUMERIC DEFAULT 0,
      status       TEXT DEFAULT 'confirmed',
      is_usdc_xfer BOOLEAN DEFAULT false,
      usdc_amount  NUMERIC,
      usdc_to      TEXT,
      PRIMARY KEY (chain_id, hash)
    );
    CREATE INDEX IF NOT EXISTS idx_itx_from  ON indexed_transactions (chain_id, from_addr);
    CREATE INDEX IF NOT EXISTS idx_itx_to    ON indexed_transactions (chain_id, to_addr);
    CREATE INDEX IF NOT EXISTS idx_itx_block ON indexed_transactions (chain_id, block_number DESC);
    CREATE TABLE IF NOT EXISTS indexer_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO indexer_state (key, value) VALUES ('last_block:${ARC_CHAIN_ID}', '0')
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log(`[Indexer] Schema ready for Arc ${ARC_NETWORK} (${ARC_CHAIN_ID})`);
}

async function getLastBlock() {
  const res = await pool.query("SELECT value FROM indexer_state WHERE key = $1", [`last_block:${ARC_CHAIN_ID}`]);
  return parseInt(res.rows[0]?.value || "0");
}

async function setLastBlock(n) {
  await pool.query("UPDATE indexer_state SET value = $1 WHERE key = $2", [n.toString(), `last_block:${ARC_CHAIN_ID}`]);
}

const USDC_CONTRACT = "0x3600000000000000000000000000000000000000";
const TRANSFER_SIG  = "0xa9059cbb";

function decodeUSDC(input) {
  if (!input || !input.startsWith(TRANSFER_SIG) || input.length < 138) return null;
  const to     = "0x" + input.slice(34, 74);
  const amount = BigInt("0x" + input.slice(74, 138));
  return { to, amount };
}

async function indexBlock(blockNumber) {
  const b = await rpc("eth_getBlockByNumber", ["0x" + blockNumber.toString(16), true]);
  if (!b || !b.transactions || b.transactions.length === 0) return 0;

  const blockTime = new Date(parseInt(b.timestamp, 16) * 1000).toISOString();
  const blockNum  = parseInt(b.number, 16);
  const txs       = b.transactions;

  const rows = [];
  for (const tx of txs) {
    const gasUsed  = parseInt(tx.gas, 16);
    const gasPrice = parseInt(tx.gasPrice || "0x2540BE400", 16);
    const isUSDC   = tx.to && tx.to.toLowerCase() === USDC_CONTRACT && tx.input && tx.input.startsWith(TRANSFER_SIG);
    const decoded  = isUSDC ? decodeUSDC(tx.input) : null;

    rows.push([
      ARC_CHAIN_ID,
      tx.hash,
      blockNum,
      blockTime,
      tx.from.toLowerCase(),
      tx.to ? tx.to.toLowerCase() : null,
      tx.value ? parseInt(tx.value, 16).toString() : "0",
      gasUsed.toString(),
      gasPrice.toString(),
      "confirmed",
      isUSDC ? true : false,
      decoded ? decoded.amount.toString() : null,
      decoded ? decoded.to.toLowerCase() : null,
    ]);
  }

  if (rows.length === 0) return 0;

  const placeholders = rows.map((_, i) => {
    const b = i * 13;
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13})`;
  }).join(",");

  await pool.query(
    `INSERT INTO indexed_transactions
       (chain_id,hash,block_number,block_time,from_addr,to_addr,value_raw,gas_used,gas_price,status,is_usdc_xfer,usdc_amount,usdc_to)
     VALUES ${placeholders}
     ON CONFLICT (chain_id, hash) DO NOTHING`,
    rows.flat()
  );

  return rows.length;
}

async function main() {
  console.log("[Indexer] Starting...");
  await ensureSchema();

  let lastBlock = await getLastBlock();

  if (lastBlock === 0) {
    const latest = await rpc("eth_blockNumber");
    lastBlock = parseInt(latest, 16) - 50;
    console.log("[Indexer] Fresh start at block " + lastBlock);
  } else {
    console.log("[Indexer] Resuming from block " + lastBlock);
  }

  let total = 0;

  async function tick() {
    try {
      const latestHex = await rpc("eth_blockNumber");
      const latest    = parseInt(latestHex, 16);
      if (lastBlock >= latest) return;

      const toProcess = Math.min(latest - lastBlock, BATCH_SIZE);
      for (let i = 1; i <= toProcess; i++) {
        const n     = lastBlock + i;
        const count = await indexBlock(n);
        total      += count;
        if (i === toProcess) {
          lastBlock = n;
          await setLastBlock(lastBlock);
          console.log("[Indexer] Block " + n.toLocaleString() + " · " + count + " txs · Total: " + total.toLocaleString());
        }
      }
    } catch (err) {
      console.error("[Indexer] Error:", err.message);
    }
  }

  await tick();
  setInterval(tick, POLL_INTERVAL);
}

main().catch(err => {
  console.error("[Indexer] Fatal:", err);
  process.exit(1);
});
