// ── YSM Contract Addresses & ABIs (Sepolia Testnet) ──

export const SEPOLIA_CHAIN_ID = 11155111;

/** Defaults in the repo; override with `NEXT_PUBLIC_MOCK_BASE_ADDRESS` / `NEXT_PUBLIC_MOCK_POLYGON_ADDRESS` after redeploying mocks. */
const MOCK_BASE_DEFAULT =
  "0x646f3ba4fe570D52e0C80D2A7Bf2131A990e4d95" as `0x${string}`;
const MOCK_POLYGON_DEFAULT =
  "0x72dbd97F1B8dAe5D4F31F8cEDe65895208E51f9c" as `0x${string}`;

function mockAddressFromEnv(
  key: "NEXT_PUBLIC_MOCK_BASE_ADDRESS" | "NEXT_PUBLIC_MOCK_POLYGON_ADDRESS" | "NEXT_PUBLIC_MOCK_ARC_ADDRESS",
  fallback: `0x${string}`
): `0x${string}` {
  if (typeof process === "undefined") return fallback;
  const e = process.env[key]?.trim();
  if (e?.startsWith("0x") && e.length >= 42) return e as `0x${string}`;
  return fallback;
}

/// Router du stream Arc cible (Sepolia) — reçoit les USDC bridgés via CCTP
export const ARC_STREAM_ROUTER = "0x6898E46D628BCF913325Fc67c807ba2fF727F44f" as `0x${string}`;

export const ADDRESSES = {
  streamFactory: "0x0EE0201AA4474360C2Be3AFf0c87B39941B54F49" as `0x${string}`,
  ystSplitter: "0xaCD8f042eE1E29580A84e213760D144957eec148" as `0x${string}`,
  vault: "0xdBcbf598eaC150d62bA0DB1b8E482f1351380bC8" as `0x${string}`,
  mockBase: mockAddressFromEnv("NEXT_PUBLIC_MOCK_BASE_ADDRESS", MOCK_BASE_DEFAULT),
  mockPolygon: mockAddressFromEnv(
    "NEXT_PUBLIC_MOCK_POLYGON_ADDRESS",
    MOCK_POLYGON_DEFAULT
  ),
  mockArc: mockAddressFromEnv(
    "NEXT_PUBLIC_MOCK_ARC_ADDRESS",
    "0x0000000000000000000000000000000000000000" as `0x${string}`
  ),
  masterSettler: "0xcd01f4a7cadceAA89B71fbf77aD80dDD3CfE2fC4" as `0x${string}`,
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`,
  ystToken: "0x343f28CEA446Cef6e8A380bFe11BcBf95f115370" as `0x${string}`,
  keeper: "0xcd01f4a7cadceAA89B71fbf77aD80dDD3CfE2fC4" as `0x${string}`,
  primarySale: "0x5161d70daCBfFc651FAd24aC63200Ac72c4A4aF3" as `0x${string}`,
} as const;

/** Deployment override (Vercel). */
export function getKeeperAddress(): `0x${string}` {
  const e = process.env.NEXT_PUBLIC_KEEPER_ADDRESS?.trim();
  return e?.startsWith("0x") && e.length >= 42
    ? (e as `0x${string}`)
    : ADDRESSES.keeper;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

/** PrimarySale: priority to env (Vercel / local), otherwise `ADDRESSES.primarySale` if set. */
export function getPrimarySaleAddress(): `0x${string}` | undefined {
  const e = process.env.NEXT_PUBLIC_PRIMARY_SALE_ADDRESS?.trim();
  if (
    e?.startsWith("0x") &&
    e.length >= 42 &&
    e.toLowerCase() !== ZERO_ADDR
  ) {
    return e as `0x${string}`;
  }
  const f = ADDRESSES.primarySale;
  if (f.toLowerCase() !== ZERO_ADDR) return f;
  return undefined;
}

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

/** USDC: approve + allowance for the primary market. */
export const ERC20_APPROVE_ABI = [
  ...ERC20_ABI,
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** @see smart-contracts/contracts/PrimarySale.sol */
export const PRIMARY_SALE_ABI = [
  {
    name: "buy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "yst", type: "address" },
      { name: "emitter", type: "address" },
      { name: "amountUsdc", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const CHAINLINK_SUB_ID = 6399;

// ── Minimal ABIs for read operations ──

/** Factory Read + Write — aligned with `smart-contracts/contracts/Factory.sol` */
export const STREAM_FACTORY_ABI = [
  {
    type: "event",
    name: "StreamCreated",
    inputs: [
      { name: "streamKey", type: "bytes32", indexed: true },
      { name: "splitter", type: "address", indexed: false },
      { name: "vault", type: "address", indexed: false },
      { name: "ystToken", type: "address", indexed: false },
      { name: "capitalRaised", type: "uint256", indexed: false },
      { name: "discountBps", type: "uint256", indexed: false },
    ],
  },
  {
    name: "createStreamDirect",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "protocolSlug", type: "string" },
      { name: "streamBps", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "capitalRaised", type: "uint256" },
      { name: "discountBps", type: "uint256" },
    ],
    outputs: [{ name: "streamKey", type: "bytes32" }],
  },
  {
    name: "getStream",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "streamKey", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "splitter", type: "address" },
          { name: "vault", type: "address" },
          { name: "ystToken", type: "address" },
          { name: "emitter", type: "address" },
          { name: "protocolSlug", type: "string" },
          { name: "createdAt", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getAllStreamKeys",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
  {
    name: "streamKeys",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "creForwarder",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "workflowToStream",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "workflowId", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "registerWorkflow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "workflowId", type: "bytes32" },
      { name: "streamKey", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "markDefaulted",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamKey", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "clearDefaulted",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamKey", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "markRepaid",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamKey", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "streamKeyToSubnode",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "streamKey", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

export const YST_VAULT_ABI = [
  {
    type: "event",
    name: "RewardsClaimed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
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
  {
    name: "stream",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalYST", type: "uint256" },
          { name: "streamBps", type: "uint256" },
          { name: "discountBps", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "capitalRaised", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "totalFeesReceived",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "priceFloor",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** YSTToken — claim rewards via vault (msg.sender) */
export const YST_TOKEN_CLAIM_ABI = [
  {
    name: "claimRewards",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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

/** All fields in `data` (topic0 different from the indexed `emitter` variant) */
export const MOCK_FEES_GENERATED_ALL_DATA_EVENT = {
  type: "event",
  name: "FeesGenerated",
  inputs: [
    { name: "emitter", type: "address", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
    { name: "timestamp", type: "uint256", indexed: false },
  ],
} as const;

/** Legacy schema (strings) — decoding fallback */
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

/** Router.sol — flushBalance + FeesReceived event */
export const ROUTER_ABI = [
  {
    name: "flushBalance",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "FeesReceived",
    inputs: [
      { name: "totalAmount", type: "uint256", indexed: false },
      { name: "vaultAmount", type: "uint256", indexed: false },
      { name: "treasuryAmount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ArcFeesReceived",
    inputs: [
      { name: "amount", type: "uint256", indexed: false },
      { name: "sourceChain", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;
