import type { MachineState } from "../hooks/useFleet";
import type { PaymentStatus } from "../hooks/usePayment";
import { formatMon } from "../lib/format";
import { machineIcon, ShieldIcon } from "./Icons";

type Props = {
  machines: MachineState[];
  /// The live payment, so each machine can show where it is in the sequence:
  /// policy configured → payment requested → approved or refused.
  payment: PaymentStatus;
};

type Stage = { label: string; tone: "idle" | "busy" | "ok" | "bad" };

const STAGE_TONE: Record<Stage["tone"], string> = {
  idle: "border-black/[0.08] bg-[#f5f5f7] text-[#86868b] font-semibold",
  busy: "border-[#ffe3b3] bg-[#fff8ec] text-[#b36b00] font-bold",
  ok: "border-[#bbf2cd] bg-[#eafaf0] text-[#1d8a3b] font-bold",
  bad: "border-[#ffc2bf] bg-[#fff2f1] text-[#d70015] font-bold",
};

function stageFor(machine: MachineState, payment: PaymentStatus): Stage {
  const { phase, intent } = payment;
  const involved = intent?.from === machine.spec.id || intent?.to === machine.spec.id;
  if (!machine.registered) return { label: "No identity yet", tone: "idle" };
  if (!involved) return { label: "Policy configured", tone: "idle" };
  const paying = intent?.from === machine.spec.id;
  switch (phase) {
    case "checking":
      return { label: "Checking policy", tone: "busy" };
    case "signing":
    case "pending":
      return { label: paying ? "Payment requested" : "Payment incoming", tone: "busy" };
    case "confirmed":
      return { label: paying ? "Payment approved" : "Payment received", tone: "ok" };
    case "blocked":
      return { label: paying ? "Payment refused" : "Nothing received", tone: paying ? "bad" : "idle" };
    case "failed":
      return { label: "Payment failed", tone: "bad" };
    default:
      return { label: "Policy configured", tone: "idle" };
  }
}

function Rule({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[#86868b] font-medium">{label}</dt>
      <dd className={`tabular text-right font-bold ${muted ? "text-[#86868b] font-normal" : "text-[#1d1d1f]"}`}>
        {value}
      </dd>
    </div>
  );
}

export function PolicyPanel({ machines, payment }: Props) {
  return (
    <section className="panel p-6 font-apple">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-grotesk flex items-center gap-2 text-base font-bold tracking-tight text-[#1d1d1f]">
            <ShieldIcon className="h-4 w-4 text-[#0071e3]" />
            Machine spending policies
          </h2>
          <p className="mt-0.5 text-xs font-medium text-[#86868b]">
            Every rule below is contract state. The dashboard reads them; it cannot override them.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {machines.map((machine) => {
          const Icon = machineIcon(machine.spec.kind);
          const stage = stageFor(machine, payment);
          const canPay = machine.canPay;
          const canReceiveFrom = machine.canReceiveFrom;
          return (
            <article key={machine.spec.id} className="rounded-2xl border border-black/[0.06] bg-[#f5f5f7]/80 p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-[#0071e3]" />
                <h3 className="font-display truncate text-xs font-bold text-[#1d1d1f]" title={machine.spec.id}>
                  {machine.spec.id}
                </h3>
              </div>

              <span
                className={`mt-2.5 inline-block rounded-full border px-3 py-0.5 text-[0.68rem] whitespace-nowrap shadow-2xs ${STAGE_TONE[stage.tone]}`}
              >
                {stage.label}
              </span>

              <dl className="mt-3 space-y-1.5 border-t border-black/[0.06] pt-3 text-[0.7rem]">
                <Rule
                  label="Can receive from"
                  value={canReceiveFrom.length > 0 ? canReceiveFrom.join(", ") : "no machine"}
                  muted={canReceiveFrom.length === 0}
                />
                <Rule
                  label="Can pay"
                  value={
                    machine.registered && !machine.allowlistEnabled
                      ? "anyone in the fleet"
                      : canPay.length > 0
                        ? canPay.join(", ")
                        : "no machine"
                  }
                  muted={canPay.length === 0}
                />
                <Rule label="Maximum payment" value={`${formatMon(machine.spendingLimit)} MON`} />
                <Rule
                  label="Daily spending"
                  value={
                    machine.dailyLimit === 0n
                      ? "no cap"
                      : `${formatMon(machine.remainingToday ?? 0n)} of ${formatMon(machine.dailyLimit)} MON left`
                  }
                  muted={machine.dailyLimit === 0n}
                />
                <Rule
                  label="Status"
                  value={!machine.registered ? "NOT REGISTERED" : machine.active ? "ACTIVE" : "PAUSED"}
                />
              </dl>
            </article>
          );
        })}
      </div>

      <p className="mt-4 border-t border-black/[0.06] pt-3 text-[0.7rem] leading-relaxed font-medium text-[#86868b]">
        A payment has to satisfy all of these at once: the payer must be active, the amount must be within its maximum
        payment and its remaining daily budget, the payee must be on its allowlist, and the payer must hold the funds.
        The contract checks them in that order and refuses with the rule that failed.
      </p>
    </section>
  );
}
