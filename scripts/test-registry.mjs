import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import solc from "solc"
import { ContractFactory, JsonRpcProvider, ZeroAddress } from "ethers"

const directory = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(directory, "..", "contracts", "ArcLensRegistry.sol"), "utf8")
const input = {
  language: "Solidity",
  sources: { "ArcLensRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
}
const compiled = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (compiled.errors || []).filter(error => error.severity === "error")
if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join("\n"))
const artifact = compiled.contracts["ArcLensRegistry.sol"].ArcLensRegistry

const port = 18_547
const rpcUrl = `http://127.0.0.1:${port}`
const anvil = spawn("anvil", ["--silent", "--port", String(port), "--chain-id", "31337"], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
})
let anvilError = ""
anvil.stderr.on("data", chunk => { anvilError += String(chunk) })

async function waitForAnvil() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      })
      if (response.ok) return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  throw new Error(`Anvil did not start${anvilError ? `: ${anvilError}` : ""}`)
}

async function expectRevert(action, label) {
  let reverted = false
  try {
    const transaction = await action()
    await transaction.wait()
  } catch {
    reverted = true
  }
  assert.equal(reverted, true, label)
}

let provider
try {
  await waitForAnvil()
  provider = new JsonRpcProvider(rpcUrl, 31_337)
  const [owner, newOwner, attester, stranger] = await Promise.all([
    provider.getSigner(0),
    provider.getSigner(1),
    provider.getSigner(2),
    provider.getSigner(3),
  ])
  const [ownerAddress, newOwnerAddress, attesterAddress] = await Promise.all([
    owner.getAddress(),
    newOwner.getAddress(),
    attester.getAddress(),
  ])

  const factory = new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, owner)
  const registry = await factory.deploy()
  await registry.waitForDeployment()

  assert.equal(await registry.owner(), ownerAddress, "deployer should be owner")
  assert.equal(await registry.attester(ownerAddress), true, "deployer should start as attester")
  assert.equal(await registry.pendingOwner(), ZeroAddress, "pending owner should start empty")

  await expectRevert(
    () => registry.connect(stranger).setAttester(attesterAddress, true),
    "non-owner must not manage attesters",
  )

  await (await registry.transferOwnership(newOwnerAddress)).wait()
  assert.equal(await registry.owner(), ownerAddress, "ownership must not move before acceptance")
  assert.equal(await registry.pendingOwner(), newOwnerAddress, "pending owner should be recorded")
  await expectRevert(
    () => registry.connect(stranger).acceptOwnership(),
    "wrong wallet must not accept ownership",
  )
  await (await registry.connect(newOwner).acceptOwnership()).wait()
  assert.equal(await registry.owner(), newOwnerAddress, "accepted owner should take control")
  assert.equal(await registry.pendingOwner(), ZeroAddress, "pending owner should clear after acceptance")
  await expectRevert(
    () => registry.connect(owner).setAttester(attesterAddress, true),
    "old owner must lose administrative control",
  )

  await (await registry.connect(newOwner).setAttester(attesterAddress, true)).wait()
  const subject = "0x00000000000000000000000000000000000A11cE"
  const reference = "arclenz.xyz/ecosystem/example"
  await (await registry.connect(attester).attest(subject, 4, reference)).wait()
  const record = await registry.get(subject)
  assert.equal(Number(record[0]), 4, "attestation tier should be stored")
  assert.equal(record[2], false, "new attestation should not be revoked")
  assert.equal(record[3], reference, "attestation reference should be stored")
  assert.equal(await registry.isVerified(subject), true, "tier four should be verified")

  await expectRevert(
    () => registry.connect(stranger).attest(subject, 4, "bad"),
    "unauthorized wallet must not attest",
  )
  await expectRevert(
    () => registry.connect(attester).attest(subject, 7, "bad tier"),
    "tier above six must be rejected",
  )
  await expectRevert(
    () => registry.connect(attester).attest(ZeroAddress, 1, "zero"),
    "zero subject must be rejected",
  )

  await (await registry.connect(attester).revoke(subject)).wait()
  assert.equal(await registry.isVerified(subject), false, "revoked subject must not remain verified")
  await expectRevert(
    () => registry.connect(stranger).revoke(subject),
    "unauthorized wallet must not revoke",
  )

  console.log("ArcLensRegistry: all ownership, authorization, attestation, and revocation tests passed.")
} finally {
  anvil.kill()
  provider?.destroy()
}
