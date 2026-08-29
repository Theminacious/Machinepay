import { defineChain } from "viem";

/// Monad testnet is the demo target. The local Hardhat chain is kept alongside
/// it so the whole app can be exercised without spending faucet MON — the
/// dashboard follows whichever chain the connected wallet is on.
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    // testnet.monadexplorer.com now redirects away; the explorers the current
    // docs list are Monadscan (used here) and MonadVision
    // (https://testnet.monadvision.com), which shows the same data.
    default: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
  testnet: true,
});

export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

/// Override with VITE_CHAIN_ID=31337 to develop against a local Hardhat node.
const requestedChainId = Number(import.meta.env.VITE_CHAIN_ID || monadTestnet.id);

/// The preferred chain is listed first: wagmi treats the head of this list as
/// the default before a wallet connects, which is what the read hooks use.
export const supportedChains =
  requestedChainId === hardhatLocal.id ? ([hardhatLocal, monadTestnet] as const) : ([monadTestnet, hardhatLocal] as const);

export type SupportedChainId = (typeof supportedChains)[number]["id"];

export const preferredChain = supportedChains[0];

export const preferredChainId: SupportedChainId = preferredChain.id;

export function isSupportedChain(chainId: number | undefined): boolean {
  return supportedChains.some((c) => c.id === chainId);
}

export function chainById(chainId: number | undefined) {
  return supportedChains.find((c) => c.id === chainId);
}

export function explorerTxUrl(chainId: number | undefined, hash: string): string | null {
  const explorer = chainById(chainId)?.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${hash}` : null;
}

export function explorerAddressUrl(chainId: number | undefined, address: string): string | null {
  const explorer = chainById(chainId)?.blockExplorers?.default.url;
  return explorer ? `${explorer}/address/${address}` : null;
}

/// Named so links read "View on Monadscan" rather than naming an explorer the
/// chain does not actually use.
export function explorerName(chainId: number | undefined): string {
  return chainById(chainId)?.blockExplorers?.default.name ?? "the explorer";
}
