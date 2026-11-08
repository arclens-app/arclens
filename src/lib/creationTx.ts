import { ethers } from "ethers"
import { ARC_RPC_HTTP } from "@/lib/constants"

export const TX_HASH_RE = /^0x[0-9a-f]{64}$/

// Proves who deployed a contract from its deployment transaction, read over the
// Arc RPC. The receipt must show this exact contract being created; the sender
// of that transaction is the deployer. Used when the explorer can't be reached.
// Factory deployments (contract created inside another call) return null here.
export async function deployerFromCreationTx(contract: string, txHash: string | null | undefined): Promise<string | null> {
  const hash = String(txHash || "").trim().toLowerCase()
  if (!TX_HASH_RE.test(hash)) return null
  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC_HTTP)
    const receipt = await provider.getTransactionReceipt(hash)
    if (!receipt || receipt.status !== 1 || !receipt.contractAddress) return null
    if (receipt.contractAddress.toLowerCase() !== contract.toLowerCase()) return null
    return receipt.from.toLowerCase()
  } catch {
    return null
  }
}
