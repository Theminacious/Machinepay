import { useCallback, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { machineWalletManagerAbi } from "../lib/abi";
import { contractAddressFor } from "../lib/contract";
import { toRejection, type Rejection } from "../lib/errors";
import { FLEET } from "../lib/machines";
import type { MachineState } from "./useFleet";

export type SetupPhase = "idle" | "running" | "done" | "failed";

export type SetupStatus = {
  phase: SetupPhase;
  /// Human-readable step, e.g. "Registering Charger-007 (2 of 3)".
  step?: string;
  hash?: `0x${string}`;
  rejection?: Rejection;
};

/// Total MON the wallet needs to seed every machine that is not yet registered.
export function seedCostFor(machines: MachineState[]): bigint {
  return machines
    .filter((m) => !m.registered)
    .reduce((sum, m) => sum + parseEther(m.spec.seed), 0n);
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/// Registration and policy changes, driven from the browser so that whoever
/// connects becomes the fleet operator — no private key to import before a demo.
export function useSetup(onSettled?: () => void) {
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [status, setStatus] = useState<SetupStatus>({ phase: "idle" });

  const reset = useCallback(() => setStatus({ phase: "idle" }), []);

  const ready = Boolean(publicClient && walletClient && address && contractAddressFor(chainId));

  /// Sends one transaction and waits for it, reporting progress through `step`.
  const send = useCallback(
    async (step: string, run: (ctx: NonNullable<typeof walletClient>) => Promise<`0x${string}`>) => {
      if (!publicClient || !walletClient || !address) {
        throw new Error("Connect a wallet first");
      }
      setStatus({ phase: "running", step });
      const hash = await run(walletClient);
      setStatus({ phase: "running", step, hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw new Error(`${step} reverted on chain`);
      return hash;
    },
    [address, publicClient, walletClient],
  );

  /// Registers every machine that does not exist yet, seeding each with MON.
  const registerFleet = useCallback(
    async (machines: MachineState[]) => {
      const contractAddress = contractAddressFor(chainId);
      if (!contractAddress) {
        setStatus({
          phase: "failed",
          rejection: {
            kind: "state",
            headline: "No contract",
            reason: "MachinePay is not deployed on this network",
            raw: "missing deployment",
          },
        });
        return;
      }

      const pending = machines.filter((m) => !m.registered);
      if (pending.length === 0) {
        setStatus({ phase: "done", step: "Fleet already registered" });
        return;
      }

      try {
        for (const [i, machine] of pending.entries()) {
          const spec = machine.spec;
          // One transaction per machine carries its whole policy: identity, seed
          // funding, per-payment limit, daily budget and allowlist. Creating and
          // then configuring would mean eight wallet prompts instead of three.
          await send(`Registering ${spec.id} (${i + 1} of ${pending.length})`, (client) =>
            client.writeContract({
              address: contractAddress,
              abi: machineWalletManagerAbi,
              functionName: "createMachineWithPolicy",
              args: [
                spec.id,
                spec.kind,
                ZERO_ADDRESS,
                parseEther(spec.limit),
                parseEther(spec.daily),
                spec.allowed,
              ],
              value: parseEther(spec.seed),
              chain: client.chain,
              account: client.account,
            }),
          );
        }
        setStatus({ phase: "done", step: `${pending.length} machine identities live` });
        onSettled?.();
      } catch (error) {
        setStatus({ phase: "failed", rejection: toRejection(error) });
      }
    },
    [chainId, onSettled, send],
  );

  const fund = useCallback(
    async (machineId: string, amountEther: string) => {
      const contractAddress = contractAddressFor(chainId);
      if (!contractAddress) return;
      try {
        await send(`Funding ${machineId}`, (client) =>
          client.writeContract({
            address: contractAddress,
            abi: machineWalletManagerAbi,
            functionName: "deposit",
            args: [machineId],
            value: parseEther(amountEther),
            chain: client.chain,
            account: client.account,
          }),
        );
        setStatus({ phase: "done", step: `${machineId} topped up with ${amountEther} MON` });
        onSettled?.();
      } catch (error) {
        setStatus({ phase: "failed", rejection: toRejection(error) });
      }
    },
    [chainId, onSettled, send],
  );

  const setLimit = useCallback(
    async (machineId: string, amountEther: string) => {
      const contractAddress = contractAddressFor(chainId);
      if (!contractAddress) return;
      try {
        await send(`Updating ${machineId} policy`, (client) =>
          client.writeContract({
            address: contractAddress,
            abi: machineWalletManagerAbi,
            functionName: "setSpendingLimit",
            args: [machineId, parseEther(amountEther)],
            chain: client.chain,
            account: client.account,
          }),
        );
        setStatus({ phase: "done", step: `${machineId} limit is now ${amountEther} MON` });
        onSettled?.();
      } catch (error) {
        setStatus({ phase: "failed", rejection: toRejection(error) });
      }
    },
    [chainId, onSettled, send],
  );

  /// Puts an already-registered fleet back into its judging state: seed
  /// balances, per-payment limits, daily caps, allowlist edges, nothing paused.
  ///
  /// Deliberately built from the functions that already exist — `withdraw` for a
  /// machine that is over its seed, `deposit` for one that is under, and the
  /// ordinary policy setters. A contract-side "reset balances" function would be
  /// an owner-controlled way to move another machine's money, which is exactly
  /// what the spending policies are supposed to prevent.
  const resetFleet = useCallback(
    async (machines: MachineState[]) => {
      const contractAddress = contractAddressFor(chainId);
      if (!contractAddress || !address) return;

      type Step = { label: string; run: (client: NonNullable<typeof walletClient>) => Promise<`0x${string}`> };
      const write = (fn: string, args: readonly unknown[], value?: bigint) => (client: NonNullable<typeof walletClient>) =>
        client.writeContract({
          address: contractAddress,
          abi: machineWalletManagerAbi,
          functionName: fn,
          args,
          ...(value !== undefined ? { value } : {}),
          chain: client.chain,
          account: client.account,
        } as never);

      const steps: Step[] = [];
      const skipped: string[] = [];

      for (const machine of machines) {
        const { spec } = machine;
        if (!machine.registered) continue;
        // Only the recorded operator can change a machine, so a fleet registered
        // by someone else is reported rather than attempted and reverted.
        if (machine.owner.toLowerCase() !== address.toLowerCase()) {
          skipped.push(spec.id);
          continue;
        }

        const limit = parseEther(spec.limit);
        if (machine.spendingLimit !== limit) {
          steps.push({ label: `${spec.id} limit → ${spec.limit} MON`, run: write("setSpendingLimit", [spec.id, limit]) });
        }
        const daily = parseEther(spec.daily);
        if (machine.dailyLimit !== daily) {
          steps.push({ label: `${spec.id} daily cap → ${spec.daily} MON`, run: write("setDailyLimit", [spec.id, daily]) });
        }
        for (const counterparty of spec.allowed) {
          if (!machine.canPay.includes(counterparty)) {
            steps.push({
              label: `${spec.id} may pay ${counterparty}`,
              run: write("setCounterpartyAllowed", [spec.id, counterparty, true]),
            });
          }
        }
        const wantAllowlist = spec.allowed.length > 0;
        if (machine.allowlistEnabled !== wantAllowlist) {
          steps.push({
            label: `${spec.id} allowlist ${wantAllowlist ? "on" : "off"}`,
            run: write("setAllowlistEnabled", [spec.id, wantAllowlist]),
          });
        }
        if (!machine.active) {
          steps.push({ label: `${spec.id} resumed`, run: write("unpauseMachine", [spec.id]) });
        }

        const seed = parseEther(spec.seed);
        if (machine.balance > seed) {
          const excess = machine.balance - seed;
          steps.push({
            label: `${spec.id} returns ${formatEther(excess)} MON`,
            run: write("withdraw", [spec.id, address, excess]),
          });
        } else if (machine.balance < seed) {
          const shortfall = seed - machine.balance;
          steps.push({
            label: `${spec.id} funded +${formatEther(shortfall)} MON`,
            run: write("deposit", [spec.id], shortfall),
          });
        }
      }

      if (steps.length === 0) {
        setStatus({
          phase: "done",
          step: skipped.length > 0 ? `Nothing to reset — ${skipped.join(", ")} belongs to another operator` : "Already in demo state",
        });
        return;
      }

      try {
        for (const [i, step] of steps.entries()) {
          await send(`${step.label} (${i + 1} of ${steps.length})`, step.run);
        }
        setStatus({ phase: "done", step: `Fleet reset — ${steps.length} ${steps.length === 1 ? "change" : "changes"} on chain` });
        onSettled?.();
      } catch (error) {
        setStatus({ phase: "failed", rejection: toRejection(error) });
      }
    },
    [address, chainId, onSettled, send, walletClient],
  );

  /// True when anything about the fleet differs from its judging state, so the
  /// reset button can say whether pressing it would do something.
  const needsReset = useCallback(
    (machines: MachineState[]) =>
      machines.some(
        (m) =>
          m.registered &&
          m.owner.toLowerCase() === address?.toLowerCase() &&
          (m.balance !== parseEther(m.spec.seed) ||
            m.spendingLimit !== parseEther(m.spec.limit) ||
            m.dailyLimit !== parseEther(m.spec.daily) ||
            !m.active ||
            m.allowlistEnabled !== (m.spec.allowed.length > 0) ||
            m.spec.allowed.some((id) => !m.canPay.includes(id))),
      ),
    [address],
  );

  const setPaused = useCallback(
    async (machineId: string, paused: boolean) => {
      const contractAddress = contractAddressFor(chainId);
      if (!contractAddress) return;
      try {
        await send(`${paused ? "Pausing" : "Resuming"} ${machineId}`, (client) =>
          client.writeContract({
            address: contractAddress,
            abi: machineWalletManagerAbi,
            functionName: paused ? "pauseMachine" : "unpauseMachine",
            args: [machineId],
            chain: client.chain,
            account: client.account,
          }),
        );
        setStatus({ phase: "done", step: `${machineId} ${paused ? "paused" : "active"}` });
        onSettled?.();
      } catch (error) {
        setStatus({ phase: "failed", rejection: toRejection(error) });
      }
    },
    [chainId, onSettled, send],
  );

  return { status, ready, registerFleet, resetFleet, needsReset, fund, setLimit, setPaused, reset, fleetSpecs: FLEET };
}
