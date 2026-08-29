require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Monad testnet. Verified against docs.monad.xyz/developer-essentials/testnets
// (chain id 10143, MON, faucet.monad.xyz). Testnet was reset from genesis on
// 2025-12-16, so any address from before then is gone — redeploy rather than
// reusing an old one.
const MONAD_RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const MONAD_CHAIN_ID = 10143;

/// A malformed key produces an unreadable Hardhat error deep inside the
/// provider, usually minutes before a demo. Fail here instead, with the reason.
/// Never logs the key itself.
function readPrivateKey() {
  const raw = (process.env.PRIVATE_KEY || "").trim();
  if (!raw) return null;
  if (raw.split(/\s+/).length > 1) {
    throw new Error("PRIVATE_KEY looks like a seed phrase. Use a raw 32-byte hex private key.");
  }
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `PRIVATE_KEY must be 32 bytes of hex (64 characters, 0x optional). Got ${hex.length - 2} characters.`,
    );
  }
  return hex;
}

const PRIVATE_KEY = readPrivateKey();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Monad runs a Prague-level EVM, so Shanghai is a safe subset: no
      // Cancun-or-later opcodes are emitted, and nothing here needs them.
      evmVersion: "shanghai",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    monadTestnet: {
      url: MONAD_RPC_URL,
      chainId: MONAD_CHAIN_ID,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  mocha: {
    timeout: 120000,
  },
};
