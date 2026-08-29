import { keccak256, parseEther, toHex } from "viem";

/// Mirrors contracts/scripts/fleet.js. If you rename a machine or change a
/// limit, change it in both places.
export type MachineKind = "vehicle" | "charger" | "utility";

export type MachineSpec = {
  id: string;
  kind: MachineKind;
  /// What this machine is, in plain language — no crypto vocabulary on screen.
  role: string;
  seed: string;
  limit: string;
  /// Rolling budget per UTC day. "0" means the contract applies no daily cap.
  daily: string;
  /// Machines this one is permitted to pay. A non-empty list turns the
  /// contract's allowlist on, so anything not listed here is refused on chain.
  allowed: string[];
};

export const EV_ID = "EV-001";
export const CHARGER_ID = "Charger-007";
export const PROVIDER_ID = "EnergyProvider-001";

export const FLEET: MachineSpec[] = [
  { id: EV_ID, kind: "vehicle", role: "Electric vehicle", seed: "0.05", limit: "0.03", daily: "0.1", allowed: [CHARGER_ID] },
  {
    id: CHARGER_ID,
    kind: "charger",
    role: "Charging station",
    seed: "0.05",
    limit: "0.03",
    daily: "0.1",
    allowed: [PROVIDER_ID],
  },
  { id: PROVIDER_ID, kind: "utility", role: "Energy provider", seed: "0", limit: "0.1", daily: "0", allowed: [] },
];

/// Demo economics, matching contracts/scripts/demoFlow.js.
export const CHARGE_PRICE = parseEther("0.01");
export const ENERGY_SETTLEMENT = parseEther("0.02");
export const OVER_LIMIT_ATTEMPT = parseEther("0.04");

/// kWh delivered per charging session — local telemetry, not money.
export const BATTERY_GAIN_PCT = 27;
export const START_BATTERY_PCT = 18;

export function specFor(id: string): MachineSpec | undefined {
  return FLEET.find((m) => m.id === id);
}

/// Same key the contract derives: keccak256(bytes(machineId)).
export function machineKey(id: string): `0x${string}` {
  return keccak256(toHex(id));
}

const KEY_TO_ID = new Map(FLEET.map((m) => [machineKey(m.id).toLowerCase(), m.id]));

/// Resolves a payment record's fromKey/toKey back to a label. Unknown machines
/// (registered outside this demo) fall back to a short hash.
export function labelForKey(key: string): string {
  return KEY_TO_ID.get(key.toLowerCase()) ?? `${key.slice(0, 10)}…`;
}
