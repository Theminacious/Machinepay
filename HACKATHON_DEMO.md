# MachinePay — 90-second demo script

**Tagline:** Machines that can pay each other.

Total 90 seconds: 15 problem, 15 solution, 45 demo, 15 ending. The demo section is
the point — protect its 45 seconds by keeping the first two short.

**Before you start:** dashboard open on Monad Testnet, wallet connected, cards
reading `EV-001` 1.5 MON, `Charger-007` 1.5 MON, `EnergyProvider-001` 0 MON,
battery 18%, Demo mode panel reading *fleet live*. Wallet popup already unlocked so
approvals are one click. Explorer tab open in a second window.

---

## PROBLEM — 15 seconds

> "Machines already consume things they cannot pay for. An electric vehicle draws
> electricity. The charger draws grid supply. Today every one of those settlements
> runs through a human or a company card — because a machine has no money of its
> own, and no rules of its own. Put a card on a machine and it can spend
> everything the card can spend."

*Nothing on screen yet — say this over the dashboard's* HOW IT WORKS *strip.*

## SOLUTION — 15 seconds

> "MachinePay gives machines programmable economic identities so they can pay for
> resources and services automatically, while smart-contract policies prevent
> unauthorized spending. Each of these three machines has its own balance, and its
> own rules: who it may pay, the most it may send at once, how much per day. The
> rules live in the contract on Monad — not in the machine, and not in this
> dashboard."

*Point at the* **Machine spending policies** *panel: five rules, per machine.*

## DEMO — 45 seconds

### 1. The vehicle pays for a charge (15s)

**Click** `Simulate charging session` — `EV-001 → Charger-007`, 0.5 MON. Approve in
the wallet.

> "The vehicle is charging, so it pays the charger. Half a MON, signed by the
> vehicle's own controller."

Wait for the confirmation panel, then point at three things:

- the block number and the **View on Monadscan** link — *"that is a real
  transaction on Monad testnet"*
- the balances: EV 1.5 → 1.0, Charger 1.5 → 2.0
- the battery: 18% → 45%

### 2. The charger pays its own supplier (10s)

**Click** `Pay energy provider` — `Charger-007 → EnergyProvider-001`, 1 MON.
Approve.

> "Now the charger settles its own supply bill. No human approved that invoice —
> the machine paid it, under the rules its operator gave it. Machine to machine."

Provider 0 → 1 MON. Second entry in **Machine activity**, with its own explorer
link.

### 3. The rule holds (20s) — *this is the moment*

Point at `Charger-007`'s card: **max 2 MON**.

**Click** `Test spending limit` — `Charger-007 → EnergyProvider-001`, 5 MON.

> "This machine's operator set a limit of two MON per payment. Now the machine is
> asking to send five."

**No wallet prompt appears.** Let the red panel land, then read it out:

```
TRANSACTION BLOCKED
Spending policy exceeded

Requested         5 MON
Maximum allowed   2 MON
Machine           Charger-007
Rule              SpendingLimitExceeded

Funds protected — no balance moved.
```

> "Those two numbers are not written in the frontend. They come out of the
> contract's own error. The dashboard asked, and the contract said no."

Point at the balances: **unchanged.** Nothing entered the activity feed.

## ENDING — 15 seconds

> "Two real payments settled between machines, and one refused by the contract
> itself. The machines here are simulated controllers — but the identities, the
> balances, the policies and the enforcement are all on Monad. Swap the simulated
> controller for a Raspberry Pi on a real charger and nothing above it changes:
> each machine already has its own on-device key, separate from the operator key
> that sets its rules.
>
> Machines that can pay each other — and cannot overspend."

---

## If a judge pushes back

**"Isn't the frontend just hiding the button?"**
Click **Submit it anyway → prove the refusal on chain**. It skips the pre-flight
check and sends the payment for real. The contract reverts it; you get an explorer
link to a failed transaction that moved nothing.

**"Could you change the limit from the dashboard?"**
Only as the machine's owner, and that is the point of the two-key split: the
`controller` key on the device can spend within the policy but cannot change it.
`setSpendingLimit` is owner-only.

**"What stops a machine from sending 2 MON a thousand times?"**
The daily budget. `Charger-007` is capped at 5 MON per day; the policy panel shows
what is left of it right now. A per-payment limit alone would not bound a
compromised controller — that is why both exist.

**"Is this production ready?"**
No. It is a hackathon prototype with a 62-case test suite and a focused
self-review, not an audit. The honest limitations are listed in the README.

## If something goes wrong

| Symptom | Do this |
| --- | --- |
| Wallet on the wrong network | Click the header pill — it offers the switch |
| Wallet popup does not appear | It is usually behind the browser window; check the extension icon |
| A payment sits pending | The panel keeps the explorer link. Open it rather than clicking again |
| RPC error / dashboard cannot read | Set `VITE_MONAD_RPC_URL` to a private endpoint and restart the dev server |
| Balances are not the demo numbers | Demo mode panel → **Reset fleet to demo state**, or `npm run setup` |
| `Daily spending budget exhausted` | You have run the demo five times today. It clears at 00:00 UTC — rehearse on the local chain instead |
| Browser or wallet unusable on stage | `cd contracts && npm run demo` — same three steps, printed hashes and the decoded refusal |

## One-line pitch, if that is all there is time for

> MachinePay gives machines programmable economic identities so they can pay for
> resources and services automatically, while smart-contract policies prevent
> unauthorized spending.


