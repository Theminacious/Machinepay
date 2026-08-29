const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { FLEET } = require("./fleet");
const { preflight, explorerTx, explorerAddress, MONAD_TESTNET_ID } = require("./monad");

const ZERO = ethers.ZeroAddress;

/// Prefers CONTRACT_ADDRESS, falls back to whatever deploy.js recorded for this chain.
function resolveAddress(chainId) {
  if (process.env.CONTRACT_ADDRESS) return process.env.CONTRACT_ADDRESS;
  const file = path.join(__dirname, "..", "..", "frontend", "src", "lib", "deployments.json");
  if (fs.existsSync(file)) {
    const record = JSON.parse(fs.readFileSync(file, "utf8"))[String(chainId)];
    if (record?.address) return record.address;
  }
  throw new Error(
    `No contract address for chain ${chainId}. Run "npm run deploy" first, or set CONTRACT_ADDRESS in .env.`,
  );
}

const mon = (wei) => `${ethers.formatEther(wei)} MON`;

async function main() {
  const { chainId, signer: operator, balance, info } = await preflight({ ethers, network });
  const address = resolveAddress(chainId);

  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`No contract at ${address} on chain ${chainId}. Redeploy — testnet resets wipe old addresses.`);
  }
  const contract = await ethers.getContractAt("MachineWalletManager", address);

  console.log(`Network        ${info.label} — ${network.name} (chainId ${chainId})`);
  console.log(`Contract       ${address}`);
  console.log(`Operator       ${operator.address}`);
  console.log(`Balance        ${mon(balance)}`);

  const needed = FLEET.reduce((sum, m) => sum + m.seedWei, 0n);
  if (balance < needed) {
    throw new Error(
      `Operator holds ${mon(balance)} but seeding the fleet needs ${mon(needed)} plus gas.` +
        (info.faucet ? ` Faucet: ${info.faucet}` : ""),
    );
  }
  console.log(`\nProvisioning ${FLEET.length} machines, seeding ${mon(needed)} in total\n`);

  const txs = [];
  const record = (label, tx) => {
    txs.push({ label, hash: tx.hash });
    const url = explorerTx(chainId, tx.hash);
    console.log(`  ${label.padEnd(38)} ${url || tx.hash}`);
  };

  for (const machine of FLEET) {
    const exists = await contract.machineExists(machine.id);

    if (!exists) {
      // One transaction per machine: identity, seed funding, per-payment limit,
      // daily budget and allowlist all in the same call.
      const tx = await contract.createMachineWithPolicy(
        machine.id,
        machine.type,
        machine.controller || ZERO,
        machine.limitWei,
        machine.dailyWei,
        machine.allowed,
        { value: machine.seedWei },
      );
      await tx.wait();
      record(`created ${machine.id}`, tx);
      continue;
    }

    // Already registered: bring the policy back in line and top up if it ran dry.
    const current = await contract.getMachine(machine.id);
    if (current.owner.toLowerCase() !== operator.address.toLowerCase()) {
      console.log(`  skipped ${machine.id.padEnd(30)} owned by ${current.owner}, not this operator`);
      continue;
    }
    if (current.spendingLimit !== machine.limitWei) {
      const tx = await contract.setSpendingLimit(machine.id, machine.limitWei);
      await tx.wait();
      record(`limit ${machine.id} -> ${machine.limit} MON`, tx);
    }
    if (current.dailyLimit !== machine.dailyWei) {
      const tx = await contract.setDailyLimit(machine.id, machine.dailyWei);
      await tx.wait();
      record(`daily cap ${machine.id} -> ${machine.daily} MON`, tx);
    }
    for (const counterparty of machine.allowed) {
      if (!(await contract.isCounterpartyAllowed(machine.id, counterparty))) {
        const tx = await contract.setCounterpartyAllowed(machine.id, counterparty, true);
        await tx.wait();
        record(`allow ${machine.id} -> ${counterparty}`, tx);
      }
    }
    const wantAllowlist = machine.allowed.length > 0;
    if (current.allowlistEnabled !== wantAllowlist) {
      const tx = await contract.setAllowlistEnabled(machine.id, wantAllowlist);
      await tx.wait();
      record(`allowlist ${machine.id} -> ${wantAllowlist}`, tx);
    }
    if (!current.active) {
      const tx = await contract.unpauseMachine(machine.id);
      await tx.wait();
      record(`resumed ${machine.id}`, tx);
    }
    if (current.balance < machine.seedWei) {
      const top = machine.seedWei - current.balance;
      const tx = await contract.deposit(machine.id, { value: top });
      await tx.wait();
      record(`funded ${machine.id} +${ethers.formatEther(top)} MON`, tx);
    } else if (current.balance > machine.seedWei) {
      // Re-running this script is the reset button: a machine left holding
      // proceeds from an earlier demo returns them, so judging always starts
      // from the same numbers. Uses the ordinary owner-only withdraw.
      const excess = current.balance - machine.seedWei;
      const tx = await contract.withdraw(machine.id, operator.address, excess);
      await tx.wait();
      record(`returned ${machine.id} -${ethers.formatEther(excess)} MON`, tx);
    }
  }

  console.log(`\nFleet — read back from the contract\n`);
  const ids = FLEET.map((m) => m.id);
  const machines = await contract.getMachinesByIds(ids);
  const flags = await contract.counterpartyMatrix(ids);
  for (let i = 0; i < machines.length; i++) {
    const m = machines[i];
    const canPay = ids.filter((_, j) => flags[i * ids.length + j]);
    console.log(`  ${m.machineId}  (${m.machineType})`);
    console.log(`    key            ${await contract.keyOf(m.machineId)}`);
    console.log(`    balance        ${mon(m.balance)}`);
    console.log(`    per payment    max ${mon(m.spendingLimit)}`);
    console.log(`    per day        ${m.dailyLimit === 0n ? "no cap" : mon(m.dailyLimit)}`);
    console.log(`    can pay        ${m.allowlistEnabled ? canPay.join(", ") || "(nobody)" : "anyone in the fleet"}`);
    console.log(`    operator       ${m.owner}`);
    console.log(`    controller     ${m.controller === ZERO ? "(owner only)" : m.controller}`);
    console.log(`    status         ${m.active ? "active" : "paused"}\n`);
  }

  console.log(`Payments recorded so far: ${await contract.paymentCount()}`);
  const addrUrl = explorerAddress(chainId, address);
  if (addrUrl) console.log(`Contract on explorer:     ${addrUrl}`);
  if (txs.length === 0) console.log("Nothing to change — the fleet was already in its demo state.");
  console.log(
    `\nStart the dashboard:\n  cd ../frontend && ${chainId === MONAD_TESTNET_ID ? "npm run dev" : "VITE_CHAIN_ID=31337 npm run dev"}`,
  );
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error.shortMessage || error.message}`);
  process.exitCode = 1;
});
