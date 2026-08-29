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
    <section className="panel p-6 font-apple">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold tracking-tight text-[#1d1d1f]">Demo mode</h2>
          <p className="text-xs font-medium text-[#86868b]">
            Three simulated machine controllers, real identities on chain.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[0.7rem] font-bold shadow-2xs ${
            pending.length === 0
              ? "border-[#bbf2cd] bg-[#eafaf0] text-[#1d8a3b]"
              : "border-[#ffe3b3] bg-[#fff8ec] text-[#b36b00]"
          }`}
        >
          {pending.length === 0 ? "fleet live" : `${pending.length} to register`}
        </span>
      </div>

      <dl className="mt-4 space-y-2 border-t border-black/[0.06] pt-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[#86868b] font-medium">Contract</dt>
          <dd className="tabular flex items-center gap-2 font-mono text-[#1d1d1f] font-semibold">
            {contractAddress ? shortAddress(contractAddress) : "not deployed here"}
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded text-[#0071e3] hover:text-[#0077ed]"
                aria-label={`View contract on ${explorerName(chainId)}`}
              >
                <LinkIcon className="h-3 w-3" />
              </a>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[#86868b] font-medium">Your balance</dt>
          <dd className="tabular font-bold text-[#1d1d1f]">{formatMon(walletBalance, 3)} MON</dd>
        </div>
        {pending.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#86868b] font-medium">Needed to seed</dt>
            <dd className={`tabular font-extrabold ${canAfford ? "text-[#1d1d1f]" : "text-[#ff3b30]"}`}>
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
          className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0071e3] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#0077ed] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {running && <SpinnerIcon className="h-4 w-4" />}
          {running ? "Registering…" : `Initialise ${pending.length} machine ${pending.length === 1 ? "identity" : "identities"}`}
        </button>
      ) : (
        <div className="mt-4 space-y-2">
          {machines.map((machine) => (
            <div key={machine.spec.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-semibold text-[#1d1d1f]">{machine.spec.id}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular font-bold text-[#1d1d1f]">{formatMon(machine.balance, 3)} MON</span>
                <button
                  type="button"
                  onClick={() => onFund(machine.spec.id, TOP_UP)}
                  disabled={running || !machine.active}
                  className="focus-ring rounded-lg border border-black/[0.08] bg-[#f5f5f7] px-2.5 py-0.5 text-[0.7rem] font-bold text-[#1d1d1f] shadow-2xs transition hover:bg-[#e8e8ed] disabled:opacity-40"
                >
                  +{TOP_UP}
                </button>
              </span>
            </div>
          ))}

          <button
            type="button"
            onClick={onReset}
            disabled={!isConnected || running || !needsReset}
            className="focus-ring mt-3.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-[#f5f5f7] px-4 py-2.5 text-xs font-bold text-[#1d1d1f] transition hover:bg-[#e8e8ed] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {running && <SpinnerIcon className="h-3.5 w-3.5" />}
            {needsReset ? "Reset fleet to demo state" : "Fleet is in demo state"}
          </button>
        </div>
      )}

      {status.step && (
        <p className={`mt-3 text-xs font-bold ${status.phase === "failed" ? "text-[#ff3b30]" : "text-[#86868b]"}`}>
          {status.step}
        </p>
      )}
      {status.phase === "failed" && status.rejection && (
        <p className="mt-1 text-xs font-bold text-[#ff3b30]">{status.rejection.reason}</p>
      )}

      <p className="mt-4 border-t border-black/[0.06] pt-3 text-[0.7rem] leading-relaxed font-medium text-[#86868b]">
        Registering a machine and funding it are real transactions. Balances shown here are read back from the
        contract, never from local state. Seeded amounts:{" "}
        {machines.map((m) => `${m.spec.id} ${formatEther(parseEther(m.spec.seed))}`).join(", ")} MON.
      </p>
    </section>
  );
}
