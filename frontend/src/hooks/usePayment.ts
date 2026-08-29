import { useCallback, useState } from "react";
import { parseEventLogs } from "viem";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { machineWalletManagerAbi } from "../lib/abi";
import { contractAddressFor } from "../lib/contract";
import { rememberHash } from "../lib/logs";
import { toRejection, type Rejection } from "../lib/errors";

export type PaymentPhase =
  | "idle"
  /// Asking the contract whether this payment is permitted (eth_call).
  | "checking"
  | "signing"
  | "pending"
  | "confirmed"
  | "blocked"
  | "failed";

export type PaymentIntent = {
  from: string;
  to: string;
  amount: bigint;
  /// What this payment means in the product: "Charging session", "Energy settlement".
  label: string;
};

export type PaymentStatus = {
  phase: PaymentPhase;
  intent?: PaymentIntent;
  hash?: `0x${string}`;
  blockNumber?: bigint;
  rejection?: Rejection;
  /// Set when a rejection was proven by submitting the transaction anyway and
  /// watching it revert on chain, rather than by simulating it.
  provenOnChain?: boolean;
  /// Set when the pre-flight check could not run — an RPC failure, not a policy
  /// decision. The payment still goes to the wallet, because the contract is the
  /// enforcement point and does not depend on this check having succeeded.
  preflightSkipped?: Rejection;
};

export type PayOptions = {
  /// Skip the pre-flight simulateContract() check. Used by Auto-Pilot so that
  /// writeContract() is reached without any async RPC awaits before it —
  /// browsers revoke the user-gesture token across async boundaries, which
  /// prevents MetaMask from opening its popup window.
  skipPreflight?: boolean;
  /// Skip the pre-flight AND supply a manual gas cap so the transaction is
  /// sent even when the contract will revert it. Used by "prove refusal on
  /// chain" only — never set this from the Auto-Pilot loop.
  force?: boolean;
  onConfirmed?: () => void;
};

const FORCE_GAS = 300_000n;

export function usePayment() {
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [status, setStatus] = useState<PaymentStatus>({ phase: "idle" });

  const reset = useCallback(() => setStatus({ phase: "idle" }), []);

  const pay = useCallback(
    async (intent: PaymentIntent, options: PayOptions = {}) => {
      const contractAddress = contractAddressFor(chainId);
      if (!publicClient || !walletClient || !address || !contractAddress) {
        setStatus({
          phase: "failed",
          intent,
          rejection: {
            kind: "state",
            headline: "Not ready",
            reason: !address ? "Connect a wallet first" : "No MachinePay contract on this network",
            raw: "missing client, account or contract address",
          },
        });
        return;
      }

      const args = [intent.from, intent.to, intent.amount] as const;
      const call = {
        address: contractAddress,
        abi: machineWalletManagerAbi,
        functionName: "payMachine",
        args,
        account: address,
      } as const;

      // Pre-flight: the contract evaluates the policy against live state. A
      // rejection here is the contract's decision, not a frontend guess — and
      // it means we never ask anyone to sign a payment that cannot succeed.
      // Skipped when skipPreflight or force is set: the async RPC await would
      // revoke the browser's user-gesture token and prevent MetaMask from
      // opening its popup.
      let preflightSkipped: Rejection | undefined;
      if (!options.force && !options.skipPreflight) {
        setStatus({ phase: "checking", intent });
        try {
          await publicClient.simulateContract(call);
        } catch (error) {
          const rejection = toRejection(error);
          // Only a decoded revert is the contract refusing. If the endpoint was
          // unreachable or turned the request away, we have no verdict — and
          // reporting one would put a policy refusal on screen that never
          // happened. Carry on to the wallet instead: the contract enforces the
          // policy whether or not this check managed to run.
          if (rejection.fromContract) {
            setStatus({ phase: "blocked", intent, rejection });
            return;
          }
          if (rejection.kind === "user-rejected") {
            setStatus({ phase: "idle" });
            return;
          }
          preflightSkipped = rejection;
        }
      }

      setStatus({ phase: "signing", intent, preflightSkipped });
      let hash: `0x${string}`;
      try {
        hash = await walletClient.writeContract({
          ...call,
          chain: walletClient.chain,
          gas: 300_000n,
        });
      } catch (error) {
        const rejection = toRejection(error);
        // "blocked" is reserved for the contract's own verdict; a wallet or RPC
        // failure is a failure to send, which reads very differently on screen.
        const phase = rejection.kind === "user-rejected" ? "idle" : rejection.fromContract ? "blocked" : "failed";
        setStatus({ phase, intent, rejection, preflightSkipped });
        return;
      }

      setStatus({ phase: "pending", intent, hash, preflightSkipped });
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") {
          // Only reachable via force: the transaction is on chain and reverted.
          // Re-run the call against the parent block to recover the custom
          // error and its arguments for display.
          let rejection: Rejection = {
            kind: "unknown",
            headline: "Transaction reverted",
            reason: "The network rejected the payment",
            raw: "reverted on chain",
          };
          try {
            await publicClient.simulateContract({ ...call, blockNumber: receipt.blockNumber - 1n });
          } catch (error) {
            rejection = toRejection(error);
          }
          setStatus({
            phase: "blocked",
            intent,
            hash,
            blockNumber: receipt.blockNumber,
            provenOnChain: true,
            rejection,
            preflightSkipped,
          });
          return;
        }
        // The receipt already carries the PaymentExecuted log, so the timeline
        // gets this payment's index → hash mapping for free. That is what keeps
        // the demo's explorer links working without scanning history over RPC.
        try {
          const events = parseEventLogs({
            abi: machineWalletManagerAbi,
            eventName: "PaymentExecuted",
            logs: receipt.logs,
          });
          const paymentIndex = events[0]?.args?.paymentIndex;
          if (paymentIndex !== undefined) {
            rememberHash(chainId, contractAddress, paymentIndex, { hash, blockNumber: receipt.blockNumber });
          }
        } catch {
          // Only costs an explorer link on this one row.
        }
        setStatus({ phase: "confirmed", intent, hash, blockNumber: receipt.blockNumber, preflightSkipped });
        options.onConfirmed?.();
      } catch (error) {
        setStatus({ phase: "failed", intent, hash, rejection: toRejection(error), preflightSkipped });
      }
    },
    [address, chainId, publicClient, walletClient],
  );

  return { status, pay, reset };
}
