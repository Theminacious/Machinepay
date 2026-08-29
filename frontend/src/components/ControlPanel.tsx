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
  autoPilot?: boolean;
  onToggleAutoPilot?: () => void;
  autoPilotStep?: string;
};

const ICONS = {
  primary: BoltIcon,
  secondary: UtilityIcon,
  danger: BlockIcon,
};

const VARIANT = {
  primary: "bg-[#0071e3] text-white hover:bg-[#0077ed] border-transparent shadow-xs font-grotesk",
  secondary: "bg-[#1d1d1f] text-white hover:bg-[#333336] border-transparent shadow-xs font-grotesk",
  danger: "bg-[#fff2f1] text-[#d70015] border-[#ffc2bf] hover:bg-[#ffe5e3] shadow-2xs font-grotesk",
};

const ICON_BG = {
  primary: "bg-white/20 text-white border-white/20",
  secondary: "bg-white/20 text-white border-white/20",
  danger: "bg-[#ff3b30]/15 text-[#d70015] border-[#ff3b30]/30",
};

export function ControlPanel({
  actions,
  busy,
  blockedReason,
  autoPilot = false,
  onToggleAutoPilot,
  autoPilotStep = "",
}: Props) {
  return (
    <section className="panel p-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="font-grotesk text-base font-bold tracking-tight text-[#1d1d1f]">Machine controls</h2>
        {busy && <span className="font-grotesk text-[0.68rem] font-bold tracking-widest text-[#0071e3] uppercase">working</span>}
      </div>
      <p className="font-apple text-xs font-medium text-[#86868b]">
        Each control is a request from a machine controller. The contract decides what happens next.
      </p>

      {/* Auto-Pilot / Autonomous Loop Banner */}
      <div className={`mt-4 rounded-2xl border p-4 transition-all ${
        autoPilot ? "border-[#34c759]/40 bg-[#34c759]/10 shadow-xs" : "border-[#0071e3]/20 bg-[#0071e3]/5"
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              {autoPilot ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34c759] opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[#34c759]"></span>
                </>
              ) : (
                <span className="h-3 w-3 rounded-full bg-[#86868b]"></span>
              )}
            </span>
            <div>
              <h3 className="font-grotesk text-xs font-bold text-[#1d1d1f]">
                Autonomous Fleet Auto-Pilot
              </h3>
              <p className="font-apple text-[0.72rem] font-medium text-[#86868b]">
                {autoPilot
                  ? autoPilotStep || "Continuous machine-to-machine payment loop active..."
                  : "Run EV Charging → Energy Settlement in a continuous loop"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleAutoPilot}
            disabled={Boolean(blockedReason)}
            className={`focus-ring shrink-0 rounded-xl px-3.5 py-2 font-grotesk text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              autoPilot
                ? "bg-[#ff3b30] text-white hover:bg-[#d70015] shadow-2xs"
                : "bg-[#0071e3] text-white hover:bg-[#0077ed] shadow-2xs"
            }`}
          >
            {autoPilot ? "Stop Auto-Pilot" : "⚡ Start Auto-Pilot"}
          </button>
        </div>
      </div>

      {blockedReason && (
        <div className="font-apple mt-4 flex items-center gap-2.5 rounded-2xl border border-[#ffe3b3] bg-[#fff8ec] px-4 py-3 text-xs font-bold text-[#b36b00] shadow-2xs">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#ff9500]" />
          {blockedReason}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {actions.map((action) => {
          const Icon = ICONS[action.variant];
          const disabled = Boolean(action.disabled) || busy;
          return (
            <button
              key={action.key}
              type="button"
              onClick={action.onRun}
              disabled={disabled}
              className={`focus-ring group flex items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT[action.variant]}`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${ICON_BG[action.variant]}`}>
                {busy ? <SpinnerIcon className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold tracking-tight">{action.title}</span>
                <span className="tabular mt-0.5 block font-mono text-xs font-medium opacity-90">
                  {action.route} · <span className="font-bold">{formatMon(action.amount)} MON</span>
                </span>
              </span>
              <span className="font-apple hidden max-w-[12rem] shrink-0 text-right text-[0.72rem] font-semibold leading-snug opacity-80 sm:block">
                {action.hint}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
