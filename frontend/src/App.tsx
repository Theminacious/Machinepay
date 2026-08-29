import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import { ActivityFeed } from "./components/ActivityFeed";
import { ControlPanel, type Action } from "./components/ControlPanel";
import { FlowVisualizer, type EdgeState } from "./components/FlowVisualizer";
import { Header } from "./components/Header";
import { HowItWorks } from "./components/HowItWorks";
import { MachineCard, type CardStatus } from "./components/MachineCard";
import { PaymentStatusPanel } from "./components/PaymentStatusPanel";
import { PolicyPanel } from "./components/PolicyPanel";
import { SetupPanel } from "./components/SetupPanel";
import { useActivity } from "./hooks/useActivity";
import { useFleet } from "./hooks/useFleet";
import { usePayment, type PaymentIntent } from "./hooks/usePayment";
import { useSetup } from "./hooks/useSetup";
import { isSupportedChain, preferredChain } from "./lib/chain";
import { clampPercent } from "./lib/format";
import {
  BATTERY_GAIN_PCT,
  CHARGER_ID,
  CHARGE_PRICE,
  ENERGY_SETTLEMENT,
  EV_ID,
  OVER_LIMIT_ATTEMPT,
  PROVIDER_ID,
  START_BATTERY_PCT,
} from "./lib/machines";

const EDGE_FOR_PAYER: Record<string, 0 | 1> = { [EV_ID]: 0, [CHARGER_ID]: 1 };

const EDGE_STATE: Record<string, EdgeState> = {
  checking: "flowing",
  signing: "flowing",
  pending: "flowing",
  confirmed: "confirmed",
  blocked: "blocked",
  failed: "blocked",
};

export default function App() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { data: walletBalance } = useBalance({ address, query: { refetchInterval: 8000 } });

  const fleet = useFleet();
  const payment = usePayment();
  // The timeline needs the live payment so a refusal — which never becomes
  // contract state — still shows up in the machine's history.
  const activity = useActivity(12, payment.status);

  const refreshAll = useCallback(() => {
    void fleet.refetch();
    void activity.refetch();
  }, [activity, fleet]);

  const setup = useSetup(refreshAll);

  /// Battery is local machine telemetry — the physical side of the simulation.
  /// Money is on chain; charge level is not.
  const [battery, setBattery] = useState(START_BATTERY_PCT);
  const [flowVisible, setFlowVisible] = useState(true);

  const { phase, intent } = payment.status;
  const busy = phase === "checking" || phase === "signing" || phase === "pending";

  // Let a finished flow rest after a few seconds; the receipt panel stays put.
  useEffect(() => {
    if (phase !== "confirmed" && phase !== "blocked" && phase !== "failed") {
      setFlowVisible(true);
      return;
    }
    setFlowVisible(true);
    const timer = setTimeout(() => setFlowVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [phase, payment.status.hash]);

  const onChargeConfirmed = useCallback(() => {
    setBattery((current) => clampPercent(current + BATTERY_GAIN_PCT));
    refreshAll();
  }, [refreshAll]);

  const run = useCallback(
    (next: PaymentIntent, options?: { onConfirmed?: () => void }) => {
      void payment.pay(next, { onConfirmed: options?.onConfirmed ?? refreshAll });
    },
    [payment, refreshAll],
  );

  const proveOnChain = useCallback(() => {
    if (!intent) return;
    void payment.pay(intent, { force: true, onConfirmed: refreshAll });
  }, [intent, payment, refreshAll]);

  const onSupportedChain = isSupportedChain(chainId);
  const ev = fleet.byId.get(EV_ID);
  const charger = fleet.byId.get(CHARGER_ID);

  const blockedReason = useMemo(() => {
    if (!isConnected) return "Connect a wallet to act as the fleet operator.";
    if (!onSupportedChain) return `Switch your wallet to ${preferredChain.name}.`;
    if (!fleet.contractAddress) return "MachinePay is not deployed on this network.";
    if (!fleet.allRegistered) return "Initialise the demo fleet to give these machines on-chain identities.";
    if (ev && !ev.controllable) return `This wallet does not operate ${EV_ID}. Its operator is ${ev.owner}.`;
    return undefined;
  }, [ev, fleet.allRegistered, fleet.contractAddress, isConnected, onSupportedChain]);

  const controlsDisabled = Boolean(blockedReason);

  const actions: Action[] = [
    {
      key: "charge",
      title: "Simulate charging session",
      route: `${EV_ID} → ${CHARGER_ID}`,
      amount: CHARGE_PRICE,
      hint: "The vehicle pays for energy drawn",
      variant: "primary",
      disabled: controlsDisabled,
      onRun: () =>
        run(
          { from: EV_ID, to: CHARGER_ID, amount: CHARGE_PRICE, label: "Charging session" },
          { onConfirmed: onChargeConfirmed },
        ),
    },
    {
      key: "settle",
      title: "Pay energy provider",
      route: `${CHARGER_ID} → ${PROVIDER_ID}`,
      amount: ENERGY_SETTLEMENT,
      hint: "The charger settles its supply bill",
      variant: "secondary",
      disabled: controlsDisabled,
      onRun: () => run({ from: CHARGER_ID, to: PROVIDER_ID, amount: ENERGY_SETTLEMENT, label: "Energy settlement" }),
    },
    {
      key: "limit",
      title: "Test spending limit",
      route: `${CHARGER_ID} → ${PROVIDER_ID}`,
      amount: OVER_LIMIT_ATTEMPT,
      hint: "Above the charger's rule — the contract refuses",
      variant: "danger",
      disabled: controlsDisabled,
      onRun: () =>
        run({ from: CHARGER_ID, to: PROVIDER_ID, amount: OVER_LIMIT_ATTEMPT, label: "Bulk energy purchase" }),
    },
  ];

  const activeEdge = flowVisible && intent ? (EDGE_FOR_PAYER[intent.from] ?? null) : null;
  const edgeState: EdgeState = activeEdge === null ? "idle" : (EDGE_STATE[phase] ?? "idle");

  const statusFor = (id: string): CardStatus => {
    const machine = fleet.byId.get(id);
    if (!machine?.registered) return { label: "Not registered", tone: "idle" };
    if (!machine.active) return { label: "Paused", tone: "bad" };
    const involved = busy && (intent?.from === id || intent?.to === id);
    if (id === EV_ID) {
      if (involved) return { label: "Charging", tone: "ok" };
      return battery < 30 ? { label: "Needs charging", tone: "warn" } : { label: "Ready", tone: "ok" };
    }
    if (id === CHARGER_ID) {
      if (involved) return { label: "In session", tone: "ok" };
      return { label: "Available", tone: "ok" };
    }
    return { label: "Online", tone: "ok" };
  };

  const noteFor = (id: string): string | undefined => {
    if (busy && intent?.from === id) return `Requesting payment to ${intent.to}`;
    if (busy && intent?.to === id) return `Incoming payment from ${intent.from}`;
    if (phase === "blocked" && intent?.from === id) return "Payment refused by its own spending rule";
    if (id === EV_ID && phase === "confirmed" && intent?.from === EV_ID) return `Battery topped up to ${battery}%`;
    if (id === CHARGER_ID) {
      const price = charger ? "0.5 MON per session" : undefined;
      return price;
    }
    return undefined;
  };

  return (
    <div className="app-backdrop min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        <Header />

        <div className="mt-6">
          <HowItWorks />
        </div>

        <main className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="grid min-w-0 gap-5">
            <div className="grid gap-4 md:grid-cols-3">
              {fleet.machines.map((machine) => (
                <MachineCard
                  key={machine.spec.id}
                  machine={machine}
                  status={statusFor(machine.spec.id)}
                  note={noteFor(machine.spec.id)}
                  battery={machine.spec.kind === "vehicle" ? battery : undefined}
                  pulse={
                    activeEdge !== null && intent
                      ? intent.from === machine.spec.id
                        ? "out"
                        : intent.to === machine.spec.id
                          ? "in"
                          : null
                      : null
                  }
                />
              ))}
            </div>

            <FlowVisualizer
              machines={fleet.machines}
              activeEdge={activeEdge}
              edgeState={edgeState}
              activeAmount={intent?.amount}
              restingAmounts={[CHARGE_PRICE, ENERGY_SETTLEMENT]}
            />

            <PaymentStatusPanel
              status={payment.status}
              chainId={chainId}
              onDismiss={payment.reset}
              onProveOnChain={proveOnChain}
            />

            <ControlPanel actions={actions} busy={busy} blockedReason={blockedReason} />

            <PolicyPanel machines={fleet.machines} payment={payment.status} />
          </div>

          <aside className="grid min-w-0 gap-5">
            <SetupPanel
              machines={fleet.machines}
              contractAddress={fleet.contractAddress}
              chainId={chainId}
              walletBalance={walletBalance?.value}
              isConnected={isConnected}
              status={setup.status}
              needsReset={setup.needsReset(fleet.machines)}
              onRegister={() => void setup.registerFleet(fleet.machines)}
              onReset={() => void setup.resetFleet(fleet.machines)}
              onFund={(id, amount) => void setup.fund(id, amount)}
            />
            <ActivityFeed
              entries={activity.entries}
              chainId={chainId}
              isLoading={activity.isLoading}
              settledCount={activity.settledCount}
            />
          </aside>
        </main>

        <footer className="mt-8 border-t border-ink-700/70 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-ink-400">
            MachinePay gives machines programmable economic identities so they can pay for resources and services
            automatically, while smart-contract policies prevent unauthorized spending.
          </p>
          <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.7rem] text-ink-500">
            {["Physical machine", "On-device controller", "MachinePay SDK", "Machine wallet contract", "Monad"].map(
              (step, index, all) => (
                <li key={step} className="flex items-center gap-2">
                  <span className={index === 1 || index === 2 ? "text-mint-300/70" : ""}>{step}</span>
                  {index < all.length - 1 && <span aria-hidden="true">→</span>}
                </li>
              ),
            )}
          </ol>
          <p className="mt-2 text-[0.7rem] text-ink-500">
            This demo implements everything from the simulated controller onward. Balances, limits and refusals are
            contract state on {preferredChain.name}.
          </p>
        </footer>
      </div>
    </div>
  );
}
