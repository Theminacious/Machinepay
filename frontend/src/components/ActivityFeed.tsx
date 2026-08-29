import type { TimelineEntry } from "../hooks/useActivity";
import { explorerTxUrl } from "../lib/chain";
import { relativeTime, shortAddress } from "../lib/format";
import { BlockIcon, BoltIcon, CheckIcon, LinkIcon } from "./Icons";

type Props = {
  entries: TimelineEntry[];
  chainId: number | undefined;
  isLoading: boolean;
  settledCount: number;
};

const STYLE: Record<TimelineEntry["kind"], { ring: string; icon: typeof CheckIcon }> = {
  settled: { ring: "bg-[#eafaf0] text-[#1d8a3b] border border-[#bbf2cd]", icon: CheckIcon },
  requested: { ring: "bg-[#fff8ec] text-[#b36b00] border border-[#ffe3b3]", icon: BoltIcon },
  blocked: { ring: "bg-[#fff2f1] text-[#d70015] border border-[#ffc2bf]", icon: BlockIcon },
};

export function ActivityFeed({ entries, chainId, isLoading, settledCount }: Props) {
  return (
    <section className="panel flex min-h-0 flex-col p-6 font-apple">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold tracking-tight text-[#1d1d1f]">Machine activity</h2>
          <p className="text-xs font-medium text-[#86868b]">Requests, settlements and refusals, newest first.</p>
        </div>
        <span className="font-grotesk tabular shrink-0 text-[0.68rem] font-bold tracking-widest text-[#86868b] uppercase">
          {settledCount} settled
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 bg-[#f5f5f7]/50 px-4 py-8 text-center text-xs font-semibold text-[#86868b]">
          {isLoading ? "Loading machine history…" : "Nothing yet. Run a charging session to see one here."}
        </p>
      ) : (
        <ol className="divide-y divide-black/[0.06]">
          {entries.map((entry) => {
            const style = STYLE[entry.kind];
            const Icon = style.icon;
            const url = entry.hash ? explorerTxUrl(chainId, entry.hash) : null;
            return (
              <li key={entry.id} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${style.ring}`}>
                  <Icon className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-xs font-bold ${entry.kind === "blocked" ? "text-[#d70015]" : "text-[#1d1d1f]"}`}
                  >
                    {entry.text}
                  </span>
                  {entry.detail && <span className="block text-[0.7rem] font-medium text-[#86868b]">{entry.detail}</span>}
                  <span className="tabular mt-1 flex flex-wrap items-center gap-x-1.5 text-[0.68rem] font-semibold text-[#86868b]">
                    <span>{relativeTime(entry.timestamp)}</span>
                    {entry.initiator && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#424245]">{shortAddress(entry.initiator)}</span>
                      </>
                    )}
                    {url ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring inline-flex items-center gap-1 font-bold text-[#0071e3] transition hover:text-[#0077ed] hover:underline"
                        >
                          transaction
                          <LinkIcon className="h-2.5 w-2.5" />
                        </a>
                      </>
                    ) : (
                      !entry.onChain && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>dashboard event, not a transaction</span>
                        </>
                      )
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
