import type { MachineState } from "../hooks/useFleet";
import { formatMon, shortAddress } from "../lib/format";
import { machineIcon } from "./Icons";

export type StatusTone = "ok" | "warn" | "idle" | "bad";

export type CardStatus = { label: string; tone: StatusTone };

const TONE: Record<StatusTone, string> = {
  ok: "border-mint-500/30 bg-mint-900/40 text-mint-300",
  warn: "border-amber-glow/30 bg-amber-glow/10 text-amber-glow",
  idle: "border-ink-600 bg-ink-800 text-ink-300",
  bad: "border-rose-alert/35 bg-rose-alert/10 text-rose-alert",
};

type Props = {
  machine: MachineState;
  status: CardStatus;
  /// One line of live context: "Charging 18% → 45%", "Settling with provider".
  note?: string;
  /// Battery telemetry, vehicles only. Local simulation, not on-chain state.
  battery?: number;
  /// Direction of a payment currently in flight, for the glow.
  pulse?: "out" | "in" | null;
};

export function MachineCard({ machine, status, note, battery, pulse }: Props) {
  const Icon = machineIcon(machine.spec.kind);
  const ring =
    pulse === "out"
      ? "ring-2 ring-mint-400/70 shadow-[0_0_36px_-8px_rgba(46,230,168,0.55)]"
      : pulse === "in"
        ? "ring-2 ring-mint-300/50 shadow-[0_0_28px_-10px_rgba(134,247,208,0.45)]"
        : "ring-0";

  return (
    <article className={`panel relative flex h-full flex-col overflow-hidden p-5 transition-all duration-500 ${ring}`}>
      {pulse && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mint-400 to-transparent" />
      )}

      {/* The machine ID gets the full card width: at three-across these cards
          are narrow, and a badge on this line truncates the name to nothing. */}
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-ink-600 bg-ink-850 text-mint-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight text-white" title={machine.spec.id}>
            {machine.spec.id}
          </h2>
          <p className="truncate text-xs text-ink-400">{machine.spec.role}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.68rem] font-medium tracking-[0.14em] text-ink-400 uppercase">Balance</p>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium whitespace-nowrap ${TONE[status.tone]}`}
          >
            {status.label}
          </span>
        </div>
        <p className="tabular-sans mt-1.5 text-[1.75rem] leading-none font-semibold text-white">
          {machine.registered ? formatMon(machine.balance) : "—"}
          <span className="ml-1.5 text-sm font-normal text-ink-400">MON</span>
        </p>
      </div>

      {battery !== undefined && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-400">Battery</span>
            <span className="tabular text-ink-200">{battery}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${
                battery < 25 ? "bg-rose-alert" : battery < 60 ? "bg-amber-glow" : "bg-mint-400"
              }`}
              style={{ width: `${battery}%` }}
            />
          </div>
        </div>
      )}

      <dl className="mt-auto space-y-2 border-t border-ink-700/70 pt-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-ink-400">Spending rule</dt>
          <dd className="tabular text-right text-ink-200">
            {machine.registered ? `max ${formatMon(machine.spendingLimit)} MON` : "not set"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-400">Operator</dt>
          <dd className="tabular text-ink-300">{machine.registered ? shortAddress(machine.owner) : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-400">Paid out</dt>
          <dd className="tabular text-ink-300">{formatMon(machine.totalSpent)} MON</dd>
        </div>
      </dl>

      <p className="mt-4 flex min-h-[1.25rem] items-start gap-2 text-xs text-ink-300">
        {note && (
          <>
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                pulse ? "animate-pulse bg-mint-400" : "bg-ink-600"
              }`}
              aria-hidden="true"
            />
            <span className="min-w-0">{note}</span>
          </>
        )}
      </p>
    </article>
  );
}
