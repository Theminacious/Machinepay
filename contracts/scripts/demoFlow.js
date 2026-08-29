/// Runs the judging sequence from the command line: EV pays the charger, the
/// charger pays the energy provider, then an over-limit request is refused by
/// the contract. Useful to verify a fresh deployment, and as a fallback if the
/// browser wallet misbehaves during a demo.
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { EV, CHARGER, PROVIDER } = require("./fleet");
const { preflight, explorerTx } = require("./monad");

const CHARGE_PRICE = ethers.parseEther(process.env.CHARGE_PRICE || "0.5");
const ENERGY_COST = ethers.parseEther(process.env.ENERGY_COST || "1");
const OVER_LIMIT = ethers.parseEther(process.env.OVER_LIMIT || "5");

const mon = (v) => `${ethers.formatEther(v)} MON`;

function resolveAddress(chainId) {
  if (process.env.CONTRACT_ADDRESS) return process.env.CONTRACT_ADDRESS;
  const file = path.join(__dirname, "..", "..", "frontend", "src", "lib", "deployments.json");
  if (fs.existsSync(file)) {
    const record = JSON.parse(fs.readFileSync(file, "utf8"))[String(chainId)];
    if (record?.address) return record.address;
  }
  throw new Error("No contract address. Set CONTRACT_ADDRESS or deploy first.");
}

async function showBalances(contract) {
  for (const id of [EV, CHARGER, PROVIDER]) {
    console.log(`    ${id.padEnd(20)} ${mon(await contract.getBalance(id)).padStart(12)}`);
  }
}

async function pay(contract, chainId, from, to, amount, label) {
  console.log(`\n${label}`);
  console.log(`  ${from} -> ${to}  ${mon(amount)}`);
  const tx = await contract.payMachine(from, to, amount);
  const receipt = await tx.wait();
  console.log(`  confirmed in block ${receipt.blockNumber}  tx ${tx.hash}`);
  const url = explorerTx(chainId, tx.hash);
  if (url) console.log(`  ${url}`);
  await showBalances(contract);
}

/// Revert data reaches us in a few shapes depending on the provider: ethers
/// sometimes pre-parses it into `error.revert`, sometimes hands back raw bytes,
/// and the Hardhat node wraps them in `{ message, data }`.
function decodeRevert(contract, error) {
  if (error.revert?.name) return { name: error.revert.name, args: error.revert.args };
  const raw = typeof error.data === "string" ? error.data : error.data?.data;
  if (typeof raw === "string" && raw.startsWith("0x")) {
    const parsed = contract.interface.parseError(raw);
    if (parsed) return { name: parsed.name, args: parsed.args };
  }
  return null;
}

async function main() {
  const { chainId, signer: operator, info } = await preflight({ ethers, network });
  const address = resolveAddress(chainId);
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`No contract at ${address} on chain ${chainId}. Redeploy — testnet resets wipe old addresses.`);
  }
  const contract = await ethers.getContractAt("MachineWalletManager", address);

  console.log(`MachinePay demo flow on ${info.label} — ${network.name} (chainId ${chainId})`);
  console.log(`Contract ${address}`);
  console.log(`Operator ${operator.address}\n`);
  console.log("Starting balances");
  await showBalances(contract);

  await pay(contract, chainId, EV, CHARGER, CHARGE_PRICE, "1. Charging session — the EV pays the charger");
  await pay(contract, chainId, CHARGER, PROVIDER, ENERGY_COST, "2. Settlement — the charger pays the energy provider");

  console.log(`\n3. Policy test — the charger requests ${mon(OVER_LIMIT)}`);
  const limit = await contract.getSpendingLimit(CHARGER);
  const [allowed, reason] = await contract.canPay(CHARGER, PROVIDER, OVER_LIMIT, operator.address);
  console.log(`  dry run: allowed=${allowed} reason=${reason}`);

  try {
    await contract.payMachine.staticCall(CHARGER, PROVIDER, OVER_LIMIT);
    throw new Error("POLICY NOT ENFORCED: the contract accepted an over-limit payment");
  } catch (error) {
    if (error.message.includes("POLICY NOT ENFORCED")) throw error;
    const decoded = decodeRevert(contract, error);
    console.log(`  BLOCKED by the contract: ${decoded?.name ?? error.shortMessage}`);
    if (decoded?.name === "SpendingLimitExceeded") {
      console.log(`    machine   ${decoded.args[0]}`);
      console.log(`    requested ${mon(decoded.args[1])}`);
      console.log(`    limit     ${mon(decoded.args[2])}`);
    }
  }

  console.log(`\n  Charger-007 spending limit stands at ${mon(limit)}. Balances after the blocked request:`);
  await showBalances(contract);
  console.log(`\nPayments recorded on chain: ${await contract.paymentCount()}`);
}

main().catch((error) => {
  console.error(`\nDemo flow failed: ${error.shortMessage || error.message}`);
  process.exitCode = 1;
});
