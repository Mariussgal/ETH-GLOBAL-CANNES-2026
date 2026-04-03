import FeatureCard from "./FeatureCard";

const FEATURES = [
  {
    index: "01",
    title: "Trustless Pricing",
    description:
      "Discount calculated by Chainlink CRE from real volatility (σ), trend analysis, and 90-day revenue consistency. No human judgment.",
    metric: "10–50%",
    metricLabel: "DISCOUNT RANGE",
  },
  {
    index: "02",
    title: "Revenue Consolidation",
    description:
      "Multi-chain fee aggregation from Base, Polygon, and any EVM chain — routed into a single vault via Arc. One interface, zero fragmentation.",
    metric: "N→1",
    metricLabel: "CHAINS TO VAULT",
  },
  {
    index: "03",
    title: "On-chain Reputation",
    description:
      "Emitter identity verified via ENS Reverse Registrar. Automatic DEFAULTED status written to ENS text records after 30 days without fees.",
  },
  {
    index: "04",
    title: "Secondary Market",
    description:
      "Instant liquidity on Uniswap v4. Price floor guaranteed by economic arbitrage — not a mechanism, a mathematical certainty.",
    metric: "24/7",
    metricLabel: "LIQUIDITY",
  },
];

export default function BentoGrid() {
  return (
    <section className="px-xl py-3xl">
      <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-lg">
        HOW IT WORKS
      </span>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {FEATURES.map((f) => (
          <FeatureCard key={f.index} {...f} />
        ))}
      </div>
    </section>
  );
}
