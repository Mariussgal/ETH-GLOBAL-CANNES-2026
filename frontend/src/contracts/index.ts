// ── YSM Contract Addresses & ABIs (Sepolia Testnet) ──

export const SEPOLIA_CHAIN_ID = 11155111;

export const ADDRESSES = {
  streamFactory: "0x3615CFfF7D94710AC12Ed63c94E28F53551Ac32E" as `0x${string}`,
  ystSplitter: "0x02E75407376e5FBEd0e507E8265d92CeE9279fDC" as `0x${string}`,
  /** Vault Arc / YSM — lecture `earned(user)` (yield accumulé USDC 6 décimales) */
  vault: "0xaa122Fd7940B575c8eaf8376e315002F33D9ad11" as `0x${string}`,
  mockBase: "0x89e3dF8A6970B62564b232cbBD7376987cD093a8" as `0x${string}`,
  mockPolygon: "0x006969A32349d9581ac7206a7a1fC1168DbBcfbc" as `0x${string}`,
  masterSettler: "0xFE6B4a8Ae90C47dA0E19296CaeBb2FF8D313954f" as `0x${string}`,
  /** USDC Sepolia (aligné sur le Vault) */
  usdc: "0x1c7D4B196Cb0274891fA4630730B4863E77a56B9" as `0x${string}`,
  ystToken: "0x343f28CEA446Cef6e8A380bFe11BcBf95f115370" as `0x${string}`,
} as const;

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

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
    name: "earned",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "usdc",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/**
 * Événement FeesGenerated — le topic0 dépend du schéma exact (indexed ou non sur `emitter`).
 * Variante courante : `emitter` indexé (filtrage / subgraphs).
 * Si la console montre des `onLogs` mais decode null, bascule vers `MOCK_FEES_GENERATED_ALL_DATA` dans le hook.
 */
export const MOCK_PROTOCOL_ABI = [
  {
    type: "event",
    name: "FeesGenerated",
    inputs: [
      { name: "emitter", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "totalFeesGenerated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Tous les champs en `data` (topic0 différent de la variante `emitter` indexé) */
export const MOCK_FEES_GENERATED_ALL_DATA_EVENT = {
  type: "event",
  name: "FeesGenerated",
  inputs: [
    { name: "emitter", type: "address", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
    { name: "timestamp", type: "uint256", indexed: false },
  ],
} as const;

/** Ancien schéma (strings) — fallback de décodage */
export const MOCK_FEES_GENERATED_LEGACY_EVENT = {
  type: "event",
  name: "FeesGenerated",
  inputs: [
    { name: "chainLabel", type: "string", indexed: false },
    { name: "protocol", type: "string", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
    { name: "timestamp", type: "uint256", indexed: false },
  ],
} as const;
