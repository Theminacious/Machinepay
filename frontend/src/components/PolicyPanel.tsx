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
  idle: "border-ink-600 bg-ink-850 text-ink-400",
  busy: "border-amber-glow/40 bg-amber-glow/10 text-amber-glow",
  ok: "border-mint-500/35 bg-mint-900/50 text-mint-300",
  bad: "border-rose-alert/40 bg-rose-alert/10 text-rose-alert",
};

/// Where this machine stands in the payment lifecycle. Kept deliberately
/// literal: a judge should be able to tell a configured rule from a requested
/// payment from a settled one without being told what the colours mean.
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
      <dt className="text-ink-400">{label}</dt>
      <dd className={`tabular text-right ${muted ? "text-ink-400" : "text-ink-200"}`}>{value}</dd>
    </div>
  );
}

export function PolicyPanel({ machines, payment }: Props) {
  return (
    <section className="panel p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
            <ShieldIcon className="h-4 w-4 text-mint-300" />
            Machine spending policies
          </h2>
          <p className="mt-0.5 text-xs text-ink-400">
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
            <article key={machine.spec.id} className="rounded-xl border border-ink-700/80 bg-ink-900/40 p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-mint-300" />
                <h3 className="truncate text-xs font-semibold text-white" title={machine.spec.id}>
                  {machine.spec.id}
                </h3>
              </div>

              <span
                className={`mt-2.5 inline-block rounded-full border px-2 py-0.5 text-[0.68rem] whitespace-nowrap ${STAGE_TONE[stage.tone]}`}
              >
                {stage.label}
              </span>

              <dl className="mt-3 space-y-1.5 border-t border-ink-700/70 pt-3 text-[0.7rem]">
                <Rule
                  label="Can receive from"
                  value={canReceiveFrom.length > 0 ? canReceiveFrom.join(", ") : "no machine"}
                  muted={canReceiveFrom.length === 0}
                />
                <Rule
                  label="Can pay"
                  // An allowlist that is off is not a list — say so, rather than
                  // enumerating the fleet as if each edge had been configured.
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

      <p className="mt-4 border-t border-ink-700/70 pt-3 text-[0.7rem] leading-relaxed text-ink-500">
        A payment has to satisfy all of these at once: the payer must be active, the amount must be within its maximum
        payment and its remaining daily budget, the payee must be on its allowlist, and the payer must hold the funds.
        The contract checks them in that order and refuses with the rule that failed.
      </p>
    </section>
  );
}
