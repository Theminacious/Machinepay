import { formatEther } from "viem";

/// MON amounts, trimmed so 0.5 reads as "0.5" and not "0.500000000000000000",
/// but never rounded so hard that a balance looks wrong.
export function formatMon(value: bigint | undefined, maxDecimals = 4): string {
  if (value === undefined) return "—";
  const raw = formatEther(value);
  if (!raw.includes(".")) return raw;
  const [whole, decimals] = raw.split(".");
  const trimmed = decimals.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

export function shortAddress(address: string | undefined): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash: string | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export function relativeTime(timestampSeconds: bigint | number): string {
  const then = Number(timestampSeconds) * 1000;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
