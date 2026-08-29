import type { PaymentStatus } from "../hooks/usePayment";
import { explorerName, explorerTxUrl } from "../lib/chain";
import { formatMon, shortHash } from "../lib/format";
import { BlockIcon, CheckIcon, LinkIcon, ShieldIcon, SpinnerIcon } from "./Icons";

type Props = {
  status: PaymentStatus;
  chainId: number | undefined;
  onDismiss: () => void;
  /// Re-submits a blocked payment without the pre-flight check, so the refusal
  /// lands on chain as a reverted transaction.
  onProveOnChain?: () => void;
};

function Row({ label, value, tone }: { label: string; value: string; tone?: "bad" | "ok" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-xs font-medium text-[#86868b]">{label}</dt>
      <dd
        className={`tabular text-sm font-bold ${
          tone === "bad" ? "text-[#ff3b30]" : tone === "ok" ? "text-[#34c759]" : "text-[#1d1d1f]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function TxLink({ hash, chainId }: { hash: `0x${string}`; chainId: number | undefined }) {
  const url = explorerTxUrl(chainId, hash);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className="tabular font-mono text-[#86868b]">{shortHash(hash)}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex items-center gap-1.5 font-bold text-[#0071e3] underline underline-offset-2 transition hover:text-[#0077ed]"
        >
          View on {explorerName(chainId)}
          <LinkIcon className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-[#86868b] font-medium">local chain — no explorer</span>
      )}
    </div>
  );
}

export function PaymentStatusPanel({ status, chainId, onDismiss, onProveOnChain }: Props) {
  const { phase, intent, hash, rejection, preflightSkipped } = status;
  if (phase === "idle") return null;

  const route = intent ? `${intent.from} → ${intent.to}` : "";

  const skippedNote = preflightSkipped ? (
    <p className="mt-2 text-xs font-semibold text-[#b36b00]">
      {preflightSkipped.headline} — the policy pre-check could not run, so the contract checked this payment itself.
    </p>
  ) : null;

  if (phase === "checking" || phase === "signing" || phase === "pending") {
    const copy = {
      checking: { title: "Checking spending rules", body: "Asking the contract whether this payment is permitted." },
      signing: { title: "Waiting for your signature", body: "Approve the payment in your wallet." },
      pending: { title: "Payment in flight", body: "Submitted to the network, waiting for confirmation." },
    }[phase];

    return (
      <section className="panel animate-rise border-[#0071e3]/30 bg-[#f0f6fe] p-5 shadow-xs font-apple">
        <div className="flex items-start gap-3.5">
          <SpinnerIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#0071e3]" />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-bold text-[#1d1d1f]">{copy.title}</h3>
            <p className="mt-0.5 text-xs font-medium text-[#424245]">{copy.body}</p>
            {intent && (
              <p className="tabular mt-2.5 text-sm font-bold text-[#1d1d1f]">
                {route} · {formatMon(intent.amount)} MON
              </p>
            )}
            {hash && <TxLink hash={hash} chainId={chainId} />}
            {skippedNote}
          </div>
        </div>
      </section>
    );
  }

  if (phase === "confirmed") {
    return (
      <section className="panel animate-rise border-[#bbf2cd] bg-[#eafaf0] p-5 shadow-xs font-apple">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#34c759]/20 text-[#1d8a3b]">
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-sm font-bold text-[#1d1d1f]">Payment confirmed</h3>
              <button
                type="button"
                onClick={onDismiss}
                className="focus-ring rounded-full bg-[#34c759]/15 px-3 py-0.5 text-xs font-bold text-[#1d8a3b] hover:bg-[#34c759]/25 transition"
              >
                Dismiss
              </button>
            </div>
            <p className="tabular mt-1.5 text-sm font-bold text-[#1d1d1f]">
              {intent?.label} · {route} · {intent ? formatMon(intent.amount) : "—"} MON
            </p>
            {status.blockNumber !== undefined && (
              <p className="tabular mt-1 text-xs font-semibold text-[#86868b]">block {status.blockNumber.toString()}</p>
            )}
            {hash && <TxLink hash={hash} chainId={chainId} />}
            {skippedNote}
          </div>
        </div>
      </section>
    );
  }

  const isPolicy = rejection?.kind === "policy";
  return (
    <section
      className={`panel animate-shake p-5 shadow-xs font-apple ${
        isPolicy ? "border-[#ffc2bf] bg-[#fff2f1]" : "border-black/[0.08]"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
            isPolicy ? "bg-[#ff3b30]/15 text-[#ff3b30]" : "bg-[#f5f5f7] text-[#86868b]"
          }`}
        >
          <BlockIcon className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={`font-display text-sm font-extrabold tracking-wide ${isPolicy ? "text-[#d70015] uppercase" : "text-[#1d1d1f]"}`}
            >
              {rejection?.headline ?? "Transaction blocked"}
            </h3>
            <button
              type="button"
              onClick={onDismiss}
              className="focus-ring rounded-full bg-black/5 px-3 py-0.5 text-xs font-bold text-[#86868b] hover:bg-black/10 transition"
            >
              Dismiss
            </button>
          </div>
          <p className="mt-0.5 text-sm font-bold text-[#1d1d1f]">{rejection?.reason}</p>
          {rejection?.kind === "rpc" && (
            <p className="mt-1 text-xs font-bold text-[#b36b00]">
              This is the RPC endpoint, not a spending policy. No payment was sent and no rule refused it.
            </p>
          )}

          <dl className="mt-3.5 divide-y divide-black/[0.06] border-y border-black/[0.06]">
            {rejection?.requested !== undefined && (
              <Row label="Requested" value={`${formatMon(rejection.requested)} MON`} tone="bad" />
            )}
            {rejection?.allowed !== undefined && (
              <Row
                label={
                  rejection.errorName === "DailyLimitExceeded"
                    ? "Left in today's budget"
                    : rejection.kind === "funds"
                      ? "Available"
                      : "Maximum allowed"
                }
                value={`${formatMon(rejection.allowed)} MON`}
              />
            )}
            {rejection?.machineId && <Row label="Machine" value={rejection.machineId} />}
            {rejection?.errorName && <Row label="Rule" value={rejection.errorName} />}
          </dl>

          {rejection?.detail && <p className="mt-3 text-xs font-semibold text-[#424245]">{rejection.detail}</p>}

          {isPolicy && (
            <p className="mt-3.5 inline-flex items-center gap-2 rounded-full border border-[#bbf2cd] bg-[#eafaf0] px-3.5 py-1.5 text-xs font-bold text-[#1d8a3b] shadow-2xs">
              <ShieldIcon className="h-4 w-4 shrink-0 text-[#34c759]" />
              Funds protected — no balance moved.
            </p>
          )}

          {hash && <TxLink hash={hash} chainId={chainId} />}

          {status.provenOnChain ? (
            <p className="mt-2 text-xs font-semibold text-[#86868b]">
              Submitted anyway: the transaction is on chain and reverted. Nothing was transferred.
            </p>
          ) : (
            isPolicy &&
            onProveOnChain && (
              <button
                type="button"
                onClick={onProveOnChain}
                className="focus-ring mt-3.5 rounded-full border border-[#d70015]/30 bg-white px-4 py-2 text-xs font-bold text-[#d70015] shadow-xs transition hover:bg-[#fff2f1] active:scale-[0.98]"
              >
                Submit it anyway → prove the refusal on chain
              </button>
            )
          )}
        </div>
      </div>
    </section>
  );
}
