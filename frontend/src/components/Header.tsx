import { useAccount, useBalance, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { chainById, isSupportedChain, preferredChain, preferredChainId } from "../lib/chain";
import { formatMon, shortAddress } from "../lib/format";
import { BoltIcon, WalletIcon } from "./Icons";

export function Header() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: balance } = useBalance({ address, query: { refetchInterval: 8000 } });

  const injectedConnector = connectors.find((c) => c.type === "injected") ?? connectors[0];
  const chain = chainById(chainId);
  const onSupportedChain = isSupportedChain(chainId);

  return (
    <header className="flex flex-col gap-5 border-b border-ink-700/70 pb-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3.5">
        <span className="relative grid h-11 w-11 place-items-center rounded-xl border border-mint-500/30 bg-mint-900/40 text-mint-400">
          <BoltIcon className="h-5 w-5" />
          <span className="absolute inset-0 rounded-xl ring-1 ring-mint-500/20" />
        </span>
        <div>
          <h1 className="text-[1.35rem] leading-tight font-semibold tracking-tight text-white">MachinePay</h1>
          <p className="text-sm text-ink-400">Machines that can pay each other.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            onSupportedChain
              ? "border-ink-600 bg-ink-850 text-ink-300"
              : "border-rose-alert/40 bg-rose-alert/10 text-rose-alert"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${onSupportedChain ? "bg-mint-400" : "bg-rose-alert"}`}
            aria-hidden="true"
          />
          {isConnected ? (chain?.name ?? `Unsupported network (${chainId})`) : preferredChain.name}
        </span>

        {isConnected && !onSupportedChain && (
          <button
            type="button"
            onClick={() => switchChain({ chainId: preferredChainId })}
            disabled={isSwitching}
            className="focus-ring rounded-full bg-mint-500 px-3.5 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-mint-400 disabled:opacity-60"
          >
            {isSwitching ? "Switching…" : `Switch to ${preferredChain.name}`}
          </button>
        )}

        {isConnected ? (
          <div className="flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5">
            <WalletIcon className="h-4 w-4 text-ink-400" />
            <span className="tabular text-xs text-ink-200">{shortAddress(address)}</span>
            <span className="text-xs text-ink-400">·</span>
            <span className="tabular text-xs text-ink-300">{formatMon(balance?.value, 3)} MON</span>
            <button
              type="button"
              onClick={() => disconnect()}
              className="focus-ring ml-1 rounded-full px-2 py-0.5 text-xs text-ink-400 transition hover:text-ink-200"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => injectedConnector && connect({ connector: injectedConnector })}
            disabled={isPending || !injectedConnector}
            className="focus-ring inline-flex items-center gap-2 rounded-full bg-mint-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-mint-400 disabled:opacity-60"
          >
            <WalletIcon className="h-4 w-4" />
            {isPending ? "Connecting…" : injectedConnector ? "Connect wallet" : "No wallet detected"}
          </button>
        )}
      </div>
    </header>
  );
}
