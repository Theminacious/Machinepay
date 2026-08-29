import { formatMon } from "../lib/format";
import { BlockIcon, BoltIcon, SpinnerIcon, UtilityIcon } from "./Icons";

export type Action = {
  key: string;
  title: string;
  route: string;
  amount: bigint;
  hint: string;
  variant: "primary" | "secondary" | "danger";
  onRun: () => void;
  disabled?: boolean;
};

type Props = {
  actions: Action[];
  busy: boolean;
  /// Why the controls are inert, if they are. Shown once, above the buttons.
  blockedReason?: string;
};

const ICONS = {
  primary: BoltIcon,
  secondary: UtilityIcon,
  danger: BlockIcon,
};

const VARIANT = {
  primary: "border-mint-500/40 bg-mint-500/10 hover:border-mint-400/70 hover:bg-mint-500/15 text-mint-200",
  secondary: "border-ink-600 bg-ink-850 hover:border-ink-400 hover:bg-ink-800 text-ink-100",
  danger: "border-rose-alert/35 bg-rose-alert/[0.06] hover:border-rose-alert/60 hover:bg-rose-alert/10 text-rose-100",
};

export function ControlPanel({ actions, busy, blockedReason }: Props) {
  return (
    <section className="panel p-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-tight text-white">Machine controls</h2>
        {busy && <span className="text-[0.68rem] tracking-[0.14em] text-mint-300 uppercase">working</span>}
      </div>
      <p className="text-xs text-ink-400">
        Each control is a request from a machine controller. The contract decides what happens next.
      </p>

      {blockedReason && (
        <p className="mt-4 rounded-lg border border-amber-glow/25 bg-amber-glow/[0.07] px-3 py-2 text-xs text-amber-glow">
          {blockedReason}
        </p>
      )}

      <div className="mt-4 grid gap-2.5">
        {actions.map((action) => {
          const Icon = ICONS[action.variant];
          const disabled = Boolean(action.disabled) || busy;
          return (
            <button
              key={action.key}
              type="button"
              onClick={action.onRun}
              disabled={disabled}
              className={`focus-ring group flex items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT[action.variant]}`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-current/20 bg-ink-950/40">
                {busy ? <SpinnerIcon className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{action.title}</span>
                <span className="tabular mt-0.5 block text-xs opacity-70">
                  {action.route} · {formatMon(action.amount)} MON
                </span>
              </span>
              <span className="hidden max-w-[11rem] shrink-0 text-right text-[0.7rem] leading-snug opacity-55 sm:block">
                {action.hint}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
