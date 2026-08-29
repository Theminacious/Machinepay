import type { Address } from "viem";
import deployments from "./deployments.json";
import { machineWalletManagerAbi } from "./abi";

type DeploymentRecord = {
  address: string;
  deployer?: string;
  network?: string;
  /// Block the contract was deployed in. Log queries start here: public RPCs
  /// refuse a range that reaches back to genesis.
  blockNumber?: number;
  deployedAt?: string;
};

const records = deployments as Record<string, DeploymentRecord>;

/// VITE_CONTRACT_ADDRESS wins; otherwise we use whatever the deploy script
/// recorded for this chain, so a fresh deploy needs no frontend edits.
const override = import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined;

export function contractAddressFor(chainId: number | undefined): Address | null {
  if (override && override.startsWith("0x")) return override as Address;
  if (chainId === undefined) return null;
  const record = records[String(chainId)];
  return record?.address ? (record.address as Address) : null;
}

export function deploymentInfoFor(chainId: number | undefined): DeploymentRecord | null {
  if (chainId === undefined) return null;
  return records[String(chainId)] ?? null;
}

/// Where to start scanning for PaymentExecuted logs. Falls back to 0n only on
/// the local chain, where the whole history is a handful of blocks.
export function deploymentBlockFor(chainId: number | undefined): bigint {
  const recorded = deploymentInfoFor(chainId)?.blockNumber;
  if (typeof recorded === "number" && Number.isFinite(recorded)) return BigInt(recorded);
  const configured = import.meta.env.VITE_DEPLOYMENT_BLOCK as string | undefined;
  if (configured && /^\d+$/.test(configured)) return BigInt(configured);
  return 0n;
}

export { machineWalletManagerAbi };
