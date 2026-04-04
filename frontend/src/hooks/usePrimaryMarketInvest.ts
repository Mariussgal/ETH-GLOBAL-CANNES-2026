"use client";

import {
  ADDRESSES,
  ERC20_APPROVE_ABI,
  PRIMARY_SALE_ABI,
  SEPOLIA_CHAIN_ID,
  getPrimarySaleAddress,
} from "@/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { maxUint256, parseUnits } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { sepolia } from "wagmi/chains";

export type PrimaryInvestPhase = "idle" | "approving" | "buying";

export function usePrimaryMarketInvest(opts: {
  ystToken: `0x${string}` | undefined;
  emitter: `0x${string}` | undefined;
  /** false pour mocks / hors scope on-chain */
  enabled: boolean;
}) {
  const { ystToken, emitter, enabled } = opts;
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: SEPOLIA_CHAIN_ID });
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const primarySale = getPrimarySaleAddress();

  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<PrimaryInvestPhase>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  const invest = useCallback(
    async (usdcHuman: number) => {
      setLastError(null);
      if (!enabled || !ystToken || !emitter || !primarySale || !address || !publicClient) {
        setLastError("Primary market unavailable (check wallet config or contract).");
        return;
      }
      const amount = parseUnits(usdcHuman.toFixed(6), 6);
      if (amount <= BigInt(0)) {
        setLastError("Invalid amount.");
        return;
      }

      try {
        if (chainId !== sepolia.id) {
          await switchChainAsync({ chainId: sepolia.id });
        }

        const allowance = await publicClient.readContract({
          address: ADDRESSES.usdc,
          abi: ERC20_APPROVE_ABI,
          functionName: "allowance",
          args: [address, primarySale],
        });

        if (allowance < amount) {
          setPhase("approving");
          const approveHash = await writeContractAsync({
            address: ADDRESSES.usdc,
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [primarySale, maxUint256],
            chainId: SEPOLIA_CHAIN_ID,
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        setPhase("buying");
        const buyHash = await writeContractAsync({
          address: primarySale,
          abi: PRIMARY_SALE_ABI,
          functionName: "buy",
          args: [ystToken, emitter, amount],
          chainId: SEPOLIA_CHAIN_ID,
        });
        await publicClient.waitForTransactionReceipt({ hash: buyHash });

        await queryClient.invalidateQueries();
        setPhase("idle");
      } catch (e: unknown) {
        setPhase("idle");
        const msg =
          e && typeof e === "object" && "shortMessage" in e
            ? String((e as { shortMessage: string }).shortMessage)
            : e instanceof Error
              ? e.message
              : "Transaction failed.";
        setLastError(msg);
      }
    },
    [
      enabled,
      ystToken,
      emitter,
      primarySale,
      address,
      publicClient,
      chainId,
      switchChainAsync,
      writeContractAsync,
      queryClient,
    ]
  );

  const busy = phase !== "idle";

  const canInvestOnChain = Boolean(
    enabled && ystToken && emitter && primarySale && address
  );

  return {
    invest,
    phase,
    busy,
    lastError,
    clearError: () => setLastError(null),
    primarySaleConfigured: Boolean(primarySale),
    canInvestOnChain,
  };
}
