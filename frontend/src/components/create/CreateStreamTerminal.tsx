"use client";

import Header from "@/components/Header";
import SegmentedProgress from "@/components/SegmentedProgress";
import {
  aggregatorV3LatestRoundAbi,
  ETH_USD_AGGREGATOR_V3,
} from "@/lib/chainlink-feeds";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useEnsName,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { ADDRESSES, SEPOLIA_CHAIN_ID, STREAM_FACTORY_ABI } from "@/contracts";
import { fetchFeesFromProxy } from "@/lib/fees-proxy";
import { formatNumber } from "@/lib/format";
import { computeStreamKey } from "@/lib/stream-key";
import type { Address } from "viem";

const ENS_APP = "https://app.ens.domains";

/**
 * Démo / hackathon : `capitalRaised` envoyé à la Factory = (net après décote CRE) ÷ ce diviseur,
 * pour garder des levées testnet réalistes tout en affichant les gros chiffres DeFiLlama à l’écran.
 */
const DEMO_ONCHAIN_AMOUNT_DIVISOR = 10_000;
/** Minimum 1 USDC (6 dec) on-chain après division. */
const MIN_ONCHAIN_CAPITAL_RAISED_RAW = BigInt(1_000_000);

/** CRE-style mock components (σ, R, trend) — animated via SegmentedProgress */
const CRE_COMPONENTS = {
  volatility: { label: "VOLATILITY (σ)", max: 100, value: 62, status: "warning" as const },
  regularity: { label: "REGULARITY (R_SCORE)", max: 100, value: 78, status: "success" as const },
  trendPenalty: { label: "TREND_PENALTY", max: 100, value: 45, status: "neutral" as const },
};

function formatUsdFromAnswer(answer: bigint): string {
  const n = Number(answer) / 1e8;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Market risk 0–100 based on the freshness of the Chainlink round (updatedAt).
 * Recent oracle → low score; stale data → high score (larger discount).
 */
function marketRiskFromOracleUpdatedAt(updatedAtSeconds: bigint): number {
  const u = Number(updatedAtSeconds);
  if (!Number.isFinite(u) || u <= 0) return 55;
  const now = Math.floor(Date.now() / 1000);
  const ageSec = Math.max(0, now - u);
  const SOFT = 180; // ~3 min
  const HARD = 7200; // 2 h → risk ceiling
  if (ageSec <= SOFT) {
    return Math.round(10 + (ageSec / SOFT) * 22);
  }
  return Math.min(
    100,
    Math.round(32 + ((ageSec - SOFT) / Math.max(1, HARD - SOFT)) * 68)
  );
}

/** Discount % (5–55) aggregated from σ, R, trend and market risk — not a "recommendation", output of the displayed CRE model. */
function computeCreDecotePercent(
  volatility: number,
  regularity: number,
  trendPenalty: number,
  marketRisk: number
): number {
  const stress =
    0.26 * volatility +
    0.26 * (100 - regularity) +
    0.24 * trendPenalty +
    0.24 * marketRisk;
  const pct = Math.round(5 + (stress / 100) * 50);
  return Math.min(55, Math.max(5, pct));
}

/** USDC display with at most one decimal (e.g. 11,923.1). */
function formatUsdcShort(n: number): string {
  const v = Math.round(n * 10) / 10;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

/** ENS label → slug base; the on-chain ERC20 name = the exact Factory slug (e.g. nohemmg-s2), symbol `YST`. */
function protocolSlugFromEns(ens: string | undefined | null): string {
  if (!ens?.trim()) return "";
  const lower = ens.trim().toLowerCase();
  const withoutEth = lower.endsWith(".eth") ? lower.slice(0, -4) : lower;
  const firstLabel = withoutEth.split(".")[0] ?? "";
  const slug = firstLabel.replace(/[^a-z0-9-]/g, "").slice(0, 48);
  return slug;
}

/** User input for DeFiLlama lookup (demo / hackathon) — same character set as Llama slugs. */
function normalizeFeesSlugOverride(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
}

/** Tries `slug`, `slug-1`, `slug-2`... until the first free on-chain slot. */
const MAX_DEPLOY_SLUG_TRIES = 48;

function deploySlugCandidate(base: string, index: number): string {
  if (index === 0) return base;
  return `${base}-${index}`;
}

/** Returns `active` from the `getStream` tuple / struct. */
function getStreamActive(result: unknown): boolean {
  if (result == null) return false;
  if (Array.isArray(result)) {
    return Boolean(result[6]);
  }
  return Boolean((result as { active?: boolean }).active);
}

export default function CreateStreamTerminal() {
  const router = useRouter();
  const publicClient = usePublicClient({ chainId: SEPOLIA_CHAIN_ID });
  const { address, status, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    data: receipt,
    isPending: isConfirming,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: sepolia.id,
    query: {
      enabled: Boolean(txHash),
    },
  });

  /** True only after a DEPLOY click: tx sent, waiting for inclusion (no ghost state without hash). */
  const awaitingReceipt = Boolean(txHash) && isConfirming;

  /** Primary ENS: mainnet and Sepolia (often only the testnet is configured for the hackathon). */
  const {
    data: ensNameMainnet,
    isPending: isEnsPendingMainnet,
  } = useEnsName({
    address,
    chainId: mainnet.id,
    query: { enabled: Boolean(address) },
  });

  const {
    data: ensNameSepolia,
    isPending: isEnsPendingSepolia,
  } = useEnsName({
    address,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  });

  const ensName = ensNameSepolia ?? ensNameMainnet;
  const isEnsPending = isEnsPendingMainnet || isEnsPendingSepolia;

  const identityBlocked =
    isConnected && !isEnsPending && !ensName;

  const identityReady =
    isConnected && !isEnsPending && Boolean(ensName);

  /** Always Sepolia: same feed as the Arc contracts on testnet, read via RPC without depending on the wallet network. */
  const sepoliaEthUsdFeed = ETH_USD_AGGREGATOR_V3[SEPOLIA_CHAIN_ID];

  const {
    data: roundData,
    isPending: isFeedPending,
    isError: isFeedError,
  } = useReadContract({
    address: sepoliaEthUsdFeed,
    abi: aggregatorV3LatestRoundAbi,
    functionName: "latestRoundData",
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: identityReady,
    },
  });

  const ethUsdDisplay = useMemo(() => {
    if (!roundData) return null;
    const answer = roundData[1];
    return formatUsdFromAnswer(answer);
  }, [roundData]);

  const marketRiskValue = useMemo(() => {
    if (isFeedError || !roundData) return 55;
    return marketRiskFromOracleUpdatedAt(roundData[3]);
  }, [roundData, isFeedError]);

  /** Share of estimated annual revenue you are selling (1–50 %). */
  const [revenuePct, setRevenuePct] = useState(10);
  const revenueTrackRef = useRef<HTMLDivElement>(null);

  const setRevenuePctFromClientX = useCallback((clientX: number) => {
    const el = revenueTrackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const ratio = rect.width > 0 ? x / rect.width : 0;
    const v = Math.max(1, Math.min(50, Math.round(ratio * 49) + 1));
    setRevenuePct(v);
  }, []);

  const [durationMonths, setDurationMonths] = useState(12);
  /** Annualization avg30×365 from the DeFiLlama proxy (CRE workflow). */
  const [annualRevenueUsd, setAnnualRevenueUsd] = useState(0);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState<string | null>(null);
  const [feesStats, setFeesStats] = useState<{
    avg30: number;
    avg60prev: number;
    rScore: number;
  } | null>(null);
  /**
   * Optional input (e.g. uniswap). Otherwise = ENS slug — same value for DeFiLlama **and** Factory deployment.
   */
  const [feesSlugOverrideInput, setFeesSlugOverrideInput] = useState("");

  /** Slug derived from the ENS label; short fallback if the label yields no [a-z0-9-] characters (otherwise DEPLOY stays disabled). */
  const protocolSlug = useMemo(() => {
    const fromEns = protocolSlugFromEns(ensName);
    if (fromEns.length > 0) return fromEns;
    if (address) return `emit${address.slice(2, 10).toLowerCase()}`;
    return "";
  }, [ensName, address]);

  /** DeFiLlama slug + deployment base: override if provided, otherwise ENS. */
  const feesLookupSlug = useMemo(() => {
    const o = normalizeFeesSlugOverride(feesSlugOverrideInput);
    if (o.length > 0) return o;
    return protocolSlug;
  }, [feesSlugOverrideInput, protocolSlug]);

  const deploySlugContracts = useMemo(() => {
    if (!feesLookupSlug || !address) return [];
    return Array.from({ length: MAX_DEPLOY_SLUG_TRIES }, (_, i) => {
      const slug = deploySlugCandidate(feesLookupSlug, i);
      const key = computeStreamKey(slug, address as Address);
      return {
        address: ADDRESSES.streamFactory,
        abi: STREAM_FACTORY_ABI,
        functionName: "getStream" as const,
        args: [key] as const,
        chainId: SEPOLIA_CHAIN_ID,
      };
    });
  }, [feesLookupSlug, address]);

  const {
    data: streamSlotResults,
    isPending: streamSlotsPending,
    refetch: refetchStreamSlots,
  } = useReadContracts({
    contracts: deploySlugContracts,
    query: {
      enabled: Boolean(identityReady && deploySlugContracts.length > 0),
      staleTime: 4_000,
    },
  });

  const onChainDeploySlug = useMemo(() => {
    if (!feesLookupSlug || !streamSlotResults?.length) return "";
    for (let i = 0; i < streamSlotResults.length; i++) {
      const row = streamSlotResults[i];
      if (row.status !== "success") continue;
      if (!getStreamActive(row.result)) {
        return deploySlugCandidate(feesLookupSlug, i);
      }
    }
    return "";
  }, [streamSlotResults, feesLookupSlug]);

  const predictedStreamKey = useMemo(() => {
    if (!onChainDeploySlug || !address) return undefined;
    return computeStreamKey(onChainDeploySlug, address as Address);
  }, [onChainDeploySlug, address]);

  const { data: factoryStreamKeys } = useReadContract({
    address: ADDRESSES.streamFactory,
    abi: STREAM_FACTORY_ABI,
    functionName: "getAllStreamKeys",
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: Boolean(identityReady && predictedStreamKey),
      staleTime: 12_000,
    },
  });

  const existingStreamInvestId = useMemo(() => {
    if (!predictedStreamKey || !factoryStreamKeys?.length) return undefined;
    const pk = predictedStreamKey.toLowerCase();
    const i = factoryStreamKeys.findIndex((k) => k.toLowerCase() === pk);
    return i >= 0 ? i + 1 : undefined;
  }, [factoryStreamKeys, predictedStreamKey]);

  useEffect(() => {
    if (!identityReady || !feesLookupSlug) {
      setAnnualRevenueUsd(0);
      setFeesStats(null);
      setFeesError(null);
      setFeesLoading(false);
      return;
    }
    let cancelled = false;
    setFeesLoading(true);
    setFeesError(null);
    void (async () => {
      try {
        const payload = await fetchFeesFromProxy(feesLookupSlug);
        if (cancelled) return;
        if (!payload) {
          setFeesError(
            "No DeFiLlama data for this slug — try a listed protocol (e.g. uniswap, aave) in the optional field above."
          );
          setAnnualRevenueUsd(0);
          setFeesStats(null);
          return;
        }
        setAnnualRevenueUsd(payload.annualUsd);
        setFeesStats({
          avg30: payload.avg30,
          avg60prev: payload.avg60prev,
          rScore: payload.rScore,
        });
      } catch (e) {
        if (!cancelled) {
          setFeesError(
            e instanceof Error
              ? e.message
              : "Unable to load fees (invalid response or network error). Please retry."
          );
          setAnnualRevenueUsd(0);
          setFeesStats(null);
        }
      } finally {
        if (!cancelled) setFeesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityReady, feesLookupSlug]);

  const creMetrics = useMemo(() => {
    if (!feesStats) {
      return {
        volatility: CRE_COMPONENTS.volatility,
        regularity: CRE_COMPONENTS.regularity,
        trendPenalty: CRE_COMPONENTS.trendPenalty,
      };
    }
    const { avg30, avg60prev, rScore } = feesStats;
    const denom = Math.max(avg30, avg60prev, 1);
    const volatility = Math.min(
      100,
      Math.round((100 * Math.abs(avg30 - avg60prev)) / denom)
    );
    const regularity = Math.min(
      100,
      Math.round((Math.min(2, Math.max(0, rScore)) / 2) * 100)
    );
    const trendPenalty = Math.min(
      100,
      Math.max(0, Math.round(50 + (volatility - regularity) * 0.5))
    );
    return {
      volatility: { ...CRE_COMPONENTS.volatility, value: volatility },
      regularity: { ...CRE_COMPONENTS.regularity, value: regularity },
      trendPenalty: { ...CRE_COMPONENTS.trendPenalty, value: trendPenalty },
    };
  }, [feesStats]);

  const creDecotePercent = useMemo(() => {
    return computeCreDecotePercent(
      creMetrics.volatility.value,
      creMetrics.regularity.value,
      creMetrics.trendPenalty.value,
      marketRiskValue
    );
  }, [creMetrics, marketRiskValue]);

  /** Tranche = annual revenue × sold share; after CRE discount = tranche × (1 − discount). */
  const offeringEconomics = useMemo(() => {
    if (!Number.isFinite(annualRevenueUsd) || annualRevenueUsd <= 0) return null;
    const nominalUsd = annualRevenueUsd * (revenuePct / 100);
    const discountFrac = creDecotePercent / 100;
    const afterDiscountUsd = nominalUsd * (1 - discountFrac);
    return { nominalUsd, afterDiscountUsd };
  }, [annualRevenueUsd, revenuePct, creDecotePercent]);

  const onSepolia = activeChainId === SEPOLIA_CHAIN_ID;

  const deployReady =
    identityReady &&
    onSepolia &&
    protocolSlug.trim().length > 0 &&
    onChainDeploySlug.trim().length > 0 &&
    !streamSlotsPending &&
    !isWritePending &&
    !awaitingReceipt &&
    Boolean(offeringEconomics && offeringEconomics.nominalUsd > 0);

  const deployBlockedHint = useMemo(() => {
    if (deployReady) return null;
    if (!isConnected || isEnsPending || !ensName) return null;
    if (!onSepolia) {
      return "DEPLOY button is inactive: switch to the Sepolia network first (button above or wallet).";
    }
    if (!protocolSlug.trim()) {
      return "Protocol identifier unavailable — reconnect the wallet.";
    }
    if (streamSlotsPending) {
      return "Looking for the next free slug (nohemmg, nohemmg-1, …)…";
    }
    if (!onChainDeploySlug.trim()) {
      return `Limit reached: more than ${MAX_DEPLOY_SLUG_TRIES} streams for this ENS label and wallet.`;
    }
    if (feesLoading) {
      return "Loading protocol fees (DeFiLlama via proxy)…";
    }
    if (feesError || annualRevenueUsd <= 0) {
      return (
        feesError ??
        "Annual revenue unavailable — enter a DeFiLlama slug in the optional field (e.g. uniswap) or check the connection."
      );
    }
    if (isWritePending) {
      return "Awaiting wallet signature (you just clicked DEPLOY).";
    }
    if (awaitingReceipt) {
      return "Deployment in progress: your transaction is pending inclusion on Sepolia (usually a few seconds).";
    }
    if (!offeringEconomics || offeringEconomics.nominalUsd <= 0) {
      return "Invalid offer amount — check the revenue share.";
    }
    return null;
  }, [
    deployReady,
    isConnected,
    isEnsPending,
    ensName,
    onSepolia,
    protocolSlug,
    onChainDeploySlug,
    streamSlotsPending,
    feesLoading,
    feesError,
    annualRevenueUsd,
    isWritePending,
    awaitingReceipt,
    offeringEconomics,
  ]);

  const deploy = useCallback(() => {
    if (!deployReady || !offeringEconomics) return;
    const slug = onChainDeploySlug.trim();
    const afterNetUsd = offeringEconomics.afterDiscountUsd;
    if (!Number.isFinite(afterNetUsd) || afterNetUsd <= 0) return;
    const streamBps = BigInt(revenuePct * 100);
    if (streamBps < BigInt(100) || streamBps > BigInt(5000)) return;
    const durationDays = BigInt(durationMonths * 30);
    const scaledNetUsd = afterNetUsd / DEMO_ONCHAIN_AMOUNT_DIVISOR;
    let capitalRaised = BigInt(Math.round(scaledNetUsd * 1e6));
    if (capitalRaised < MIN_ONCHAIN_CAPITAL_RAISED_RAW) {
      capitalRaised = MIN_ONCHAIN_CAPITAL_RAISED_RAW;
    }
    const discountBps = BigInt(creDecotePercent * 100);

    resetWrite();
    writeContract({
      address: ADDRESSES.streamFactory,
      abi: STREAM_FACTORY_ABI,
      functionName: "createStreamDirect",
      args: [slug, streamBps, durationDays, capitalRaised, discountBps],
      chainId: SEPOLIA_CHAIN_ID,
    });
  }, [
    deployReady,
    offeringEconomics,
    onChainDeploySlug,
    revenuePct,
    durationMonths,
    creDecotePercent,
    resetWrite,
    writeContract,
  ]);

  useEffect(() => {
    /** `isReceiptSuccess` = RPC receipt fetched; a tx can be included with `status: reverted`. */
    if (!receipt || receipt.status !== "success" || !publicClient) return;
    void refetchStreamSlots();
    let cancelled = false;
    void (async () => {
      try {
        const keys = await publicClient.readContract({
          address: ADDRESSES.streamFactory,
          abi: STREAM_FACTORY_ABI,
          functionName: "getAllStreamKeys",
        });
        if (cancelled) return;
        const newId = keys.length;
        if (newId >= 1) {
          router.push(`/invest/${newId}`);
        }
      } catch {
        /* optional redirect if Factory read fails */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [receipt, publicClient, router, refetchStreamSlots]);

  const terminalBody = useMemo(() => {
    const lines: string[] = [];
    lines.push(`> ENS_LABEL: ${protocolSlug || "—"}`);
    lines.push(`> PROTOCOL_SLUG (fees + Factory base): ${feesLookupSlug || "—"}`);
    lines.push(`> DEPLOY_SLUG (first free slot): ${onChainDeploySlug || "—"}`);
    lines.push(`> ERC20: name="${onChainDeploySlug || "—"}" · symbol=YST (Factory)`);
    lines.push(
      `> ANNUAL_REV_USD (DeFiLlama avg30×365): ${feesLoading ? "…" : formatNumber(Math.round(annualRevenueUsd))}`
    );
    lines.push(
      `> YOU_SELL (supply): ${offeringEconomics ? formatNumber(Math.round(offeringEconomics.nominalUsd)) : "—"} YST`
    );
    lines.push(
      `> YOU_RECEIVE_NET: ${offeringEconomics ? formatNumber(Math.round(offeringEconomics.nominalUsd)) : "—"} USDC`
    );
    lines.push(
      `> FACTORY capitalRaised (net ÷ ${DEMO_ONCHAIN_AMOUNT_DIVISOR}, min 1 USDC): ${
        offeringEconomics
          ? formatUsdcShort(offeringEconomics.afterDiscountUsd / DEMO_ONCHAIN_AMOUNT_DIVISOR)
          : "—"
      } USDC`
    );
    lines.push(`> CRE_DISCOUNT_RATE: ${creDecotePercent}% (σ, R_SCORE, trend, ETH/USD feed)`);
    lines.push(`> FACTORY: ${ADDRESSES.streamFactory}`);
    lines.push(`> USDC: immutable in Factory constructor — not passed in createStreamDirect`);
    lines.push(`> MSG.VALUE: 0 ETH (no protocol fee on Factory)`);
    lines.push("");

    if (writeError) {
      const em = writeError.message;
      if (/StreamAlreadyExists/i.test(em)) {
        lines.push(
          "> ERROR: StreamAlreadyExists — slug taken in the meantime. Retry (next free slot will be recalculated)."
        );
      } else {
        lines.push(`> ERROR: ${em.slice(0, 280)}`);
      }
    } else if (receipt?.status === "reverted") {
      lines.push("> ON-CHAIN FAILURE (revert) — no vault created, no redirect.");
      lines.push(
        "> E.g. NotOwner: wrong contract / owner-only function — check the deployed Factory address."
      );
    } else if (receipt?.status === "success") {
      lines.push("> DEPLOYMENT SUCCESSFUL. VAULT CREATED.");
      lines.push("> REDIRECTING TO INVEST VIEW…");
    } else if (awaitingReceipt) {
      lines.push("> DEPLOYING SMART CONTRACTS (STRICT 1:1 PARITY) ON SEPOLIA...");
      lines.push(`> TX_HASH: ${txHash}`);
    } else if (isWritePending) {
      lines.push("> AWAITING WALLET CONFIRMATION...");
    } else {
      lines.push("> STATUS: IDLE — SUBMIT WHEN READY.");
    }
    return lines.join("\n");
  }, [
    protocolSlug,
    onChainDeploySlug,
    feesLookupSlug,
    annualRevenueUsd,
    feesLoading,
    creDecotePercent,
    offeringEconomics,
    writeError,
    receipt,
    txHash,
    awaitingReceipt,
    isWritePending,
  ]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <Header />

      <main className="px-md sm:px-xl py-2xl max-w-[1400px] mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-md mb-2xl">
          <div>
            <Link
              href="/"
              className="font-mono text-label uppercase tracking-label text-text-disabled hover:text-text-secondary transition-colors duration-200 ease-nothing"
            >
              ← MARKETPLACE
            </Link>
            <h1 className="font-grotesk text-display-md text-text-display font-medium tracking-snug mt-md">
              Deploy stream
            </h1>
            <p className="font-grotesk text-body-sm text-text-secondary mt-sm max-w-md">
              Protocol terminal — instrument configuration + CRE risk summary.
            </p>
          </div>

          {mounted && identityReady && (
            <div
              className="font-mono text-label uppercase tracking-label text-text-secondary border border-border px-md py-sm rounded-technical transition-opacity duration-300 ease-[steps(6,end)]"
              style={{ opacity: 1 }}
            >
              ISSUER_IDENTITY:{" "}
              <span className="text-text-primary">{ensName}</span> |{" "}
              <span className="text-success">VERIFIED</span>
            </div>
          )}
        </div>

        {/* Wallet not connected */}
        {mounted && !isConnected && status !== "connecting" && (
          <section className="border border-border-visible p-2xl dot-grid rounded-technical transition-opacity duration-300 ease-[steps(8,end)]">
            <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-md">
              WALLET
            </p>
            <p className="font-grotesk text-body text-text-primary mb-lg">
              Connect a wallet for ENS verification and deployment.
            </p>
            <button
              type="button"
              onClick={() => openConnectModal?.()}
              disabled={!openConnectModal}
              className="font-mono text-[13px] uppercase tracking-[0.06em] px-lg py-[12px] rounded-pill bg-text-display text-black transition-opacity duration-200 ease-nothing hover:opacity-90 disabled:opacity-40"
            >
              CONNECT WALLET
            </button>
          </section>
        )}

        {mounted && status === "connecting" && (
          <p className="font-mono text-body-sm text-text-secondary">[CONNECTING…]</p>
        )}

        {/* ENS gate — blocked */}
        {mounted && isConnected && isEnsPending && (
          <p className="font-mono text-body-sm text-text-secondary">[RESOLVING ENS…]</p>
        )}

        {mounted && identityBlocked && (
          <section className="relative overflow-hidden border-2 border-accent rounded-technical min-h-[320px] flex flex-col items-center justify-center p-2xl dot-grid">
            <div className="absolute inset-0 pointer-events-none opacity-[0.15] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,0,0,0.08)_2px,rgba(255,0,0,0.08)_4px)]" />
            <p className="font-mono text-display-md sm:text-display-lg text-accent text-center tracking-tight leading-none mb-lg relative z-10 transition-transform duration-500 ease-[steps(12,end)]">
              IDENTITY_REQUIRED
            </p>
            <p className="font-grotesk text-body-sm text-text-secondary text-center max-w-lg mb-xl relative z-10">
              A primary ENS name (reverse record) is required — verified on{" "}
              <span className="text-text-primary">Sepolia</span> and{" "}
              <span className="text-text-primary">Ethereum</span>. Set up the reverse record
              on the network where your name is deployed, then come back.
            </p>
            <a
              href={ENS_APP}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 font-mono text-[13px] uppercase tracking-[0.08em] px-2xl py-md border border-text-display text-text-display rounded-pill hover:bg-text-display hover:text-black transition-colors duration-200 ease-nothing"
            >
              REGISTER ON ENS
            </a>
          </section>
        )}

        {/* Formulaire + widget risque */}
        {mounted && identityReady && (
          <div
            className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-2xl items-start transition-opacity duration-500 ease-[steps(10,end)]"
          >
            <section className="border border-border p-xl lg:p-2xl rounded-technical">
              <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-xl">
                CONFIGURATION
              </h2>

              {ensName && (
                <div className="mb-xl border border-border-visible rounded-technical px-md py-sm space-y-sm">
                  <p className="font-mono text-body-sm text-text-secondary">
                    <span className="text-text-disabled uppercase text-label tracking-label block mb-xs">
                      Verified protocol (ENS)
                    </span>
                    <span className="text-text-display">{ensName}</span>
                  </p>
                  <p className="font-mono text-caption text-text-disabled">
                    The slug shown on the marketplace and deployed on-chain follows the &ldquo;protocol slug&rdquo; field
                    (e.g. uniswap); without an override, it is your ENS label.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-xl">
                <div className="border border-border-visible rounded-technical px-md py-md bg-black/40">
                  <label
                    htmlFor="fees-slug-override"
                    className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm"
                  >
                    Protocol slug (DeFiLlama + deployment)
                  </label>
                  <p className="font-grotesk text-body-sm text-text-secondary mb-md leading-snug">
                    Default = your ENS label. For a readable demo (e.g.{" "}
                    <span className="text-text-display">uniswap</span>), enter the slug here: it is used for both{" "}
                    <strong className="text-text-primary font-medium">fees</strong> and the{" "}
                    <strong className="text-text-primary font-medium">stream / token name on-chain</strong>.
                  </p>
                  <input
                    id="fees-slug-override"
                    type="text"
                    autoComplete="off"
                    placeholder="empty = ENS label · e.g. uniswap"
                    value={feesSlugOverrideInput}
                    onChange={(e) => setFeesSlugOverrideInput(e.target.value)}
                    className="w-full bg-black border border-border-visible px-md py-sm font-mono text-body-sm text-text-display placeholder:text-text-disabled tabular-nums outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing rounded-technical"
                  />
                  <p className="font-mono text-caption text-text-disabled mt-sm">
                    Active slug (fees + Factory):{" "}
                    <span className="text-text-secondary">{feesLookupSlug || "—"}</span>
                  </p>
                </div>

                <div className="border border-border-visible rounded-technical px-md py-md bg-black/40">
                  <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-sm">
                    Deployment preview (Factory)
                  </p>
                  {feesLookupSlug ? (
                    <>
                      <p className="font-mono text-body-sm text-text-primary">
                        ENS identity: <span className="text-text-display">{ensName ?? "—"}</span> (label{" "}
                        <span className="text-text-display">{protocolSlug}</span>)
                      </p>
                      <p className="font-mono text-body-sm text-text-primary mt-xs">
                        Next free slot on-chain:{" "}
                        {streamSlotsPending ? (
                          <span className="text-text-disabled">…</span>
                        ) : (
                          <span className="text-text-display">{onChainDeploySlug || "—"}</span>
                        )}
                      </p>
                      <p className="font-mono text-body-sm text-text-primary mt-xs">
                        Token (ERC20 name):{" "}
                        {streamSlotsPending ? (
                          <span className="text-text-disabled">…</span>
                        ) : (
                          <span className="text-text-display">{onChainDeploySlug || "—"}</span>
                        )}{" "}
                        · symbol <span className="text-text-display">YST</span>
                      </p>
                      <p className="font-mono text-caption text-text-disabled mt-sm">
                        If <span className="text-text-secondary">{feesLookupSlug}</span> is already taken for this
                        wallet, it falls through to{" "}
                        <span className="text-text-secondary">{feesLookupSlug}-1</span>,{" "}
                        <span className="text-text-secondary">{feesLookupSlug}-2</span>…
                      </p>
                    </>
                  ) : (
                    <p className="font-mono text-caption text-accent">
                      Unable to derive slug — check your primary ENS.
                    </p>
                  )}
                </div>

                <div className="border border-success/30 rounded-technical px-md py-md bg-success/5">
                  <p className="font-mono text-label uppercase tracking-label text-success mb-sm">
                    Estimated annual revenue (DeFiLlama)
                  </p>
                  <p className="font-grotesk text-body-sm text-text-secondary mb-sm">
                    Moyenne des frais sur 30 jours (USD/jour) via le proxy Cloudflare du workflow CRE,
                    annualized ×365 — same source as the off-chain Chainlink CRE valuation.
                  </p>
                  <p className="font-mono text-display-sm sm:text-display-md text-text-display tabular-nums">
                    {feesLoading ? (
                      <span className="text-text-disabled">Loading…</span>
                    ) : feesError ? (
                      <span className="text-caption text-accent font-mono leading-snug">{feesError}</span>
                    ) : (
                      <>
                        ${formatNumber(Math.round(annualRevenueUsd))}{" "}
                        <span className="text-caption text-text-disabled font-mono">USD / yr</span>
                      </>
                    )}
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-baseline mb-sm gap-md">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      Share of future revenue sold
                    </span>
                    <span className="font-mono text-heading text-text-display tabular-nums">
                      {revenuePct}%
                    </span>
                  </div>
                  <p className="font-mono text-caption text-text-disabled mb-sm">
                    Share of your <span className="text-text-secondary">estimated annual revenue</span> you are
                    offering to investors. Click a block or{" "}
                    <span className="text-text-disabled/90">
                      hold and drag the bar (left = less, right = more).
                    </span>
                  </p>
                  <div
                    ref={revenueTrackRef}
                    role="slider"
                    tabIndex={0}
                    aria-valuemin={1}
                    aria-valuemax={50}
                    aria-valuenow={revenuePct}
                    aria-label="Share of future revenue sold, from 1 to 50 percent"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setRevenuePctFromClientX(e.clientX);
                    }}
                    onPointerMove={(e) => {
                      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                      setRevenuePctFromClientX(e.clientX);
                    }}
                    onPointerUp={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                    onPointerCancel={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                        e.preventDefault();
                        setRevenuePct((p) => Math.max(1, p - 1));
                      }
                      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setRevenuePct((p) => Math.min(50, p + 1));
                      }
                    }}
                    className="flex flex-wrap gap-[4px] cursor-grab touch-none select-none rounded-technical py-1 outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-border-visible focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {Array.from({ length: 50 }, (_, i) => {
                      const v = i + 1;
                      const active = v <= revenuePct;
                      return (
                        <div
                          key={v}
                          aria-hidden
                          className={`h-[10px] flex-1 min-w-[6px] max-w-[14px] rounded-[1px] transition-colors duration-150 ease-nothing pointer-events-none ${
                            active ? "bg-text-display" : "bg-border"
                          }`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between font-mono text-caption text-text-disabled mt-xs tabular-nums">
                    <span>1%</span>
                    <span>50%</span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="duration"
                    className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm"
                  >
                    STREAM_DURATION (MO)
                  </label>
                  <input
                    id="duration"
                    type="number"
                    min={1}
                    max={120}
                    value={durationMonths}
                    onChange={(e) =>
                      setDurationMonths(
                        Math.min(120, Math.max(1, Number(e.target.value) || 1))
                      )
                    }
                    className="w-full bg-black border border-border-visible px-md py-sm font-mono text-body-sm text-text-primary tabular-nums outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing rounded-technical"
                  />
                </div>

                {offeringEconomics && (
                  <div className="border border-success/25 rounded-technical px-md py-md space-y-lg bg-success/5">
                    <p className="font-mono text-label uppercase tracking-label text-text-secondary">
                      Issuer summary
                    </p>

                <div>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-success mb-xs">
                        Vous vendez
                      </p>
                      <p className="font-grotesk text-display-sm sm:text-display-md text-text-primary tabular-nums leading-none">
                        {formatNumber(Math.round(offeringEconomics.nominalUsd))}{" "}
                        <span className="font-mono text-body-sm text-text-disabled">USDC</span>
                      </p>
                      <p className="font-grotesk text-body-sm text-text-secondary mt-sm leading-snug">
                        Value of the <strong className="text-text-primary font-medium">rights to your revenue</strong>{" "}
                        that investors purchase ({revenuePct}% of the annual estimate).
                      </p>
                    </div>

                    <div className="border-t border-border-visible pt-md">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-text-display mb-xs">
                        Vous recevez au net
                      </p>
                      <p className="font-grotesk text-display-sm sm:text-display-md text-success tabular-nums leading-none">
                        {formatUsdcShort(offeringEconomics.afterDiscountUsd)}{" "}
                        <span className="font-mono text-body-sm text-success/80">USDC</span>
                      </p>
                      <p className="font-grotesk text-body-sm text-text-secondary mt-sm leading-snug">
                        What you receive <strong className="text-text-primary font-medium">after the discount</strong>{" "}
                        ({creDecotePercent}%) calculated from the CRE summary (σ, R, trend, ETH/USD market).
                      </p>
                    </div>

                    <div className="border-t border-border-visible pt-md">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-xs">
                        Montant on-chain (démo ÷ {DEMO_ONCHAIN_AMOUNT_DIVISOR.toLocaleString("en-US")})
                      </p>
                      <p className="font-grotesk text-display-sm sm:text-display-md text-text-primary tabular-nums leading-none">
                        {formatUsdcShort(
                          Math.max(
                            1,
                            offeringEconomics.afterDiscountUsd / DEMO_ONCHAIN_AMOUNT_DIVISOR
                          )
                        )}{" "}
                        <span className="font-mono text-body-sm text-text-disabled">USDC</span>
                      </p>
                      <p className="font-grotesk text-body-sm text-text-secondary mt-sm leading-snug">
                        Valeur enregistrée dans la Factory pour la levée (net après décote, divisé par{" "}
                        {DEMO_ONCHAIN_AMOUNT_DIVISOR.toLocaleString("en-US")} pour la démo testnet).
                      </p>
                    </div>
                </div>
                )}
              </div>

              <div className="mt-2xl pt-xl border-t border-border space-y-md">
                {!onSepolia && isConnected && (
                  <div className="flex flex-col gap-sm">
                    <p className="font-mono text-caption text-accent uppercase tracking-wide">
                      WRONG_NETWORK — Sepolia required for createStreamDirect
                    </p>
                    <button
                      type="button"
                      onClick={() => switchChain?.({ chainId: SEPOLIA_CHAIN_ID })}
                      disabled={!switchChain || isSwitchingChain}
                      className="w-full font-mono text-[12px] uppercase tracking-[0.06em] px-md py-sm border border-accent text-accent rounded-technical hover:bg-accent hover:text-black transition-colors disabled:opacity-40"
                    >
                      {isSwitchingChain ? "[SWITCHING…]" : "SWITCH TO SEPOLIA"}
                    </button>
                  </div>
                )}

                <div className="rounded-technical border border-border-visible bg-black/80 p-md min-h-[220px]">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-text-disabled mb-sm">
                    DEPLOYMENT_TERMINAL
                  </p>
                  <pre className="font-mono text-[11px] sm:text-body-sm text-success/90 whitespace-pre-wrap break-all leading-relaxed">
                    {terminalBody}
                  </pre>
                </div>

                {receipt?.status === "reverted" && (
                  <p className="font-mono text-caption text-accent leading-relaxed border border-accent/50 rounded-technical px-md py-sm bg-accent/5">
                    Transaction failed on-chain (revert — e.g. NotOwner). No vault created, no
                    redirect. Check the Factory address in the code and the Sepolia explorer for details.
                  </p>
                )}

                {writeError && /StreamAlreadyExists/i.test(writeError.message) && (
                  <div className="rounded-technical border border-accent/60 bg-accent/5 px-md py-md space-y-sm">
                    <p className="font-mono text-label uppercase tracking-label text-accent">
                      StreamAlreadyExists
                    </p>
                    <p className="font-grotesk text-body-sm text-text-secondary leading-snug">
                      Rare race: the slug was taken in the meantime. Retry — the next free slot will be
                      recalculated.
                    </p>
                    {existingStreamInvestId != null ? (
                      <Link
                        href={`/invest/${existingStreamInvestId}`}
                        className="inline-flex font-mono text-[12px] uppercase tracking-[0.06em] px-md py-sm border border-text-display text-text-display rounded-technical hover:bg-text-display hover:text-black transition-colors"
                      >
                        Ouvrir /invest/{existingStreamInvestId}
                      </Link>
                    ) : null}
                  </div>
                )}

                {deployBlockedHint && (
                  <p className="font-mono text-caption text-warning leading-relaxed border border-warning/40 rounded-technical px-md py-sm bg-warning/5">
                    {deployBlockedHint}
                  </p>
                )}

                <button
                  type="button"
                  onClick={deploy}
                  disabled={!deployReady}
                  title={deployBlockedHint ?? (deployReady ? "Deploy the stream on Sepolia" : undefined)}
                  className="w-full font-mono text-[12px] sm:text-[13px] uppercase tracking-[0.05em] px-md py-lg rounded-technical bg-text-display text-black transition-opacity duration-200 ease-nothing hover:opacity-90 btn-dot-matrix-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  DEPLOY
                </button>
                <p className="font-mono text-caption text-text-disabled text-center leading-relaxed">
                  No ETH fees to the Factory (msg.value = 0). USDC handled internally at Vault
                  deployment.
                </p>
              </div>
            </section>

            <aside className="border border-border p-xl lg:p-2xl rounded-technical lg:sticky lg:top-xl">
              <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-md">
                CHAINLINK CRE — RISK SUMMARY
              </h2>
              <p className="font-grotesk text-body-sm text-text-secondary mb-lg">
                Four inputs (DeFiLlama fees + Sepolia ETH/USD oracle) aggregated into a stream discount rate —
                not an arbitrary suggestion.
              </p>

              <div className="mb-lg border border-border-visible rounded-technical px-md py-sm font-mono text-caption text-text-secondary">
                <span className="text-text-disabled uppercase tracking-wider block mb-xs">
                  Annual revenue (DeFiLlama)
                </span>
                <span className="text-text-display tabular-nums text-body-sm">
                  {feesLoading ? "…" : feesError ? "—" : `$${formatNumber(Math.round(annualRevenueUsd))}`}
                </span>
                <span className="text-text-disabled"> USD — aligned with the configuration column.</span>
              </div>

              <div className="space-y-lg mb-xl">
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {creMetrics.volatility.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {feesLoading ? "…" : creMetrics.volatility.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={creMetrics.volatility.value}
                    max={creMetrics.volatility.max}
                    segments={20}
                    status={creMetrics.volatility.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {creMetrics.regularity.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {feesLoading ? "…" : creMetrics.regularity.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={creMetrics.regularity.value}
                    max={creMetrics.regularity.max}
                    segments={20}
                    status={creMetrics.regularity.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {creMetrics.trendPenalty.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {feesLoading ? "…" : creMetrics.trendPenalty.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={creMetrics.trendPenalty.value}
                    max={creMetrics.trendPenalty.max}
                    segments={20}
                    status={creMetrics.trendPenalty.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      MARKET_RISK (ETH/USD FEED)
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {isFeedPending ? "…" : isFeedError ? "—" : marketRiskValue}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={isFeedError ? 0 : marketRiskValue}
                    max={100}
                    segments={20}
                    status="neutral"
                    size="standard"
                    variant="blocks"
                    animated
                  />
                  <p className="font-mono text-caption text-text-disabled mt-xs tabular-nums">
                    ETH/USD (Sepolia Chainlink):{" "}
                        {isFeedPending
                          ? "[LOADING…]"
                      : isFeedError || !ethUsdDisplay
                        ? "[FEED ERROR]"
                        : `$${ethUsdDisplay}`}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-lg">
                <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-sm">
                  STREAM DISCOUNT
                </p>
                <p className="font-mono text-display-sm text-text-display tabular-nums leading-snug">
                  {creDecotePercent}%
                </p>
                <p className="font-mono text-caption text-text-disabled mt-sm leading-relaxed">
                  Weighting: 26% volatility · 26% (100 − regularity) · 24% trend · 24% market risk
                  (ETH/USD feed freshness). Range 5–55%.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
