import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { useChainId, usePublicClient, useReadContract } from "wagmi";
import { machineWalletManagerAbi } from "../lib/abi";
import { contractAddressFor, deploymentBlockFor } from "../lib/contract";
import { loadHashes, scanPaymentHashes, type PaymentRef } from "../lib/logs";
import { labelForKey } from "../lib/machines";
import type { PaymentStatus } from "./usePayment";

/// One line of the machine's history. `onChain` entries were read back from
/// Monad; the others are what this dashboard asked for or was refused, which is
/// worth showing but is not blockchain state — the UI labels the difference.
export type TimelineEntry = {
  id: string;
  kind: "settled" | "requested" | "blocked";
  /// Written for someone who has never used an explorer.
  text: string;
  detail?: string;
  amount?: bigint;
  /// Unix seconds.
  timestamp: number;
  hash?: `0x${string}`;
  blockNumber?: bigint;
  initiator?: string;
  onChain: boolean;
};

const mon = (v: bigint) => formatEther(v);

/// The on-chain payment log. Storage is the source of truth (so a page reload
/// keeps the history), and the event log supplies the one thing storage cannot:
/// the transaction hash each payment settled in.
export function useActivity(limit = 12, payment?: PaymentStatus) {
  const chainId = useChainId();
  const contractAddress = contractAddressFor(chainId);
  const publicClient = usePublicClient();

  const query = useReadContract({
    address: contractAddress ?? undefined,
    abi: machineWalletManagerAbi,
    functionName: "getRecentPayments",
    args: [BigInt(limit)],
    query: {
      enabled: Boolean(contractAddress),
      refetchInterval: 6000,
    },
  });

  const total = useReadContract({
    address: contractAddress ?? undefined,
    abi: machineWalletManagerAbi,
    functionName: "paymentCount",
    args: [],
    query: { enabled: Boolean(contractAddress), refetchInterval: 6000 },
  });

  /// paymentIndex → transaction hash. Storage cannot hold the hash a payment
  /// settled in, so it comes from PaymentExecuted logs — read in small windows
  /// walking back from the head, plus a local cache of hashes already seen. A
  /// single deployment-block-to-latest sweep is what Monad's public RPC answers
  /// with HTTP 413, and it is not needed: the demo's own payments record their
  /// hash straight from the receipt.
  const settledIndices = useMemo(() => {
    const count = total.data ?? 0n;
    const rows = query.data?.length ?? 0;
    return Array.from({ length: rows }, (_, i) => String(count - 1n - BigInt(i))).filter(
      (index) => !index.startsWith("-"),
    );
  }, [query.data, total.data]);

  const hashes = useQuery({
    queryKey: ["payment-log", chainId, contractAddress, settledIndices.join(",")],
    enabled: Boolean(publicClient && contractAddress),
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<Map<string, PaymentRef>> => {
      if (!publicClient || !contractAddress) return new Map<string, PaymentRef>();
      if (settledIndices.length === 0) return loadHashes(chainId, contractAddress);
      return scanPaymentHashes({
        client: publicClient,
        chainId,
        address: contractAddress,
        fromBlock: deploymentBlockFor(chainId),
        needed: settledIndices,
      });
    },
  });

  const refetch = useCallback(() => {
    void query.refetch();
    void total.refetch();
    void hashes.refetch();
  }, [query.refetch, total.refetch, hashes.refetch]);

  // No event subscription: with an HTTP transport that means a filter or a log
  // poll, which is the request Monad's RPC refuses. `paymentCount` above is a
  // plain eth_call on a 6s interval and detects a new payment just as well.

  const settled = useMemo<TimelineEntry[]>(() => {
    const rows = query.data ?? [];
    const count = total.data ?? BigInt(rows.length);
    const byIndex = hashes.data;
    return rows.map((row, i) => {
      // getRecentPayments returns newest first, so walk the global index down.
      const globalIndex = count - 1n - BigInt(i);
      const log = byIndex?.get(String(globalIndex));
      const fromId = labelForKey(row.fromKey);
      const toId = labelForKey(row.toKey);
      return {
        id: `settled-${globalIndex}`,
        kind: "settled" as const,
        text: `${fromId} paid ${toId} ${mon(row.amount)} MON`,
        detail: "Settled on chain",
        amount: row.amount,
        timestamp: Number(row.timestamp),
        hash: log?.hash,
        blockNumber: log?.blockNumber,
        initiator: row.initiator,
        onChain: true,
      };
    });
  }, [query.data, total.data, hashes.data]);

  /// Requests and refusals. A refused payment never becomes contract state — if
  /// it were not recorded here it would leave no trace at all, and the whole
  /// point of the demo is that the refusal is visible.
  const [local, setLocal] = useState<TimelineEntry[]>([]);
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!payment?.intent) return;
    const { phase, intent, rejection, hash, blockNumber, provenOnChain } = payment;
    const key = `${phase}:${intent.from}:${intent.to}:${intent.amount}:${hash ?? ""}`;
    if (key === lastKey.current) return;

    const now = Math.floor(Date.now() / 1000);
    if (phase === "checking") {
      lastKey.current = key;
      setLocal((prev) => [
        {
          id: `req-${now}-${intent.from}-${intent.amount}`,
          kind: "requested",
          text: `${intent.from} requested ${mon(intent.amount)} MON to ${intent.to}`,
          detail: intent.label,
          amount: intent.amount,
          timestamp: now,
          onChain: false,
        },
        ...prev,
      ]);
      return;
    }
    if (phase === "blocked" && rejection) {
      lastKey.current = key;
      // Only the contract's own verdict is a refusal. An RPC or wallet failure
      // means no verdict was ever reached, and writing "BLOCKED" for one would
      // claim the policy did something it did not do.
      if (!rejection.fromContract) {
        setLocal((prev) => [
          {
            id: `err-${now}-${intent.from}-${intent.amount}`,
            kind: "requested",
            text: `${intent.from} → ${intent.to} ${mon(intent.amount)} MON not sent`,
            detail: `${rejection.headline} — not a policy decision`,
            amount: intent.amount,
            timestamp: now,
            onChain: false,
          },
          ...prev,
        ]);
        return;
      }
      const allowed = rejection.allowed;
      setLocal((prev) => [
        {
          id: `blk-${now}-${intent.from}-${intent.amount}`,
          kind: "blocked",
          text: `${intent.from} attempted ${mon(intent.amount)} MON — BLOCKED`,
          detail:
            allowed !== undefined
              ? `${rejection.reason} — allowed ${mon(allowed)} MON`
              : rejection.reason,
          amount: intent.amount,
          timestamp: now,
          hash: provenOnChain ? hash : undefined,
          blockNumber: provenOnChain ? blockNumber : undefined,
          onChain: Boolean(provenOnChain),
        },
        ...prev,
      ]);
    }
  }, [payment]);

  const entries = useMemo<TimelineEntry[]>(
    () =>
      [...local, ...settled]
        // Newest first. Local events carry wall-clock time and chain events carry
        // block time, which can differ by a second or two — close enough to sort.
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit),
    [local, settled, limit],
  );

  const clearLocal = useCallback(() => setLocal([]), []);

  return {
    entries,
    settledCount: Number(total.data ?? 0n),
    isLoading: query.isLoading,
    refetch,
    clearLocal,
  };
}
