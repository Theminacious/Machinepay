// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MachineWalletManager
/// @notice Programmable economic identities for machines.
///
/// A machine is a first-class account inside this contract: it has an id, an
/// owner (the fleet operator), an optional controller key (the on-device
/// controller — a Raspberry Pi, an ECU, a charge point controller), a balance
/// of native MON held by this contract, and a spending policy.
///
/// The policy is enforced here, on chain. A client can ask for any payment it
/// likes; if it breaks the policy the state transition never happens. This is
/// the difference between giving a machine a wallet and giving a machine
/// programmable financial permissions.
///
/// Balances are an internal ledger over the contract's own native MON balance.
/// Machine-to-machine payments are ledger moves (no external calls, so no
/// reentrancy surface); `withdraw` is the only path that sends MON out.
contract MachineWalletManager {
    struct Machine {
        string machineId; // human-readable label, e.g. "EV-001"
        string machineType; // free-form class, e.g. "vehicle" / "charger" / "utility"
        address owner; // fleet operator: full control over the policy
        address controller; // the machine's own key: may initiate payments only
        uint256 balance; // native MON credited to this machine
        uint256 spendingLimit; // max value of a single outgoing payment
        uint256 totalSpent;
        uint256 totalReceived;
        bool active; // false == paused: cannot send or receive
        bool allowlistEnabled; // true == may only pay explicitly allowed machines
        bool exists;
        // --- rolling daily cap. A per-payment limit alone does not bound the
        // loss from a compromised controller: it can send the maximum amount
        // repeatedly. The daily cap does. 0 == no cap.
        uint256 dailyLimit; // max total outgoing per UTC day
        uint256 spentToday; // accumulator, only meaningful for `dayIndex`
        uint256 dayIndex; // block.timestamp / 1 days when spentToday was last written
    }

    struct Payment {
        bytes32 fromKey;
        bytes32 toKey;
        uint256 amount;
        uint256 timestamp;
        address initiator;
    }

    mapping(bytes32 => Machine) private machines;
    mapping(bytes32 => mapping(bytes32 => bool)) private counterpartyAllowed;
    bytes32[] private machineKeys;
    Payment[] private payments;

    /// Sum of every machine balance. Never exceeds address(this).balance.
    uint256 public totalLedger;

    event MachineCreated(
        bytes32 indexed key,
        string machineId,
        string machineType,
        address owner,
        address controller,
        uint256 spendingLimit
    );
    event Deposited(bytes32 indexed key, string machineId, address indexed from, uint256 amount, uint256 newBalance);
    event PaymentExecuted(
        bytes32 indexed fromKey,
        bytes32 indexed toKey,
        string fromId,
        string toId,
        uint256 amount,
        address indexed initiator,
        uint256 paymentIndex
    );
    event Withdrawn(bytes32 indexed key, string machineId, address indexed to, uint256 amount);
    event SpendingLimitUpdated(bytes32 indexed key, string machineId, uint256 previousLimit, uint256 newLimit);
    event DailyLimitUpdated(bytes32 indexed key, string machineId, uint256 previousLimit, uint256 newLimit);
    event PauseStateChanged(bytes32 indexed key, string machineId, bool paused);
    event ControllerUpdated(bytes32 indexed key, string machineId, address previousController, address newController);
    event OwnershipTransferred(bytes32 indexed key, string machineId, address previousOwner, address newOwner);
    event AllowlistEnabledChanged(bytes32 indexed key, string machineId, bool enabled);
    event CounterpartyUpdated(bytes32 indexed key, string machineId, string counterpartyId, bool allowed);

    error MachineAlreadyExists(string machineId);
    error MachineNotFound(string machineId);
    /// Caller is neither the machine's owner nor its controller.
    error NotAuthorized(string machineId, address caller);
    /// Caller is not the machine's owner (policy changes are owner-only).
    error NotOwner(string machineId, address caller);
    error MachineIsPaused(string machineId);
    /// The whole point: the policy rejected this payment on chain.
    error SpendingLimitExceeded(string machineId, uint256 requested, uint256 limit);
    /// The per-payment limit was respected but the machine has spent its day's budget.
    error DailyLimitExceeded(string machineId, uint256 requested, uint256 remainingToday, uint256 dailyLimit);
    error InsufficientBalance(string machineId, uint256 requested, uint256 available);
    error CounterpartyNotAllowed(string fromId, string toId);
    error EmptyMachineId();
    error ZeroAmount();
    error SelfPayment(string machineId);
    error ZeroAddress();
    error TransferFailed();

    /// @notice Deterministic storage key for a machine id. Exposed so clients
    /// can map event topics and payment records back to a machine.
    function keyOf(string memory machineId) public pure returns (bytes32) {
        return keccak256(bytes(machineId));
    }

    function _load(string memory machineId) private view returns (Machine storage m) {
        m = machines[keyOf(machineId)];
        if (!m.exists) revert MachineNotFound(machineId);
    }

    function _requireOwner(Machine storage m) private view {
        if (msg.sender != m.owner) revert NotOwner(m.machineId, msg.sender);
    }

    /// @notice Register a machine. Any MON sent with the call is credited to it.
    /// @param controller Optional on-device key allowed to initiate payments.
    ///        Pass address(0) for a machine driven only by its owner.
    /// @param spendingLimit Max value of a single outgoing payment, in wei.
    function createMachine(
        string calldata machineId,
        string calldata machineType,
        address controller,
        uint256 spendingLimit
    ) external payable returns (bytes32 key) {
        return _create(machineId, machineType, controller, spendingLimit, 0);
    }

    /// @notice Register a machine with its whole spending policy in one
    /// transaction: per-payment limit, daily cap, and the list of machines it is
    /// allowed to pay. Passing a non-empty list turns the allowlist on.
    ///
    /// Counterparties are recorded by id hash, so they may be registered later —
    /// a fleet can be provisioned in any order. Whether the payee actually
    /// exists is checked at payment time.
    function createMachineWithPolicy(
        string calldata machineId,
        string calldata machineType,
        address controller,
        uint256 spendingLimit,
        uint256 dailyLimit,
        string[] calldata allowedCounterparties
    ) external payable returns (bytes32 key) {
        key = _create(machineId, machineType, controller, spendingLimit, dailyLimit);

        if (allowedCounterparties.length > 0) {
            Machine storage m = machines[key];
            m.allowlistEnabled = true;
            emit AllowlistEnabledChanged(key, machineId, true);
            for (uint256 i = 0; i < allowedCounterparties.length; i++) {
                counterpartyAllowed[key][keyOf(allowedCounterparties[i])] = true;
                emit CounterpartyUpdated(key, machineId, allowedCounterparties[i], true);
            }
        }
    }

    function _create(
        string calldata machineId,
        string calldata machineType,
        address controller,
        uint256 spendingLimit,
        uint256 dailyLimit
    ) private returns (bytes32 key) {
        if (bytes(machineId).length == 0) revert EmptyMachineId();
        key = keyOf(machineId);
        Machine storage m = machines[key];
        if (m.exists) revert MachineAlreadyExists(machineId);

        m.machineId = machineId;
        m.machineType = machineType;
        m.owner = msg.sender;
        m.controller = controller;
        m.spendingLimit = spendingLimit;
        m.dailyLimit = dailyLimit;
        m.active = true;
        m.exists = true;
        machineKeys.push(key);

        emit MachineCreated(key, machineId, machineType, msg.sender, controller, spendingLimit);
        if (dailyLimit > 0) emit DailyLimitUpdated(key, machineId, 0, dailyLimit);

        if (msg.value > 0) {
            m.balance = msg.value;
            m.totalReceived = msg.value;
            totalLedger += msg.value;
            emit Deposited(key, machineId, msg.sender, msg.value, msg.value);
        }
    }

    /// @notice Top up a machine. Funding is open to anyone — receiving money is
    /// not a privileged action, spending it is.
    function deposit(string calldata machineId) external payable {
        if (msg.value == 0) revert ZeroAmount();
        Machine storage m = _load(machineId);
        if (!m.active) revert MachineIsPaused(machineId);

        m.balance += msg.value;
        m.totalReceived += msg.value;
        totalLedger += msg.value;

        emit Deposited(keyOf(machineId), machineId, msg.sender, msg.value, m.balance);
    }

    /// @notice Machine-to-machine payment, subject to the payer's on-chain policy.
    ///
    /// Every rule below is enforced here. A frontend cannot skip any of them:
    /// the only way to move a machine's balance is through this function.
    function payMachine(string calldata fromId, string calldata toId, uint256 amount)
        external
        returns (uint256 paymentIndex)
    {
        if (amount == 0) revert ZeroAmount();
        bytes32 fromKey = keyOf(fromId);
        bytes32 toKey = keyOf(toId);
        if (fromKey == toKey) revert SelfPayment(fromId);

        Machine storage from = machines[fromKey];
        if (!from.exists) revert MachineNotFound(fromId);
        Machine storage to = machines[toKey];
        if (!to.exists) revert MachineNotFound(toId);

        // Owner or on-device controller. Nobody else can spend this machine's money.
        if (msg.sender != from.owner && msg.sender != from.controller) {
            revert NotAuthorized(fromId, msg.sender);
        }
        if (!from.active) revert MachineIsPaused(fromId);
        if (!to.active) revert MachineIsPaused(toId);

        // Policy before funds: an over-limit request is a policy failure even
        // when the machine happens to be rich enough to pay it.
        if (amount > from.spendingLimit) {
            revert SpendingLimitExceeded(fromId, amount, from.spendingLimit);
        }

        // Daily budget. Bounds the total damage a compromised controller can do,
        // which a per-payment limit on its own does not.
        uint256 spentToday = 0;
        uint256 today = 0;
        if (from.dailyLimit > 0) {
            today = block.timestamp / 1 days;
            spentToday = from.dayIndex == today ? from.spentToday : 0;
            // The owner may lower the cap below what was already spent today, so
            // compute the remainder without underflowing.
            uint256 remaining = spentToday >= from.dailyLimit ? 0 : from.dailyLimit - spentToday;
            if (amount > remaining) {
                revert DailyLimitExceeded(fromId, amount, remaining, from.dailyLimit);
            }
        }

        if (from.allowlistEnabled && !counterpartyAllowed[fromKey][toKey]) {
            revert CounterpartyNotAllowed(fromId, toId);
        }
        if (amount > from.balance) revert InsufficientBalance(fromId, amount, from.balance);

        if (from.dailyLimit > 0) {
            from.dayIndex = today;
            from.spentToday = spentToday + amount;
        }

        from.balance -= amount;
        from.totalSpent += amount;
        to.balance += amount;
        to.totalReceived += amount;

        paymentIndex = payments.length;
        payments.push(
            Payment({fromKey: fromKey, toKey: toKey, amount: amount, timestamp: block.timestamp, initiator: msg.sender})
        );

        emit PaymentExecuted(fromKey, toKey, fromId, toId, amount, msg.sender, paymentIndex);
    }

    /// @notice Move MON out of the contract, back to a real address. Owner only.
    function withdraw(string calldata machineId, address to, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        Machine storage m = _load(machineId);
        _requireOwner(m);
        if (amount > m.balance) revert InsufficientBalance(machineId, amount, m.balance);

        // Effects before the external call.
        m.balance -= amount;
        totalLedger -= amount;
        emit Withdrawn(keyOf(machineId), machineId, to, amount);

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Update the payer policy. Owner only — a machine cannot raise its
    /// own limit, which is what makes the limit meaningful.
    function setSpendingLimit(string calldata machineId, uint256 newLimit) external {
        Machine storage m = _load(machineId);
        _requireOwner(m);
        uint256 previous = m.spendingLimit;
        m.spendingLimit = newLimit;
        emit SpendingLimitUpdated(keyOf(machineId), machineId, previous, newLimit);
    }

    /// @notice Update the machine's daily budget. Owner only, same reasoning as
    /// the per-payment limit. 0 removes the cap.
    function setDailyLimit(string calldata machineId, uint256 newLimit) external {
        Machine storage m = _load(machineId);
        _requireOwner(m);
        uint256 previous = m.dailyLimit;
        m.dailyLimit = newLimit;
        emit DailyLimitUpdated(keyOf(machineId), machineId, previous, newLimit);
    }

    /// @notice Freeze a machine's economic identity: it can neither send nor receive.
    function pauseMachine(string calldata machineId) external {
        _setPaused(machineId, true);
    }

    function unpauseMachine(string calldata machineId) external {
        _setPaused(machineId, false);
    }

    function _setPaused(string calldata machineId, bool paused) private {
        Machine storage m = _load(machineId);
        _requireOwner(m);
        m.active = !paused;
        emit PauseStateChanged(keyOf(machineId), machineId, paused);
    }

    /// @notice Rotate the on-device key. This is how a replaced controller board
    /// or a re-flashed device rejoins the same economic identity.
    function setController(string calldata machineId, address controller) external {
        Machine storage m = _load(machineId);
        _requireOwner(m);
        address previous = m.controller;
        m.controller = controller;
        emit ControllerUpdated(keyOf(machineId), machineId, previous, controller);
    }

    function transferMachineOwnership(string calldata machineId, address newOwner) external {
        if (newOwner == address(0)) revert ZeroAddress();
        Machine storage m = _load(machineId);
        _requireOwner(m);
        address previous = m.owner;
        m.owner = newOwner;
        emit OwnershipTransferred(keyOf(machineId), machineId, previous, newOwner);
    }

    /// @notice When enabled, the machine may only pay counterparties on its allowlist.
    function setAllowlistEnabled(string calldata machineId, bool enabled) external {
        Machine storage m = _load(machineId);
        _requireOwner(m);
        m.allowlistEnabled = enabled;
        emit AllowlistEnabledChanged(keyOf(machineId), machineId, enabled);
    }

    function setCounterpartyAllowed(string calldata machineId, string calldata counterpartyId, bool allowed) external {
        Machine storage m = _load(machineId);
        _requireOwner(m);
        counterpartyAllowed[keyOf(machineId)][keyOf(counterpartyId)] = allowed;
        emit CounterpartyUpdated(keyOf(machineId), machineId, counterpartyId, allowed);
    }

    // ---------------------------------------------------------------- views

    function getMachine(string calldata machineId) external view returns (Machine memory) {
        return _load(machineId);
    }

    /// @notice Same as getMachine but keyed by hash — for resolving event topics
    /// and payment records without knowing the label up front.
    function getMachineByKey(bytes32 key) external view returns (Machine memory) {
        Machine memory m = machines[key];
        if (!m.exists) revert MachineNotFound("");
        return m;
    }

    function getBalance(string calldata machineId) external view returns (uint256) {
        return _load(machineId).balance;
    }

    function getSpendingLimit(string calldata machineId) external view returns (uint256) {
        return _load(machineId).spendingLimit;
    }

    /// @notice How much this machine may still spend today under its daily cap.
    /// Returns type(uint256).max when no cap is configured.
    function remainingToday(string calldata machineId) external view returns (uint256) {
        Machine storage m = _load(machineId);
        if (m.dailyLimit == 0) return type(uint256).max;
        uint256 spent = m.dayIndex == block.timestamp / 1 days ? m.spentToday : 0;
        return spent >= m.dailyLimit ? 0 : m.dailyLimit - spent;
    }

    /// @notice Flattened allowlist matrix for a set of machines: element
    /// `i * ids.length + j` is true when ids[i] is permitted to pay ids[j].
    /// One call, so a dashboard can draw every policy edge without n² requests.
    function counterpartyMatrix(string[] calldata ids) external view returns (bool[] memory flags) {
        uint256 n = ids.length;
        flags = new bool[](n * n);
        bytes32[] memory keys = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            keys[i] = keyOf(ids[i]);
        }
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = 0; j < n; j++) {
                flags[i * n + j] = counterpartyAllowed[keys[i]][keys[j]];
            }
        }
    }

    function machineExists(string calldata machineId) external view returns (bool) {
        return machines[keyOf(machineId)].exists;
    }

    function isCounterpartyAllowed(string calldata fromId, string calldata toId) external view returns (bool) {
        return counterpartyAllowed[keyOf(fromId)][keyOf(toId)];
    }

    /// @notice Dry-run the policy for a proposed payment without sending a
    /// transaction. Returns the same decision `payMachine` would reach, so a
    /// client can explain a rejection before asking anyone to sign anything.
    /// This is a convenience, not the enforcement point: `payMachine` re-checks
    /// everything regardless of what a caller believes.
    function canPay(string calldata fromId, string calldata toId, uint256 amount, address initiator)
        external
        view
        returns (bool allowed, string memory reason)
    {
        bytes32 fromKey = keyOf(fromId);
        bytes32 toKey = keyOf(toId);
        Machine storage from = machines[fromKey];
        Machine storage to = machines[toKey];

        if (amount == 0) return (false, "AMOUNT_ZERO");
        if (fromKey == toKey) return (false, "SELF_PAYMENT");
        if (!from.exists) return (false, "PAYER_NOT_FOUND");
        if (!to.exists) return (false, "PAYEE_NOT_FOUND");
        if (initiator != from.owner && initiator != from.controller) return (false, "NOT_AUTHORIZED");
        if (!from.active) return (false, "PAYER_PAUSED");
        if (!to.active) return (false, "PAYEE_PAUSED");
        if (amount > from.spendingLimit) return (false, "SPENDING_LIMIT_EXCEEDED");
        if (from.dailyLimit > 0) {
            uint256 spent = from.dayIndex == block.timestamp / 1 days ? from.spentToday : 0;
            uint256 remaining = spent >= from.dailyLimit ? 0 : from.dailyLimit - spent;
            if (amount > remaining) return (false, "DAILY_LIMIT_EXCEEDED");
        }
        if (from.allowlistEnabled && !counterpartyAllowed[fromKey][toKey]) return (false, "COUNTERPARTY_NOT_ALLOWED");
        if (amount > from.balance) return (false, "INSUFFICIENT_BALANCE");
        return (true, "OK");
    }

    function machineCount() external view returns (uint256) {
        return machineKeys.length;
    }

    /// @notice Whole registry in one call. Fine at demo/fleet scale; a large
    /// deployment would page through `machineKeys` instead.
    function getAllMachines() external view returns (Machine[] memory list) {
        list = new Machine[](machineKeys.length);
        for (uint256 i = 0; i < machineKeys.length; i++) {
            list[i] = machines[machineKeys[i]];
        }
    }

    function getMachinesByIds(string[] calldata ids) external view returns (Machine[] memory list) {
        list = new Machine[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = machines[keyOf(ids[i])];
        }
    }

    function paymentCount() external view returns (uint256) {
        return payments.length;
    }

    function getPayment(uint256 index) external view returns (Payment memory) {
        return payments[index];
    }

    /// @notice Oldest-first page of the payment log.
    function getPayments(uint256 offset, uint256 limit) external view returns (Payment[] memory page) {
        if (offset >= payments.length) return new Payment[](0);
        uint256 end = offset + limit;
        if (end > payments.length) end = payments.length;
        page = new Payment[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = payments[i];
        }
    }

    /// @notice Newest-first tail of the payment log — what an activity feed wants.
    function getRecentPayments(uint256 count) external view returns (Payment[] memory page) {
        uint256 total = payments.length;
        if (count > total) count = total;
        page = new Payment[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = payments[total - 1 - i];
        }
    }

    /// @notice MON held by the contract that is not credited to any machine.
    /// Should always be zero: there is no `receive()`, so plain transfers revert.
    function unallocatedBalance() external view returns (uint256) {
        return address(this).balance - totalLedger;
    }
}
