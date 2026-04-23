const { Pool } = require("pg")
const fs = require("fs")

const env = fs.readFileSync(".env.local", "utf8")
env.split("\n").forEach(l => {
  const [k, ...v] = l.split("=")
  if (k && v.length) process.env[k.trim()] = v.join("=").trim()
})

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const TABLES = [
  "projects",
  "reviews",
  "campaigns",
  "campaign_completions",
  "contracts",
  "contract_names_cache",
  "events",
  "pending_updates",
  "project_views",
]

async function exportDB() {
  let sql = "-- ArcLens DB Export\n\n"

  for (const table of TABLES) {
    try {
      const res = await pool.query(`SELECT * FROM ${table}`)
      if (res.rows.length === 0) {
        sql += `-- ${table}: empty\n\n`
        console.log(`${table}: 0 rows`)
        continue
      }

      const cols = Object.keys(res.rows[0])
      sql += `-- ${table}: ${res.rows.length} rows\n`

      for (const row of res.rows) {
        const vals = cols.map(c => {
          const v = row[c]
          if (v === null || v === undefined) return "NULL"
          if (typeof v === "boolean") return v ? "TRUE" : "FALSE"
          if (typeof v === "number") return v
          if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`
          return `'${String(v).replace(/'/g, "''").replace(/\n/g, "\\n").replace(/\r/g, "")}'`
        })
        sql += `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT DO NOTHING;\n`
      }
      sql += "\n"
      console.log(`${table}: ${res.rows.length} rows exported`)
    } catch (e) {
      sql += `-- ${table}: SKIP (${e.message})\n\n`
      console.log(`${table}: skipped — ${e.message}`)
    }
  }

  fs.writeFileSync("backup.sql", sql)
  console.log("\n✓ backup.sql saved")
  await pool.end()
}

exportDB().catch(e => { console.error("FAILED:", e.message); process.exit(1) })
