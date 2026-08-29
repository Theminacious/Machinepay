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
    <header className="flex flex-col gap-4 border-b border-black/[0.06] pb-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3.5">
        <span className="relative grid h-11 w-11 place-items-center rounded-2xl border border-[#0071e3]/20 bg-[#0071e3]/10 text-[#0071e3] shadow-xs">
          <BoltIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-[1.45rem] leading-tight font-extrabold tracking-tight text-[#1d1d1f]">
            MachinePay
          </h1>
          <p className="font-apple text-xs font-medium text-[#86868b]">Machines that can pay each other.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 font-apple">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-2xs ${
            onSupportedChain
              ? "border-black/[0.08] bg-white text-[#1d1d1f]"
              : "border-[#ff3b30]/30 bg-[#fff2f1] text-[#ff3b30]"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${onSupportedChain ? "bg-[#34c759] animate-pulse" : "bg-[#ff3b30]"}`}
            aria-hidden="true"
          />
          {isConnected ? (chain?.name ?? `Unsupported network (${chainId})`) : preferredChain.name}
        </span>

        {isConnected && !onSupportedChain && (
          <button
            type="button"
            onClick={() => switchChain({ chainId: preferredChainId })}
            disabled={isSwitching}
            className="focus-ring rounded-full bg-[#0071e3] px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-60"
          >
            {isSwitching ? "Switching…" : `Switch to ${preferredChain.name}`}
          </button>
        )}

        {isConnected ? (
          <div className="flex items-center gap-2.5 rounded-full border border-black/[0.08] bg-white px-4 py-1.5 shadow-2xs">
            <WalletIcon className="h-4 w-4 text-[#86868b]" />
            <span className="tabular text-xs font-bold text-[#1d1d1f]">{shortAddress(address)}</span>
            <span className="text-xs text-black/20">·</span>
            <span className="tabular text-xs font-bold text-[#0071e3]">{formatMon(balance?.value, 3)} MON</span>
            <button
              type="button"
              onClick={() => disconnect()}
              className="focus-ring ml-1 rounded-full bg-[#f5f5f7] px-2.5 py-0.5 text-xs font-semibold text-[#86868b] transition hover:bg-[#e8e8ed] hover:text-[#1d1d1f]"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => injectedConnector && connect({ connector: injectedConnector })}
            disabled={isPending || !injectedConnector}
            className="focus-ring inline-flex items-center gap-2 rounded-full bg-[#0071e3] px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-60"
          >
            <WalletIcon className="h-4 w-4" />
            {isPending ? "Connecting…" : injectedConnector ? "Connect wallet" : "No wallet detected"}
          </button>
        )}
      </div>
    </header>
  );
}
