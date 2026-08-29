const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const newOwner = process.env.NEW_OPERATOR || "0xF2fAE4E371b72f277EB588698afaD6a250D61111";
  const targetMachine = process.env.MACHINE_ID || "EV-001";
  const transferAll = process.env.TRANSFER_ALL === "true";

  const deploymentsFile = path.join(__dirname, "..", "..", "frontend", "src", "lib", "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  const address = deployments[chainId]?.address;

  if (!address) {
    throw new Error(`No deployment address found for chain ${chainId}`);
  }

  const [signer] = await ethers.getSigners();
  const contract = await ethers.getContractAt("MachineWalletManager", address, signer);

  console.log(`Network: ${network.name} (chainId ${chainId})`);
  console.log(`Contract: ${address}`);
  console.log(`Signer: ${signer.address}`);

  const machines = transferAll ? ["EV-001", "Charger-007", "EnergyProvider-001"] : [targetMachine];

  for (const id of machines) {
    if (await contract.machineExists(id)) {
      const current = await contract.getMachine(id);
      console.log(`Machine ${id} current owner: ${current.owner}`);
      if (current.owner.toLowerCase() !== newOwner.toLowerCase()) {
        let machineContract = contract;
        if (network.name === "localhost" || chainId === "31337") {
          await ethers.provider.send("hardhat_impersonateAccount", [current.owner]);
          await ethers.provider.send("hardhat_setBalance", [current.owner, "0x10000000000000000000"]);
          const currentSigner = await ethers.getSigner(current.owner);
          machineContract = contract.connect(currentSigner);
        }
        const tx = await machineContract.transferMachineOwnership(id, newOwner);
        await tx.wait();
        console.log(`Transferred ${id} ownership to ${newOwner} (tx: ${tx.hash})`);
      } else {
        console.log(`Machine ${id} is already owned by ${newOwner}`);
      }
    } else {
      console.log(`Machine ${id} does not exist on contract.`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
