"use client";

import { ADDRESSES, SEPOLIA_CHAIN_ID, STREAM_FACTORY_ABI } from "@/contracts";
import { computeStreamKey } from "@/lib/stream-key";
import type { OnChainStreamRow } from "@/hooks/useMarketplaceOnChainStreams";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

type Props = {
  row: OnChainStreamRow;
};

function getWorkflowId(): Hex | undefined {
  const w = process.env.NEXT_PUBLIC_CRE_WORKFLOW_ID?.trim();
  if (w?.startsWith("0x") && w.length === 66) return w as Hex;
  return undefined;
}

/**
 * Enregistre `workflowId → streamKey` sur la Factory (nécessite **owner** Factory).
 * Les émetteurs non-owner voient le streamKey à transmettre à l’opérateur Chainlink.
 */
export default function ActivateAutomationButton({ row }: Props) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const workflowId = useMemo(() => getWorkflowId(), []);

  const streamKey = useMemo(
    () =>
      computeStreamKey(
        row.stream.protocol,
        row.emitter as Address
      ) as `0x${string}`,
    [row.stream.protocol, row.emitter]
  );

  const { data: factoryOwner } = useReadContract({
    address: ADDRESSES.streamFactory,
    abi: STREAM_FACTORY_ABI,
    functionName: "owner",
    chainId: SEPOLIA_CHAIN_ID,
  });

  const isFactoryOwner = useMemo(
    () =>
      Boolean(
        address &&
          factoryOwner &&
          (factoryOwner as string).toLowerCase() === address.toLowerCase()
      ),
    [address, factoryOwner]
  );

  const {
    writeContract,
    data: txHash,
    isPending: writePending,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: confirmPending, isSuccess } = useWaitForTransactionReceipt(
    {
      hash: txHash,
      chainId: SEPOLIA_CHAIN_ID,
      query: { enabled: Boolean(txHash) },
    }
  );

  useEffect(() => {
    if (!isSuccess || !txHash) return;
    void queryClient.invalidateQueries();
    const t = window.setTimeout(() => resetWrite(), 2000);
    return () => window.clearTimeout(t);
  }, [isSuccess, txHash, queryClient, resetWrite]);

  const [copied, setCopied] = useState(false);
  const copyKey = useCallback(() => {
    void navigator.clipboard.writeText(streamKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [streamKey]);

  const onActivate = useCallback(() => {
    if (!workflowId || !isFactoryOwner) return;
    writeContract({
      address: ADDRESSES.streamFactory,
      abi: STREAM_FACTORY_ABI,
      functionName: "registerWorkflow",
      args: [workflowId, streamKey],
      chainId: SEPOLIA_CHAIN_ID,
    });
  }, [workflowId, isFactoryOwner, writeContract, streamKey]);

  const busy = writePending || confirmPending;

  return (
    <div className="border border-border-visible rounded-technical p-md space-y-sm bg-black/60">
      <span className="font-mono text-[9px] uppercase tracking-wider text-text-disabled block">
        Chainlink CRE
      </span>
      {!workflowId ? (
        <p className="font-mono text-[10px] text-warning leading-snug">
          Définissez <code className="text-text-secondary">NEXT_PUBLIC_CRE_WORKFLOW_ID</code>{" "}
          (bytes32 du workflow CRE).
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onActivate}
            disabled={!isFactoryOwner || busy}
            title={
              !isFactoryOwner
                ? "Seul le owner de la Factory peut appeler registerWorkflow on-chain."
                : undefined
            }
            className="w-full font-mono text-[10px] uppercase tracking-[0.08em] py-sm border border-[#375BD2] text-[#9ECFFF] hover:bg-[#375BD2]/20 disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-sm"
          >
            {busy ? "…" : isSuccess ? "REGISTERED" : "ACTIVATE AUTOMATION"}
          </button>
          {!isFactoryOwner && (
            <p className="font-mono text-[9px] text-text-disabled leading-snug">
              Reserved for the Factory owner wallet. Copy the{" "}
              <span className="text-text-secondary">streamKey</span> pour votre job CRE / opérateur.
            </p>
          )}
        </>
      )}
      <button
        type="button"
        onClick={copyKey}
        className="w-full font-mono text-[9px] uppercase tracking-wider py-[6px] border border-border text-text-secondary hover:border-text-display transition-colors rounded-sm"
      >
        {copied ? "COPIÉ" : "COPY STREAM KEY"}
      </button>
    </div>
  );
}
