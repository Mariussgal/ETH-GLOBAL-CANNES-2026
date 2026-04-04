"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { ADDRESSES, SEPOLIA_CHAIN_ID, STREAM_FACTORY_ABI } from "@/contracts";

const ZERO_ADDR =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

function getWorkflowIdFromEnv(): `0x${string}` | undefined {
  const w =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_CRE_WORKFLOW_ID?.trim()
      : undefined;
  if (w?.startsWith("0x") && w.length === 66) return w as `0x${string}`;
  return undefined;
}

/**
 * Indique si le flux CRE / Factory est prêt pour ce stream :
 * - `creForwarder` non nul (routage onReport)
 * - si `NEXT_PUBLIC_CRE_WORKFLOW_ID` est défini : `workflowToStream(id) === streamKey`
 */
export function useCreAutomationStatus(
  streamKey: `0x${string}` | undefined
) {
  const workflowId = useMemo(() => getWorkflowIdFromEnv(), []);

  const contracts = useMemo(() => {
    if (!streamKey) return [];
    const reads: {
      address: typeof ADDRESSES.streamFactory;
      abi: typeof STREAM_FACTORY_ABI;
      functionName: "creForwarder" | "workflowToStream";
      args?: readonly [`0x${string}`];
      chainId: typeof SEPOLIA_CHAIN_ID;
    }[] = [
      {
        address: ADDRESSES.streamFactory,
        abi: STREAM_FACTORY_ABI,
        functionName: "creForwarder",
        chainId: SEPOLIA_CHAIN_ID,
      },
    ];
    if (workflowId) {
      reads.push({
        address: ADDRESSES.streamFactory,
        abi: STREAM_FACTORY_ABI,
        functionName: "workflowToStream",
        args: [workflowId],
        chainId: SEPOLIA_CHAIN_ID,
      });
    }
    return reads;
  }, [streamKey, workflowId]);

  const { data, isPending } = useReadContracts({
    contracts,
    query: {
      enabled: Boolean(streamKey),
      staleTime: 20_000,
    },
  });

  const result = useMemo(() => {
    if (!streamKey) {
      return {
        chainlinkAutomationActive: false,
        forwarderLive: false,
        workflowLinked: false,
      };
    }

    const fwdRes = data?.[0];
    const forwarder =
      fwdRes?.status === "success"
        ? (fwdRes.result as `0x${string}`)
        : undefined;
    const forwarderLive = Boolean(
      forwarder && forwarder !== ZERO_ADDR
    );

    let workflowLinked = true;
    if (workflowId) {
      const mapRes = data?.[1];
      const mapped =
        mapRes?.status === "success"
          ? (mapRes.result as `0x${string}`)
          : ZERO_BYTES32;
      workflowLinked = mapped === streamKey;
    }

    const chainlinkAutomationActive = forwarderLive && workflowLinked;

    return {
      chainlinkAutomationActive,
      forwarderLive,
      workflowLinked,
    };
  }, [data, streamKey, workflowId]);

  return { ...result, isPending, workflowId };
}
