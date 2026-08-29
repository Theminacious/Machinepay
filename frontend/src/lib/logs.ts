import type { Address, PublicClient } from "viem";
import { machineWalletManagerAbi } from "./abi";

export type PaymentRef = { hash: `0x${string}`; blockNumber: bigint };

/// Monad's public RPC refuses a wide `eth_getLogs` window outright — HTTP 413,
/// "content too large" — and its sub-second blocks mean a
/// deployment-block-to-`latest` sweep is already tens of thousands of blocks an
/// hour after deploying. So the payment log is read in small windows walking
/// back from the head, never in one request, and never more than a fixed number
/// of windows per refresh. A local Hardhat chain has no such limit and only a
/// handful of blocks, so it gets a window wide enough to cover its whole history.
const CHUNK_BLOCKS: Record<number, bigint> = {
  10143: 100n,
  31337: 50_000n,
};
const DEFAULT_CHUNK = 100n;

/// Bounded work per refresh, so the cost of a poll never grows with the age of
/// the deployment. 8 × 100 blocks is roughly the last few minutes on Monad —
/// enough to pick up a payment made during a demo, and anything older is
/// already in the cache below.
const MAX_CHUNKS = 8;

const chunkFor = (chainId: number | undefined): bigint =>
  (chainId !== undefined ? CHUNK_BLOCKS[chainId] : undefined) ?? DEFAULT_CHUNK;

const cacheKey = (chainId: number | undefined, address: Address) =>
  `machinepay:paylog:${chainId ?? "unknown"}:${address.toLowerCase()}`;

/// Hashes survive a reload, which matters because the window above deliberately
/// does not reach back to the deployment block. Storage still holds every
/// payment record; this cache only holds the transaction hash each one settled
/// in, which contract storage cannot know.
export function loadHashes(chainId: number | undefined, address: Address): Map<string, PaymentRef> {
  const map = new Map<string, PaymentRef>();
  try {
    const raw = localStorage.getItem(cacheKey(chainId, address));
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, { hash: string; blockNumber: string }>;
    for (const [index, ref] of Object.entries(parsed)) {
      if (typeof ref?.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(ref.hash)) continue;
      map.set(index, { hash: ref.hash as `0x${string}`, blockNumber: BigInt(ref.blockNumber ?? "0") });
    }
  } catch {
    // A corrupt or unavailable cache is not worth failing over — the timeline
    // renders from contract storage either way, just without explorer links.
  }
  return map;
}

function saveHashes(chainId: number | undefined, address: Address, map: Map<string, PaymentRef>): void {
  try {
    const out: Record<string, { hash: string; blockNumber: string }> = {};
    for (const [index, ref] of map) out[index] = { hash: ref.hash, blockNumber: ref.blockNumber.toString() };
    localStorage.setItem(cacheKey(chainId, address), JSON.stringify(out));
  } catch {
    // Private browsing, quota, or no localStorage at all. Non-fatal.
  }
}

/// Records a hash learned without any RPC call — from the receipt of a payment
/// this dashboard just submitted, which is where the demo's own links come from.
export function rememberHash(
  chainId: number | undefined,
  address: Address,
  paymentIndex: bigint,
  ref: PaymentRef,
): void {
  const map = loadHashes(chainId, address);
  map.set(String(paymentIndex), ref);
  saveHashes(chainId, address, map);
}

/// Best-effort backfill for payments this dashboard did not submit itself.
/// Returns everything known, cache included; a refused window ends the scan
/// rather than failing, because an explorer link is a nicety and the payment
/// record itself always comes from contract storage.
export async function scanPaymentHashes(opts: {
  client: PublicClient;
  chainId: number | undefined;
  address: Address;
  /// Block the contract was deployed in — the scan never reads below it.
  fromBlock: bigint;
  /// Payment indices, as strings, that the timeline still lacks a hash for.
  needed: string[];
}): Promise<Map<string, PaymentRef>> {
  const { client, chainId, address, fromBlock, needed } = opts;
  const known = loadHashes(chainId, address);
  const missing = new Set(needed.filter((index) => !known.has(index)));
  if (missing.size === 0) return known;

  const chunk = chunkFor(chainId);
  let to: bigint;
  try {
    to = await client.getBlockNumber();
  } catch {
    return known;
  }

  for (let i = 0; i < MAX_CHUNKS && missing.size > 0 && to >= fromBlock; i++) {
    const candidate = to - chunk + 1n;
    const from = candidate > fromBlock ? candidate : fromBlock;
    try {
      const logs = await client.getContractEvents({
        address,
        abi: machineWalletManagerAbi,
        eventName: "PaymentExecuted",
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const index = log.args?.paymentIndex;
        if (index === undefined || !log.transactionHash) continue;
        const key = String(index);
        known.set(key, { hash: log.transactionHash, blockNumber: log.blockNumber ?? 0n });
        missing.delete(key);
      }
    } catch {
      break;
    }
    if (from === fromBlock) break;
    to = from - 1n;
  }

  saveHashes(chainId, address, known);
  return known;
}
