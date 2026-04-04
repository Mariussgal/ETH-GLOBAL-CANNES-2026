"use client";

import type { StreamData } from "@/components/StreamCard";
import StreamInvestView, {
  type StreamChainInvest,
} from "@/components/invest/StreamInvestView";
import {
  ADDRESSES,
  ERC20_ABI,
  SEPOLIA_CHAIN_ID,
  STREAM_FACTORY_ABI,
  YST_VAULT_ABI,
} from "@/contracts";
import { useCreAutomationStatus } from "@/hooks/useCreAutomationStatus";
import {
  buildChainStreamCardData,
  parseFactoryRecord,
  parseVaultStreamTuple,
} from "@/lib/chain-stream";
import { getStreamById } from "@/lib/mock-streams";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useMemo } from "react";
import { useEnsName, useReadContract, useReadContracts } from "wagmi";
import { mainnet } from "wagmi/chains";

const ZERO_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export default function InvestStreamPage({ id }: { id: string }) {
  const numericId = parseInt(id, 10);

  const mockStream = useMemo(() => {
    if (Number.isNaN(numericId)) return undefined;
    return getStreamById(numericId);
  }, [numericId]);

  const chainEnabled =
    !mockStream && Number.isFinite(numericId) && !Number.isNaN(numericId) && numericId >= 1;
  const index = chainEnabled ? numericId - 1 : undefined;

  const { data: streamKeyRaw, isPending: keyPending, isError: keyError } = useReadContract({
    address: ADDRESSES.streamFactory,
    abi: STREAM_FACTORY_ABI,
    functionName: "streamKeys",
    args: index !== undefined ? [BigInt(index)] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: Boolean(chainEnabled && index !== undefined) },
  });

  const streamKey =
    streamKeyRaw && streamKeyRaw !== ZERO_KEY ? streamKeyRaw : undefined;

  const { data: recordRaw, isPending: recordPending } = useReadContract({
    address: ADDRESSES.streamFactory,
    abi: STREAM_FACTORY_ABI,
    functionName: "getStream",
    args: streamKey ? [streamKey] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: Boolean(streamKey) },
  });

  const record = useMemo(() => parseFactoryRecord(recordRaw), [recordRaw]);

  const vaultAddr = record?.vault;

  const vaultReads = useMemo(
    () =>
      vaultAddr
        ? [
            {
              address: vaultAddr,
              abi: YST_VAULT_ABI,
              functionName: "stream" as const,
              chainId: SEPOLIA_CHAIN_ID,
            },
            {
              address: vaultAddr,
              abi: YST_VAULT_ABI,
              functionName: "totalFeesReceived" as const,
              chainId: SEPOLIA_CHAIN_ID,
            },
            {
              address: vaultAddr,
              abi: YST_VAULT_ABI,
              functionName: "priceFloor" as const,
              chainId: SEPOLIA_CHAIN_ID,
            },
          ]
        : [],
    [vaultAddr]
  );

  const { data: vaultBatch, isPending: vaultPending } = useReadContracts({
    contracts: vaultReads,
    query: { enabled: vaultReads.length > 0 },
  });

  const streamTupleRaw =
    vaultBatch?.[0]?.status === "success" ? vaultBatch[0].result : undefined;
  const totalFeesRaw =
    vaultBatch?.[1]?.status === "success" ? vaultBatch[1].result : undefined;
  const priceFloorRaw =
    vaultBatch?.[2]?.status === "success" ? vaultBatch[2].result : undefined;

  const streamParams = useMemo(
    () => parseVaultStreamTuple(streamTupleRaw),
    [streamTupleRaw]
  );

  const { data: emitterYstBalanceWei, isPending: emitterBalPending } = useReadContract({
    address: record?.ystToken,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: record?.emitter ? [record.emitter] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: Boolean(record?.ystToken && record?.emitter),
      refetchInterval: 15_000,
    },
  });

  const { data: ystTotalSupplyWei, isPending: ystSupplyPending } = useReadContract({
    address: record?.ystToken,
    abi: ERC20_ABI,
    functionName: "totalSupply",
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: Boolean(record?.ystToken), refetchInterval: 15_000 },
  });

  const { data: ensName } = useEnsName({
    address: record?.emitter,
    chainId: mainnet.id,
    query: { enabled: Boolean(record?.emitter) },
  });

  const { chainlinkAutomationActive } = useCreAutomationStatus(
    streamKey as `0x${string}` | undefined
  );

  const chainStream: StreamData | null = useMemo(() => {
    if (!record?.active || !streamParams) return null;
    const totalFees = (totalFeesRaw as bigint | undefined) ?? BigInt(0);
    const priceFloor = priceFloorRaw as bigint | undefined;
    const capYst =
      ystTotalSupplyWei !== undefined
        ? (ystTotalSupplyWei as bigint)
        : streamParams.totalYST;
    const base = buildChainStreamCardData(
      numericId,
      record,
      streamParams,
      totalFees,
      priceFloor,
      emitterYstBalanceWei !== undefined
        ? {
            emitterYstBalanceWei: emitterYstBalanceWei as bigint,
            capYstWei: capYst,
          }
        : undefined
    );
    return {
      ...base,
      ensName: ensName ?? base.ensName,
    };
  }, [
    record,
    streamParams,
    ensName,
    numericId,
    totalFeesRaw,
    priceFloorRaw,
    emitterYstBalanceWei,
    ystTotalSupplyWei,
  ]);

  if (mockStream) {
    return <StreamInvestView stream={mockStream} />;
  }

  const chainInvest: StreamChainInvest | undefined =
    record?.ystToken && record?.emitter && record?.vault && record?.splitter
      ? {
          ystToken: record.ystToken,
          emitter: record.emitter,
          vault: record.vault,
          splitter: record.splitter,
        }
      : undefined;

  if (!chainEnabled || Number.isNaN(numericId)) {
    notFound();
  }

  if (keyError) {
    notFound();
  }

  if (
    keyPending ||
    (streamKey &&
      (recordPending ||
        vaultPending ||
        (record?.ystToken && (emitterBalPending || ystSupplyPending))))
  ) {
    return (
      <div className="min-h-screen bg-black text-text-primary flex items-center justify-center font-mono text-body-sm text-text-secondary">
        [LOADING_STREAM…]
      </div>
    );
  }

  if (!streamKey || !chainStream) {
    return (
      <div className="min-h-screen bg-black text-text-primary flex flex-col items-center justify-center gap-lg px-md">
        <p className="font-mono text-body-sm text-text-secondary text-center">
          Stream introuvable sur Sepolia pour l’index #{numericId}.
        </p>
        <Link
          href="/"
          className="font-mono text-label uppercase tracking-label text-success hover:underline"
        >
          ← MARKETPLACE
        </Link>
      </div>
    );
  }

  return (
    <StreamInvestView
      stream={chainStream}
      chainInvest={chainInvest}
      chainlinkAutomationActive={chainlinkAutomationActive}
    />
  );
}
