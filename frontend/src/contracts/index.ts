// ── YSM Contract Addresses & ABIs (Sepolia Testnet) ──

export const SEPOLIA_CHAIN_ID = 11155111;

export const ADDRESSES = {
  streamFactory: "0x281d58aeF1e47a9ac842c1558e85eb674DaAcca4" as `0x${string}`,
  ystSplitter: "0x7e07451B69dc3A92f678Df6Cc37272043178447e" as `0x${string}`,
  mockProtocol: "0x5884DE6070F71EF8e4FdC9F3D5341a941ae4c29b" as `0x${string}`,
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
