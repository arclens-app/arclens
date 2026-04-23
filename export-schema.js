const { Pool } = require("pg")
const fs = require("fs")

const env = fs.readFileSync(".env.local", "utf8")
env.split("\n").forEach(l => {
  const [k, ...v] = l.split("=")
  if (k && v.length) process.env[k.trim()] = v.join("=").trim()
})

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function exportSchema() {
  const res = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)

  const tables = {}
  for (const row of res.rows) {
    if (!tables[row.table_name]) tables[row.table_name] = []
    tables[row.table_name].push(row)
  }

  let sql = ""
  for (const [table, cols] of Object.entries(tables)) {
    sql += `CREATE TABLE IF NOT EXISTS ${table} (\n`
    const colDefs = cols.map(c => {
      let def = `  ${c.column_name} ${c.data_type}`
      if (c.column_default) def += ` DEFAULT ${c.column_default}`
      if (c.is_nullable === "NO") def += ` NOT NULL`
      return def
    })
    sql += colDefs.join(",\n")
    sql += `\n);\n\n`
    console.log(`${table}: ${cols.length} columns`)
  }

  fs.writeFileSync("schema.sql", sql)
  console.log("\n✓ schema.sql saved")
  await pool.end()
}

exportSchema().catch(e => { console.error("FAILED:", e.message); process.exit(1) })
