/// Network facts, in one place, mirrored in frontend/src/lib/chain.ts.
/// Source: https://docs.monad.xyz/developer-essentials/testnets (chain id 10143,
/// MON, RPC testnet-rpc.monad.xyz, faucet faucet.monad.xyz).
const MONAD_TESTNET_ID = 10143;
const HARDHAT_ID = 31337;

const NETWORKS = {
  [MONAD_TESTNET_ID]: {
    label: "Monad Testnet",
    // Etherscan-style explorer; MonadVision (testnet.monadvision.com) shows the
    // same data if this one is slow.
    explorer: "https://testnet.monadscan.com",
    faucet: "https://faucet.monad.xyz",
    rpc: "https://testnet-rpc.monad.xyz",
  },
  [HARDHAT_ID]: {
    label: "Hardhat Local",
    explorer: null,
    faucet: null,
    rpc: "http://127.0.0.1:8545",
  },
};

const netInfo = (chainId) => NETWORKS[Number(chainId)] ?? { label: `chain ${chainId}`, explorer: null, faucet: null };

const explorerTx = (chainId, hash) => {
  const base = netInfo(chainId).explorer;
  return base ? `${base}/tx/${hash}` : null;
};

const explorerAddress = (chainId, address) => {
  const base = netInfo(chainId).explorer;
  return base ? `${base}/address/${address}` : null;
};

/// Confirms the node we are talking to is the chain we think it is, and that we
/// have a usable signer, before anything irreversible happens.
async function preflight({ ethers, network }) {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const expected = network.config.chainId;
  if (expected !== undefined && chainId !== expected) {
    throw new Error(
      `RPC reports chain ${chainId} but network "${network.name}" expects ${expected}. ` +
        "Check MONAD_RPC_URL, or pass the right --network.",
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error(
      chainId === MONAD_TESTNET_ID
        ? "No signer. Set PRIVATE_KEY in contracts/.env (throwaway testnet key) and fund it: https://faucet.monad.xyz"
        : "No signer available for this network.",
    );
  }

  const balance = await ethers.provider.getBalance(signer.address);
  return { chainId, signer, balance, info: netInfo(chainId) };
}

module.exports = { MONAD_TESTNET_ID, HARDHAT_ID, NETWORKS, netInfo, explorerTx, explorerAddress, preflight };
