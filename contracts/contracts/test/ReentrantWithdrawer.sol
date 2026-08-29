// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IMachineWalletManager {
    function createMachine(string calldata machineId, string calldata machineType, address controller, uint256 spendingLimit)
        external
        payable
        returns (bytes32);
    function withdraw(string calldata machineId, address to, uint256 amount) external;
    function getBalance(string calldata machineId) external view returns (uint256);
}

/// Test-only attacker: owns a machine, withdraws from it, and re-enters
/// `withdraw` from its receive hook to try to take the same MON twice.
///
/// The manager decrements the machine balance before making the external call,
/// so the re-entrant attempt should fail on its own accounting.
contract ReentrantWithdrawer {
    IMachineWalletManager public immutable manager;
    string public machineId;
    uint256 public reentries;
    bool private attacking;

    constructor(IMachineWalletManager manager_, string memory machineId_) payable {
        manager = manager_;
        machineId = machineId_;
        manager.createMachine{value: msg.value}(machineId_, "attacker", address(0), type(uint256).max);
    }

    function attack(uint256 amount) external {
        attacking = true;
        manager.withdraw(machineId, address(this), amount);
        attacking = false;
    }

    /// Same call without the re-entrant hook, to prove the mock itself is sound.
    function withdrawSafely(uint256 amount) external {
        manager.withdraw(machineId, address(this), amount);
    }

    receive() external payable {
        if (!attacking) return;
        reentries += 1;
        // Second bite at the same MON. Must fail.
        manager.withdraw(machineId, address(this), msg.value);
    }
}
