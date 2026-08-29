import { useCallback, useMemo } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import type { Address } from "viem";
import { machineWalletManagerAbi } from "../lib/abi";
import { contractAddressFor } from "../lib/contract";
import { FLEET, type MachineSpec } from "../lib/machines";

export type MachineState = {
  spec: MachineSpec;
  registered: boolean;
  owner: Address;
  controller: Address;
  balance: bigint;
  spendingLimit: bigint;
  /// Rolling budget per UTC day, straight from the contract. 0n means no cap.
  dailyLimit: bigint;
  /// Already spent inside the contract's current day.
  spentToday: bigint;
  /// dailyLimit - spentToday, or null when the machine has no cap.
  remainingToday: bigint | null;
  totalSpent: bigint;
  totalReceived: bigint;
  active: boolean;
  allowlistEnabled: boolean;
  /// Machine ids this one may pay, as the contract's allowlist has them.
  /// Empty with `allowlistEnabled` false means "any machine in the fleet".
  canPay: string[];
  /// Machine ids allowed to pay this one — the other side of the same matrix.
  canReceiveFrom: string[];
  /// True when the connected wallet may initiate payments for this machine.
  controllable: boolean;
};

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const IDS = FLEET.map((m) => m.id);

/// Reads the whole fleet in a single call and re-polls on an interval, so
/// balances stay live without wiring a subscription per machine.
export function useFleet() {
  const chainId = useChainId();
  const { address } = useAccount();
  const contractAddress = contractAddressFor(chainId);

  const query = useReadContract({
    address: contractAddress ?? undefined,
    abi: machineWalletManagerAbi,
    functionName: "getMachinesByIds",
    args: [IDS],
    query: {
      enabled: Boolean(contractAddress),
      refetchInterval: 4000,
      refetchOnWindowFocus: true,
    },
  });

  /// One flattened bool[] where `i * n + j` is "IDS[i] may pay IDS[j]". Policy
  /// edges only change during setup, so this polls far more slowly than balances.
  const matrix = useReadContract({
    address: contractAddress ?? undefined,
    abi: machineWalletManagerAbi,
    functionName: "counterpartyMatrix",
    args: [IDS],
    query: {
      enabled: Boolean(contractAddress),
      refetchInterval: 20000,
    },
  });

  const machines = useMemo<MachineState[]>(() => {
    const rows = query.data;
    const flags = matrix.data;
    const n = FLEET.length;
    /// Who may actually pay whom. The matrix holds raw allowlist edges, but an
    /// edge only constrains a machine whose allowlist is switched on — with it
    /// off the contract lets that machine pay anyone. Reading the raw edges
    /// alone would show a restriction the contract does not enforce.
    const mayPay = (from: number, to: number): boolean => {
      if (from === to) return false;
      if (!rows?.[from]?.exists || !rows?.[to]?.exists) return false;
      if (!rows[from].allowlistEnabled) return true;
      return Boolean(flags?.[from * n + to]);
    };
    return FLEET.map((spec, index) => {
      const row = rows?.[index];
      const registered = Boolean(row?.exists);
      const owner = (row?.owner ?? ZERO) as Address;
      const controller = (row?.controller ?? ZERO) as Address;
      const dailyLimit = row?.dailyLimit ?? 0n;
      const spentToday = row?.spentToday ?? 0n;
      return {
        spec,
        registered,
        owner,
        controller,
        balance: row?.balance ?? 0n,
        spendingLimit: row?.spendingLimit ?? 0n,
        dailyLimit,
        spentToday,
        // The contract clamps at zero when an owner lowers the cap mid-day; do
        // the same here rather than showing a negative budget.
        remainingToday: dailyLimit === 0n ? null : spentToday >= dailyLimit ? 0n : dailyLimit - spentToday,
        totalSpent: row?.totalSpent ?? 0n,
        totalReceived: row?.totalReceived ?? 0n,
        active: row?.active ?? false,
        allowlistEnabled: row?.allowlistEnabled ?? false,
        canPay: flags && rows ? IDS.filter((_, j) => mayPay(index, j)) : spec.allowed,
        canReceiveFrom: flags && rows ? IDS.filter((_, i) => mayPay(i, index)) : [],
        controllable:
          registered &&
          Boolean(address) &&
          (owner.toLowerCase() === address?.toLowerCase() || controller.toLowerCase() === address?.toLowerCase()),
      };
    });
  }, [query.data, matrix.data, address]);

  const allRegistered = machines.every((m) => m.registered);
  const anyRegistered = machines.some((m) => m.registered);

  const refetch = useCallback(() => {
    void query.refetch();
    void matrix.refetch();
  }, [query.refetch, matrix.refetch]);

  return {
    machines,
    byId: useMemo(() => new Map(machines.map((m) => [m.spec.id, m])), [machines]),
    allRegistered,
    anyRegistered,
    contractAddress,
    isLoading: query.isLoading,
    error: query.error,
    refetch,
  };
}
