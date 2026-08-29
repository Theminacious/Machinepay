# MachinePay

**Machines that can pay each other.**

MachinePay gives machines programmable economic identities so they can pay for
resources and services automatically, while smart-contract policies prevent
unauthorized spending.

Three machine controllers — an electric vehicle, a charging station, and an
energy provider — hold real balances in a smart contract and settle with each
other through real transactions on Monad. The spending rules live in the
contract, so the dashboard cannot talk a machine into overspending even if it
tries.

```
EV-001  ──0.5 MON──▶  Charger-007  ──1 MON──▶  EnergyProvider-001
                            │
                            └──5 MON──▶  REFUSED (rule: max 2 MON per payment)
```

**Scope, stated up front.** This hackathon MVP *simulates the machine
controllers* — the three machines are software, not hardware on a bench. The
economic identities, the balances, the spending policies and the enforcement of
those policies are implemented on Monad and are real. Nothing in the dashboard
fakes a transaction.

| | |
| --- | --- |
| [1. The problem](#1-the-problem) | [7. Machine spending policies](#7-machine-spending-policies) |
| [2. The solution](#2-the-solution) | [8. Running the demo](#8-running-the-demo) |
| [3. Why blockchain](#3-why-blockchain) | [9. Monad testnet deployment](#9-monad-testnet-deployment) |
| [4. Why Monad](#4-why-monad) | [10. Known limitations](#10-known-limitations) |
| [5. Architecture](#5-architecture) | [11. Future hardware integration](#11-future-hardware-integration) |
| [6. Contract design](#6-contract-design) | [Setup and deployment checklist](#setup-and-deployment-checklist) |

---

## 1. The problem

Machines already consume metered resources on their own — a vehicle draws
electricity, a charger draws grid supply, a delivery robot rents a locker — but
they cannot pay for any of it. Every settlement route available today runs
through a human or a company:

- **A card on file.** The machine has no identity of its own; it spends its
  owner's account with no per-machine limit. One compromised controller can
  spend everything the account can spend.
- **Monthly invoicing.** Works between companies, not between two machines that
  met for four minutes. Reconciliation costs more than the energy did.
- **A backend that holds the money.** Whoever operates the backend can move any
  machine's funds, and every participant has to trust that operator's ledger.

The gap is not payment rails. It is that a machine has no economic identity —
no balance that is its own, and no rules that constrain it independently of the
person who deployed it.

## 2. The solution

Give each machine an identity in a contract, holding three things: **a balance**,
**a policy**, and **a key that may spend within that policy**.

| Machine | Balance | May pay | Max per payment | Per day |
| --- | --- | --- | --- | --- |
| `EV-001` | 1.5 MON | `Charger-007` only | 2 MON | 3 MON |
| `Charger-007` | 1.5 MON | `EnergyProvider-001` only | 2 MON | 5 MON |
| `EnergyProvider-001` | 0 MON | anyone in the fleet (allowlist off) | 5 MON | no cap |

The provider is the end of the chain in the demo and never initiates a payment, so
it is left with the loosest policy of the three — which is useful to point at:
it is what a machine with *no* restrictions looks like beside two that have them.

A charging session becomes `EV-001 → Charger-007, 0.5 MON`, signed by the
vehicle's controller and settled in one transaction. The charger then settles its
own supply bill, `Charger-007 → EnergyProvider-001, 1 MON`, without a human
approving that specific invoice.

The interesting case is the refusal. Ask `Charger-007` to send 5 MON and the
contract rejects it with its own numbers:

```
SpendingLimitExceeded("Charger-007", 5000000000000000000, 2000000000000000000)
```

The dashboard prints those numbers rather than inventing them, and has no code
path that can move money any other way. That is the whole claim of the project:
**a compromised or buggy machine controller cannot spend more than its policy
allows, because the policy is not in the controller.**

## 3. Why blockchain

Not because payments need to be tokenised — because the *policy* needs a home
that neither machine controls.

1. **Enforcement neither party can bypass.** The spending rule is not a check in
   the vehicle's firmware, which the vehicle could be reflashed to skip. It runs
   inside the contract, on hardware the vehicle does not own. The frontend in
   this repo is a good adversary to think about: it holds the operator's wallet
   and still cannot exceed a limit.
2. **A machine-owned balance.** Funds are assigned to `EV-001` itself, not to an
   account the operator shares with a hundred other machines, so the blast radius
   of a compromised controller is that machine's balance and its daily cap.
3. **Settlement without a shared operator.** The vehicle's owner and the
   charger's owner need no contract with each other, no invoicing relationship,
   and no trusted intermediary holding the float.
4. **An audit trail both sides can check.** Every settlement is a transaction
   with a receipt; every refusal is a revert with the rule that caused it. Neither
   party has to trust the other's database export.

## 4. Why Monad

Machine payments are small, frequent, and time-bounded — a charging session that
takes four minutes cannot wait thirty seconds for a settlement, and a 0.5 MON
payment cannot carry a 0.4 MON fee.

- **Latency matches the physical event.** Monad targets sub-second block times.
  A payment that settles inside the session means the charger can meter, charge,
  and confirm while the vehicle is still plugged in, instead of reconciling later.
- **Fee scale matches the payment scale.** These are cents-sized settlements.
  They only make sense on a chain where the fee is a rounding error against the
  energy delivered.
- **Throughput matches the eventual shape of this.** One vehicle is three
  transactions. A city of chargers is a continuous stream of them, and parallel
  execution is what makes independent machine payments not queue behind each
  other.
- **EVM-equivalent, which is why this exists at all in one build.** Solidity
  0.8.28, Hardhat, ethers v6 and viem/wagmi all work unchanged. The only
  Monad-specific code in the repo is a chain definition — chain ID, RPC and
  explorer URL.

Honest note on the last two points: latency and fees are Monad's documented
characteristics, and this repo has not yet measured them (see
[section 9](#9-monad-testnet-deployment)). What it *has* verified is that the
contract and the dashboard need no chain-specific changes to run there.

## 5. Architecture

```
  ┌─ simulated in this MVP ─────────────┐   ┌─ real on Monad ──────────────────┐
  │                                     │   │                                  │
  │  Machine controller  ─── signs ───────▶  MachineWalletManager.sol           │
  │  (browser dashboard /               │   │    ├─ machine registry           │
  │   scripts/demoFlow.js)              │   │    ├─ per-machine balances       │
  │                                     │   │    ├─ per-machine policies       │
  │  reads state ◀───────────────────────────┤    └─ payment history           │
  └─────────────────────────────────────┘   └──────────────────────────────────┘
```

| Path | What it is |
| --- | --- |
| `contracts/contracts/MachineWalletManager.sol` | The single enforcement point: registry, balances, policies, payments, history |
| `contracts/test/MachineWalletManager.test.js` | Core behaviour: identities, funding, payments, limits, ledger integrity |
| `contracts/test/MachinePolicy.test.js` | Policies and abuse cases: daily budgets, allowlists, privilege, precision |
| `contracts/scripts/deploy.js` | Deploys, then writes the ABI + address + block into the frontend |
| `contracts/scripts/setupDemo.js` | Creates, funds and configures the three machines (idempotent; doubles as a CLI reset) |
| `contracts/scripts/demoFlow.js` | Runs the whole judging sequence headlessly, as a stage fallback |
| `contracts/scripts/fleet.js` | The fleet definition — seeds, limits, daily caps, allowlists |
| `frontend/src/` | React 19 + TypeScript + Vite + Tailwind + wagmi/viem dashboard |
| `frontend/scripts/smoke.mjs` | Exercises the dashboard's exact read path without a browser |

Two rules the code sticks to, because they are what makes the demo mean
anything:

1. **The frontend never computes money.** Every balance, limit, remaining daily
   budget, allowlist edge and payment record on screen is read back from the
   contract. The one locally-derived value is the vehicle's battery percentage,
   which is telemetry, not money.
2. **There is exactly one value-moving path between machines.** `payMachine`.
   No admin transfer, no batch settle, no "reset balances" helper — see
   [section 8](#8-running-the-demo) for how the demo reset avoids adding one.

## 6. Contract design

One contract, `MachineWalletManager.sol` (~500 lines, Solidity 0.8.28). A machine
is a struct keyed by `keccak256(machineId)`, so a human-readable label like
`EV-001` addresses it from both the CLI and the browser:

```solidity
struct Machine {
    string  machineId;        // "EV-001"
    string  machineType;      // "vehicle" / "charger" / "utility"
    address owner;            // fleet operator: full control over the policy
    address controller;       // the machine's own key: may initiate payments only
    uint256 balance;          // native MON held by this contract, credited here
    uint256 spendingLimit;    // max value of a single outgoing payment
    bool    active;           // false == paused: cannot send or receive
    bool    allowlistEnabled; // true == may only pay explicitly allowed machines
    uint256 dailyLimit;       // max total outgoing per UTC day. 0 == no cap
    uint256 spentToday;       // accumulator, only meaningful for `dayIndex`
    uint256 dayIndex;         // block.timestamp / 1 days
    // ... totalSpent, totalReceived, exists
}
```

**Two keys per machine, deliberately split.** The `owner` is the fleet operator
and is the only address that may change a policy. The `controller` is the key
that lives on the device and may only *initiate payments within* the policy.
Firmware never holds the key that could raise its own limit — which is what makes
the limit worth anything.

**Balances are an internal ledger over the contract's own MON.** `createMachine`
and `deposit` are `payable`, so seeding a machine really moves MON into the
contract. A machine-to-machine payment is a ledger move between two struct
fields inside one transaction: no external call, so no reentrancy surface.
`withdraw` is the only path that sends MON out, and it applies effects before the
call. The invariant `sum(balances) == totalLedger <= address(this).balance` is
asserted by the test suite.

**`payMachine` is the only function that moves value between machines**, and it
checks, in this order:

| # | Check | Revert |
| --- | --- | --- |
| 1 | non-zero amount, not a self-payment, both machines exist | `ZeroAmount` / `SelfPayment` / `MachineNotFound` |
| 2 | caller is the payer's `owner` **or** its `controller` | `NotAuthorized(machineId, caller)` |
| 3 | both machines active | `MachineIsPaused(machineId)` |
| 4 | amount within the per-payment limit | `SpendingLimitExceeded(machineId, requested, limit)` |
| 5 | amount within what is left of today's budget | `DailyLimitExceeded(machineId, requested, remainingToday, dailyLimit)` |
| 6 | payee is on the payer's allowlist | `CounterpartyNotAllowed(fromId, toId)` |
| 7 | payer holds the funds | `InsufficientBalance(machineId, requested, available)` |

Policy is checked **before** funds on purpose: a 5 MON request from a machine
holding 100 MON is a policy failure, not a funding one, and the demo has to show
the rule refusing rather than "not enough money".

**Every error carries its arguments.** That is why the dashboard can display the
contract's own numbers instead of guessing at them — the panel that says
`Requested 5 MON / Maximum allowed 2 MON` is rendering
`SpendingLimitExceeded`'s second and third arguments. The frontend decodes the
revert; it does not author the message.

**A refused payment leaves nothing behind.** All seven checks precede the first
write, so a revert consumes no daily budget, appends no payment record, and emits
no event. There is a test that refuses a payment three different ways and asserts
`remainingToday` and `paymentCount` are untouched.

**History is on chain twice, on purpose.** `payments[]` gives the dashboard a
paginated record it can read with one call; `PaymentExecuted` carries the same
`paymentIndex`, which is how the dashboard recovers transaction hashes (storage
cannot know them) and joins them back to the right record. A test asserts the log
and the storage record describe the same payment, so that join cannot drift.

## 7. Machine spending policies

The dashboard's **Machine spending policies** panel shows five rules per machine.
Each one is contract state, read back over RPC — the panel is a view of the
contract, not a copy of it.

| Rule shown | Contract state | Enforced by |
| --- | --- | --- |
| **Can receive from** | every machine whose `allowlistEnabled` is off, plus those with `counterpartyAllowed[them][this]` | the payer's allowlist check |
| **Can pay** | `allowlistEnabled` off ⇒ anyone; on ⇒ `counterpartyAllowed[this][other]` | `CounterpartyNotAllowed` |
| **Maximum payment** | `spendingLimit` | `SpendingLimitExceeded` |
| **Daily spending** | `dailyLimit`, `remainingToday()` | `DailyLimitExceeded` |
| **Status** ACTIVE / PAUSED | `active` | `MachineIsPaused` |

Two of these deserve a note.

**The daily budget is what actually bounds a compromised controller.** A
per-payment limit of 2 MON does not stop a controller from sending 2 MON in a
loop; a 5 MON daily cap does. It is a rolling UTC-day accumulator
(`block.timestamp / 1 days`), so it needs no keeper and no cron: the first payment
of a new day sees a stale `dayIndex` and starts from zero. `dailyLimit == 0` means
no cap, which is how the energy provider is configured — it never initiates a
payment in the demo. If an owner *lowers* a cap below what has already been
spent today, the remainder clamps at zero rather than underflowing.

**The allowlist is per-machine and off by default.** Switching it on turns a
machine from "may pay anyone in the fleet" into "may pay exactly these", and the
dashboard says which of the two it is rather than printing an allowlist that is
not being enforced. `EV-001` may only ever pay a charger, so a controller talked
into paying an attacker's machine is refused even for 0.001 MON — an amount every
limit in the system would allow.

### The four states the dashboard distinguishes

A judge should never have to guess which of these they are looking at, so each
one has its own visual treatment:

| State | What it means | How it looks |
| --- | --- | --- |
| **Policy configured** | the rule is contract state, no payment in flight | neutral pill on the machine's policy card |
| **Payment requested** | the dashboard has asked the contract whether this is permitted (`canPay` / `simulateContract`), nothing signed | mint panel, spinner, "Checking spending rules" |
| **Payment approved** | mined and confirmed, with a block number and an explorer link | mint panel, check mark, "Payment confirmed" |
| **Payment rejected** | the contract refused, with the rule that refused it | red panel, shake, the rule name and both numbers, "Funds protected — no balance moved" |

The rejection path is worth being precise about. The dashboard simulates the call
first, so a refusal is known **before a wallet prompt appears** — no signature, no
gas, no transaction. That is the honest behaviour, but it invites a fair
challenge: *is the frontend just hiding the button?* So the rejection panel offers
**Submit it anyway → prove the refusal on chain**, which skips the pre-flight and
sends the payment for real. The contract reverts it, and you get an explorer link
to a failed transaction that moved nothing.

## 8. Running the demo

### 8.1 Install and verify

Node.js 20+ and npm. Two npm projects, installed separately.

```bash
cd machinepay/contracts && npm install
cd ../frontend  && npm install
```

Verify the contract before going anywhere near a network:

```bash
cd machinepay/contracts
npm test          # 62 passing
```

### 8.2 Configure

`contracts/.env` (copy from `contracts/.env.example`) — **required to deploy**:

```bash
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
PRIVATE_KEY=                # required. A THROWAWAY testnet key. Never a real one.
CONTRACT_ADDRESS=           # optional, else read from deployments.json
```

`PRIVATE_KEY` is the only variable you must set, and nothing in this repo prints
it, logs it, or writes it anywhere. `.env.example` also lists optional per-machine
overrides (`SEED_*`, `LIMIT_*`, `DAILY_*`, `CONTROLLER_*`) if you want to change
the fleet without editing `scripts/fleet.js`.

`frontend/.env.local` (copy from `frontend/.env.example`) — **entirely optional**.
With no file at all the dashboard targets Monad testnet and reads the address the
deploy script recorded:

```bash
VITE_CHAIN_ID=10143            # 31337 to develop against a local Hardhat node
VITE_CONTRACT_ADDRESS=         # override the recorded address
VITE_MONAD_RPC_URL=            # override the RPC endpoint
```

Missing configuration degrades rather than crashes: with no `PRIVATE_KEY` the
deploy scripts stop with a one-line explanation and the faucet URL; with no
recorded deployment the dashboard renders and says the contract is not deployed on
this chain; on the wrong network the header pill offers to switch.

### 8.3 Deploy to Monad testnet

```bash
cd machinepay/contracts
npm run deploy        # hardhat run scripts/deploy.js --network monadTestnet
npm run setup         # creates the three machines with their policies
```

`deploy` prints the deployer, its balance, the deployed address and an explorer
link, then writes two files into the frontend so there is no address to copy by
hand:

- `frontend/src/lib/abi.ts` — the ABI
- `frontend/src/lib/deployments.json` — `{ "10143": { address, deployer, blockNumber, … } }`

The recorded `blockNumber` is where the dashboard starts scanning for
`PaymentExecuted` logs; public RPCs refuse genesis-wide ranges, so this matters.

`setup` sends one transaction per machine — `createMachineWithPolicy` carries the
identity, the seed funding, the per-payment limit, the daily cap and the allowlist
together, which is why browser setup is three wallet prompts and not eight. It
prints every machine id, its address key, each transaction hash and an explorer
URL. It is idempotent and doubles as a CLI reset (see 8.6), and it skips machines
owned by another address.

You can skip `npm run setup` and register the fleet from the dashboard instead.
Whoever registers becomes the fleet operator.

### 8.4 Start the dashboard

```bash
cd machinepay/frontend
npm run dev           # http://localhost:5173
```

Also available: `npm run build`, `npm run typecheck`, and
`node scripts/smoke.mjs 10143` — a browserless check that reads the fleet, the
policy matrix, the remaining daily budgets, the payment history with real
transaction hashes, and the refusal, straight from the deployed contract. Worth
running 60 seconds before presenting.

### Local alternative (no faucet, no testnet)

Everything runs against a local Hardhat chain, which is the right way to rehearse:

```bash
cd machinepay/contracts
npx hardhat node                                # terminal 1
npm run deploy:local && npm run setup:local     # terminal 2
cd ../frontend && VITE_CHAIN_ID=31337 npm run dev
```

### 8.5 The seven steps for judging

The 90-second spoken version is in [HACKATHON_DEMO.md](HACKATHON_DEMO.md). This is
the mechanical checklist.

**Before you present:** dashboard open, wallet connected, network pill reads
*Monad Testnet*, three cards showing 1.5 / 1.5 / 0 MON, battery at 18%, the Demo
mode panel reading *fleet live*.

| # | Action | What must happen |
| --- | --- | --- |
| 1 | **Connect wallet** in the header | pill turns to Monad Testnet, controls unlock |
| 2 | Read the three machine cards | live on-chain balances, each with its spending rule |
| 3 | Click **Simulate charging session** (`EV-001 → Charger-007`, 0.5 MON), approve | flow edge animates; confirmed panel with block number and explorer link |
| 4 | Watch the balances | EV 1.5 → 1.0, Charger 1.5 → 2.0, battery 18% → 45%, entry appears in Machine activity |
| 5 | Click **Pay energy provider** (`Charger-007 → EnergyProvider-001`, 1 MON), approve | second real transaction; Provider 0 → 1 MON |
| 6 | Click **Test spending limit** (`Charger-007 → EnergyProvider-001`, 5 MON) | **no wallet prompt.** Red panel: `TRANSACTION BLOCKED / Spending policy exceeded / Requested 5 MON / Maximum allowed 2 MON / Machine Charger-007 / Rule SpendingLimitExceeded` |
| 7 | Point at the balances and the activity feed | both unchanged. Nothing settled. "Funds protected — no balance moved." |

Optional closer if a judge suspects the UI is hiding the button: **Submit it
anyway → prove the refusal on chain**. Real transaction, real revert, explorer
link, nothing moved.

### 8.6 Resetting between runs

Judging should start from the same numbers every time, so there are two reset
paths and they agree with each other:

- **In the dashboard:** the Demo mode panel's **Reset fleet to demo state**
  button, which is disabled and reads *Fleet is in demo state* when there is
  nothing to do.
- **On the CLI:** re-run `npm run setup` (or `setup:local`).

Both are built out of functions that already existed — owner-only `withdraw` for
a machine holding more than its seed, `deposit` for one holding less, plus the
ordinary policy setters. **There is deliberately no contract-side "reset
balances" function**: an owner-callable way to move a machine's money around
would be exactly the spending-limit bypass the rest of the design exists to
prevent.

One thing a reset cannot undo: the **daily budget already spent today**. The
accumulator is a UTC-day counter with no owner override — by design, since an
override would be a bypass — so it clears at 00:00 UTC. The demo spends 0.5 MON
of `EV-001`'s 3 MON and 1 MON of `Charger-007`'s 5 MON per run, so a UTC day fits
five full run-throughs. Rehearse against the local chain and you never touch the
testnet budget.

### 8.7 Headless fallback

If the wallet or the browser misbehaves on stage:

```bash
cd machinepay/contracts && npm run demo
```

Same three steps from the CLI, printing transaction hashes, explorer URLs and the
decoded refusal. It exits non-zero if the contract ever *accepts* the over-limit
payment.

## 9. Monad testnet deployment

<!-- Fill this in from the output of `npm run deploy`. -->

| | |
| --- | --- |
| Network | Monad Testnet (chain ID `10143`) |
| Contract address | `TBD — paste the address npm run deploy prints` |
| Explorer | `https://testnet.monadscan.com/address/<address>` |
| Deployed at block | recorded automatically in `frontend/src/lib/deployments.json` |
| Deployer | `TBD` |
| Machines | `EV-001`, `Charger-007`, `EnergyProvider-001` |

**Status: not deployed yet.** Deployment needs a funded throwaway `PRIVATE_KEY` in
`contracts/.env`, which is not in this repo and never will be. Run
`npm run deploy && npm run setup`, paste the address above, and the dashboard picks
it up automatically. No code path differs between the local chain and Monad
testnet, but until that command has run, treat testnet as unverified — see
[section 10](#10-known-limitations).

## 10. Known limitations

This is a hackathon prototype. **Do not treat the contract as production secure.**
It has had a focused self-review and a test suite, not an audit.

**What is simulated**

- **The machine controllers.** The vehicle, charger and provider are software —
  the dashboard and `scripts/demoFlow.js` play their part. Every economic action
  they take is real.
- **The battery percentage**, which is telemetry, not money, and is the only
  number on screen not read from the contract.
- **Pricing.** Amounts are fixed demo constants (0.5 MON per session, 1 MON per
  supply bill). A real charger would meter kWh and price it; nothing in the
  contract cares where the number came from.

**What the policies do and do not protect against**

- They bound a **compromised or buggy controller**: it cannot exceed the
  per-payment limit, the daily budget, or the allowlist, and it cannot change any
  of them.
- They do **not** bound a **malicious fleet operator**. The `owner` of a machine
  can raise its limits, pause it, and `withdraw` its balance to any address. That
  is the intended trust model — the operator funded the machine — but it means the
  security claim is about the machine, not about the operator.
- **No contract-wide emergency stop.** Pausing is per machine.
- **No upgradeability.** A bug means redeploying and re-registering the fleet.

**Other honest gaps**

- Native MON only; no stablecoin or ERC-20 support.
- The daily cap resets at 00:00 UTC rather than on a rolling 24-hour window,
  which is cheaper on gas and coarser in behaviour.
- `getAllMachines()` iterates the whole registry. Fine at three machines; a real
  fleet would use the paginated reads.
- The frontend ships as one ~620 kB chunk with no code splitting.
- **Monad testnet is unverified** until section 9 is filled in. Everything below
  has been verified on a local Hardhat chain (31337) only.

**What the self-review covered.** Unauthorized machine payments, unauthorized
machine creation, owner/controller privilege boundaries, spending-limit bypass
routes, integer and precision handling (down to single-wei payments), reentrancy
on the one external call, balance accounting against `address(this).balance`,
pause behaviour, recipient validation (`address(0)`, self-payment), and whether
one machine can spend another's balance. Each finding or confirmed boundary has a
test; the suite is 62 cases across `MachineWalletManager.test.js` and
`MachinePolicy.test.js`.

## 11. Future hardware integration

The MVP simulates the controller. Nothing above the controller changes when the
machine is physical:

```
Physical machine  →  On-device controller  →  MachinePay SDK  →  Machine wallet  →  Monad
 (charger, ECU)      (Raspberry Pi, ECU)      (signs payMachine)     contract
 ├── simulated in this MVP ────────────────┤  ├── unchanged, already real ───────────────┤
```

The seam is already cut for it. Each machine has a `controller` address distinct
from its `owner`, and `payMachine` accepts either. So the path to hardware is:

1. **Generate a keypair on the device** and never let it leave. Store it in
   whatever secure element the hardware has.
2. **Register the machine with that address** as its controller — already
   supported today via `createMachineWithPolicy(...)` or `setController(...)`, and
   already exposed as `CONTROLLER_EV` / `CONTROLLER_CHARGER` /
   `CONTROLLER_PROVIDER` in `contracts/.env.example`.
3. **Replace the dashboard button with a meter reading.** The charger's controller
   calls `payMachine` when its energy meter says a session ended, instead of when
   a human clicks. The contract sees no difference.
4. **Rotate keys through the operator.** `setController` lets an operator retire a
   device key without touching balances or policies, which is how a stolen
   controller is handled.

What genuinely remains outside this repo: metering and pricing, gas funding for
device keys (a controller needs native MON to submit), offline queueing for a
machine that loses connectivity mid-session, and a discovery mechanism so a
vehicle learns which machine id a charger it just plugged into actually is.

---

## Setup and deployment checklist

Everything you need to have in hand, in order. Nothing here asks for or prints a
private key.

**Before deploying**

- [ ] Node.js 20+ and npm installed
- [ ] `npm install` run in both `contracts/` and `frontend/`
- [ ] `npm test` in `contracts/` → **62 passing**
- [ ] A **throwaway** wallet created for this demo (never a key with real funds)
- [ ] That key set as `PRIVATE_KEY` in `contracts/.env` — copied from
      `contracts/.env.example`, and `.env` is gitignored
- [ ] `MONAD_RPC_URL=https://testnet-rpc.monad.xyz` (the default, if unset)
- [ ] Deployer funded from `https://faucet.monad.xyz` — **~4 MON** covers it:
      3 MON seeds the fleet (1.5 + 1.5 + 0) and the rest is gas
- [ ] Monad testnet added to the browser wallet: chain ID `10143`, RPC
      `https://testnet-rpc.monad.xyz`, currency **MON** (18 decimals), explorer
      `https://testnet.monadscan.com`
- [ ] The browser wallet funded too — it signs the machine payments during the
      demo. It may be the same key as the deployer.

**Deploying**

- [ ] `cd contracts && npm run deploy` → address printed and written to
      `frontend/src/lib/deployments.json`
- [ ] `npm run setup` → three machines created, seeded and configured
- [ ] Paste the address and deployer into [section 9](#9-monad-testnet-deployment)
- [ ] `cd ../frontend && node scripts/smoke.mjs 10143` → exits 0
- [ ] `npm run dev`, connect the wallet, confirm the three cards read 1.5 / 1.5 / 0

**Before presenting**

- [ ] Demo mode panel reads *fleet live* and *Fleet is in demo state*
- [ ] One rehearsal on the **local** chain, not the testnet, to preserve the daily
      budgets
- [ ] `npm run demo` known to work, as the headless fallback

## Status of this build

Written down plainly, because "it works" should mean something.

- **Contract:** complete. **62/62 tests pass** (`npm test` in `contracts/`).
- **Frontend:** `tsc --noEmit` clean, `vite build` clean, no console errors in a
  headless render check.
- **Verified end to end on a local Hardhat chain (31337):** deploy → setup →
  three real transactions (0.5 MON, 1 MON, and the refused 5 MON) → decoded
  revert → dashboard rendering live contract state → reset back to the seed
  numbers → `scripts/smoke.mjs` green, including the policy matrix, remaining
  daily budgets and `PaymentExecuted` log join.
- **Monad testnet deployment: not done yet.** It needs a funded throwaway
  `PRIVATE_KEY`, which is yours to supply.









