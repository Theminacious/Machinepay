const { ethers, network } = require("hardhat");
const { exportAbi, recordDeployment } = require("./exportAbi");
const { preflight, explorerAddress, explorerTx, MONAD_TESTNET_ID } = require("./monad");

async function main() {
  const { chainId, signer: deployer, balance, info } = await preflight({ ethers, network });

  console.log(`Network        ${info.label} — ${network.name} (chainId ${chainId})`);
  console.log(`Deployer       ${deployer.address}`);
  console.log(`Balance        ${ethers.formatEther(balance)} MON`);

  if (balance === 0n) {
    throw new Error(
      `Deployer has no MON. Fund ${deployer.address}` + (info.faucet ? ` — faucet: ${info.faucet}` : ""),
    );
  }
  // Deploy plus fleet setup lands well under 1 MON at testnet prices; this is a
  // warning, not a hard stop, because gas prices move.
  if (chainId === MONAD_TESTNET_ID && balance < ethers.parseEther("3.5")) {
    console.log(
      `\n!  ${ethers.formatEther(balance)} MON may not cover deploy + 3 MON of machine seed funding.` +
        `\n   Top up at ${info.faucet} or lower the seeds (SEED_EV / SEED_CHARGER in .env).`,
    );
  }

  const Factory = await ethers.getContractFactory("MachineWalletManager");
  const contract = await Factory.deploy();
  const deployTx = contract.deploymentTransaction();
  console.log(`\nDeploying...   tx ${deployTx.hash}`);
  await contract.waitForDeployment();
  const receipt = await ethers.provider.getTransactionReceipt(deployTx.hash);

  const address = await contract.getAddress();
  console.log(`\nMachineWalletManager`);
  console.log(`  address      ${address}`);
  console.log(`  block        ${receipt.blockNumber}`);
  console.log(`  gas used     ${receipt.gasUsed}`);
  const txUrl = explorerTx(chainId, deployTx.hash);
  const addrUrl = explorerAddress(chainId, address);
  if (addrUrl) console.log(`  explorer     ${addrUrl}`);
  if (txUrl) console.log(`  deploy tx    ${txUrl}`);

  await exportAbi();
  // The block number lets the dashboard query PaymentExecuted logs from here
  // rather than from genesis, which public RPCs will not serve.
  recordDeployment(chainId, address, deployer.address, receipt.blockNumber);

  console.log(`\nNext: register the demo fleet`);
  console.log(`  npm run ${chainId === MONAD_TESTNET_ID ? "setup" : "setup:local"}`);
}

main().catch((error) => {
  console.error(`\nDeploy failed: ${error.shortMessage || error.message}`);
  process.exitCode = 1;
});
