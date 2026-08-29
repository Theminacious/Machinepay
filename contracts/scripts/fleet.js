/// The demo fleet. Mirrored in frontend/src/lib/machines.ts — keep the two in
/// sync if you rename a machine or change a policy.
const { parseEther } = require("ethers");

const env = (name, fallback) => (process.env[name] !== undefined ? process.env[name] : fallback);

const EV = "EV-001";
const CHARGER = "Charger-007";
const PROVIDER = "EnergyProvider-001";

const FLEET = [
  {
    id: EV,
    type: "vehicle",
    // Enough headroom for several 0.5 MON charging sessions.
    seed: env("SEED_EV", "1.5"),
    limit: env("LIMIT_EV", "2"),
    daily: env("DAILY_EV", "3"),
    // The vehicle's money may only ever go to a charger.
    allowed: [CHARGER],
    controller: env("CONTROLLER_EV", ""),
  },
  {
    id: CHARGER,
    type: "charger",
    seed: env("SEED_CHARGER", "1.5"),
    // The star of the demo: 2 MON per payment, so a 5 MON request is refused.
    limit: env("LIMIT_CHARGER", "2"),
    daily: env("DAILY_CHARGER", "5"),
    allowed: [PROVIDER],
    controller: env("CONTROLLER_CHARGER", ""),
  },
  {
    id: PROVIDER,
    type: "utility",
    seed: env("SEED_PROVIDER", "0"),
    limit: env("LIMIT_PROVIDER", "5"),
    // End of the chain: it receives settlement and does not pay on, so it needs
    // no daily budget and no allowlist.
    daily: env("DAILY_PROVIDER", "0"),
    allowed: [],
    controller: env("CONTROLLER_PROVIDER", ""),
  },
];

const asWei = (m) => ({
  ...m,
  seedWei: parseEther(String(m.seed)),
  limitWei: parseEther(String(m.limit)),
  dailyWei: parseEther(String(m.daily)),
});

module.exports = { FLEET: FLEET.map(asWei), EV, CHARGER, PROVIDER };
