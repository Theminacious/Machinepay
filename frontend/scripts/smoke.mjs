/// Smoke test for the read path the dashboard uses: the same contract calls,
/// the same decoding, without a browser or a wallet.
///   node scripts/smoke.mjs [chainId]
import { createPublicClient, http, formatEther } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(
  readFileSync(join(here, "..", "..", "contracts", "artifacts", "contracts", "MachineWalletManager.sol", "MachineWalletManager.json"), "utf8"),
);
const deployments = JSON.parse(readFileSync(join(here, "..", "src", "lib", "deployments.json"), "utf8"));

const chainId = process.argv[2] ?? "31337";
const record = deployments[chainId];
if (!record) throw new Error(`No deployment recorded for chain ${chainId}`);

const rpc = chainId === "31337" ? "http://127.0.0.1:8545" : process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const client = createPublicClient({ transport: http(rpc) });
const contract = { address: record.address, abi: artifact.abi };
const IDS = ["EV-001", "Charger-007", "EnergyProvider-001"];

const machines = await client.readContract({ ...contract, functionName: "getMachinesByIds", args: [IDS] });
console.log(`Contract ${record.address} on chain ${chainId}\n`);
for (const m of machines) {
  if (!m.exists) {
    console.log(`  ${m.machineId || "(unregistered)"}`);
    continue;
  }
  console.log(
    `  ${m.machineId.padEnd(20)} ${formatEther(m.balance).padStart(8)} MON   limit ${formatEther(m.spendingLimit)} MON   ${m.active ? "active" : "paused"}   ${m.machineType}`,
  );
}

// The policy panel's two remaining columns: the allowlist matrix and each
// machine's remaining daily budget.
const flags = await client.readContract({ ...contract, functionName: "counterpartyMatrix", args: [IDS] });
console.log(`\nSpending policies`);
for (const [i, m] of machines.entries()) {
  if (!m.exists) continue;
  const canPay = IDS.filter((_, j) => flags[i * IDS.length + j]);
  const left = await client.readContract({ ...contract, functionName: "remainingToday", args: [m.machineId] });
  const daily =
    m.dailyLimit === 0n ? "no cap" : `${formatEther(left)} of ${formatEther(m.dailyLimit)} MON left today`;
  console.log(
    `  ${m.machineId.padEnd(20)} can pay ${(m.allowlistEnabled ? canPay.join(", ") || "(nobody)" : "anyone").padEnd(20)} ${daily}`,
  );
}

const payments = await client.readContract({ ...contract, functionName: "getRecentPayments", args: [12n] });
console.log(`\nRecent payments (${payments.length})`);
for (const p of payments) {
  console.log(`  ${formatEther(p.amount).padStart(6)} MON   ${p.fromKey.slice(0, 10)} -> ${p.toKey.slice(0, 10)}   by ${p.initiator.slice(0, 10)}`);
}

// The activity timeline joins storage against PaymentExecuted logs to recover
// the transaction hash each payment settled in. Storage has no hash of its own.
const logs = await client.getContractEvents({
  address: record.address,
  abi: artifact.abi,
  eventName: "PaymentExecuted",
  fromBlock: BigInt(record.blockNumber ?? 0),
  toBlock: "latest",
});
console.log(`\nPaymentExecuted logs from block ${record.blockNumber ?? 0} (${logs.length})`);
for (const log of logs) {
  console.log(`  #${log.args.paymentIndex}  ${log.args.fromId} -> ${log.args.toId}  ${formatEther(log.args.amount)} MON  tx ${log.transactionHash}`);
}
if (logs.length !== payments.length && payments.length < 12) {
  console.log(`  MISMATCH: ${payments.length} payments in storage but ${logs.length} logs`);
  process.exitCode = 1;
}

const [allowed, reason] = await client.readContract({
  ...contract,
  functionName: "canPay",
  args: ["Charger-007", "EnergyProvider-001", 5000000000000000000n, machines[1]?.owner ?? record.deployer],
});
console.log(`\nPolicy dry run — Charger-007 pays 5 MON: allowed=${allowed} reason=${reason}`);

// The frontend decodes this exact revert to build the "transaction blocked" panel.
try {
  await client.simulateContract({
    ...contract,
    functionName: "payMachine",
    args: ["Charger-007", "EnergyProvider-001", 5000000000000000000n],
    account: machines[1]?.owner ?? record.deployer,
  });
  console.log("UNEXPECTED: the contract accepted an over-limit payment");
  process.exitCode = 1;
} catch (error) {
  const revert = error.walk?.((e) => e.name === "ContractFunctionRevertedError");
  const name = revert?.data?.errorName ?? "(undecoded)";
  const args = revert?.data?.args ?? [];
  console.log(`Simulated payMachine reverted with ${name}`);
  if (name === "SpendingLimitExceeded") {
    console.log(`  machine ${args[0]}  requested ${formatEther(args[1])} MON  limit ${formatEther(args[2])} MON`);
  } else {
    process.exitCode = 1;
  }
}
