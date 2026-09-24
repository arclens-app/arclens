import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import solc from "solc"

const directory = path.dirname(fileURLToPath(import.meta.url))
const contractPath = path.join(directory, "..", "contracts", "ArcLensRegistry.sol")
const abiPath = path.join(directory, "..", "contracts", "ArcLensRegistry.abi.json")
const source = fs.readFileSync(contractPath, "utf8")
const input = {
  language: "Solidity",
  sources: { "ArcLensRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi"] } },
  },
}
const compiled = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (compiled.errors || []).filter(error => error.severity === "error")
if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join("\n"))

const abi = compiled.contracts["ArcLensRegistry.sol"].ArcLensRegistry.abi
fs.writeFileSync(abiPath, `${JSON.stringify(abi, null, 2)}\n`)
console.log(`ArcLensRegistry ABI updated: ${abiPath}`)
