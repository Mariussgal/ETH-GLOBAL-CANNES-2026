"use client";

import { ADDRESSES, SEPOLIA_CHAIN_ID, STREAM_FACTORY_ABI } from "@/contracts";
import { computeStreamKey } from "@/lib/stream-key";
import type { OnChainStreamRow } from "@/hooks/useMarketplaceOnChainStreams";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

type Props = {
  row: OnChainStreamRow;
};

export default function EndCampaignButton({ row }: Props) {
  const queryClient = useQueryClient();
  const [isDefaulted, setIsDefaulted] = useState(false);

  const streamKey = computeStreamKey(
    row.stream.protocol,
    row.emitter as Address
  ) as `0x${string}`;

  const {
    writeContract,
    data: txHash,
    isPending: writePending,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: confirmPending, isSuccess } =
    useWaitForTransactionReceipt({
      hash: txHash,
      chainId: SEPOLIA_CHAIN_ID,
      query: { enabled: Boolean(txHash) },
    });

  useEffect(() => {
    if (!isSuccess || !txHash) return;
    void queryClient.invalidateQueries();
    setIsDefaulted(true);
    const t = window.setTimeout(() => resetWrite(), 2000);
    return () => window.clearTimeout(t);
  }, [isSuccess, txHash, queryClient, resetWrite]);

  const onEndCampaign = useCallback(() => {
    writeContract({
      address: ADDRESSES.streamFactory,
      abi: STREAM_FACTORY_ABI,
      functionName: "markDefaulted",
      args: [streamKey],
      chainId: SEPOLIA_CHAIN_ID,
    });
  }, [writeContract, streamKey]);

  const onClearCampaign = useCallback(() => {
    writeContract({
      address: ADDRESSES.streamFactory,
      abi: STREAM_FACTORY_ABI,
      functionName: "clearDefaulted",
      args: [streamKey],
      chainId: SEPOLIA_CHAIN_ID,
    });
  }, [writeContract, streamKey]);

  const busy = writePending || confirmPending;

  return (
    <div className="border border-border-visible rounded-technical p-md space-y-sm bg-black/60">
      <span className="font-mono text-[9px] uppercase tracking-wider text-text-disabled block">
        ENS Campaign Status
      </span>

      {!isDefaulted ? (
        <button
          type="button"
          onClick={onEndCampaign}
          disabled={busy}
          className="w-full font-mono text-[10px] uppercase tracking-[0.08em] py-sm border border-accent text-accent hover:bg-accent/20 disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-sm"
        >
          {busy ? "…" : isSuccess ? "DEFAULTED ✓" : "END CAMPAIGN"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onClearCampaign}
          disabled={busy}
          className="w-full font-mono text-[10px] uppercase tracking-[0.08em] py-sm border border-success text-success hover:bg-success/20 disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-sm"
        >
          {busy ? "…" : "CLEAR DEFAULTED"}
        </button>
      )}

      <p className="font-mono text-[9px] text-text-disabled leading-snug">
        Writes <code className="text-text-secondary">ysm.status</code> on{" "}
        <span className="text-text-secondary">
          {row.stream.protocol}.ysm.eth
        </span>{" "}
        via ENS Public Resolver.
      </p>
    </div>
  );
}
