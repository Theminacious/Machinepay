import { preferredChain } from "../lib/chain";

const POINTS = [
  {
    title: "Machines get an economic identity",
    body: "Each machine is registered by name and holds its own balance.",
  },
  {
    title: "Each identity follows spending rules",
    body: "Who it may pay, the most it may send at once, and how much per day.",
  },
  {
    title: "Payments settle directly between machines",
    body: `Every payment is a real transaction on ${preferredChain.name}.`,
  },
  {
    title: "The rules are enforced by the contract",
    body: "A payment that breaks a rule is refused on chain. This dashboard cannot override it.",
  },
];

/// Four sentences, no jargon: a judge should get the idea before reading the
/// numbers. Deliberately the first thing under the header.
export function HowItWorks() {
  return (
    <section className="panel p-5">
      <h2 className="text-[0.68rem] font-medium tracking-[0.14em] text-ink-400 uppercase">How it works</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((point, index) => (
          <li key={point.title} className="flex gap-2.5">
            <span className="tabular mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-mint-500/30 bg-mint-900/40 text-[0.65rem] text-mint-300">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-white">{point.title}</span>
              <span className="mt-0.5 block text-[0.7rem] leading-snug text-ink-400">{point.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
