import type { MachineState } from "../hooks/useFleet";
import { formatMon, shortAddress } from "../lib/format";
import { machineIcon } from "./Icons";

export type StatusTone = "ok" | "warn" | "idle" | "bad";

export type CardStatus = { label: string; tone: StatusTone };

const TONE: Record<StatusTone, string> = {
  ok: "border-[#bbf2cd] bg-[#eafaf0] text-[#1d8a3b] font-bold",
  warn: "border-[#ffe3b3] bg-[#fff8ec] text-[#b36b00] font-bold",
  idle: "border-black/[0.08] bg-[#f5f5f7] text-[#86868b] font-semibold",
  bad: "border-[#ffc2bf] bg-[#fff2f1] text-[#d70015] font-bold",
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
      ? "ring-2 ring-[#0071e3]/80 shadow-[0_8px_30px_rgba(0,113,227,0.18)]"
      : pulse === "in"
        ? "ring-2 ring-[#34c759]/80 shadow-[0_8px_25px_rgba(52,199,89,0.18)]"
        : "";

  return (
    <article className={`panel relative flex h-full flex-col overflow-hidden p-5 transition-all duration-300 ${ring}`}>
      {pulse && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0071e3] via-[#34c759] to-[#0071e3]" />
      )}

      <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-black/[0.06] bg-[#f5f5f7] text-[#0071e3] shadow-2xs">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display truncate text-base font-extrabold tracking-tight text-[#1d1d1f]" title={machine.spec.id}>
            {machine.spec.id}
          </h2>
          <p className="font-apple truncate text-xs font-medium text-[#86868b]">{machine.spec.role}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-grotesk text-[0.68rem] font-bold tracking-widest text-[#86868b] uppercase">Balance</p>
          <span
            className={`shrink-0 rounded-full border px-3 py-0.5 text-[0.68rem] whitespace-nowrap shadow-2xs ${TONE[status.tone]}`}
          >
            {status.label}
          </span>
        </div>
        <p className="font-display tabular-sans mt-1 text-[2.1rem] leading-none font-extrabold text-[#1d1d1f]">
          {machine.registered ? formatMon(machine.balance) : "—"}
          <span className="font-apple ml-1.5 text-xs font-bold text-[#86868b]">MON</span>
        </p>
      </div>

      {battery !== undefined && (
        <div className="mt-4 rounded-2xl bg-[#f5f5f7] border border-black/[0.04] p-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-[#86868b]">Vehicle battery</span>
            <span className="tabular font-bold text-[#1d1d1f]">{battery}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${
                battery < 25 ? "bg-[#ff3b30]" : battery < 60 ? "bg-[#ff9500]" : "bg-[#34c759]"
              }`}
              style={{ width: `${battery}%` }}
            />
          </div>
        </div>
      )}

      <dl className="font-apple mt-4 space-y-2 border-t border-black/[0.06] pt-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-[#86868b] font-medium">Spending rule</dt>
          <dd className="tabular text-right font-bold text-[#1d1d1f]">
            {machine.registered ? `max ${formatMon(machine.spendingLimit)} MON` : "not set"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[#86868b] font-medium">Operator</dt>
          <dd className="tabular font-mono text-[0.7rem] font-semibold text-[#424245]">
            {machine.registered ? shortAddress(machine.owner) : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[#86868b] font-medium">Paid out</dt>
          <dd className="tabular font-bold text-[#1d1d1f]">{formatMon(machine.totalSpent)} MON</dd>
        </div>
      </dl>

      <p className="font-apple mt-4 flex min-h-[1.25rem] items-start gap-2 text-xs font-semibold text-[#424245]">
        {note && (
          <>
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                pulse ? "animate-pulse bg-[#0071e3] ring-2 ring-[#0071e3]/30" : "bg-[#86868b]"
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
