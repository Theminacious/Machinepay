import { formatEther, parseEther } from "viem";
import type { MachineState } from "../hooks/useFleet";
import { seedCostFor, type SetupStatus } from "../hooks/useSetup";
import { explorerAddressUrl, explorerName } from "../lib/chain";
import { formatMon, shortAddress } from "../lib/format";
import { LinkIcon, SpinnerIcon } from "./Icons";

type Props = {
  machines: MachineState[];
  contractAddress: string | null;
  chainId: number | undefined;
  walletBalance: bigint | undefined;
  isConnected: boolean;
  status: SetupStatus;
  /// True when the fleet has drifted from its judging state.
  needsReset: boolean;
  onRegister: () => void;
  onReset: () => void;
  onFund: (machineId: string, amountEther: string) => void;
};

const TOP_UP = "0.5";

export function SetupPanel({
  machines,
  contractAddress,
  chainId,
  walletBalance,
  isConnected,
  status,
  needsReset,
  onRegister,
  onReset,
  onFund,
}: Props) {
  const pending = machines.filter((m) => !m.registered);
  const seedCost = seedCostFor(machines);
  const explorer = contractAddress ? explorerAddressUrl(chainId, contractAddress) : null;
  const running = status.phase === "running";
  const canAfford = walletBalance === undefined || walletBalance >= seedCost;

  return (
    <section className="panel p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">Demo mode</h2>
          <p className="text-xs text-ink-400">
            Three simulated machine controllers, real identities on chain.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.7rem] ${
            pending.length === 0
              ? "border-mint-500/30 bg-mint-900/40 text-mint-300"
              : "border-amber-glow/30 bg-amber-glow/10 text-amber-glow"
          }`}
        >
          {pending.length === 0 ? "fleet live" : `${pending.length} to register`}
        </span>
      </div>

      <dl className="mt-4 space-y-2 border-t border-ink-700/70 pt-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-400">Contract</dt>
          <dd className="tabular flex items-center gap-2 text-ink-200">
            {contractAddress ? shortAddress(contractAddress) : "not deployed here"}
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded text-mint-300 transition hover:text-mint-200"
                aria-label={`View contract on ${explorerName(chainId)}`}
              >
                <LinkIcon className="h-3 w-3" />
              </a>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-400">Your balance</dt>
          <dd className="tabular text-ink-200">{formatMon(walletBalance, 3)} MON</dd>
        </div>
        {pending.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-400">Needed to seed</dt>
            <dd className={`tabular ${canAfford ? "text-ink-200" : "text-rose-alert"}`}>
              {formatEther(seedCost)} MON
            </dd>
          </div>
        )}
      </dl>

      {pending.length > 0 ? (
        <button
          type="button"
          onClick={onRegister}
          disabled={!isConnected || !contractAddress || running}
          className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-mint-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-mint-400 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {running && <SpinnerIcon className="h-4 w-4" />}
          {running ? "Registering…" : `Initialise ${pending.length} machine ${pending.length === 1 ? "identity" : "identities"}`}
        </button>
      ) : (
        <div className="mt-4 space-y-1.5">
          {machines.map((machine) => (
            <div key={machine.spec.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-ink-300">{machine.spec.id}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular text-ink-200">{formatMon(machine.balance, 3)} MON</span>
                <button
                  type="button"
                  onClick={() => onFund(machine.spec.id, TOP_UP)}
                  disabled={running || !machine.active}
                  className="focus-ring rounded-md border border-ink-600 px-2 py-0.5 text-[0.7rem] text-ink-300 transition hover:border-ink-400 hover:text-ink-100 disabled:opacity-40"
                >
                  +{TOP_UP}
                </button>
              </span>
            </div>
          ))}

          {/* Judging always starts from the same numbers: this puts every
              balance back to its seed and every rule back to its default,
              using the same owner-only functions an operator would. */}
          <button
            type="button"
            onClick={onReset}
            disabled={!isConnected || running || !needsReset}
            className="focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-ink-600 px-4 py-2 text-xs font-medium text-ink-200 transition hover:border-mint-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running && <SpinnerIcon className="h-3.5 w-3.5" />}
            {needsReset ? "Reset fleet to demo state" : "Fleet is in demo state"}
          </button>
        </div>
      )}

      {status.step && (
        <p className={`mt-3 text-xs ${status.phase === "failed" ? "text-rose-alert" : "text-ink-400"}`}>
          {status.step}
        </p>
      )}
      {status.phase === "failed" && status.rejection && (
        <p className="mt-1 text-xs text-rose-alert">{status.rejection.reason}</p>
      )}

      <p className="mt-4 border-t border-ink-700/70 pt-3 text-[0.7rem] leading-relaxed text-ink-500">
        Registering a machine and funding it are real transactions. Balances shown here are read back from the
        contract, never from local state. Seeded amounts:{" "}
        {machines.map((m) => `${m.spec.id} ${formatEther(parseEther(m.spec.seed))}`).join(", ")} MON.
      </p>
    </section>
  );
}
