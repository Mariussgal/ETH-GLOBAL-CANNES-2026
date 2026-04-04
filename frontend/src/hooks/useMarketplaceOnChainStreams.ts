"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import {
  ADDRESSES,
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

  const keys = keysRaw ?? [];

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
      });
    }
    return out;
  }, [streamResults]);

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

      const stream = buildChainStreamCardData(
        row.indexOneBased,
        record,
        params,
        totalFees,
        priceFloorRaw
      );

      out.push({ stream, emitter: row.emitter });
    }

    return out.reverse();
  }, [vaultRows, vaultResults, streamResults]);

  const isLoading =
    keysPending ||
    (keys.length > 0 && streamsPending) ||
    (vaultReads.length > 0 && vaultPending);

  return {
    rows: onChainRows,
    isLoading,
    isError: keysError,
    hasKeys: keys.length > 0,
  };
}
