const { expect } = require("chai");
const { ethers } = require("hardhat");

const mon = (n) => ethers.parseEther(String(n));

const EV = "EV-001";
const CHARGER = "Charger-007";
const PROVIDER = "EnergyProvider-001";

describe("MachineWalletManager", function () {
  let contract, operator, evController, chargerController, stranger;

  beforeEach(async function () {
    [operator, evController, chargerController, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MachineWalletManager");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  /// The demo fleet: an EV that pays, a charger that both receives and pays on,
  /// and an energy provider at the end of the chain.
  async function seedFleet() {
    await contract.createMachine(EV, "vehicle", evController.address, mon(2), { value: mon(3) });
    await contract.createMachine(CHARGER, "charger", chargerController.address, mon(2), { value: mon(3) });
    await contract.createMachine(PROVIDER, "utility", ethers.ZeroAddress, mon(10), { value: mon(1) });
  }

  describe("registration", function () {
    it("stores the machine identity and credits the initial deposit", async function () {
      await contract.createMachine(EV, "vehicle", evController.address, mon(2), { value: mon(3) });

      const m = await contract.getMachine(EV);
      expect(m.machineId).to.equal(EV);
      expect(m.machineType).to.equal("vehicle");
      expect(m.owner).to.equal(operator.address);
      expect(m.controller).to.equal(evController.address);
      expect(m.balance).to.equal(mon(3));
      expect(m.spendingLimit).to.equal(mon(2));
      expect(m.active).to.equal(true);
      expect(m.exists).to.equal(true);
      expect(await contract.totalLedger()).to.equal(mon(3));
    });

    it("emits MachineCreated", async function () {
      await expect(contract.createMachine(EV, "vehicle", evController.address, mon(2)))
        .to.emit(contract, "MachineCreated")
        .withArgs(await contract.keyOf(EV), EV, "vehicle", operator.address, evController.address, mon(2));
    });

    it("rejects a duplicate machine id", async function () {
      await contract.createMachine(EV, "vehicle", ethers.ZeroAddress, mon(2));
      await expect(contract.createMachine(EV, "vehicle", ethers.ZeroAddress, mon(5)))
        .to.be.revertedWithCustomError(contract, "MachineAlreadyExists")
        .withArgs(EV);
    });

    it("rejects an empty machine id", async function () {
      await expect(contract.createMachine("", "vehicle", ethers.ZeroAddress, mon(2))).to.be.revertedWithCustomError(
        contract,
        "EmptyMachineId",
      );
    });
  });

  describe("funding", function () {
    it("lets anyone top up a machine", async function () {
      await seedFleet();
      await contract.connect(stranger).deposit(EV, { value: mon(1) });
      expect(await contract.getBalance(EV)).to.equal(mon(4));
    });

    it("rejects a zero deposit", async function () {
      await seedFleet();
      await expect(contract.deposit(EV, { value: 0 })).to.be.revertedWithCustomError(contract, "ZeroAmount");
    });

    it("rejects a plain MON transfer so funds cannot get stranded", async function () {
      await seedFleet();
      await expect(operator.sendTransaction({ to: await contract.getAddress(), value: mon(1) })).to.be.reverted;
    });
  });

  describe("machine-to-machine payments", function () {
    it("moves balance from payer to payee", async function () {
      await seedFleet();
      await contract.payMachine(EV, CHARGER, mon("0.5"));

      expect(await contract.getBalance(EV)).to.equal(mon("2.5"));
      expect(await contract.getBalance(CHARGER)).to.equal(mon("3.5"));

      const ev = await contract.getMachine(EV);
      const charger = await contract.getMachine(CHARGER);
      expect(ev.totalSpent).to.equal(mon("0.5"));
      expect(charger.totalReceived).to.equal(mon("3.5")); // 3 seeded + 0.5 received
    });

    it("emits PaymentExecuted with both machine ids", async function () {
      await seedFleet();
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(1)))
        .to.emit(contract, "PaymentExecuted")
        .withArgs(
          await contract.keyOf(CHARGER),
          await contract.keyOf(PROVIDER),
          CHARGER,
          PROVIDER,
          mon(1),
          operator.address,
          0,
        );
    });

    it("lets the on-device controller spend, but nobody else", async function () {
      await seedFleet();
      await contract.connect(evController).payMachine(EV, CHARGER, mon("0.5"));
      expect(await contract.getBalance(EV)).to.equal(mon("2.5"));

      await expect(contract.connect(stranger).payMachine(EV, CHARGER, mon("0.5")))
        .to.be.revertedWithCustomError(contract, "NotAuthorized")
        .withArgs(EV, stranger.address);
    });

    it("does not let one machine's controller spend another machine's funds", async function () {
      await seedFleet();
      await expect(contract.connect(chargerController).payMachine(EV, PROVIDER, mon("0.5")))
        .to.be.revertedWithCustomError(contract, "NotAuthorized")
        .withArgs(EV, chargerController.address);
    });

    it("rejects zero-value and self payments", async function () {
      await seedFleet();
      await expect(contract.payMachine(EV, CHARGER, 0)).to.be.revertedWithCustomError(contract, "ZeroAmount");
      await expect(contract.payMachine(EV, EV, mon(1)))
        .to.be.revertedWithCustomError(contract, "SelfPayment")
        .withArgs(EV);
    });

    it("rejects unknown machines on either side", async function () {
      await seedFleet();
      await expect(contract.payMachine("Ghost-000", CHARGER, mon(1)))
        .to.be.revertedWithCustomError(contract, "MachineNotFound")
        .withArgs("Ghost-000");
      await expect(contract.payMachine(EV, "Ghost-000", mon(1)))
        .to.be.revertedWithCustomError(contract, "MachineNotFound")
        .withArgs("Ghost-000");
    });
  });

  describe("spending policy (the enforcement point)", function () {
    it("blocks a payment above the limit and reports the exact numbers", async function () {
      await seedFleet();
      // Charger-007 holds 3 MON and its limit is 2 MON. Asking for 5 MON is a
      // policy failure, not a funding failure.
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(5)))
        .to.be.revertedWithCustomError(contract, "SpendingLimitExceeded")
        .withArgs(CHARGER, mon(5), mon(2));
    });

    it("leaves both balances untouched after a blocked payment", async function () {
      await seedFleet();
      const before = [await contract.getBalance(CHARGER), await contract.getBalance(PROVIDER)];
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(5))).to.be.reverted;
      expect(await contract.getBalance(CHARGER)).to.equal(before[0]);
      expect(await contract.getBalance(PROVIDER)).to.equal(before[1]);
      expect(await contract.paymentCount()).to.equal(0);
    });

    it("reports a policy failure even when the machine is rich enough", async function () {
      await contract.createMachine(CHARGER, "charger", ethers.ZeroAddress, mon(2), { value: mon(100) });
      await contract.createMachine(PROVIDER, "utility", ethers.ZeroAddress, mon(10));
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(5)))
        .to.be.revertedWithCustomError(contract, "SpendingLimitExceeded")
        .withArgs(CHARGER, mon(5), mon(2));
    });

    it("allows a payment exactly at the limit", async function () {
      await seedFleet();
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      expect(await contract.getBalance(PROVIDER)).to.equal(mon(3));
    });

    it("blocks a payment the machine cannot fund", async function () {
      await contract.createMachine(EV, "vehicle", ethers.ZeroAddress, mon(10), { value: mon(1) });
      await contract.createMachine(CHARGER, "charger", ethers.ZeroAddress, mon(10));
      await expect(contract.payMachine(EV, CHARGER, mon(2)))
        .to.be.revertedWithCustomError(contract, "InsufficientBalance")
        .withArgs(EV, mon(2), mon(1));
    });

    it("only the owner can change the limit — a machine cannot raise its own", async function () {
      await seedFleet();
      await expect(contract.connect(evController).setSpendingLimit(EV, mon(100)))
        .to.be.revertedWithCustomError(contract, "NotOwner")
        .withArgs(EV, evController.address);
      await expect(contract.connect(stranger).setSpendingLimit(EV, mon(100))).to.be.revertedWithCustomError(
        contract,
        "NotOwner",
      );

      await expect(contract.setSpendingLimit(EV, mon(4)))
        .to.emit(contract, "SpendingLimitUpdated")
        .withArgs(await contract.keyOf(EV), EV, mon(2), mon(4));
      await contract.payMachine(EV, CHARGER, mon(3)); // now within policy
      expect(await contract.getBalance(EV)).to.equal(0);
    });
  });

  describe("pause (kill switch)", function () {
    it("freezes sending and receiving", async function () {
      await seedFleet();
      await contract.pauseMachine(EV);
      await expect(contract.payMachine(EV, CHARGER, mon("0.5")))
        .to.be.revertedWithCustomError(contract, "MachineIsPaused")
        .withArgs(EV);
      await expect(contract.payMachine(CHARGER, EV, mon("0.5")))
        .to.be.revertedWithCustomError(contract, "MachineIsPaused")
        .withArgs(EV);

      await contract.unpauseMachine(EV);
      await contract.payMachine(EV, CHARGER, mon("0.5"));
      expect(await contract.getBalance(EV)).to.equal(mon("2.5"));
    });

    it("is owner-only", async function () {
      await seedFleet();
      await expect(contract.connect(stranger).pauseMachine(EV)).to.be.revertedWithCustomError(contract, "NotOwner");
    });
  });

  describe("counterparty allowlist", function () {
    it("restricts payments to allowed machines once enabled", async function () {
      await seedFleet();
      await contract.setAllowlistEnabled(CHARGER, true);

      await expect(contract.payMachine(CHARGER, PROVIDER, mon(1)))
        .to.be.revertedWithCustomError(contract, "CounterpartyNotAllowed")
        .withArgs(CHARGER, PROVIDER);

      await contract.setCounterpartyAllowed(CHARGER, PROVIDER, true);
      expect(await contract.isCounterpartyAllowed(CHARGER, PROVIDER)).to.equal(true);
      await contract.payMachine(CHARGER, PROVIDER, mon(1));
      expect(await contract.getBalance(PROVIDER)).to.equal(mon(2));
    });
  });

  describe("withdrawals and control", function () {
    it("sends real MON back out to the owner", async function () {
      await seedFleet();
      const before = await ethers.provider.getBalance(stranger.address);
      await contract.withdraw(PROVIDER, stranger.address, mon(1));
      expect(await ethers.provider.getBalance(stranger.address)).to.equal(before + mon(1));
      expect(await contract.getBalance(PROVIDER)).to.equal(0);
    });

    it("is owner-only and bounded by the machine balance", async function () {
      await seedFleet();
      await expect(
        contract.connect(evController).withdraw(EV, evController.address, mon(1)),
      ).to.be.revertedWithCustomError(contract, "NotOwner");
      await expect(contract.withdraw(PROVIDER, stranger.address, mon(50))).to.be.revertedWithCustomError(
        contract,
        "InsufficientBalance",
      );
    });

    it("rotates the controller key", async function () {
      await seedFleet();
      await contract.setController(EV, stranger.address);
      await contract.connect(stranger).payMachine(EV, CHARGER, mon("0.5"));
      await expect(contract.connect(evController).payMachine(EV, CHARGER, mon("0.5"))).to.be.revertedWithCustomError(
        contract,
        "NotAuthorized",
      );
    });

    it("transfers machine ownership", async function () {
      await seedFleet();
      await contract.transferMachineOwnership(EV, stranger.address);
      expect((await contract.getMachine(EV)).owner).to.equal(stranger.address);
      await expect(contract.setSpendingLimit(EV, mon(9))).to.be.revertedWithCustomError(contract, "NotOwner");
      await contract.connect(stranger).setSpendingLimit(EV, mon(9));
    });
  });

  describe("dry run (canPay)", function () {
    it("agrees with what payMachine actually does", async function () {
      await seedFleet();

      expect(await contract.canPay(EV, CHARGER, mon("0.5"), operator.address)).to.deep.equal([true, "OK"]);
      expect(await contract.canPay(EV, CHARGER, mon("0.5"), evController.address)).to.deep.equal([true, "OK"]);
      expect(await contract.canPay(CHARGER, PROVIDER, mon(5), operator.address)).to.deep.equal([
        false,
        "SPENDING_LIMIT_EXCEEDED",
      ]);
      expect(await contract.canPay(EV, CHARGER, mon("0.5"), stranger.address)).to.deep.equal([false, "NOT_AUTHORIZED"]);
      expect(await contract.canPay(EV, "Ghost-000", mon(1), operator.address)).to.deep.equal([false, "PAYEE_NOT_FOUND"]);

      await contract.pauseMachine(EV);
      expect(await contract.canPay(EV, CHARGER, mon(1), operator.address)).to.deep.equal([false, "PAYER_PAUSED"]);
    });
  });

  describe("registry and history", function () {
    it("returns the whole fleet in one call", async function () {
      await seedFleet();
      expect(await contract.machineCount()).to.equal(3);
      const all = await contract.getAllMachines();
      expect(all.map((m) => m.machineId)).to.deep.equal([EV, CHARGER, PROVIDER]);

      const some = await contract.getMachinesByIds([PROVIDER, EV]);
      expect(some.map((m) => m.machineId)).to.deep.equal([PROVIDER, EV]);
    });

    it("records the full charging chain, newest first", async function () {
      await seedFleet();
      await contract.payMachine(EV, CHARGER, mon("0.5"));
      await contract.payMachine(CHARGER, PROVIDER, mon(1));

      expect(await contract.paymentCount()).to.equal(2);

      const recent = await contract.getRecentPayments(10);
      expect(recent.length).to.equal(2);
      expect(recent[0].amount).to.equal(mon(1));
      expect(recent[0].fromKey).to.equal(await contract.keyOf(CHARGER));
      expect(recent[1].amount).to.equal(mon("0.5"));
      expect(recent[1].fromKey).to.equal(await contract.keyOf(EV));

      const page = await contract.getPayments(0, 1);
      expect(page.length).to.equal(1);
      expect(page[0].amount).to.equal(mon("0.5"));
      expect(await contract.getPayments(9, 5)).to.deep.equal([]);

      const first = await contract.getPayment(0);
      expect(first.initiator).to.equal(operator.address);
    });

    it("resolves a machine from an event key", async function () {
      await seedFleet();
      const m = await contract.getMachineByKey(await contract.keyOf(CHARGER));
      expect(m.machineId).to.equal(CHARGER);
    });
  });

  describe("ledger integrity", function () {
    it("keeps every MON in the contract accounted for", async function () {
      await seedFleet();
      await contract.payMachine(EV, CHARGER, mon("0.5"));
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      await contract.withdraw(PROVIDER, stranger.address, mon(1));

      const balances = await Promise.all([
        contract.getBalance(EV),
        contract.getBalance(CHARGER),
        contract.getBalance(PROVIDER),
      ]);
      const sum = balances.reduce((a, b) => a + b, 0n);
      expect(sum).to.equal(await contract.totalLedger());
      expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(sum);
      expect(await contract.unallocatedBalance()).to.equal(0);
    });
  });
});
