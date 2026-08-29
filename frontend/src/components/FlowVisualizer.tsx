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
          dim ? "border-black/[0.08] bg-[#f5f5f7] text-[#86868b]" : "border-black/[0.08] bg-white text-[#0071e3] shadow-xs"
        }`}
      >
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="font-display text-xs font-extrabold text-[#1d1d1f]">{machine.spec.id}</p>
        <p className="tabular text-[0.7rem] font-bold text-[#86868b]">
          {machine.registered ? `${formatMon(machine.balance, 3)} MON` : "not registered"}
        </p>
      </div>
    </div>
  );
}

const LINE_TONE: Record<EdgeState, string> = {
  idle: "bg-black/10",
  flowing: "bg-[#0071e3]",
  confirmed: "bg-[#34c759]",
  blocked: "bg-[#ff3b30]",
};

const LABEL_TONE: Record<EdgeState, string> = {
  idle: "border-black/[0.08] bg-white text-[#1d1d1f] shadow-2xs font-semibold",
  flowing: "border-[#0071e3]/40 bg-[#f0f6fe] text-[#0071e3] shadow-xs font-bold",
  confirmed: "border-[#bbf2cd] bg-[#eafaf0] text-[#1d8a3b] shadow-xs font-bold",
  blocked: "border-[#ffc2bf] bg-[#fff2f1] text-[#d70015] shadow-xs font-bold",
};

function Edge({ amount, state }: { amount: bigint; state: EdgeState }) {
  return (
    <div className="relative flex min-h-16 w-full flex-1 items-center justify-center py-3 md:min-h-0 md:py-0">
      <span className={`absolute hidden h-1 w-full rounded-full md:block ${LINE_TONE[state]}`} aria-hidden="true" />
      <span className={`absolute h-full w-1 rounded-full md:hidden ${LINE_TONE[state]}`} aria-hidden="true" />

      {state === "flowing" && (
        <>
          <span
            className="absolute hidden h-2.5 w-2.5 rounded-full bg-[#0071e3] shadow-[0_0_12px_2px_rgba(0,113,227,0.8)] md:block"
            style={{ animation: "travel-x 1.2s ease-in-out infinite" }}
            aria-hidden="true"
          />
          <span
            className="absolute h-2.5 w-2.5 rounded-full bg-[#0071e3] shadow-[0_0_12px_2px_rgba(0,113,227,0.8)] md:hidden"
            style={{ animation: "travel-y 1.2s ease-in-out infinite" }}
            aria-hidden="true"
          />
        </>
      )}

      <span
        className={`tabular relative z-10 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-[0.7rem] transition-colors ${LABEL_TONE[state]}`}
      >
        {state === "confirmed" && <CheckIcon className="h-3 w-3 text-[#34c759]" />}
        {state === "blocked" && <BlockIcon className="h-3 w-3 text-[#ff3b30]" />}
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
          <h2 className="font-grotesk text-base font-bold tracking-tight text-[#1d1d1f]">Payment flow</h2>
          <p className="font-apple text-xs font-medium text-[#86868b]">Energy moves one way, money moves the other.</p>
        </div>
        <span className="font-grotesk text-[0.68rem] font-bold tracking-widest text-[#86868b] uppercase">
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
