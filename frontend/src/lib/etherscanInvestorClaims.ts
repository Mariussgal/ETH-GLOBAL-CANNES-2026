/**
 * Historique `RewardsClaimed` via [Etherscan API V2](https://docs.etherscan.io/api-reference/endpoint/getlogs-topics.md)
 * — same approach as `etherscanFeesLogs.ts`, avoids RPC quotas / 400 errors on `eth_getLogs`.
 */

import {
  decodeAbiParameters,
  formatUnits,
  getAddress,
  hexToBigInt,
  pad,
  toEventHash,
} from "viem";
import { SEPOLIA_CHAIN_ID } from "@/contracts";
import { getSepoliaBlockNumberEtherscan } from "@/lib/etherscanFeesLogs";

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

/** topic0 = keccak256("RewardsClaimed(address,uint256)") — `Vault.sol` */
export const REWARDS_CLAIMED_TOPIC0 = toEventHash(
  "RewardsClaimed(address,uint256)"
) as `0x${string}`;

const DEFAULT_LOOKBACK = BigInt(800_000); // ~3 mois (Sepolia 12s)

/** Max range per request (aligned with the Arc feed). */
const BLOCK_SPAN = BigInt(500_000);

export type SerializedClaimEntry = {
  vault: `0x${string}`;
  amountUsdc: number;
  txHash: `0x${string}`;
  blockNumber: string;
  logIndex: number;
};

function readLookbackFromEnv(): bigint {
  const raw = process.env.INVESTOR_CLAIMS_LOOKBACK_BLOCKS?.trim()
    ?? process.env.NEXT_PUBLIC_INVESTOR_CLAIMS_LOOKBACK_BLOCKS?.trim();
  if (!raw) return DEFAULT_LOOKBACK;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 10_000) return DEFAULT_LOOKBACK;
  return BigInt(n);
}

function readOptionalFromBlock(): bigint | null {
  const raw = process.env.INVESTOR_CLAIMS_FROM_BLOCK?.trim()
    ?? process.env.NEXT_PUBLIC_INVESTOR_CLAIMS_FROM_BLOCK?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return BigInt(n);
}

function userToTopic1(user: `0x${string}`): `0x${string}` {
  return pad(getAddress(user), { size: 32 });
}

type EtherscanLogRow = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
};

async function fetchRewardsClaimedRange(
  apiKey: string,
  fromBlock: bigint,
  toBlock: bigint,
  userTopic1: `0x${string}`
): Promise<EtherscanLogRow[]> {
  const out: EtherscanLogRow[] = [];
  let page = 1;
  const offset = 1000;
  const from = fromBlock.toString(10);
  const to = toBlock.toString(10);

  while (true) {
    const params = new URLSearchParams({
      chainid: String(SEPOLIA_CHAIN_ID),
      module: "logs",
      action: "getLogs",
      fromBlock: from,
      toBlock: to,
      topic0: REWARDS_CLAIMED_TOPIC0,
      topic0_1_opr: "and",
      topic1: userTopic1,
      page: String(page),
      offset: String(offset),
      apikey: apiKey,
    });

    const res = await fetch(`${ETHERSCAN_V2}?${params.toString()}`);
    const json = (await res.json()) as {
      status: string;
      message: string;
      result: EtherscanLogRow[] | string;
    };

    if (json.status !== "1") {
      const msg = String(json.message ?? "");
      const r = typeof json.result === "string" ? json.result : "";
      if (
        msg.toLowerCase().includes("no records") ||
        r.toLowerCase().includes("no records") ||
        msg === "No transactions found"
      ) {
        break;
      }
      throw new Error(`Etherscan getLogs (topics): ${msg} ${r}`);
    }

    const rows = Array.isArray(json.result) ? json.result : [];
    if (rows.length === 0) break;

    out.push(...rows);

    if (rows.length < offset) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 400));
  }

  return out;
}

/**
 * All `RewardsClaimed` events for `user` over the window [fromBlock, latest],
 * filtrés aux vaults listés (whitelist).
 */
export async function fetchInvestorClaimsEtherscan(
  apiKey: string,
  vaultAddresses: readonly `0x${string}`[],
  userAddress: `0x${string}`
): Promise<{ entries: SerializedClaimEntry[]; totalClaimedUsdc: number }> {
  const hasVaultFilter = vaultAddresses.length > 0;
  const vaultSet = hasVaultFilter 
    ? new Set(vaultAddresses.map((a) => getAddress(a).toLowerCase()))
    : null;
  const lookback = readLookbackFromEnv();
  const fixedFrom = readOptionalFromBlock();

  const latest = await getSepoliaBlockNumberEtherscan(apiKey);
  await new Promise((r) => setTimeout(r, 400));

  const windowStart =
    latest > lookback ? latest - lookback : BigInt(0);
  let fromBlock =
    fixedFrom !== null
      ? windowStart > fixedFrom
        ? windowStart
        : fixedFrom
      : windowStart;
  if (fromBlock < BigInt(0)) fromBlock = BigInt(0);
  if (fromBlock > latest) fromBlock = latest;

  const userTopic1 = userToTopic1(userAddress);
  const allRows: EtherscanLogRow[] = [];

  let chunkStart = fromBlock;
  while (chunkStart <= latest) {
    const chunkEnd =
      chunkStart + BLOCK_SPAN - BigInt(1) <= latest
        ? chunkStart + BLOCK_SPAN - BigInt(1)
        : latest;

    const chunk = await fetchRewardsClaimedRange(
      apiKey,
      chunkStart,
      chunkEnd,
      userTopic1
    );
    allRows.push(...chunk);

    chunkStart = chunkEnd + BigInt(1);
    if (chunkStart <= latest) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  const entries: SerializedClaimEntry[] = [];
  let totalWei = BigInt(0);

  for (const row of allRows) {
    const addr = getAddress(row.address as `0x${string}`);
    if (vaultSet && !vaultSet.has(addr.toLowerCase())) continue;

    let amount: bigint;
    try {
      const decoded = decodeAbiParameters(
        [{ type: "uint256", name: "amount" }],
        row.data as `0x${string}`
      );
      amount = decoded[0] as bigint;
    } catch {
      continue;
    }

    totalWei += amount;
    const li = row.logIndex && row.logIndex !== "0x" ? row.logIndex : "0x0";
    entries.push({
      vault: addr,
      amountUsdc: parseFloat(formatUnits(amount, 6)),
      txHash: row.transactionHash as `0x${string}`,
      blockNumber: hexToBigInt(row.blockNumber as `0x${string}`).toString(),
      logIndex: Number(hexToBigInt(li as `0x${string}`)),
    });
  }

  entries.sort((a, b) => {
    const ba = BigInt(a.blockNumber);
    const bb = BigInt(b.blockNumber);
    if (ba !== bb) return ba > bb ? -1 : 1;
    return b.logIndex - a.logIndex;
  });

  const totalClaimedUsdc = parseFloat(formatUnits(totalWei, 6));

  return {
    entries,
    totalClaimedUsdc: Number.isFinite(totalClaimedUsdc) ? totalClaimedUsdc : 0,
  };
}
