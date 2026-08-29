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

export function HowItWorks() {
  return (
    <section className="panel p-5 font-apple">
      <h2 className="font-grotesk text-[0.68rem] font-bold tracking-widest text-[#86868b] uppercase">How it works</h2>
      <ol className="mt-3.5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((point, index) => (
          <li key={point.title} className="flex gap-3">
            <span className="tabular font-display mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#0071e3]/20 bg-[#f0f6fe] text-[0.72rem] font-extrabold text-[#0071e3] shadow-2xs">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-xs font-bold text-[#1d1d1f]">{point.title}</span>
              <span className="mt-0.5 block text-[0.72rem] leading-relaxed font-medium text-[#86868b]">{point.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
