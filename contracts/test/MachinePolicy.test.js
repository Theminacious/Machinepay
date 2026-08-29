const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const mon = (n) => ethers.parseEther(String(n));
const MAX_UINT = 2n ** 256n - 1n;

const EV = "EV-001";
const CHARGER = "Charger-007";
const PROVIDER = "EnergyProvider-001";

/// Policy enforcement beyond the single-payment limit, plus the adversarial
/// cases from the security review. The original suite in
/// MachineWalletManager.test.js still covers the core flow.
describe("MachineWalletManager — policies and abuse cases", function () {
  let contract, operator, evController, chargerController, stranger;

  beforeEach(async function () {
    [operator, evController, chargerController, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MachineWalletManager");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  /// The demo fleet exactly as scripts/setupDemo.js provisions it: policies and
  /// allowlist edges set in the same transaction that creates each machine.
  async function seedFleetWithPolicy() {
    await contract.createMachineWithPolicy(EV, "vehicle", evController.address, mon(2), mon(5), [CHARGER], {
      value: mon(3),
    });
    await contract.createMachineWithPolicy(
      CHARGER,
      "charger",
      chargerController.address,
      mon(2),
      mon(5),
      [PROVIDER],
      { value: mon(3) },
    );
    await contract.createMachineWithPolicy(PROVIDER, "utility", ethers.ZeroAddress, mon(10), 0, [], { value: mon(1) });
  }

  describe("policy in one transaction", function () {
    it("sets the limit, the daily cap and the allowlist as the machine is created", async function () {
      await seedFleetWithPolicy();

      const charger = await contract.getMachine(CHARGER);
      expect(charger.spendingLimit).to.equal(mon(2));
      expect(charger.dailyLimit).to.equal(mon(5));
      expect(charger.allowlistEnabled).to.equal(true);
      expect(await contract.isCounterpartyAllowed(CHARGER, PROVIDER)).to.equal(true);
      expect(await contract.isCounterpartyAllowed(CHARGER, EV)).to.equal(false);
    });

    it("leaves the allowlist off when no counterparties are given", async function () {
      await seedFleetWithPolicy();
      const provider = await contract.getMachine(PROVIDER);
      expect(provider.allowlistEnabled).to.equal(false);
      expect(provider.dailyLimit).to.equal(0);
    });

    it("accepts counterparties that do not exist yet, so provisioning order does not matter", async function () {
      // EV-001 is allowed to pay Charger-007 before Charger-007 is registered.
      await contract.createMachineWithPolicy(EV, "vehicle", ethers.ZeroAddress, mon(2), 0, [CHARGER], {
        value: mon(1),
      });
      await contract.createMachine(CHARGER, "charger", ethers.ZeroAddress, mon(2));
      await contract.payMachine(EV, CHARGER, mon("0.5"));
      expect(await contract.getBalance(CHARGER)).to.equal(mon("0.5"));
    });

    it("enforces the allowlist it configured", async function () {
      await seedFleetWithPolicy();
      // The charger may pay the provider, but not the vehicle.
      await expect(contract.payMachine(CHARGER, EV, mon(1)))
        .to.be.revertedWithCustomError(contract, "CounterpartyNotAllowed")
        .withArgs(CHARGER, EV);
      await contract.payMachine(CHARGER, PROVIDER, mon(1));
      expect(await contract.getBalance(PROVIDER)).to.equal(mon(2));
    });

    it("reports every policy edge in one call", async function () {
      await seedFleetWithPolicy();
      const flags = await contract.counterpartyMatrix([EV, CHARGER, PROVIDER]);
      expect(flags.length).to.equal(9);
      // row-major: index i*3 + j is "ids[i] may pay ids[j]"
      expect(flags[0 * 3 + 1]).to.equal(true); // EV -> Charger
      expect(flags[1 * 3 + 2]).to.equal(true); // Charger -> Provider
      expect(flags[1 * 3 + 0]).to.equal(false); // Charger -> EV
      expect(flags[2 * 3 + 1]).to.equal(false); // Provider -> Charger
    });
  });

  describe("daily spending cap", function () {
    /// A charger with plenty of money, so the cap is what stops it, not funding:
    /// 2 MON per payment, 5 MON per day.
    async function richCharger() {
      await contract.createMachineWithPolicy(CHARGER, "charger", chargerController.address, mon(2), mon(5), [], {
        value: mon(50),
      });
      await contract.createMachine(PROVIDER, "utility", ethers.ZeroAddress, mon(100));
    }

    it("allows repeated payments while budget remains", async function () {
      await richCharger();
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      await contract.payMachine(CHARGER, PROVIDER, mon(1));

      expect(await contract.getBalance(PROVIDER)).to.equal(mon(5));
      expect(await contract.remainingToday(CHARGER)).to.equal(0);
      expect(await contract.paymentCount()).to.equal(3);
    });

    it("blocks the payment that would exceed the day's budget and reports what is left", async function () {
      await richCharger();
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      expect(await contract.remainingToday(CHARGER)).to.equal(mon(1));

      await expect(contract.payMachine(CHARGER, PROVIDER, mon(2)))
        .to.be.revertedWithCustomError(contract, "DailyLimitExceeded")
        .withArgs(CHARGER, mon(2), mon(1), mon(5));

      // Nothing moved, nothing recorded.
      expect(await contract.getBalance(PROVIDER)).to.equal(mon(4));
      expect(await contract.paymentCount()).to.equal(2);
      expect(await contract.remainingToday(CHARGER)).to.equal(mon(1));
    });

    it("resets at the start of the next day", async function () {
      await richCharger();
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      await contract.payMachine(CHARGER, PROVIDER, mon(1));
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(1))).to.be.revertedWithCustomError(
        contract,
        "DailyLimitExceeded",
      );

      await time.increase(24 * 60 * 60);
      expect(await contract.remainingToday(CHARGER)).to.equal(mon(5));
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      expect(await contract.remainingToday(CHARGER)).to.equal(mon(3));
    });

    it("keeps the per-payment limit as the first thing reported", async function () {
      await richCharger();
      // 5 MON breaks both rules. The per-payment limit is the one the demo shows.
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(5)))
        .to.be.revertedWithCustomError(contract, "SpendingLimitExceeded")
        .withArgs(CHARGER, mon(5), mon(2));
    });

    it("does not underflow when the owner lowers the cap below today's spend", async function () {
      await richCharger();
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      await contract.payMachine(CHARGER, PROVIDER, mon(2));

      await contract.setDailyLimit(CHARGER, mon(1)); // below the 4 MON already spent
      expect(await contract.remainingToday(CHARGER)).to.equal(0);
      await expect(contract.payMachine(CHARGER, PROVIDER, 1))
        .to.be.revertedWithCustomError(contract, "DailyLimitExceeded")
        .withArgs(CHARGER, 1, 0, mon(1));
    });

    it("treats a zero cap as no cap", async function () {
      await contract.createMachineWithPolicy(CHARGER, "charger", ethers.ZeroAddress, mon(2), 0, [], { value: mon(10) });
      await contract.createMachine(PROVIDER, "utility", ethers.ZeroAddress, mon(100));
      expect(await contract.remainingToday(CHARGER)).to.equal(MAX_UINT);
      for (let i = 0; i < 4; i++) await contract.payMachine(CHARGER, PROVIDER, mon(2));
      expect(await contract.getBalance(PROVIDER)).to.equal(mon(8));
    });

    it("is owner-only — a controller cannot raise its own budget", async function () {
      await richCharger();
      await expect(contract.connect(chargerController).setDailyLimit(CHARGER, mon(1000)))
        .to.be.revertedWithCustomError(contract, "NotOwner")
        .withArgs(CHARGER, chargerController.address);
      await expect(contract.connect(stranger).setDailyLimit(CHARGER, mon(1000))).to.be.revertedWithCustomError(
        contract,
        "NotOwner",
      );

      await expect(contract.setDailyLimit(CHARGER, mon(9)))
        .to.emit(contract, "DailyLimitUpdated")
        .withArgs(await contract.keyOf(CHARGER), CHARGER, mon(5), mon(9));
    });

    it("is reported by the dry run before anyone signs", async function () {
      await richCharger();
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      expect(await contract.canPay(CHARGER, PROVIDER, mon(2), operator.address)).to.deep.equal([
        false,
        "DAILY_LIMIT_EXCEEDED",
      ]);
      expect(await contract.canPay(CHARGER, PROVIDER, mon(1), operator.address)).to.deep.equal([true, "OK"]);
    });
  });

  describe("privilege separation", function () {
    it("lets the controller spend but never change the rules", async function () {
      await seedFleetWithPolicy();
      const asController = contract.connect(chargerController);

      await asController.payMachine(CHARGER, PROVIDER, mon(1)); // allowed

      await expect(asController.setSpendingLimit(CHARGER, mon(100))).to.be.revertedWithCustomError(
        contract,
        "NotOwner",
      );
      await expect(asController.setDailyLimit(CHARGER, mon(100))).to.be.revertedWithCustomError(contract, "NotOwner");
      await expect(asController.setAllowlistEnabled(CHARGER, false)).to.be.revertedWithCustomError(
        contract,
        "NotOwner",
      );
      await expect(asController.setCounterpartyAllowed(CHARGER, EV, true)).to.be.revertedWithCustomError(
        contract,
        "NotOwner",
      );
      await expect(asController.setController(CHARGER, stranger.address)).to.be.revertedWithCustomError(
        contract,
        "NotOwner",
      );
      await expect(asController.pauseMachine(CHARGER)).to.be.revertedWithCustomError(contract, "NotOwner");
      await expect(asController.transferMachineOwnership(CHARGER, stranger.address)).to.be.revertedWithCustomError(
        contract,
        "NotOwner",
      );
      // The important one: a controller cannot take the money out of the system.
      await expect(
        asController.withdraw(CHARGER, chargerController.address, mon(1)),
      ).to.be.revertedWithCustomError(contract, "NotOwner");
    });

    it("refuses every mutator to an unrelated address", async function () {
      await seedFleetWithPolicy();
      const asStranger = contract.connect(stranger);

      await expect(asStranger.payMachine(EV, CHARGER, mon("0.1"))).to.be.revertedWithCustomError(
        contract,
        "NotAuthorized",
      );
      for (const call of [
        () => asStranger.setSpendingLimit(EV, mon(100)),
        () => asStranger.setDailyLimit(EV, mon(100)),
        () => asStranger.pauseMachine(EV),
        () => asStranger.unpauseMachine(EV),
        () => asStranger.setController(EV, stranger.address),
        () => asStranger.transferMachineOwnership(EV, stranger.address),
        () => asStranger.setAllowlistEnabled(EV, false),
        () => asStranger.setCounterpartyAllowed(EV, PROVIDER, true),
        () => asStranger.withdraw(EV, stranger.address, mon(1)),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(contract, "NotOwner");
      }
    });

    it("does not let one operator touch another operator's machine", async function () {
      await seedFleetWithPolicy();
      // The stranger runs their own machine on the same contract.
      await contract.connect(stranger).createMachine("Rogue-001", "vehicle", ethers.ZeroAddress, mon(100), {
        value: mon(1),
      });

      // Owning one machine grants nothing over anyone else's.
      await expect(contract.connect(stranger).payMachine(EV, "Rogue-001", mon(1))).to.be.revertedWithCustomError(
        contract,
        "NotAuthorized",
      );
      await expect(
        contract.connect(stranger).withdraw(EV, stranger.address, mon(1)),
      ).to.be.revertedWithCustomError(contract, "NotOwner");
      // And the reverse: the fleet operator cannot spend the stranger's machine.
      await expect(contract.payMachine("Rogue-001", PROVIDER, mon("0.5"))).to.be.revertedWithCustomError(
        contract,
        "NotAuthorized",
      );
    });

    it("hands a squatted machine id to whoever registered it first", async function () {
      // Anyone may register any unused id on a public contract. The consequence
      // is not a stolen machine — it is a name the fleet operator cannot use.
      await contract.connect(stranger).createMachine(EV, "vehicle", ethers.ZeroAddress, mon(100), { value: mon(1) });
      await expect(contract.createMachine(EV, "vehicle", ethers.ZeroAddress, mon(2))).to.be.revertedWithCustomError(
        contract,
        "MachineAlreadyExists",
      );
      expect((await contract.getMachine(EV)).owner).to.equal(stranger.address);
      await expect(contract.setSpendingLimit(EV, mon(1))).to.be.revertedWithCustomError(contract, "NotOwner");
    });
  });

  describe("funds cannot be drained", function () {
    it("bounds withdrawals by the machine's own balance", async function () {
      await seedFleetWithPolicy();
      // The contract holds 7 MON in total, but PROVIDER is only credited 1.
      expect(await contract.totalLedger()).to.equal(mon(7));
      await expect(contract.withdraw(PROVIDER, operator.address, mon(2)))
        .to.be.revertedWithCustomError(contract, "InsufficientBalance")
        .withArgs(PROVIDER, mon(2), mon(1));
      await contract.withdraw(PROVIDER, operator.address, mon(1));
      expect(await contract.getBalance(PROVIDER)).to.equal(0);
      expect(await contract.totalLedger()).to.equal(mon(6));
    });

    it("survives a re-entrant withdrawal attempt", async function () {
      const Attacker = await ethers.getContractFactory("ReentrantWithdrawer");
      const attacker = await Attacker.deploy(await contract.getAddress(), "Attacker-001", { value: mon(2) });
      await attacker.waitForDeployment();
      expect(await contract.getBalance("Attacker-001")).to.equal(mon(2));

      // Re-entering from the receive hook finds the balance already debited, so
      // the inner call reverts and takes the whole withdrawal with it.
      await expect(attacker.attack(mon(2))).to.be.revertedWithCustomError(contract, "TransferFailed");
      expect(await contract.getBalance("Attacker-001")).to.equal(mon(2));
      expect(await contract.unallocatedBalance()).to.equal(0);

      // The same call without the re-entrant hook works, so the mock is sound.
      await attacker.withdrawSafely(mon(2));
      expect(await contract.getBalance("Attacker-001")).to.equal(0);
      expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(mon(2));
    });

    it("still lets the operator recover funds from a paused machine", async function () {
      await seedFleetWithPolicy();
      await contract.pauseMachine(EV);
      // Pausing stops the machine transacting; it must not trap the operator's money.
      await expect(contract.payMachine(EV, CHARGER, mon("0.5"))).to.be.revertedWithCustomError(
        contract,
        "MachineIsPaused",
      );
      await expect(contract.deposit(EV, { value: mon(1) })).to.be.revertedWithCustomError(contract, "MachineIsPaused");
      await contract.withdraw(EV, operator.address, mon(3));
      expect(await contract.getBalance(EV)).to.equal(0);
    });

    it("keeps the ledger exact across every mutating path", async function () {
      await seedFleetWithPolicy();
      await contract.payMachine(EV, CHARGER, mon("0.5"));
      await contract.connect(chargerController).payMachine(CHARGER, PROVIDER, mon(2));
      await contract.deposit(EV, { value: mon("0.25") });
      await contract.withdraw(PROVIDER, stranger.address, mon(1));
      await contract.setDailyLimit(CHARGER, mon(9));

      const balances = await Promise.all(
        [EV, CHARGER, PROVIDER].map((id) => contract.getBalance(id)),
      );
      const sum = balances.reduce((a, b) => a + b, 0n);
      expect(sum).to.equal(await contract.totalLedger());
      expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(sum);
      expect(await contract.unallocatedBalance()).to.equal(0);
    });
  });

  describe("boundaries and recipients", function () {
    it("splits hairs at the limit: exact amount passes, one wei over does not", async function () {
      await contract.createMachine(CHARGER, "charger", ethers.ZeroAddress, mon(2), { value: mon(10) });
      await contract.createMachine(PROVIDER, "utility", ethers.ZeroAddress, mon(100));

      await expect(contract.payMachine(CHARGER, PROVIDER, mon(2) + 1n))
        .to.be.revertedWithCustomError(contract, "SpendingLimitExceeded")
        .withArgs(CHARGER, mon(2) + 1n, mon(2));
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      expect(await contract.getBalance(PROVIDER)).to.equal(mon(2));

      // Wei-level amounts are exact — there is no rounding anywhere in the path.
      await contract.payMachine(CHARGER, PROVIDER, 1);
      expect(await contract.getBalance(PROVIDER)).to.equal(mon(2) + 1n);
    });

    it("refuses an invalid recipient", async function () {
      await seedFleetWithPolicy();
      await expect(contract.payMachine(EV, "NotAMachine", mon("0.1")))
        .to.be.revertedWithCustomError(contract, "MachineNotFound")
        .withArgs("NotAMachine");
      await expect(contract.payMachine(EV, "", mon("0.1")))
        .to.be.revertedWithCustomError(contract, "MachineNotFound")
        .withArgs("");
      await expect(contract.payMachine(EV, EV, mon("0.1")))
        .to.be.revertedWithCustomError(contract, "SelfPayment")
        .withArgs(EV);

      await contract.pauseMachine(CHARGER);
      await expect(contract.payMachine(EV, CHARGER, mon("0.1")))
        .to.be.revertedWithCustomError(contract, "MachineIsPaused")
        .withArgs(CHARGER);
    });

    it("tracks balances exactly through the whole demo chain", async function () {
      await seedFleetWithPolicy();
      await contract.payMachine(EV, CHARGER, mon("0.5"));
      await contract.payMachine(CHARGER, PROVIDER, mon(1));
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(5))).to.be.revertedWithCustomError(
        contract,
        "SpendingLimitExceeded",
      );

      expect(await contract.getBalance(EV)).to.equal(mon("2.5"));
      expect(await contract.getBalance(CHARGER)).to.equal(mon("2.5"));
      expect(await contract.getBalance(PROVIDER)).to.equal(mon(2));

      const ev = await contract.getMachine(EV);
      const charger = await contract.getMachine(CHARGER);
      expect(ev.totalSpent).to.equal(mon("0.5"));
      expect(charger.totalSpent).to.equal(mon(1));
      expect(charger.totalReceived).to.equal(mon("3.5"));
      expect(await contract.remainingToday(CHARGER)).to.equal(mon(4));
      expect(await contract.paymentCount()).to.equal(2);
    });
  });

  /// The dashboard's activity timeline joins storage against PaymentExecuted
  /// logs to recover each payment's transaction hash, and a refused payment must
  /// leave nothing behind at all. Both are contract guarantees, so both are
  /// tested here rather than assumed by the frontend.
  describe("what a refused payment leaves behind", function () {
    it("does not consume the daily budget", async function () {
      await seedFleetWithPolicy();
      await contract.payMachine(CHARGER, PROVIDER, mon(2));
      expect(await contract.remainingToday(CHARGER)).to.equal(mon(3));

      // Refused three different ways: over the per-payment limit, over the
      // remaining budget, and to a machine off the allowlist.
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(4))).to.be.revertedWithCustomError(
        contract,
        "SpendingLimitExceeded",
      );
      await contract.setSpendingLimit(CHARGER, mon(10));
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(4))).to.be.revertedWithCustomError(
        contract,
        "DailyLimitExceeded",
      );
      await expect(contract.payMachine(CHARGER, EV, mon(1))).to.be.revertedWithCustomError(
        contract,
        "CounterpartyNotAllowed",
      );

      expect(await contract.remainingToday(CHARGER)).to.equal(mon(3));
      expect(await contract.getBalance(CHARGER)).to.equal(mon(1));
      expect(await contract.paymentCount()).to.equal(1);
    });

    it("writes no payment record and no event", async function () {
      await seedFleetWithPolicy();
      await expect(contract.payMachine(CHARGER, PROVIDER, mon(5))).to.be.reverted;
      expect(await contract.paymentCount()).to.equal(0);
      const logs = await contract.queryFilter(contract.filters.PaymentExecuted(), 0, "latest");
      expect(logs.length).to.equal(0);
    });

    it("numbers PaymentExecuted with the same index the storage record has", async function () {
      await seedFleetWithPolicy();
      await contract.payMachine(EV, CHARGER, mon("0.5"));
      await contract.payMachine(CHARGER, PROVIDER, mon(1));
      await contract.payMachine(EV, CHARGER, mon("0.25"));

      const logs = await contract.queryFilter(contract.filters.PaymentExecuted(), 0, "latest");
      expect(logs.length).to.equal(3);
      for (const [i, log] of logs.entries()) {
        expect(log.args.paymentIndex).to.equal(i);
        // getPayment(i) is what the timeline reads; the log is where the
        // transaction hash comes from. They have to describe the same payment.
        const stored = await contract.getPayment(i);
        expect(log.args.amount).to.equal(stored.amount);
        expect(log.args.fromKey).to.equal(stored.fromKey);
        expect(log.args.toKey).to.equal(stored.toKey);
        expect(log.args.initiator).to.equal(stored.initiator);
      }
    });
  });

  describe("residual privilege", function () {
    it("leaves a transferred-away machine beyond the previous owner's reach", async function () {
      await seedFleetWithPolicy();
      await contract.transferMachineOwnership(EV, stranger.address);

      // The old owner keeps nothing: not the policy, not the funds, not the pause.
      await expect(contract.setSpendingLimit(EV, mon(100)))
        .to.be.revertedWithCustomError(contract, "NotOwner")
        .withArgs(EV, operator.address);
      await expect(contract.setDailyLimit(EV, 0)).to.be.revertedWithCustomError(contract, "NotOwner");
      await expect(contract.withdraw(EV, operator.address, mon(1))).to.be.revertedWithCustomError(
        contract,
        "NotOwner",
      );
      await expect(contract.pauseMachine(EV)).to.be.revertedWithCustomError(contract, "NotOwner");
      await expect(contract.payMachine(EV, CHARGER, mon("0.1")))
        .to.be.revertedWithCustomError(contract, "NotAuthorized")
        .withArgs(EV, operator.address);

      // And the controller the old owner installed still works, which is why
      // rotating it is the new owner's first job.
      await contract.connect(evController).payMachine(EV, CHARGER, mon("0.1"));
      await contract.connect(stranger).setController(EV, ethers.ZeroAddress);
      await expect(contract.connect(evController).payMachine(EV, CHARGER, mon("0.1"))).to.be.revertedWithCustomError(
        contract,
        "NotAuthorized",
      );
    });

    it("refuses to send withdrawn funds nowhere", async function () {
      await seedFleetWithPolicy();
      await expect(contract.withdraw(EV, ethers.ZeroAddress, mon(1))).to.be.revertedWithCustomError(
        contract,
        "ZeroAddress",
      );
      await expect(contract.withdraw(EV, operator.address, 0)).to.be.revertedWithCustomError(contract, "ZeroAmount");
      expect(await contract.getBalance(EV)).to.equal(mon(3));
    });
  });

  describe("precision", function () {
    it("moves single wei exactly, with no rounding anywhere", async function () {
      await seedFleetWithPolicy();
      const before = await contract.getMachine(CHARGER);
      await contract.payMachine(EV, CHARGER, 1n);
      const after = await contract.getMachine(CHARGER);

      expect(after.balance - before.balance).to.equal(1n);
      expect(await contract.getBalance(EV)).to.equal(mon(3) - 1n);
      expect(await contract.remainingToday(EV)).to.equal(mon(5) - 1n);
      expect(await contract.totalLedger()).to.equal(await ethers.provider.getBalance(contract.target));
    });

    it("handles an amount far larger than the demo without overflowing", async function () {
      const big = mon("1000000");
      await contract.createMachineWithPolicy("Big-1", "utility", ethers.ZeroAddress, big, big, [], { value: mon(2) });
      await contract.createMachine("Big-2", "utility", ethers.ZeroAddress, 0);

      // The limit and the cap both permit it; only the balance stops it, and the
      // reported numbers are exact rather than saturated.
      await expect(contract.payMachine("Big-1", "Big-2", big))
        .to.be.revertedWithCustomError(contract, "InsufficientBalance")
        .withArgs("Big-1", big, mon(2));
      expect(await contract.remainingToday("Big-1")).to.equal(big);
    });
  });
});
