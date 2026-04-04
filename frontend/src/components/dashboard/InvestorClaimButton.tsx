"use client";

import {
  SEPOLIA_CHAIN_ID,
  YST_TOKEN_CLAIM_ABI,
} from "@/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

type Props = {
  ystToken: `0x${string}`;
  disabled?: boolean;
  className?: string;
};

export default function InvestorClaimButton({
  ystToken,
  disabled,
  className,
}: Props) {
  const queryClient = useQueryClient();

  const {
    writeContract,
    data: txHash,
    isPending: writePending,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: confirmPending,
    isSuccess,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: Boolean(txHash) },
  });

  useEffect(() => {
    if (!isSuccess || !txHash) return;
    void queryClient.invalidateQueries();
    const t = window.setTimeout(() => resetWrite(), 1500);
    return () => window.clearTimeout(t);
  }, [isSuccess, txHash, queryClient, resetWrite]);

  const busy = writePending || confirmPending;

  const onClaim = useCallback(() => {
    if (disabled || busy) return;
    writeContract({
      address: ystToken,
      abi: YST_TOKEN_CLAIM_ABI,
      functionName: "claimRewards",
      chainId: SEPOLIA_CHAIN_ID,
    });
  }, [disabled, busy, writeContract, ystToken]);

  return (
    <button
      type="button"
      onClick={onClaim}
      disabled={disabled || busy}
      className={
        className ??
        "font-mono text-[10px] uppercase tracking-wider px-sm py-[6px] border border-success text-success hover:bg-success hover:text-black disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-sm"
      }
    >
      {busy ? "…" : isSuccess ? "OK" : "CLAIM"}
    </button>
  );
}
