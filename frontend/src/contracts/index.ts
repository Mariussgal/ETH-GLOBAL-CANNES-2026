// ── YSM Contract Addresses & ABIs (Sepolia Testnet) ──

export const SEPOLIA_CHAIN_ID = 11155111;

export const ADDRESSES = {
  streamFactory: "0x3615CFfF7D94710AC12Ed63c94E28F53551Ac32E" as `0x${string}`,
  ystSplitter: "0x02E75407376e5FBEd0e507E8265d92CeE9279fDC" as `0x${string}`,
  mockBase: "0x89e3dF8A6970B62564b232cbBD7376987cD093a8" as `0x${string}`,
  mockPolygon: "0x006969A32349d9581ac7206a7a1fC1168DbBcfbc" as `0x${string}`,
  masterSettler: "0xFE6B4a8Ae90C47dA0E19296CaeBb2FF8D313954f" as `0x${string}`,
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`,
} as const;

export const CHAINLINK_SUB_ID = 6399;

// ── Minimal ABIs for read operations ──

export const STREAM_FACTORY_ABI = [
  {
    name: "getStreamCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "streams",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      { name: "vault", type: "address" },
      { name: "splitter", type: "address" },
      { name: "token", type: "address" },
      { name: "protocol", type: "string" },
      { name: "feePercent", type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "discount", type: "uint256" },
    ],
  },
] as const;

export const YST_VAULT_ABI = [
  {
    name: "totalAccumulated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "targetAmount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "claimable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const MOCK_PROTOCOL_ABI = [
  {
    type: "event",
    name: "FeesGenerated",
    inputs: [
      { name: "chainLabel", type: "string", indexed: false },
      { name: "protocol", type: "string", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false }
    ]
  }
] as const;
