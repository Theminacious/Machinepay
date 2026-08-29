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
  settled: { ring: "bg-mint-500/12 text-mint-300", icon: CheckIcon },
  requested: { ring: "bg-amber-glow/12 text-amber-glow", icon: BoltIcon },
  blocked: { ring: "bg-rose-alert/12 text-rose-alert", icon: BlockIcon },
};

/// Reads as a machine's own log: what it asked for, what settled, what its
/// policy refused — in order, in words, with a link for anything on chain.
export function ActivityFeed({ entries, chainId, isLoading, settledCount }: Props) {
  return (
    <section className="panel flex min-h-0 flex-col p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">Machine activity</h2>
          <p className="text-xs text-ink-400">Requests, settlements and refusals, newest first.</p>
        </div>
        <span className="tabular shrink-0 text-[0.68rem] tracking-[0.14em] text-ink-400 uppercase">
          {settledCount} settled
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-700 px-4 py-6 text-center text-xs text-ink-400">
          {isLoading ? "Loading machine history…" : "Nothing yet. Run a charging session to see one here."}
        </p>
      ) : (
        <ol className="divide-y divide-ink-700/60">
          {entries.map((entry) => {
            const style = STYLE[entry.kind];
            const Icon = style.icon;
            const url = entry.hash ? explorerTxUrl(chainId, entry.hash) : null;
            return (
              <li key={entry.id} className="flex items-start gap-3 py-2.5">
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${style.ring}`}>
                  <Icon className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-xs ${entry.kind === "blocked" ? "text-rose-alert" : "text-ink-200"}`}
                  >
                    {entry.text}
                  </span>
                  {entry.detail && <span className="block text-[0.7rem] text-ink-400">{entry.detail}</span>}
                  <span className="tabular mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.68rem] text-ink-500">
                    <span>{relativeTime(entry.timestamp)}</span>
                    {entry.initiator && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{shortAddress(entry.initiator)}</span>
                      </>
                    )}
                    {url ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring inline-flex items-center gap-1 rounded text-mint-300 transition hover:text-mint-200"
                        >
                          transaction
                          <LinkIcon className="h-2.5 w-2.5" />
                        </a>
                      </>
                    ) : (
                      !entry.onChain && (
                        <>
                          <span aria-hidden="true">·</span>
                          {/* Says plainly that this line is not blockchain state. */}
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
