/** Chainlink ETH/USD AggregatorV3 (mainnet + Sepolia) — MARKET_RISK feed source */
export const ETH_USD_AGGREGATOR_V3: Record<number, `0x${string}`> = {
  1: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  /** Sepolia ETH/USD — https://docs.chain.link/data-feeds/price-feeds/addresses */
  11155111: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
};

export const aggregatorV3LatestRoundAbi = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
