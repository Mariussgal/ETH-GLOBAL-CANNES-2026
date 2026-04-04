"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWatchContractEvent,
} from "wagmi";
import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  type Log,
  type PublicClient,
} from "viem";
import { sepolia } from "wagmi/chains";
import { ADDRESSES, ERC20_ABI, SEPOLIA_CHAIN_ID, YST_VAULT_ABI } from "@/contracts";
import { formatNumber } from "@/lib/format";
import {
  deserializeLog,
  fetchFeesGeneratedLogsEtherscan,
  getSepoliaBlockNumberEtherscan,
  TOTAL_HISTORY_LOOKBACK_BLOCKS,
  type SerializedLog,
} from "@/lib/etherscanFeesLogs";
import type { ArcActivityItem } from "@/components/invest/ArcActivityFeed";

const USDC_DECIMALS = 6;
const FEED_MAX = 10;
/**
 * Alchemy **gratuit** : eth_getLogs limité à **10 blocs** par requête (doc / erreur API).
 * On aligne tous les RPC sur cette taille de tranche (les nœuds publics l’acceptent aussi).
 */
const MAX_ETH_GETLOGS_BLOCKS_INCLUSIVE = BigInt(10);
/**
 * Pause entre chaque eth_getLogs (10 blocs). Trop bas → erreur Alchemy « compute units per second ».
 * ~200 ms ≈ ≤5 req/s, compatible free tier.
 */
const BETWEEN_LOG_CHUNKS_MS = 200;
/**
 * Polling eth_getLogs : 2 watchers × intervalle.
 * En prod, augmenter l’espace entre polls réduit la concurrence avec les eth_call / multicall de la console.
 */
const EVENT_POLLING_MS =
  typeof process !== "undefined" && process.env.NODE_ENV === "production"
    ? 20_000
    : 12_000;
/** Après ce délai, on lance quand même le scan feed (évite de bloquer le feed si la console reste en pending) */
const FEED_HEAVY_FALLBACK_MS = 5_000;

const LOG_PREFIX = "[useArcSepoliaSync]";

/** ABI alignée sur les mocks Sepolia (MockQuickswapBase / MockQuickswapPolygon) */
const STRICT_ABI = [
  {
    type: "event",
    name: "FeesGenerated",
    inputs: [
      { name: "chainLabel", type: "string", indexed: false },
      { name: "protocol", type: "string", indexed: false },
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

type FeedRow = ArcActivityItem & { sortTs: bigint };

function formatClockFromUnix(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function dedupeKeyFromLog(log: Pick<Log, "transactionHash" | "logIndex">): string {
  return `${log.transactionHash}-${String(log.logIndex ?? 0)}`;
}

function isAlchemyThroughputError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("compute units per second") ||
    msg.includes("CU") && msg.includes("capacity") ||
    msg.includes("exceeded its compute units") ||
    msg.includes("Throughput") ||
    msg.includes("429")
  );
}

/** Découpe en tranches ≤10 blocs inclus (Alchemy Free + compatibilité max des RPC) */
async function getFeesGeneratedEventsChunked(
  publicClient: Pick<PublicClient, "getContractEvents">,
  contractAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  const out: Log[] = [];
  let chunkStart = fromBlock;
  const maxInclusiveSpan = MAX_ETH_GETLOGS_BLOCKS_INCLUSIVE - BigInt(1);

  while (chunkStart <= toBlock) {
    const chunkEnd =
      chunkStart + maxInclusiveSpan <= toBlock ? chunkStart + maxInclusiveSpan : toBlock;

    let part: Log[] = [];
    let attempt = 0;
    const maxAttempts = 6;
    while (true) {
      try {
        part = await publicClient.getContractEvents({
          address: contractAddress,
          abi: STRICT_ABI,
          eventName: "FeesGenerated",
          fromBlock: chunkStart,
          toBlock: chunkEnd,
        });
        break;
      } catch (e) {
        if (attempt < maxAttempts && isAlchemyThroughputError(e)) {
          attempt += 1;
          const backoffMs = Math.min(900 * attempt ** 2, 8000);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw e;
      }
    }

    out.push(...part);
    chunkStart = chunkEnd + BigInt(1);
    if (chunkStart <= toBlock && BETWEEN_LOG_CHUNKS_MS > 0) {
      const jitter = Math.floor(Math.random() * 40);
      await new Promise((r) => setTimeout(r, BETWEEN_LOG_CHUNKS_MS + jitter));
    }
  }

  return out;
}

/**
 * Historique : préférence [Etherscan API V2 getLogs](https://docs.etherscan.io/api-reference/endpoint/getlogs-address-topics.md)
 * si `NEXT_PUBLIC_ETHERSCAN_API_KEY` est défini (pas de limite 10 blocs / eth_getLogs Alchemy).
 * Sinon repli sur le RPC (tranches 10 blocs).
 */
async function fetchFeesHistoryForContract(
  rpcClient: Pick<PublicClient, "getContractEvents"> | null,
  contractAddress: `0x${string}`,
  latest: bigint,
  etherscanApiKey: string | undefined
): Promise<Log[]> {
  const fromBlock =
    latest > TOTAL_HISTORY_LOOKBACK_BLOCKS ? latest - TOTAL_HISTORY_LOOKBACK_BLOCKS : BigInt(0);

  if (etherscanApiKey) {
    try {
      return await fetchFeesGeneratedLogsEtherscan(etherscanApiKey, contractAddress, fromBlock, latest);
    } catch (e) {
      console.warn(`${LOG_PREFIX} Etherscan getLogs failed`, e);
    }
  }

  if (!rpcClient) {
    console.warn(`${LOG_PREFIX} pas de client RPC pour le repli historique`);
    return [];
  }
  return getFeesGeneratedEventsChunked(rpcClient, contractAddress, fromBlock, latest);
}

function decodeFeesLogStrict(log: Log): {
  amount: bigint;
  chainLabel: string;
  protocol: string;
  timestamp: bigint;
} | null {
  try {
    const decoded = decodeEventLog({
      abi: STRICT_ABI,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    if (decoded.eventName !== "FeesGenerated") return null;
    const a = decoded.args as {
      chainLabel: string;
      protocol: string;
      amount: bigint;
      timestamp: bigint;
    };
    return {
      amount: a.amount,
      chainLabel: a.chainLabel,
      protocol: a.protocol,
      timestamp: a.timestamp,
    };
  } catch (e) {
    console.warn(`${LOG_PREFIX} decodeFeesLogStrict failed`, e);
    return null;
  }
}

export function useArcSepoliaSync(options: {
  enabled?: boolean;
  /** Libellé protocol pour les entrées synthétiques (delta yield), pas les événements on-chain */
  fallbackProtocolLabel?: string;
  /**
   * Slug / protocole du stream affiché (ex. chainlink). Les mocks Solidity émettent toujours
   * `QuickswapV3` dans l’event — on remplace l’affichage pour la démo multi-stream.
   */
  feedProtocolLabel?: string;
  /**
   * Vault du stream courant (Factory). Si absent, fallback sur `ADDRESSES.vault` (legacy single-vault).
   */
  streamVaultAddress?: `0x${string}`;
}) {
  const {
    enabled = true,
    fallbackProtocolLabel = "Arc",
    feedProtocolLabel,
    streamVaultAddress,
  } = options;

  const vaultForEarn = useMemo(
    () => streamVaultAddress ?? ADDRESSES.vault,
    [streamVaultAddress]
  );

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: SEPOLIA_CHAIN_ID });

  /** Client dédié Alchemy pour l’historique : évite le fallback Wagmi (1rpc, etc.) qui faisait échouer eth_getLogs alors que les eth_call passent */
  const explicitHistoryClient = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim();
    if (!url?.startsWith("http")) return null;
    return createPublicClient({
      chain: sepolia,
      transport: http(url, {
        batch: false,
        retryCount: 6,
        retryDelay: 400,
        timeout: 60_000,
      }),
    });
  }, []);

  const clientForHistory = explicitHistoryClient ?? publicClient;

  const etherscanApiKey = useMemo(() => process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY?.trim(), []);

  const liveSync = Boolean(isConnected && chainId === SEPOLIA_CHAIN_ID);

  const readEnabled = enabled;

  const feedRowsRef = useRef<Map<string, FeedRow>>(new Map());
  const [feedItems, setFeedItems] = useState<ArcActivityItem[]>([]);
  const syntheticCounterRef = useRef(0);

  useEffect(() => {
    if (!readEnabled) {
      feedRowsRef.current.clear();
      setFeedItems([]);
    }
  }, [readEnabled]);

  const commitFeedFromRef = useCallback(() => {
    const next = Array.from(feedRowsRef.current.values())
      .sort((a, b) => {
        if (a.sortTs > b.sortTs) return -1;
        if (a.sortTs < b.sortTs) return 1;
        return 0;
      })
      .slice(0, FEED_MAX)
      .map((row) => {
        const { sortTs, ...item } = row;
        void sortTs;
        return item;
      });
    setFeedItems(next);
  }, []);

  const labelForLogProtocol = useCallback(
    (onChainProtocol: string) =>
      feedProtocolLabel?.trim()
        ? `${feedProtocolLabel.trim()} · shared mock`
        : onChainProtocol,
    [feedProtocolLabel]
  );

  const upsertFeedRow = useCallback(
    (dedupeKey: string, sortTs: bigint, item: Omit<ArcActivityItem, "id">) => {
      feedRowsRef.current.set(dedupeKey, { ...item, id: dedupeKey, sortTs });
      commitFeedFromRef();
    },
    [commitFeedFromRef]
  );

  const lastWatcherLogAtRef = useRef(0);
  const prevYieldRef = useRef<bigint | undefined>(undefined);
  const prevBaseFeesRef = useRef<bigint | undefined>(undefined);
  const prevPolyFeesRef = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    if (!readEnabled) return;
    lastWatcherLogAtRef.current = 0;
  }, [readEnabled]);

  useEffect(() => {
    prevYieldRef.current = undefined;
    prevBaseFeesRef.current = undefined;
    prevPolyFeesRef.current = undefined;
  }, [vaultForEarn]);

  useEffect(() => {
    if (!readEnabled) return;
    console.log("[DEBUG_WATCHER] Listening on...", {
      wallet: address ?? null,
      mockBase: ADDRESSES.mockBase,
      mockPolygon: ADDRESSES.mockPolygon,
      chainId: SEPOLIA_CHAIN_ID,
      syncConnectedChain: false,
      pollingInterval: EVENT_POLLING_MS,
    });
  }, [readEnabled, address]);

  /**
   * Un seul appel RPC (multicall viem) pour usdc + fees Base/Poly + earned — évite la saturation
   * concurrente de connexions HTTP vers le même hôte qu’eth_getLogs.
   */
  const consoleReadContracts = useMemo(() => {
    const shared = [
      {
        address: vaultForEarn,
        abi: YST_VAULT_ABI,
        functionName: "usdc" as const,
        chainId: SEPOLIA_CHAIN_ID,
      },
      {
        address: ADDRESSES.mockBase,
        abi: STRICT_ABI,
        functionName: "totalFeesGenerated" as const,
        chainId: SEPOLIA_CHAIN_ID,
      },
      {
        address: ADDRESSES.mockPolygon,
        abi: STRICT_ABI,
        functionName: "totalFeesGenerated" as const,
        chainId: SEPOLIA_CHAIN_ID,
      },
    ] as const;
    if (readEnabled && liveSync && address) {
      return [
        ...shared,
        {
          address: vaultForEarn,
          abi: YST_VAULT_ABI,
          functionName: "earned" as const,
          args: [address] as const,
          chainId: SEPOLIA_CHAIN_ID,
        },
      ];
    }
    return [...shared];
  }, [readEnabled, liveSync, address, vaultForEarn]);

  const { data: batchResults, isPending: loadingConsoleBatch } = useReadContracts({
    contracts: consoleReadContracts,
    query: {
      enabled: readEnabled,
      refetchInterval: 25_000,
      staleTime: 10_000,
    },
  });

  const vaultUsdcTokenAddress = batchResults?.[0]?.result as `0x${string}` | undefined;
  const baseFeesRaw = batchResults?.[1]?.result as bigint | undefined;
  const polygonFeesRaw = batchResults?.[2]?.result as bigint | undefined;
  const earnedRaw =
    readEnabled && liveSync && address && batchResults?.[3]
      ? (batchResults[3].result as bigint | undefined)
      : undefined;

  const loadingEarned =
    readEnabled && liveSync && Boolean(address) && loadingConsoleBatch;

  const { data: vaultUsdcBalanceRaw, isPending: loadingVaultLiquidity } = useReadContract({
    address: (vaultUsdcTokenAddress ?? ADDRESSES.usdc) as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [vaultForEarn],
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: readEnabled,
      refetchInterval: 30_000,
      staleTime: 10_000,
    },
  });

  /** Historique + watchers getLogs : uniquement après la console ou timeout — priorité RPC pour earned / liquidité */
  const [feedHeavySyncEnabled, setFeedHeavySyncEnabled] = useState(false);
  useEffect(() => {
    if (!readEnabled) {
      setFeedHeavySyncEnabled(false);
      return;
    }
    const settled = !loadingConsoleBatch && !loadingVaultLiquidity;
    if (settled) {
      setFeedHeavySyncEnabled(true);
      return;
    }
    const id = window.setTimeout(() => setFeedHeavySyncEnabled(true), FEED_HEAVY_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [readEnabled, loadingConsoleBatch, loadingVaultLiquidity]);

  /** Historique : d’abord `/api/arc-feed-history` (clé lue côté serveur), sinon Etherscan client puis RPC */
  useEffect(() => {
    if (!readEnabled || !feedHeavySyncEnabled) return;

    let cancelled = false;

    void (async () => {
      try {
        let baseLogs: Log[] = [];
        let polyLogs: Log[] = [];

        const apiRes = await fetch("/api/arc-feed-history", { cache: "no-store" });
        const apiJson = (await apiRes.json()) as {
          ok: boolean;
          baseLogs?: SerializedLog[];
          polyLogs?: SerializedLog[];
          error?: string;
        };

        if (apiJson.ok && apiJson.baseLogs && apiJson.polyLogs) {
          baseLogs = apiJson.baseLogs.map(deserializeLog);
          polyLogs = apiJson.polyLogs.map(deserializeLog);
        } else {
          if (!clientForHistory && !etherscanApiKey) return;

          const latest = clientForHistory
            ? await clientForHistory.getBlockNumber()
            : await getSepoliaBlockNumberEtherscan(etherscanApiKey!);

          baseLogs = await fetchFeesHistoryForContract(
            clientForHistory ?? null,
            ADDRESSES.mockBase,
            latest,
            etherscanApiKey
          );

          await new Promise((r) => setTimeout(r, 600));
          if (cancelled) return;

          polyLogs = await fetchFeesHistoryForContract(
            clientForHistory ?? null,
            ADDRESSES.mockPolygon,
            latest,
            etherscanApiKey
          );
        }

        if (cancelled) return;

        for (const log of baseLogs) {
          const parsed = decodeFeesLogStrict(log);
          if (!parsed) continue;
          const key = dedupeKeyFromLog(log);
          const amountNum = parseFloat(formatUnits(parsed.amount, USDC_DECIMALS));
          upsertFeedRow(key, parsed.timestamp, {
            time: formatClockFromUnix(parsed.timestamp),
            amount: amountNum,
            protocol: labelForLogProtocol(parsed.protocol),
            chainLabel: parsed.chainLabel,
            txHash: log.transactionHash ?? undefined,
          });
        }

        for (const log of polyLogs) {
          const parsed = decodeFeesLogStrict(log);
          if (!parsed) continue;
          const key = dedupeKeyFromLog(log);
          const amountNum = parseFloat(formatUnits(parsed.amount, USDC_DECIMALS));
          upsertFeedRow(key, parsed.timestamp, {
            time: formatClockFromUnix(parsed.timestamp),
            amount: amountNum,
            protocol: labelForLogProtocol(parsed.protocol),
            chainLabel: parsed.chainLabel,
            txHash: log.transactionHash ?? undefined,
          });
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} historical feed fetch failed`, e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    readEnabled,
    feedHeavySyncEnabled,
    clientForHistory,
    etherscanApiKey,
    upsertFeedRow,
    labelForLogProtocol,
  ]);

  const emitFeeFromLogs = useCallback(
    (logs: readonly Log[]) => {
      console.log(`${LOG_PREFIX} onLogs batch`, { count: logs.length });
      console.dir(logs, { depth: null });

      lastWatcherLogAtRef.current = Date.now();

      for (const log of logs) {
        console.dir(log, { depth: null });

        const parsed = decodeFeesLogStrict(log);
        if (!parsed) {
          console.warn(`${LOG_PREFIX} skip log (decode null)`);
          continue;
        }

        const key = dedupeKeyFromLog(log);
        const amountNum = parseFloat(formatUnits(parsed.amount, USDC_DECIMALS));
        upsertFeedRow(key, parsed.timestamp, {
          time: formatClockFromUnix(parsed.timestamp),
          amount: amountNum,
          protocol: labelForLogProtocol(parsed.protocol),
          chainLabel: parsed.chainLabel,
          txHash: log.transactionHash ?? undefined,
        });

        console.log(`${LOG_PREFIX} FeesDecoded → feed`, parsed);
      }
    },
    [upsertFeedRow, labelForLogProtocol]
  );

  const onBaseLogs = useCallback(
    (logs: readonly Log[]) => {
      emitFeeFromLogs(logs);
    },
    [emitFeeFromLogs]
  );

  const onPolygonLogs = useCallback(
    (logs: readonly Log[]) => {
      emitFeeFromLogs(logs);
    },
    [emitFeeFromLogs]
  );

  const watchOpts = {
    abi: STRICT_ABI,
    eventName: "FeesGenerated" as const,
    chainId: SEPOLIA_CHAIN_ID,
    enabled: readEnabled && feedHeavySyncEnabled,
    /** Si true, aucun poll Sepolia tant que le wallet n’est pas sur Sepolia — les eth_call passent quand même via chainId */
    syncConnectedChain: false as const,
    pollingInterval: EVENT_POLLING_MS,
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
    const nowSec = BigInt(Math.floor(Date.now() / 1000));

    if (deltaEarned > BigInt(0)) {
      const prevB = prevBaseFeesRef.current ?? BigInt(0);
      const prevP = prevPolyFeesRef.current ?? BigInt(0);
      const dBase = baseNow > prevB ? baseNow - prevB : BigInt(0);
      const dPoly = polyNow > prevP ? polyNow - prevP : BigInt(0);

      let chainLabel = "Base";
      if (dPoly > dBase) chainLabel = "Polygon";
      else if (dBase === BigInt(0) && dPoly === BigInt(0)) chainLabel = "Arc";

      const amountNum = parseFloat(formatUnits(deltaEarned, USDC_DECIMALS));
      const sk = `yield-${syntheticCounterRef.current++}-${nowSec.toString()}`;
      upsertFeedRow(sk, nowSec, {
        time: formatClockFromUnix(nowSec),
        amount: amountNum,
        protocol: `${fallbackProtocolLabel} · YIELD_DELTA`,
        chainLabel,
      });

      console.log(`${LOG_PREFIX} fallback feed row (earned ↑, immédiat)`, { chainLabel, amountNum });
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
    fallbackProtocolLabel,
    upsertFeedRow,
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
    feedItems,
  };
}
