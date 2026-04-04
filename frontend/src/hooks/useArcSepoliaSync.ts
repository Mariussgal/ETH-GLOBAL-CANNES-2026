"use client";

import { useCallback, useMemo, useRef, useEffect } from "react";
import { useAccount, useChainId, useReadContract, useWatchContractEvent } from "wagmi";
import { decodeEventLog, formatUnits } from "viem";
import { ADDRESSES, ERC20_ABI, SEPOLIA_CHAIN_ID, YST_VAULT_ABI } from "@/contracts";
import { formatNumber } from "@/lib/format";

const USDC_DECIMALS = 6;

const LOG_PREFIX = "[useArcSepoliaSync]";

/** ABI minimal local — évite tout conflit avec les exports globaux ; aligné sur le déploiement Sepolia */
const STRICT_ABI = [
  {
    type: "event",
    name: "FeesGenerated",
    inputs: [
      { name: "emitter", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "totalFeesGenerated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type FeeActivityPayload = {
  amount: bigint;
  chainLabel: string;
  protocol: string;
  emitter?: `0x${string}`;
  timestamp?: bigint;
  txHash?: `0x${string}`;
};

type LogLike = {
  data: `0x${string}`;
  topics: readonly `0x${string}`[];
  transactionHash?: `0x${string}`;
};

function decodeFeesLogStrict(log: LogLike): {
  amount: bigint;
  emitter?: `0x${string}`;
  timestamp?: bigint;
} | null {
  try {
    const decoded = decodeEventLog({
      abi: STRICT_ABI,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    if (decoded.eventName !== "FeesGenerated") return null;
    const a = decoded.args as {
      emitter: `0x${string}`;
      amount: bigint;
      timestamp: bigint;
    };
    return {
      amount: a.amount,
      emitter: a.emitter,
      timestamp: a.timestamp,
    };
  } catch (e) {
    console.warn(`${LOG_PREFIX} decodeFeesLogStrict failed`, e);
    return null;
  }
}

export function useArcSepoliaSync(options: {
  enabled?: boolean;
  onFeeActivity?: (payload: FeeActivityPayload) => void;
}) {
  const { enabled = true, onFeeActivity } = options;
  const onFeeActivityRef = useRef(onFeeActivity);

  useEffect(() => {
    onFeeActivityRef.current = onFeeActivity;
  }, [onFeeActivity]);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const liveSync = Boolean(isConnected && chainId === SEPOLIA_CHAIN_ID);

  const readEnabled = enabled;

  const lastWatcherLogAtRef = useRef(0);
  const prevYieldRef = useRef<bigint | undefined>(undefined);
  const prevBaseFeesRef = useRef<bigint | undefined>(undefined);
  const prevPolyFeesRef = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    if (!readEnabled) return;
    lastWatcherLogAtRef.current = 0;
  }, [readEnabled]);

  useEffect(() => {
    if (!readEnabled) return;
    console.log("[DEBUG_WATCHER] Listening on...", {
      wallet: address ?? null,
      mockBase: ADDRESSES.mockBase,
      mockPolygon: ADDRESSES.mockPolygon,
      chainId: SEPOLIA_CHAIN_ID,
      syncConnectedChain: true,
      pollingInterval: 4_000,
    });
  }, [readEnabled, address]);

  const { data: earnedRaw, isLoading: loadingEarned } = useReadContract({
    address: ADDRESSES.vault,
    abi: YST_VAULT_ABI,
    functionName: "earned",
    args: address ? [address] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: readEnabled && liveSync && Boolean(address),
      refetchInterval: 12_000,
    },
  });

  /** Token USDC réellement branché sur le Vault (ne pas utiliser une adresse statique seule) */
  const { data: vaultUsdcTokenAddress } = useReadContract({
    address: ADDRESSES.vault,
    abi: YST_VAULT_ABI,
    functionName: "usdc",
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: readEnabled,
      refetchInterval: 60_000,
    },
  });

  const { data: vaultUsdcBalanceRaw, isPending: loadingVaultLiquidity } = useReadContract({
    address: (vaultUsdcTokenAddress ?? ADDRESSES.usdc) as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [ADDRESSES.vault],
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: readEnabled,
      refetchInterval: 15_000,
    },
  });

  const { data: baseFeesRaw, refetch: refetchBaseFees } = useReadContract({
    address: ADDRESSES.mockBase,
    abi: STRICT_ABI,
    functionName: "totalFeesGenerated",
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: readEnabled,
      refetchInterval: 20_000,
    },
  });

  const { data: polygonFeesRaw, refetch: refetchPolygonFees } = useReadContract({
    address: ADDRESSES.mockPolygon,
    abi: STRICT_ABI,
    functionName: "totalFeesGenerated",
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: readEnabled,
      refetchInterval: 20_000,
    },
  });

  const emitFeeFromLogs = useCallback(
    (source: "mockBase" | "mockPolygon", logs: readonly LogLike[]) => {
      console.log(`${LOG_PREFIX} onLogs batch`, source, { count: logs.length });
      console.dir(logs, { depth: null });

      lastWatcherLogAtRef.current = Date.now();

      void refetchBaseFees();
      void refetchPolygonFees();

      for (const log of logs) {
        console.dir(log, { depth: null });

        const parsed = decodeFeesLogStrict(log);
        if (!parsed) {
          console.warn(`${LOG_PREFIX} skip log (decode null)`, source);
          continue;
        }

        const chainLabel = source === "mockBase" ? "Base" : "Polygon";
        const payload: FeeActivityPayload = {
          amount: parsed.amount,
          chainLabel,
          protocol: "QuickswapV3",
          emitter: parsed.emitter,
          timestamp: parsed.timestamp,
          txHash: log.transactionHash,
        };

        console.log(`${LOG_PREFIX} FeesDecoded → onFeeActivity`, source, payload);
        onFeeActivityRef.current?.(payload);
      }
    },
    [refetchBaseFees, refetchPolygonFees]
  );

  const onBaseLogs = useCallback(
    (logs: readonly LogLike[]) => {
      emitFeeFromLogs("mockBase", logs);
    },
    [emitFeeFromLogs]
  );

  const onPolygonLogs = useCallback(
    (logs: readonly LogLike[]) => {
      emitFeeFromLogs("mockPolygon", logs);
    },
    [emitFeeFromLogs]
  );

  const watchOpts = {
    abi: STRICT_ABI,
    eventName: "FeesGenerated" as const,
    chainId: SEPOLIA_CHAIN_ID,
    enabled: readEnabled,
    syncConnectedChain: true as const,
    pollingInterval: 4_000,
  };

  useWatchContractEvent({
    ...watchOpts,
    address: ADDRESSES.mockBase,
    onLogs: onBaseLogs,
  });

  useWatchContractEvent({
    ...watchOpts,
    address: ADDRESSES.mockPolygon,
    onLogs: onPolygonLogs,
  });

  /** Fallback : dès que `earned` augmente (ex. 24.90 → 29.90 USDC), pousse une ligne dans le feed sans attendre les events ni délai */
  useEffect(() => {
    const yieldValue = earnedRaw;
    console.log("[YIELD_CHECK]", { yieldValue, prevYield: prevYieldRef.current });

    if (!readEnabled || !liveSync || !address) return;
    if (earnedRaw === undefined) return;

    const earned = earnedRaw as bigint;
    const prev = prevYieldRef.current;

    const baseNow = baseFeesRaw ?? BigInt(0);
    const polyNow = polygonFeesRaw ?? BigInt(0);

    if (prev === undefined) {
      prevYieldRef.current = earned;
      prevBaseFeesRef.current = baseNow;
      prevPolyFeesRef.current = polyNow;
      return;
    }

    if (earned <= prev) {
      prevYieldRef.current = earned;
      prevBaseFeesRef.current = baseNow;
      prevPolyFeesRef.current = polyNow;
      return;
    }

    const deltaEarned = earned - prev;
    const now = Date.now();

    if (deltaEarned > BigInt(0)) {
      const prevB = prevBaseFeesRef.current ?? BigInt(0);
      const prevP = prevPolyFeesRef.current ?? BigInt(0);
      const dBase = baseNow > prevB ? baseNow - prevB : BigInt(0);
      const dPoly = polyNow > prevP ? polyNow - prevP : BigInt(0);

      let chainLabel = "Base";
      if (dPoly > dBase) chainLabel = "Polygon";
      else if (dBase === BigInt(0) && dPoly === BigInt(0)) chainLabel = "Arc";

      const payload: FeeActivityPayload = {
        amount: deltaEarned,
        chainLabel,
        protocol: "YIELD_DELTA_SYNC",
        timestamp: BigInt(Math.floor(now / 1000)),
      };

      console.log(`${LOG_PREFIX} fallback onFeeActivity (earned ↑, immédiat)`, payload);
      onFeeActivityRef.current?.(payload);
    }

    prevYieldRef.current = earned;
    prevBaseFeesRef.current = baseNow;
    prevPolyFeesRef.current = polyNow;
  }, [
    readEnabled,
    liveSync,
    address,
    earnedRaw,
    baseFeesRaw,
    polygonFeesRaw,
  ]);

  const totalBaseRevenue = useMemo(() => {
    const v = baseFeesRaw ?? BigInt(0);
    return Number(formatUnits(v, USDC_DECIMALS));
  }, [baseFeesRaw]);

  const totalPolygonRevenue = useMemo(() => {
    const v = polygonFeesRaw ?? BigInt(0);
    return Number(formatUnits(v, USDC_DECIMALS));
  }, [polygonFeesRaw]);

  const accumulatedYieldUsdc = useMemo(() => {
    if (!liveSync || !address || earnedRaw === undefined) return null;
    return formatUnits(earnedRaw as bigint, USDC_DECIMALS);
  }, [address, earnedRaw, liveSync]);

  const vaultLiquidityUsdcDisplay = useMemo(() => {
    if (vaultUsdcBalanceRaw === undefined) return null;
    const n = Number(formatUnits(vaultUsdcBalanceRaw as bigint, USDC_DECIMALS));
    if (!Number.isFinite(n)) return null;
    return `${formatNumber(Math.round(n))} USDC`;
  }, [vaultUsdcBalanceRaw]);

  const routingStatusActive = liveSync;

  return {
    liveSync,
    accumulatedYieldUsdc,
    loadingEarned: readEnabled && liveSync && Boolean(address) && loadingEarned,
    totalBaseRevenue,
    totalPolygonRevenue,
    vaultLiquidityUsdcDisplay,
    routingStatusActive,
    loadingVaultLiquidity: readEnabled && loadingVaultLiquidity,
  };
}
