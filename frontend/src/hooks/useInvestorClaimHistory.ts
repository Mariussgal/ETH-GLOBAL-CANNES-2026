"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatUnits, parseAbiItem, type PublicClient } from "viem";
import { SEPOLIA_CHAIN_ID } from "@/contracts";

const USDC_DECIMALS = 6;

/** Événement Vault — aligné sur `Vault.sol`. */
const REWARDS_CLAIMED_EVENT = parseAbiItem(
  "event RewardsClaimed(address indexed user, uint256 amount)"
);

export type InvestorClaimLogEntry = {
  vault: `0x${string}`;
  amountUsdc: number;
  txHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
};

function dedupeVaults(addresses: readonly `0x${string}`[]): `0x${string}`[] {
  const seen = new Set<string>();
  const out: `0x${string}`[] = [];
  for (const a of addresses) {
    const k = a.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

/** Block window (RPC fallback only) — aligned with `NEXT_PUBLIC_*` on the client side. */
function readLookbackBlocks(): bigint {
  if (typeof process === "undefined") return BigInt(800_000);
  const raw = process.env.NEXT_PUBLIC_INVESTOR_CLAIMS_LOOKBACK_BLOCKS?.trim();
  if (!raw) return BigInt(800_000);
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 10_000) return BigInt(800_000);
  return BigInt(n);
}

function readOptionalFromBlock(): bigint | null {
  if (typeof process === "undefined") return null;
  const raw = process.env.NEXT_PUBLIC_INVESTOR_CLAIMS_FROM_BLOCK?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return BigInt(n);
}

/**
 * Fallback: chunked `eth_getLogs` (some RPCs limit the block range).
 */
async function fetchRewardsClaimedLogsRpc(
  publicClient: PublicClient,
  vaults: readonly `0x${string}`[],
  userAddress: `0x${string}`
) {
  const latest = await publicClient.getBlockNumber();
  const lookback = readLookbackBlocks();
  const fixedFrom = readOptionalFromBlock();

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

  const chunkSizes = [
    BigInt(50_000),
    BigInt(20_000),
    BigInt(5_000),
    BigInt(1_000),
    BigInt(500),
    BigInt(250),
    BigInt(100),
  ];

  const allLogs: Awaited<ReturnType<PublicClient["getLogs"]>> = [];

  let start = fromBlock;
  while (start <= latest) {
    let moved = false;
    let lastErr: unknown;
    for (const size of chunkSizes) {
      const end =
        start + size - BigInt(1) > latest ? latest : start + size - BigInt(1);
      try {
        const logs = await publicClient.getLogs({
          address: vaults as `0x${string}`[],
          event: REWARDS_CLAIMED_EVENT,
          args: { user: userAddress },
          fromBlock: start,
          toBlock: end,
        });
        allLogs.push(...logs);
        start = end + BigInt(1);
        moved = true;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!moved) {
      const msg =
        lastErr instanceof Error
          ? lastErr.message
          : "eth_getLogs failed (block range or RPC).";
      throw new Error(
        `${msg} — configurez ETHERSCAN_API_KEY pour l’historique via l’API Etherscan, ou changez de RPC.`
      );
    }
  }

  return allLogs;
}

type ApiOk = {
  ok: true;
  source: "etherscan";
  entries: Array<{
    vault: `0x${string}`;
    amountUsdc: number;
    txHash: `0x${string}`;
    blockNumber: string;
    logIndex: number;
  }>;
  totalClaimedUsdc: number;
};

type ApiErr = {
  ok: false;
  error: string;
};

async function fetchInvestorClaimsViaEtherscanApi(
  vaults: `0x${string}`[],
  userAddress: `0x${string}`
): Promise<{ entries: InvestorClaimLogEntry[]; totalClaimedUsdc: number } | null> {
  let res: Response;
  try {
    res = await fetch("/api/investor-claim-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaults,
        user: userAddress,
      }),
    });
  } catch {
    return null;
  }
  let json: ApiOk | ApiErr;
  try {
    json = (await res.json()) as ApiOk | ApiErr;
  } catch {
    return null;
  }
  if (!json.ok) {
    return null;
  }
  return {
    entries: json.entries.map((e) => ({
      vault: e.vault,
      amountUsdc: e.amountUsdc,
      txHash: e.txHash,
      blockNumber: BigInt(e.blockNumber),
      logIndex: e.logIndex,
    })),
    totalClaimedUsdc: json.totalClaimedUsdc,
  };
}

/**
 * Sums `RewardsClaimed(user, amount)` events (net USDC amount after 50 bps fee).
 * Priority: [Etherscan API V2](https://docs.etherscan.io/) (server route); falls back to RPC.
 */
export function useInvestorClaimHistory({
  vaultAddresses,
  userAddress,
  enabled,
}: {
  vaultAddresses: readonly `0x${string}`[];
  userAddress: `0x${string}` | undefined;
  enabled: boolean;
}) {
  const publicClient = usePublicClient({ chainId: SEPOLIA_CHAIN_ID });

  const query = useQuery({
    queryKey: [
      "investor-claim-history",
      SEPOLIA_CHAIN_ID,
      userAddress?.toLowerCase() ?? "",
      vaultAddresses.join(","),
      typeof process !== "undefined"
        ? `${process.env.NEXT_PUBLIC_INVESTOR_CLAIMS_LOOKBACK_BLOCKS ?? ""}:${process.env.NEXT_PUBLIC_INVESTOR_CLAIMS_FROM_BLOCK ?? ""}`
        : "",
      "etherscan-first",
    ],
    enabled: Boolean(enabled && userAddress),
    staleTime: 20_000,
    retry: 1,
    queryFn: async (): Promise<{
      entries: InvestorClaimLogEntry[];
      totalClaimedUsdc: number;
    }> => {
      if (!userAddress) {
        return { entries: [], totalClaimedUsdc: 0 };
      }
      const vaults = dedupeVaults(vaultAddresses);

      const viaApi = await fetchInvestorClaimsViaEtherscanApi(vaults, userAddress);
      if (viaApi) {
        return viaApi;
      }

      if (!publicClient) {
        throw new Error(
          "Historique indisponible : ajoutez ETHERSCAN_API_KEY dans .env.local (API Etherscan) ou connectez un RPC Sepolia."
        );
      }

      const rawLogs = await fetchRewardsClaimedLogsRpc(
        publicClient,
        vaults,
        userAddress
      );

      const entries: InvestorClaimLogEntry[] = [];
      let totalWei = BigInt(0);

      for (const log of rawLogs) {
        const decoded = log as unknown as {
          args?: { amount?: bigint };
          address: `0x${string}` | null;
          transactionHash: `0x${string}` | null;
          blockNumber: bigint | null;
          logIndex: number | null;
        };
        const amount = decoded.args?.amount;
        if (amount === undefined) continue;
        if (
          decoded.address === null ||
          decoded.transactionHash === null ||
          decoded.blockNumber === null
        ) {
          continue;
        }
        totalWei += amount;
        entries.push({
          vault: decoded.address,
          amountUsdc: parseFloat(formatUnits(amount, USDC_DECIMALS)),
          txHash: decoded.transactionHash,
          blockNumber: decoded.blockNumber,
          logIndex: Number(decoded.logIndex),
        });
      }

      entries.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber)
          return a.blockNumber > b.blockNumber ? -1 : 1;
        return b.logIndex - a.logIndex;
      });

      const totalClaimedUsdc = parseFloat(formatUnits(totalWei, USDC_DECIMALS));

      return {
        entries,
        totalClaimedUsdc: Number.isFinite(totalClaimedUsdc)
          ? totalClaimedUsdc
          : 0,
      };
    },
  });

  return {
    claimEntries: query.data?.entries ?? [],
    totalClaimedUsdc: query.data?.totalClaimedUsdc ?? 0,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    errorMessage:
      query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
