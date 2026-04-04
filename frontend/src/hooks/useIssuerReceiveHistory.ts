"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { fetchIssuerBuyLogsEtherscan, type IssuerReceiveTx } from "@/lib/etherscanIssuerReceives";

const ETHERSCAN_API_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || "";

export type EnhancedIssuerReceiveEntry = IssuerReceiveTx & {
  streamName?: string;
};

/**
 * Hook to fetch the REAL receive history for an issuer.
 * It scans for USDC 'Buy' events on the PrimarySale contract for the issuer's address.
 */
export function useIssuerReceiveHistory() {
  const { address } = useAccount();

  const { data: txs, isLoading, isError, error } = useQuery({
    queryKey: ["issuer-receive-history", address],
    queryFn: async () => {
      if (!address || !ETHERSCAN_API_KEY) return [];
      return fetchIssuerBuyLogsEtherscan(ETHERSCAN_API_KEY, address);
    },
    enabled: Boolean(address && ETHERSCAN_API_KEY),
    staleTime: 15_000,
    retry: 2,
  });

  return {
    receiveEntries: txs || [],
    isLoading,
    isError,
    error,
  };
}
