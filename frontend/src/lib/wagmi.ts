import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { hardhatLocal, monadTestnet, supportedChains } from "./chain";

/// Injected wallets only (MetaMask, Rabby, Phantom …). No WalletConnect project
/// id to configure, nothing to fail on stage.
export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [monadTestnet.id]: http(),
    [hardhatLocal.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
