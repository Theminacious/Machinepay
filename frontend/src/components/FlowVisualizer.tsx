import type { MachineState } from "../hooks/useFleet";
import { formatMon } from "../lib/format";
import { BlockIcon, CheckIcon, machineIcon } from "./Icons";

export type EdgeState = "idle" | "flowing" | "confirmed" | "blocked";

type Props = {
  machines: MachineState[];
  /// 0 = EV to charger, 1 = charger to provider.
  activeEdge: 0 | 1 | null;
  edgeState: EdgeState;
  /// Amount currently in flight or just attempted, in wei.
  activeAmount?: bigint;
  /// Nominal amounts shown when nothing is happening.
  restingAmounts: [bigint, bigint];
};

function Node({ machine }: { machine: MachineState }) {
  const Icon = machineIcon(machine.spec.kind);
  const dim = !machine.registered;
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 text-center">
      <span
        className={`grid h-14 w-14 place-items-center rounded-2xl border transition-colors ${
          dim ? "border-ink-700 bg-ink-900 text-ink-600" : "border-ink-600 bg-ink-850 text-mint-300"
        }`}
      >
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-xs font-semibold text-white">{machine.spec.id}</p>
        <p className="tabular text-[0.7rem] text-ink-400">
          {machine.registered ? `${formatMon(machine.balance, 3)} MON` : "not registered"}
        </p>
      </div>
    </div>
  );
}

const LINE_TONE: Record<EdgeState, string> = {
  idle: "bg-ink-700",
  flowing: "bg-mint-500/60",
  confirmed: "bg-mint-500/80",
  blocked: "bg-rose-alert/70",
};

const LABEL_TONE: Record<EdgeState, string> = {
  idle: "border-ink-600 bg-ink-850 text-ink-300",
  flowing: "border-mint-500/40 bg-mint-900/60 text-mint-300",
  confirmed: "border-mint-500/50 bg-mint-900/70 text-mint-300",
  blocked: "border-rose-alert/40 bg-rose-alert/10 text-rose-alert",
};

function Edge({ amount, state }: { amount: bigint; state: EdgeState }) {
  return (
    <div className="relative flex min-h-16 w-full flex-1 items-center justify-center py-3 md:min-h-0 md:py-0">
      {/* Horizontal rail on wide screens, vertical on narrow. */}
      <span className={`absolute hidden h-px w-full md:block ${LINE_TONE[state]}`} aria-hidden="true" />
      <span className={`absolute h-full w-px md:hidden ${LINE_TONE[state]}`} aria-hidden="true" />

      {state === "flowing" && (
        <>
          <span
            className="absolute hidden h-1.5 w-1.5 rounded-full bg-mint-300 shadow-[0_0_10px_2px_rgba(46,230,168,0.7)] md:block"
            style={{ animation: "travel-x 1.2s ease-in-out infinite" }}
            aria-hidden="true"
          />
          <span
            className="absolute h-1.5 w-1.5 rounded-full bg-mint-300 shadow-[0_0_10px_2px_rgba(46,230,168,0.7)] md:hidden"
            style={{ animation: "travel-y 1.2s ease-in-out infinite" }}
            aria-hidden="true"
          />
        </>
      )}

      <span
        className={`tabular relative z-10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition-colors ${LABEL_TONE[state]}`}
      >
        {state === "confirmed" && <CheckIcon className="h-3 w-3" />}
        {state === "blocked" && <BlockIcon className="h-3 w-3" />}
        {formatMon(amount)} MON
      </span>
    </div>
  );
}

export function FlowVisualizer({ machines, activeEdge, edgeState, activeAmount, restingAmounts }: Props) {
  const stateFor = (index: 0 | 1): EdgeState => (activeEdge === index ? edgeState : "idle");
  const amountFor = (index: 0 | 1) =>
    activeEdge === index && activeAmount !== undefined ? activeAmount : restingAmounts[index];

  return (
    <section className="panel p-6">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">Payment flow</h2>
          <p className="text-xs text-ink-400">Energy moves one way, money moves the other.</p>
        </div>
        <span className="text-[0.68rem] tracking-[0.14em] text-ink-400 uppercase">
          {edgeState === "flowing" ? "settling" : edgeState === "blocked" ? "refused" : "live"}
        </span>
      </div>

      <div className="flex flex-col items-center gap-1 md:flex-row md:gap-3">
        {machines[0] && <Node machine={machines[0]} />}
        <Edge amount={amountFor(0)} state={stateFor(0)} />
        {machines[1] && <Node machine={machines[1]} />}
        <Edge amount={amountFor(1)} state={stateFor(1)} />
        {machines[2] && <Node machine={machines[2]} />}
      </div>
    </section>
  );
}
