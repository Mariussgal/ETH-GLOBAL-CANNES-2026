"use client";

import { ADDRESSES, SEPOLIA_CHAIN_ID, STREAM_FACTORY_ABI } from "@/contracts";
import { computeStreamKey } from "@/lib/stream-key";
import type { OnChainStreamRow } from "@/hooks/useMarketplaceOnChainStreams";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

type UiState = "idle" | "choosing" | "defaulted" | "repaid";
type PendingAction = "markDefaulted" | "markRepaid" | "clearDefaulted" | null;

type Props = {
  row: OnChainStreamRow;
};

export default function EndCampaignButton({ row }: Props) {
  const queryClient = useQueryClient();
  const [uiState, setUiState] = useState<UiState>("idle");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const streamKey = computeStreamKey(
    row.stream.protocol,
    row.emitter as Address
  ) as `0x${string}`;

  const { writeContract, data: txHash, isPending: writePending } = useWriteContract();

  const { isLoading: confirmPending, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: Boolean(txHash) },
  });

  const busy = writePending || confirmPending;

  useEffect(() => {
    if (!isSuccess || !pendingAction) return;
    void queryClient.invalidateQueries();
    if (pendingAction === "markDefaulted") setUiState("defaulted");
    else if (pendingAction === "markRepaid") setUiState("repaid");
    else if (pendingAction === "clearDefaulted") setUiState("idle");
    setPendingAction(null);
  }, [isSuccess, pendingAction, queryClient]);

  const callContract = useCallback(
    (functionName: "markDefaulted" | "markRepaid" | "clearDefaulted") => {
      setPendingAction(functionName);
      writeContract({
        address: ADDRESSES.streamFactory,
        abi: STREAM_FACTORY_ABI,
        functionName,
        args: [streamKey],
        chainId: SEPOLIA_CHAIN_ID,
      });
    },
    [writeContract, streamKey]
  );

  return (
    <div className="border border-border-visible rounded-technical p-md space-y-sm bg-black/60">
      <span className="font-mono text-[9px] uppercase tracking-wider text-text-disabled block">
        ENS Campaign Status
      </span>

      {uiState === "idle" && (
        <button
          type="button"
          onClick={() => setUiState("choosing")}
          className="w-full font-mono text-[10px] uppercase tracking-[0.08em] py-sm border border-accent text-accent hover:bg-accent/20 transition-colors rounded-sm"
        >
          END CAMPAIGN
        </button>
      )}

      {uiState === "choosing" && (
        <div className="flex gap-xs">
          <button
            type="button"
            onClick={() => callContract("markDefaulted")}
            disabled={busy}
            className="flex-1 font-mono text-[10px] uppercase tracking-[0.08em] py-sm border border-accent text-accent hover:bg-accent/20 disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-sm"
          >
            {busy && pendingAction === "markDefaulted" ? "…" : "MARK DEFAULTED"}
          </button>
          <button
            type="button"
            onClick={() => callContract("markRepaid")}
            disabled={busy}
            className="flex-1 font-mono text-[10px] uppercase tracking-[0.08em] py-sm border border-success text-success hover:bg-success/20 disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-sm"
          >
            {busy && pendingAction === "markRepaid" ? "…" : "MARK REPAID"}
          </button>
        </div>
      )}

      {uiState === "defaulted" && (
        <div className="flex items-center gap-xs">
          <div className="flex-1 font-mono text-[10px] uppercase tracking-[0.08em] py-sm border border-accent/40 text-accent/70 text-center rounded-sm">
            DEFAULTED ✓
          </div>
          <button
            type="button"
            onClick={() => callContract("clearDefaulted")}
            disabled={busy}
            className="font-mono text-[9px] uppercase tracking-[0.08em] px-sm py-sm border border-border-visible text-text-disabled hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-sm"
          >
            {busy && pendingAction === "clearDefaulted" ? "…" : "CLEAR"}
          </button>
        </div>
      )}

      {uiState === "repaid" && (
        <div className="flex items-center gap-xs">
          <div className="flex-1 font-mono text-[10px] uppercase tracking-[0.08em] py-sm border border-success/40 text-success/70 text-center rounded-sm">
            REPAID ✓
          </div>
          <button
            type="button"
            onClick={() => callContract("clearDefaulted")}
            disabled={busy}
            className="font-mono text-[9px] uppercase tracking-[0.08em] px-sm py-sm border border-border-visible text-text-disabled hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-sm"
          >
            {busy && pendingAction === "clearDefaulted" ? "…" : "CLEAR"}
          </button>
        </div>
      )}

      <p className="font-mono text-[9px] text-text-disabled leading-snug">
        Writes <code className="text-text-secondary">ysm.status</code> on{" "}
        <span className="text-text-secondary">{row.stream.protocol}.ysm.eth</span>{" "}
        via ENS Public Resolver.
      </p>
    </div>
  );
}
