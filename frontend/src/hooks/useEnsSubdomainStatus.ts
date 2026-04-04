"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { namehash } from "viem/ens";
import { SEPOLIA_CHAIN_ID } from "@/contracts";

const PUBLIC_RESOLVER_SEPOLIA =
  "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const;

export const ENS_PARENT_DOMAIN = "mariusgal.eth";

const RESOLVER_TEXT_ABI = [
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export function useEnsSubdomainStatus(protocolSlug: string | undefined) {
  const node = useMemo(() => {
    if (!protocolSlug?.trim()) return undefined;
    try {
      return namehash(`${protocolSlug}.${ENS_PARENT_DOMAIN}`);
    } catch {
      return undefined;
    }
  }, [protocolSlug]);

  const { data: statusText, isPending } = useReadContract({
    address: PUBLIC_RESOLVER_SEPOLIA,
    abi: RESOLVER_TEXT_ABI,
    functionName: "text",
    args: node ? [node, "ysm.status"] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: Boolean(node),
      staleTime: 60_000,
      refetchInterval: 120_000,
    },
  });

  return {
    subdomainName: protocolSlug
      ? `${protocolSlug}.${ENS_PARENT_DOMAIN}`
      : undefined,
    statusText: statusText ?? null,
    isDefaulted: statusText === "DEFAULTED",
    isPending,
  };
}