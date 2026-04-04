"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import {
  ADDRESSES,
  ERC20_ABI,
  SEPOLIA_CHAIN_ID,
  STREAM_FACTORY_ABI,
  YST_VAULT_ABI,
} from "@/contracts";
import {
  buildChainStreamCardData,
  parseFactoryRecord,
  parseVaultStreamTuple,
} from "@/lib/chain-stream";
import type { StreamData } from "@/components/StreamCard";

export type OnChainStreamRow = {
  stream: StreamData;
  emitter: `0x${string}`;
  vault: `0x${string}`;
  ystToken: `0x${string}`;
  /**
   * Part du YST qui a quitté l’émetteur (vente / distribution), vs supply initial.
   * À la création tout est minté sur l’émetteur — totalSupply/cap faisait 100 % à tort.
   */
  fundingRatio: number;
  /** Nominal raise target (USDC 6 dec → human), from `Vault.stream.capitalRaised`. */
  nominalCapUsdc: number;
  totalFeesWei: bigint;
  totalYST: bigint;
  emitterYstBalance: bigint;
};

export function useMarketplaceOnChainStreams() {
  const { data: keysRaw, isPending: keysPending, isError: keysError } =
    useReadContract({
      address: ADDRESSES.streamFactory,
      abi: STREAM_FACTORY_ABI,
      functionName: "getAllStreamKeys",
      chainId: SEPOLIA_CHAIN_ID,
      query: {
        staleTime: 15_000,
        refetchInterval: 30_000,
      },
    });

  const keys = useMemo(() => keysRaw ?? [], [keysRaw]);

  const streamContracts = useMemo(
    () =>
      keys.map((streamKey) => ({
        address: ADDRESSES.streamFactory,
        abi: STREAM_FACTORY_ABI,
        functionName: "getStream" as const,
        args: [streamKey] as const,
        chainId: SEPOLIA_CHAIN_ID,
      })),
    [keys]
  );

  const { data: streamResults, isPending: streamsPending } = useReadContracts({
    contracts: streamContracts,
    query: {
      enabled: keys.length > 0,
      staleTime: 15_000,
      refetchInterval: 30_000,
    },
  });

  type VaultRow = {
    indexOneBased: number;
    vault: `0x${string}`;
    emitter: `0x${string}`;
    ystToken: `0x${string}`;
  };

  const vaultRows = useMemo((): VaultRow[] => {
    if (!streamResults?.length) return [];
    const out: VaultRow[] = [];
    for (let i = 0; i < streamResults.length; i++) {
      const r = streamResults[i];
      if (r.status !== "success") continue;
      const rec = parseFactoryRecord(r.result);
      if (!rec?.active || !rec.vault) continue;
      out.push({
        indexOneBased: i + 1,
        vault: rec.vault,
        emitter: rec.emitter,
        ystToken: rec.ystToken,
      });
    }
    return out;
  }, [streamResults]);

  /** Solde YST encore détenu par l’émetteur (le reste = distribué aux investisseurs). */
  const ystEmitterBalanceReads = useMemo(
    () =>
      vaultRows.map((row) => ({
        address: row.ystToken,
        abi: ERC20_ABI,
        functionName: "balanceOf" as const,
        args: [row.emitter] as const,
        chainId: SEPOLIA_CHAIN_ID,
      })),
    [vaultRows]
  );

  const { data: ystEmitterBalanceResults, isPending: ystEmitterBalancePending } =
    useReadContracts({
      contracts: ystEmitterBalanceReads,
      query: {
        enabled: ystEmitterBalanceReads.length > 0,
        staleTime: 15_000,
        refetchInterval: 30_000,
      },
    });

  const ystTotalSupplyReads = useMemo(
    () =>
      vaultRows.map((row) => ({
        address: row.ystToken,
        abi: ERC20_ABI,
        functionName: "totalSupply" as const,
        chainId: SEPOLIA_CHAIN_ID,
      })),
    [vaultRows]
  );

  const { data: ystSupplyResults, isPending: ystSupplyPending } = useReadContracts({
    contracts: ystTotalSupplyReads,
    query: {
      enabled: ystTotalSupplyReads.length > 0,
      staleTime: 15_000,
      refetchInterval: 30_000,
    },
  });

  const vaultReads = useMemo(() => {
    return vaultRows.flatMap((row) => [
      {
        address: row.vault,
        abi: YST_VAULT_ABI,
        functionName: "stream" as const,
        chainId: SEPOLIA_CHAIN_ID,
      },
      {
        address: row.vault,
        abi: YST_VAULT_ABI,
        functionName: "totalFeesReceived" as const,
        chainId: SEPOLIA_CHAIN_ID,
      },
      {
        address: row.vault,
        abi: YST_VAULT_ABI,
        functionName: "priceFloor" as const,
        chainId: SEPOLIA_CHAIN_ID,
      },
    ]);
  }, [vaultRows]);

  const { data: vaultResults, isPending: vaultPending } = useReadContracts({
    contracts: vaultReads,
    query: {
      enabled: vaultReads.length > 0,
      staleTime: 15_000,
      refetchInterval: 30_000,
    },
  });

  const onChainRows = useMemo((): OnChainStreamRow[] => {
    if (!vaultResults?.length || !streamResults?.length) return [];
    const out: OnChainStreamRow[] = [];

    for (let j = 0; j < vaultRows.length; j++) {
      const row = vaultRows[j];
      const base = j * 3;
      const sRes = vaultResults[base];
      const feesRes = vaultResults[base + 1];
      const priceRes = vaultResults[base + 2];
      if (
        sRes?.status !== "success" ||
        feesRes?.status !== "success" ||
        priceRes?.status !== "success"
      ) {
        continue;
      }

      const idx = row.indexOneBased - 1;
      const factoryRes = streamResults[idx];
      if (factoryRes?.status !== "success") continue;

      const record = parseFactoryRecord(factoryRes.result);
      const params = parseVaultStreamTuple(sRes.result);
      if (!record || !params?.active) continue;

      const totalFees = feesRes.result as bigint;
      const priceFloorRaw = priceRes.result as bigint;

      const balRes = ystEmitterBalanceResults?.[j];
      const emitterYstBalance =
        balRes?.status === "success"
          ? (balRes.result as bigint)
          : undefined;

      const supplyRes = ystSupplyResults?.[j];
      const cap =
        supplyRes?.status === "success"
          ? (supplyRes.result as bigint)
          : params.totalYST;
      const emitterBalForRatio = emitterYstBalance ?? cap;

      const stream = buildChainStreamCardData(
        row.indexOneBased,
        record,
        params,
        totalFees,
        priceFloorRaw,
        emitterYstBalance !== undefined
          ? { emitterYstBalanceWei: emitterYstBalance, capYstWei: cap }
          : undefined
      );
      const sold =
        cap > emitterBalForRatio ? cap - emitterBalForRatio : BigInt(0);
      let fundingRatio = 0;
      if (cap > BigInt(0)) {
        const tenK = BigInt(10000);
        const bps = (sold * tenK) / cap;
        const capped = bps > tenK ? tenK : bps;
        fundingRatio = Math.min(1, Number(capped) / 10000);
      }

      out.push({
        stream,
        emitter: row.emitter,
        vault: row.vault,
        ystToken: row.ystToken,
        fundingRatio,
        nominalCapUsdc: Number(params.capitalRaised) / 1e6,
        totalFeesWei: totalFees,
        totalYST: cap,
        emitterYstBalance: emitterYstBalance ?? BigInt(0),
      });
    }

    return out.reverse();
  }, [vaultRows, vaultResults, streamResults, ystEmitterBalanceResults, ystSupplyResults]);

  const isLoading =
    keysPending ||
    (keys.length > 0 && streamsPending) ||
    (ystEmitterBalanceReads.length > 0 && ystEmitterBalancePending) ||
    (ystTotalSupplyReads.length > 0 && ystSupplyPending) ||
    (vaultReads.length > 0 && vaultPending);

  return {
    rows: onChainRows,
    isLoading,
    isError: keysError,
    hasKeys: keys.length > 0,
  };
}
