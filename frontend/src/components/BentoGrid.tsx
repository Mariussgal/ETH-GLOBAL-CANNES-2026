import FeatureCard from "./FeatureCard";

const FEATURES = [
  {
    index: "01",
    title: "Trustless Pricing",
    plainEnglish: "You always know exactly what you're paying — no negotiation, no surprises.",
    description:
      "Discount calculated by our [[Risk Scoring Engine (RSE)]] from real volatility (σ), trend analysis, and 90-day revenue consistency. No human judgment.",
    metric: "10–55%",
    metricLabel: "DISCOUNT RANGE",
    glossary: [
      {
        term: "Risk Scoring Engine (RSE)",
        definition:
          "Advanced algorithmic pricing model. It runs the discount formula using live market data so the price is always objective and verifiable.",
      },
    ],
  },
  {
    index: "02",
    title: "Revenue Consolidation",
    plainEnglish: "Fees from every chain flow into one place automatically — no manual bridging.",
    description:
      "Multi-chain fee aggregation from Base, Polygon, and any EVM chain — routed into a single vault via [[Arc]]. One interface, zero fragmentation.",
    metric: "N→1",
    metricLabel: "CHAINS TO VAULT",
    glossary: [
      {
        term: "Arc",
        definition:
          "Arc is a cross-chain liquidity protocol. It bridges USDC from multiple networks into a single vault so investors see one unified balance.",
      },
    ],
  },
  {
    index: "03",
    title: "On-chain Reputation",
    plainEnglish: "A protocol's track record is public and unforgeable — investors can trust who they're dealing with.",
    description:
      "Emitter identity verified via [[ENS]] Reverse Registrar. Automatic DEFAULTED status written to ENS text records after 30 days without fees.",
    metric: "30D",
    metricLabel: "DEFAULT WINDOW",
    glossary: [
      {
        term: "ENS",
        definition:
          "Ethereum Name Service — maps a wallet address to a human-readable name like quickswap.eth, making identity on-chain verifiable.",
      },
    ],
  },
  {
    index: "04",
    title: "Secondary Market",
    plainEnglish: "You can sell your position at any time — you're never locked in.",
    description:
      "Instant liquidity on [[Uniswap v4]]. Price floor guaranteed by economic arbitrage — not a mechanism, a mathematical certainty.",
    metric: "24/7",
    metricLabel: "LIQUIDITY",
    glossary: [
      {
        term: "Uniswap v4",
        definition:
          "The latest version of Uniswap, a decentralised exchange. YST tokens trade here, with a custom hook that enforces a price floor.",
      },
    ],
  },
];

export default function BentoGrid() {
  return (
    <section className="px-xl py-3xl">
      {/* Section label */}
      <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm">
        HOW IT WORKS
      </span>

      {/* Newcomer intro — one sentence that frames everything */}
      <p className="font-grotesk text-body-sm text-text-secondary max-w-[600px] mb-lg border-l border-border-visible pl-sm leading-relaxed">
        YSM turns a protocol&apos;s future fee revenue into tradeable tokens.
        Here&apos;s what makes that{" "}
        <span className="text-text-primary">safe</span>,{" "}
        <span className="text-text-primary">fairly priced</span>, and{" "}
        <span className="text-text-primary">liquid</span>.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {FEATURES.map((f) => (
          <FeatureCard key={f.index} {...f} />
        ))}
      </div>

      {/* Step flow indicator */}
      <div className="mt-lg flex items-center gap-xs flex-wrap">
        {FEATURES.map((f, i) => (
          <span key={f.index} className="flex items-center gap-xs">
            <span className="font-mono text-[10px] text-text-disabled uppercase tracking-widest">
              {f.index} {f.title}
            </span>
            {i < FEATURES.length - 1 && (
              <span className="font-mono text-[10px] text-border-visible mx-xs">→</span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}
