"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import {
  ERC20_ABI,
  SEPOLIA_CHAIN_ID,
  YST_VAULT_ABI,
} from "@/contracts";
import {
  useMarketplaceOnChainStreams,
  type OnChainStreamRow,
} from "@/hooks/useMarketplaceOnChainStreams";

const USDC_DECIMALS = 6;
/** YST minted by the Factory on the same scale as USDC amounts (often 6 dec on amount side). */
const DEFAULT_YST_DECIMALS = 18;

export type InvestorPositionRow = {
  row: OnChainStreamRow;
  ystBalance: bigint;
  earnedUsdc: bigint;
  /** YST decimals read on-chain (fallback 18). */
  ystDecimals: number;
};

/**
 * Multicall: for each Arc vault, balanceOf(YST) + earned(Vault) + decimals(YST).
 */
export function useInvestorPositions() {
  const { address } = useAccount();
  const { rows: allRows, isLoading: streamsLoading, isError: streamsError } =
    useMarketplaceOnChainStreams();

  const multicallContracts = useMemo(() => {
    if (!address || allRows.length === 0) return [];
    const out: {
      address: `0x${string}`;
      abi: typeof ERC20_ABI | typeof YST_VAULT_ABI;
      functionName: "balanceOf" | "earned" | "decimals";
      args?: readonly unknown[];
      chainId: typeof SEPOLIA_CHAIN_ID;
    }[] = [];
    for (const r of allRows) {
      out.push({
        address: r.ystToken,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
        chainId: SEPOLIA_CHAIN_ID,
      });
      out.push({
        address: r.vault,
        abi: YST_VAULT_ABI,
        functionName: "earned",
        args: [address],
        chainId: SEPOLIA_CHAIN_ID,
      });
      out.push({
        address: r.ystToken,
        abi: ERC20_ABI,
        functionName: "decimals",
        chainId: SEPOLIA_CHAIN_ID,
      });
    }
    return out;
  }, [allRows, address]);

  const { data: batchResults, isPending: batchPending } = useReadContracts({
    contracts: multicallContracts,
    query: {
      enabled: Boolean(address && multicallContracts.length > 0),
      staleTime: 12_000,
      refetchInterval: 25_000,
    },
  });

  const positions = useMemo((): InvestorPositionRow[] => {
    if (!address || !batchResults?.length || allRows.length === 0) return [];
    const out: InvestorPositionRow[] = [];
    const n = allRows.length;
    for (let i = 0; i < n; i++) {
      const base = i * 3;
      const balRes = batchResults[base];
      const earnedRes = batchResults[base + 1];
      const decRes = batchResults[base + 2];
      if (
        balRes?.status !== "success" ||
        earnedRes?.status !== "success" ||
        decRes?.status !== "success"
      ) {
        continue;
      }
      const ystBalance = balRes.result as bigint;
      const earnedUsdc = earnedRes.result as bigint;
      const d = Number(decRes.result);
      const ystDecimals =
        Number.isFinite(d) && d >= 0 && d <= 36 ? d : DEFAULT_YST_DECIMALS;

      out.push({
        row: allRows[i],
        ystBalance,
        earnedUsdc,
        ystDecimals,
      });
    }
    return out;
  }, [address, batchResults, allRows]);

  /**
   * Excludes streams where the wallet is the issuer: these are "issuer" positions
   * (YST minted to the issuer), not the investor portfolio.
   */
  const investorPositions = useMemo(
    () =>
      positions.filter(
        (p) =>
          address &&
          p.row.emitter.toLowerCase() !== address.toLowerCase()
      ),
    [positions, address]
  );

  const aggregates = useMemo(() => {
    let totalStakedUsdc = 0;
    let totalRewardsUsdc = 0;

    for (const p of investorPositions) {
      const balHuman = parseFloat(
        formatUnits(p.ystBalance, p.ystDecimals)
      );
      if (Number.isFinite(balHuman)) {
        totalStakedUsdc += balHuman;
      }
      const earnedNum = parseFloat(
        formatUnits(p.earnedUsdc, USDC_DECIMALS)
      );
      if (Number.isFinite(earnedNum)) {
        totalRewardsUsdc += earnedNum;
      }
    }

    const claimableStreamCount = investorPositions.filter(
      (p) => p.earnedUsdc > BigInt(0)
    ).length;

    return {
      totalStakedUsdc,
      /** Σ vault.earned(user) — snapshot on-chain. */
      totalEarnedUsdc: totalRewardsUsdc,
      pendingRewardsUsdc: totalRewardsUsdc,
      claimableStreamCount,
    };
  }, [investorPositions]);

  /** Investor lines with YST or rewards (excluding streams where I am the issuer). */
  const activePositions = useMemo(
    () =>
      investorPositions.filter(
        (p) => p.ystBalance > BigInt(0) || p.earnedUsdc > BigInt(0)
      ),
    [investorPositions]
  );

  const isLoading = streamsLoading || (Boolean(address) && batchPending);
  const hasNoPosition =
    Boolean(address) &&
    !isLoading &&
    !streamsError &&
    activePositions.length === 0;

  return {
    address,
    positions,
    activePositions,
    aggregates,
    isLoading,
    isError: streamsError,
    hasNoPosition,
    allStreamCount: allRows.length,
  };
}
