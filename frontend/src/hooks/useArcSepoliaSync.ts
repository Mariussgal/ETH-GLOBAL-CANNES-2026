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
import { ADDRESSES, ARC_STREAM_ROUTER, ERC20_ABI, ROUTER_ABI, SEPOLIA_CHAIN_ID, YST_VAULT_ABI } from "@/contracts";
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
 * Alchemy **free tier**: eth_getLogs limited to **10 blocks** per request (per docs / API error).
 * All RPCs are aligned to this chunk size (public nodes accept it too).
 */
const MAX_ETH_GETLOGS_BLOCKS_INCLUSIVE = BigInt(10);
/**
 * Delay between each eth_getLogs call (10 blocks). Too low → Alchemy "compute units per second" error.
 * ~200 ms ≈ ≤5 req/s, compatible free tier.
 */
const BETWEEN_LOG_CHUNKS_MS = 200;
/**
 * Polling eth_getLogs: 2 watchers × interval.
 * In prod, increasing the gap between polls reduces contention with eth_call / multicall from the console.
 */
const EVENT_POLLING_MS =
  typeof process !== "undefined" && process.env.NODE_ENV === "production"
    ? 20_000
    : 12_000;
/** After this delay, start the feed scan anyway (avoids blocking the feed if the console stays pending) */
const FEED_HEAVY_FALLBACK_MS = 5_000;

const LOG_PREFIX = "[useArcSepoliaSync]";

/** ABI aligned with the Sepolia mocks (MockQuickswapBase / MockQuickswapPolygon) */
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

/** Splits into chunks of ≤10 inclusive blocks (Alchemy Free + max RPC compatibility) */
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
 * History: prefers [Etherscan API V2 getLogs](https://docs.etherscan.io/api-reference/endpoint/getlogs-address-topics.md)
 * if `NEXT_PUBLIC_ETHERSCAN_API_KEY` is set (no 10-block limit / eth_getLogs Alchemy).
 * Falls back to RPC otherwise (10-block chunks).
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
    console.warn(`${LOG_PREFIX} no RPC client for history fallback`);
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
  /** Protocol label for synthetic entries (delta yield), not on-chain events */
  fallbackProtocolLabel?: string;
  /**
   * Slug / protocol of the displayed stream (e.g. chainlink). Solidity mocks always emit
   * `QuickswapV3` in the event — we override the display label for the multi-stream demo.
   */
  feedProtocolLabel?: string;
  /**
   * Vault du stream courant (Factory). Si absent, fallback sur `ADDRESSES.vault` (legacy single-vault).
   */
  streamVaultAddress?: `0x${string}`;
  streamCreatedAt?: number; // ← ajout
}) {
  const {
    enabled = true,
    fallbackProtocolLabel = "Arc",
    feedProtocolLabel,
    streamVaultAddress,
    streamCreatedAt,
  } = options;

  const vaultForEarn = useMemo(
    () => streamVaultAddress ?? ADDRESSES.vault,
    [streamVaultAddress]
  );

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: SEPOLIA_CHAIN_ID });

  /** Dedicated Alchemy client for history: avoids the Wagmi fallback (1rpc, etc.) which was failing eth_getLogs while eth_call succeeded */
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
  const [totalBaseFromLogs, setTotalBaseFromLogs] = useState(0);
  const [totalPolygonFromLogs, setTotalPolygonFromLogs] = useState(0);
  const syntheticCounterRef = useRef(0);

  useEffect(() => {
    if (!readEnabled) {
      feedRowsRef.current.clear();
      setFeedItems([]);
      setTotalBaseFromLogs(0);
      setTotalPolygonFromLogs(0);
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
  const lastArcEventAtRef = useRef(0);
  const prevYieldRef = useRef<bigint | undefined>(undefined);
  const prevBaseFeesRef = useRef<bigint | undefined>(undefined);
  const prevPolyFeesRef = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    if (!readEnabled) return;
    lastWatcherLogAtRef.current = 0;
    lastArcEventAtRef.current = 0;
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
   * Single RPC call (viem multicall) for usdc + fees Base/Poly + earned — avoids saturating
   * concurrent HTTP connections to the same host as eth_getLogs.
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

  /** History + getLogs watchers: only after the console or timeout — RPC priority for earned / liquidity */
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

  /** Arc: listen for `FeesReceived` on the Sepolia YSM Router (after `flushBalance()`). */
  const [totalArcRevenue, setTotalArcRevenue] = useState(0);

  /** History: first tries `/api/arc-feed-history` (key read server-side), then Etherscan client, then RPC */
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
          arcLogs?: SerializedLog[]; // ← ajout
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
          if (streamCreatedAt && Number(parsed.timestamp) < streamCreatedAt) continue;

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
          if (streamCreatedAt && Number(parsed.timestamp) < streamCreatedAt) continue;

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

        let baseTotal = 0;
        for (const log of baseLogs) {
          const parsed = decodeFeesLogStrict(log);
          if (parsed) {
            if (streamCreatedAt && Number(parsed.timestamp) < streamCreatedAt) continue;
            baseTotal += parseFloat(formatUnits(parsed.amount, USDC_DECIMALS));
          }
        }
        setTotalBaseFromLogs(baseTotal);

        let polyTotal = 0;
        for (const log of polyLogs) {
          const parsed = decodeFeesLogStrict(log);
          if (parsed) {
            if (streamCreatedAt && Number(parsed.timestamp) < streamCreatedAt) continue;
            polyTotal += parseFloat(formatUnits(parsed.amount, USDC_DECIMALS));
          }
        }
        setTotalPolygonFromLogs(polyTotal);

        // Après la boucle polyLogs, ajouter le parsing Arc :
        if (apiJson.arcLogs) {
          const arcLogsDeserialized = apiJson.arcLogs.map(deserializeLog);
          let arcHistoricalTotal = 0;
          for (const log of arcLogsDeserialized) {
            try {
              const decoded = decodeEventLog({
                abi: ROUTER_ABI,
                data: log.data,
                topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
              });
              if (decoded.eventName !== "FeesReceived") continue;
              const args = decoded.args as { vaultAmount: bigint; timestamp: bigint };
              if (streamCreatedAt && Number(args.timestamp) < streamCreatedAt) continue;

              const amountNum = parseFloat(formatUnits(args.vaultAmount, USDC_DECIMALS));
              if (amountNum <= 0) continue;
              arcHistoricalTotal += amountNum;
              const key = dedupeKeyFromLog(log);
              upsertFeedRow(key, args.timestamp, {
                time: formatClockFromUnix(args.timestamp),
                amount: amountNum,
                protocol: feedProtocolLabel?.trim() ? `${feedProtocolLabel.trim()} · Arc` : "YSM · Arc",
                chainLabel: "Arc",
                txHash: log.transactionHash ?? undefined,
              });
            } catch { continue; }
          }
          if (arcHistoricalTotal > 0) {
            setTotalArcRevenue(arcHistoricalTotal);
          }
          // Update lastArcEventAtRef with the most recent timestamp from historical logs
          const maxTs = arcLogsDeserialized.reduce((max, log) => {
            try {
              const decoded = decodeEventLog({
                abi: ROUTER_ABI,
                data: log.data,
                topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
              });
              const ts = Number((decoded.args as { timestamp: bigint }).timestamp);
              return ts > max ? ts : max;
            } catch { return max; }
          }, 0);
          if (maxTs > lastArcEventAtRef.current) {
            lastArcEventAtRef.current = maxTs;
          }
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
    feedProtocolLabel,
    streamCreatedAt,
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
    /** If true, no Sepolia poll until the wallet is on Sepolia — eth_call still goes through via chainId */
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

  const onArcRouterLogs = useCallback(
    (logs: readonly Log[]) => {
      for (const log of logs) {
        lastArcEventAtRef.current = Date.now();
        try {
          const decodedArgs = (log as Log & { args?: { vaultAmount?: bigint; timestamp?: bigint } }).args;
          const vaultAmount = decodedArgs?.vaultAmount ?? BigInt(0);
          const amountNum = parseFloat(formatUnits(vaultAmount, USDC_DECIMALS));
          if (amountNum <= 0) continue;

          setTotalArcRevenue((prev) => prev + amountNum);

          const eventTs = decodedArgs?.timestamp ? BigInt(decodedArgs.timestamp) : BigInt(Math.floor(Date.now() / 1000));
          const key = dedupeKeyFromLog(log);
          upsertFeedRow(key, eventTs, {
            time: formatClockFromUnix(eventTs),
            amount: amountNum,
            protocol: feedProtocolLabel?.trim() ? `${feedProtocolLabel.trim()} · Arc` : "YSM · Arc",
            chainLabel: "Arc",
            txHash: log.transactionHash ?? undefined,
          });

          console.log(`${LOG_PREFIX} Arc FeesReceived → feed`, { amountNum });
        } catch (e) {
          console.warn(`${LOG_PREFIX} Arc FeesReceived decode failed`, e);
        }
      }
    },
    [upsertFeedRow, feedProtocolLabel]
  );

  useWatchContractEvent({
    abi: ROUTER_ABI,
    eventName: "FeesReceived" as const,
    address: ARC_STREAM_ROUTER,
    chainId: SEPOLIA_CHAIN_ID,
    enabled: readEnabled && feedHeavySyncEnabled,
    syncConnectedChain: false as const,
    pollingInterval: EVENT_POLLING_MS,
    onLogs: onArcRouterLogs,
  });

  /** Fallback: when `earned` increases (e.g. 24.90 → 29.90 USDC), push a line to the feed without waiting for events or a delay */
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

      const arcJustFired = Date.now() - lastArcEventAtRef.current < 30_000;
      if (arcJustFired && dBase === BigInt(0) && dPoly === BigInt(0)) {
        prevYieldRef.current = earned;
        prevBaseFeesRef.current = baseNow;
        prevPolyFeesRef.current = polyNow;
        return;
      }

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

      console.log(`${LOG_PREFIX} fallback feed row (earned ↑, immediate)`, { chainLabel, amountNum });
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
    totalBaseRevenue: totalBaseFromLogs,
    totalPolygonRevenue: totalPolygonFromLogs,
    totalArcRevenue,
    vaultLiquidityUsdcDisplay,
    routingStatusActive,
    loadingVaultLiquidity: readEnabled && loadingVaultLiquidity,
    feedItems,
  };
}