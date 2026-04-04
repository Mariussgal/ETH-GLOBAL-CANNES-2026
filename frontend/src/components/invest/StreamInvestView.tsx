"use client";

import Header from "@/components/Header";
import SegmentedProgress from "@/components/SegmentedProgress";
import type { StreamData } from "@/components/StreamCard";
import { formatNumber } from "@/lib/format";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES, ERC20_ABI, SEPOLIA_CHAIN_ID } from "@/contracts";
import { usdcHumanFromYstWei, ystHumanFromUsdc } from "@/lib/yst-primary-sale";
import ArcConsolidationHub from "./ArcConsolidationHub";
import ArcActivityFeed from "./ArcActivityFeed";
import { useArcSepoliaSync } from "@/hooks/useArcSepoliaSync";
import { useDemoProtocolRevenueFeed } from "@/hooks/useDemoProtocolRevenueFeed";
import { useMockFeeAutoCrank } from "@/hooks/useMockFeeAutoCrank";
import { usePrimaryMarketInvest } from "@/hooks/usePrimaryMarketInvest";
import { shouldSimulateDemoRevenue } from "@/lib/demo-revenue-protocol";
import InvestorClaimButton from "@/components/dashboard/InvestorClaimButton";

/** Getter `splitter` sur MockQuickswapBase / Polygon */
const MOCK_SPLITTER_READ_ABI = [
  {
    name: "splitter",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
] as const;

const MOCK_FEES_ENABLED_READ_ABI = [
  {
    name: "feesEnabled",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool", name: "" }],
  },
] as const;

export type StreamChainInvest = {
  ystToken: `0x${string}`;
  emitter: `0x${string}`;
  vault: `0x${string}`;
  /** Router déployé par la Factory pour ce stream — doit être le même que `mock.splitter` pour créditer ce vault. */
  splitter: `0x${string}`;
};

interface StreamInvestViewProps {
  stream: StreamData;
  /** Sepolia stream addresses — buy YST via PrimarySale. */
  chainInvest?: StreamChainInvest;
  /** Factory + CRE: forwarder and workflow mapping (on-chain streams only). */
  chainlinkAutomationActive?: boolean;
}

export default function StreamInvestView({
  stream,
  chainInvest,
  chainlinkAutomationActive = false,
}: StreamInvestViewProps) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [usdcRaw, setUsdcRaw] = useState("");
  const [mockTogglePending, setMockTogglePending] = useState(false);
  const [alignSplittersPending, setAlignSplittersPending] = useState(false);
  const [halveBoundsPending, setHalveBoundsPending] = useState(false);
  const [mockPanelMessage, setMockPanelMessage] = useState<string | null>(null);

  /** Plafond de levée affiché : nominal (`capitalRaised`) si on-chain primaire, sinon `vaultTarget`. */
  const raiseCapUsdc = useMemo(() => {
    if (
      stream.nominalRaiseCapUsdc !== undefined &&
      stream.nominalRaiseCapUsdc > 0
    ) {
      return stream.nominalRaiseCapUsdc;
    }
    return stream.vaultTarget;
  }, [stream.nominalRaiseCapUsdc, stream.vaultTarget]);

  /** Ceiling: do not exceed the raise objective or remaining capacity. */
  const maxInvestUsdc = useMemo(
    () => Math.max(0, raiseCapUsdc - stream.vaultFill),
    [raiseCapUsdc, stream.vaultFill]
  );

  const usdcNum = useMemo(() => {
    const n = parseFloat(usdcRaw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, maxInvestUsdc);
  }, [usdcRaw, maxInvestUsdc]);

  useEffect(() => {
    if (maxInvestUsdc <= 0) return;
    const n = parseFloat(usdcRaw.replace(/,/g, ""));
    if (usdcRaw !== "" && Number.isFinite(n) && n > maxInvestUsdc) {
      setUsdcRaw(
        Number.isInteger(maxInvestUsdc)
          ? String(maxInvestUsdc)
          : maxInvestUsdc.toFixed(6).replace(/\.?0+$/, "")
      );
    }
  }, [maxInvestUsdc, usdcRaw]);

  const nominalUsdc = stream.nominalRaiseCapUsdc;
  /** En primaire, `vaultTarget` = valeur faciale ; sinon nominal vault. */
  const TARGET_DISTRIBUTION = useMemo(() => {
    if (nominalUsdc !== undefined && nominalUsdc > 0) {
      return stream.vaultTarget;
    }
    return stream.vaultTarget / (1 - stream.discount / 100);
  }, [nominalUsdc, stream.vaultTarget, stream.discount]);

  const HISTORICAL_ANNUAL_REVENUE = useMemo(() => {
    const base =
      nominalUsdc !== undefined && nominalUsdc > 0
        ? nominalUsdc
        : stream.vaultTarget;
    return base / (stream.feePercent / 100);
  }, [nominalUsdc, stream.vaultTarget, stream.feePercent]);

  const projectedYield = useMemo(() => {
    if (nominalUsdc !== undefined && nominalUsdc > 0 && stream.vaultTarget > nominalUsdc) {
      return ((stream.vaultTarget - nominalUsdc) / nominalUsdc) * 100;
    }
    if (stream.vaultTarget <= 0) return 0;
    return ((TARGET_DISTRIBUTION - stream.vaultTarget) / stream.vaultTarget) * 100;
  }, [nominalUsdc, stream.vaultTarget, TARGET_DISTRIBUTION]);

  /** 100 % = levée nominale atteinte (primaire on-chain), pas la valeur faciale. */
  const primaryRaiseComplete = Boolean(
    chainInvest &&
      nominalUsdc !== undefined &&
      nominalUsdc > 0 &&
      stream.vaultFill + 1e-6 >= nominalUsdc
  );

  const vaultLive = chainInvest
    ? primaryRaiseComplete
    : stream.vaultFill >= stream.vaultTarget;
  const isLive = vaultLive;

  const { data: ystDecimalsRaw } = useReadContract({
    address: chainInvest?.ystToken,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled: Boolean(chainInvest?.ystToken) },
  });
  const ystDecimals =
    ystDecimalsRaw !== undefined ? Number(ystDecimalsRaw) : 18;

  const { data: myYstBalanceWei, isPending: myYstBalancePending } = useReadContract({
    address: chainInvest?.ystToken,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: Boolean(chainInvest?.ystToken && address),
      refetchInterval: 15_000,
    },
  });

  const myInvestedUsdc = useMemo(() => {
    if (!chainInvest || myYstBalanceWei === undefined) return null;
    return usdcHumanFromYstWei(myYstBalanceWei as bigint, ystDecimals);
  }, [chainInvest, myYstBalanceWei, ystDecimals]);

  /** Total supply in human units = face value (Factory: projectedRevenue × 1e12 wei). */
  const totalYst = TARGET_DISTRIBUTION;
  const pricePerUnit = 1.0;

  const ystReceived = useMemo(() => {
    if (usdcNum <= 0) return 0;
    if (chainInvest) return ystHumanFromUsdc(usdcNum, ystDecimals);
    return usdcNum / pricePerUnit;
  }, [usdcNum, chainInvest, ystDecimals, pricePerUnit]);
  const revenueSharePct = totalYst > 0 ? (ystReceived / totalYst) * stream.feePercent : 0;

  const myYstHuman = useMemo(() => {
    if (myYstBalanceWei === undefined) return null;
    return parseFloat(formatUnits(myYstBalanceWei as bigint, ystDecimals));
  }, [myYstBalanceWei, ystDecimals]);

  /** Base pour breakeven / ROI : montant USDC réellement investi (YST) ou plafond nominal. */
  const breakevenBaseUsdc = useMemo(() => {
    if (myInvestedUsdc !== null && myInvestedUsdc > 0) return myInvestedUsdc;
    if (nominalUsdc !== undefined && nominalUsdc > 0) return nominalUsdc;
    if (raiseCapUsdc > 0) return raiseCapUsdc;
    return 500;
  }, [myInvestedUsdc, nominalUsdc, raiseCapUsdc]);

  /** Part du flux de revenus protocole (même logique que « REVENUE SHARE » : (YST / supply) × fee%). */
  const myRevenueShareOfProtocolPct = useMemo(() => {
    if (
      myYstHuman === null ||
      myYstHuman <= 0 ||
      !Number.isFinite(totalYst) ||
      totalYst <= 0
    ) {
      return 0;
    }
    return (myYstHuman / totalYst) * stream.feePercent;
  }, [myYstHuman, totalYst, stream.feePercent]);

  const demoRevenue = shouldSimulateDemoRevenue(stream.protocol);
  /** Nohem revenue mock: only when the stream is already in live mode. */
  const demoFeedActive = demoRevenue && vaultLive;

  const { data: mockSplitterReads, refetch: refetchMockSplitters } = useReadContracts({
    contracts: [
      {
        address: ADDRESSES.mockBase,
        abi: MOCK_SPLITTER_READ_ABI,
        functionName: "splitter",
        chainId: SEPOLIA_CHAIN_ID,
      },
      {
        address: ADDRESSES.mockPolygon,
        abi: MOCK_SPLITTER_READ_ABI,
        functionName: "splitter",
        chainId: SEPOLIA_CHAIN_ID,
      },
    ],
    query: {
      enabled: Boolean(chainInvest?.splitter && vaultLive && !demoRevenue),
    },
  });

  const {
    data: mockFeesEnabledReads,
    refetch: refetchMockFeesEnabled,
    isPending: mockFeesFlagLoading,
  } = useReadContracts({
    contracts: [
      {
        address: ADDRESSES.mockBase,
        abi: MOCK_FEES_ENABLED_READ_ABI,
        functionName: "feesEnabled",
        chainId: SEPOLIA_CHAIN_ID,
      },
      {
        address: ADDRESSES.mockPolygon,
        abi: MOCK_FEES_ENABLED_READ_ABI,
        functionName: "feesEnabled",
        chainId: SEPOLIA_CHAIN_ID,
      },
    ],
    query: {
      enabled: Boolean(chainInvest && vaultLive && !demoRevenue),
      refetchInterval: 12_000,
    },
  });

  const feesBaseOn = mockFeesEnabledReads?.[0]?.result as boolean | undefined;
  const feesPolyOn = mockFeesEnabledReads?.[1]?.result as boolean | undefined;
  /**
   * Crank **uniquement** si les deux mocks ont `feesEnabled === true`.
   * Évite d’appeler `generateFees` pendant le refetch (`undefined !== false` était vrai → erreur FeesDisabled après OFF).
   */
  const mockFeesSwitchOn = feesBaseOn === true && feesPolyOn === true;
  const feesGenerationEnabled = mockFeesSwitchOn;
  const mockFeesSwitchMixed =
    feesBaseOn !== undefined &&
    feesPolyOn !== undefined &&
    feesBaseOn !== feesPolyOn;

  /** Si les mocks n’appellent pas le Router de ce stream, les fees vont à un autre vault → earned ici = 0. */
  const mockSplitterMismatch = useMemo(() => {
    const target = chainInvest?.splitter?.toLowerCase();
    if (!target) return false;
    const b = mockSplitterReads?.[0]?.result as `0x${string}` | undefined;
    const p = mockSplitterReads?.[1]?.result as `0x${string}` | undefined;
    if (!b || !p) return false;
    return b.toLowerCase() !== target || p.toLowerCase() !== target;
  }, [chainInvest?.splitter, mockSplitterReads]);

  const mockApiJsonHeaders = useCallback((): HeadersInit => {
    const h: HeadersInit = { "Content-Type": "application/json" };
    const s = process.env.NEXT_PUBLIC_CRANK_SECRET?.trim();
    if (s) h.Authorization = `Bearer ${s}`;
    return h;
  }, []);

  const setMockFeesGeneration = useCallback(
    async (enabled: boolean) => {
      setMockTogglePending(true);
      setMockPanelMessage(null);
      try {
        const res = await fetch("/api/mock-fees-enabled", {
          method: "POST",
          headers: mockApiJsonHeaders(),
          body: JSON.stringify({ enabled }),
        });
        const j = (await res.json()) as {
          error?: string;
          allOk?: boolean;
          results?: { label: string; ok: boolean; error?: string }[];
        };
        if (!res.ok) throw new Error(j.error ?? res.statusText);
        if (j.allOk === false && j.results?.length) {
          const msg = j.results
            .filter((r) => !r.ok)
            .map((r) => `${r.label}: ${r.error ?? "err"}`)
            .join(" · ");
          throw new Error(
            msg.includes("NotOwner") || msg.includes("owner")
              ? `${msg} — la clé MOCK_CRANK_PRIVATE_KEY doit être owner des mocks (transferOwnership).`
              : msg
          );
        }
        await refetchMockFeesEnabled();
        void queryClient.invalidateQueries();
      } catch (e) {
        setMockPanelMessage(e instanceof Error ? e.message : String(e));
      } finally {
        setMockTogglePending(false);
      }
    },
    [mockApiJsonHeaders, queryClient, refetchMockFeesEnabled]
  );

  const alignMocksToStreamRouter = useCallback(async () => {
    if (!chainInvest?.splitter) return;
    setAlignSplittersPending(true);
    setMockPanelMessage(null);
    try {
      const res = await fetch("/api/mock-set-splitter", {
        method: "POST",
        headers: mockApiJsonHeaders(),
        body: JSON.stringify({ splitter: chainInvest.splitter }),
      });
      const j = (await res.json()) as {
        error?: string;
        hint?: string;
        results?: { label: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) {
        throw new Error(j.hint ?? j.error ?? res.statusText);
      }
      await refetchMockSplitters();
      void queryClient.invalidateQueries();
      setMockPanelMessage("Mocks alignés sur le Router de ce stream.");
    } catch (e) {
      setMockPanelMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setAlignSplittersPending(false);
    }
  }, [
    chainInvest?.splitter,
    mockApiJsonHeaders,
    queryClient,
    refetchMockSplitters,
  ]);

  const halveMockFeeBounds = useCallback(async () => {
    setHalveBoundsPending(true);
    setMockPanelMessage(null);
    try {
      const res = await fetch("/api/mock-fee-bounds", {
        method: "POST",
        headers: mockApiJsonHeaders(),
        body: JSON.stringify({ halve: true }),
      });
      const j = (await res.json()) as {
        allOk?: boolean;
        error?: string;
        results?: { label: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      if (j.allOk === false && j.results?.length) {
        const msg = j.results
          .filter((r) => !r.ok)
          .map((r) => `${r.label}: ${r.error ?? "err"}`)
          .join(" · ");
        throw new Error(
          msg.includes("NotOwner") || msg.includes("owner")
            ? `${msg} — MOCK_CRANK_PRIVATE_KEY doit être owner des mocks.`
            : msg
        );
      }
      setMockPanelMessage("Bornes min/max ÷2 — les mocks vident le solde ~2× moins vite par tick.");
      void queryClient.invalidateQueries();
    } catch (e) {
      setMockPanelMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setHalveBoundsPending(false);
    }
  }, [mockApiJsonHeaders, queryClient]);

  const protocolShort = useMemo(
    () => stream.ensName.split(".")[0].toUpperCase(),
    [stream.ensName]
  );

  const arc = useArcSepoliaSync({
    enabled: vaultLive && !demoRevenue,
    fallbackProtocolLabel: protocolShort,
    feedProtocolLabel: stream.protocol,
    streamVaultAddress: chainInvest?.vault,
  });

  const demo = useDemoProtocolRevenueFeed(stream.protocol, demoFeedActive);

  const feedItems = demoFeedActive ? demo.feedItems : arc.feedItems;
  const totalBaseRevenue = demoFeedActive ? demo.demoBaseUsdc : arc.totalBaseRevenue;
  const totalPolygonRevenue = demoFeedActive ? demo.demoPolygonUsdc : arc.totalPolygonRevenue;
  const hubLiveSync = demoFeedActive || arc.liveSync;

  /** Après 100 % : appelle /api/crank-mock-fees tout de puis puis toutes les ~11 min (page ouverte). */
  const mockFeeCrank = useMockFeeAutoCrank({
    enabled: Boolean(chainInvest && vaultLive && !demoRevenue),
    feesGenerationEnabled,
  });

  const demoYieldEstimate = useMemo(
    () => demo.feedItems.reduce((s, i) => s + i.amount, 0) * 0.012,
    [demo.feedItems]
  );

  const yieldNum = demoFeedActive
    ? demoYieldEstimate
    : mockSplitterMismatch
      ? 0
      : vaultLive && arc.liveSync && arc.accumulatedYieldUsdc !== null
        ? parseFloat(arc.accumulatedYieldUsdc)
        : 0;

  /** `YST.claimRewards()` — désactivé si pas de rewards claimables (vault.earned). */
  const claimYieldDisabled = useMemo(() => {
    if (!chainInvest?.ystToken) return true;
    if (demoFeedActive) return true;
    if (mockSplitterMismatch) return true;
    if (!arc.liveSync || !address) return true;
    if (arc.loadingEarned) return true;
    return !Number.isFinite(yieldNum) || yieldNum <= 1e-9;
  }, [
    chainInvest?.ystToken,
    demoFeedActive,
    mockSplitterMismatch,
    arc.liveSync,
    arc.loadingEarned,
    address,
    yieldNum,
  ]);

  const {
    invest,
    phase,
    busy: investBusy,
    lastError: investError,
    primarySaleConfigured,
  } = usePrimaryMarketInvest({
    ystToken: chainInvest?.ystToken,
    emitter: chainInvest?.emitter,
    enabled: Boolean(chainInvest),
  });

  const onInvestClick = () => {
    if (!chainInvest) return;
    if (!address) {
      openConnectModal?.();
      return;
    }
    if (usdcNum <= 0 || maxInvestUsdc <= 0) return;
    void invest(usdcNum);
  };

  const investDisabledReason = !chainInvest
    ? "Demo stream — no on-chain purchase."
    : !primarySaleConfigured
      ? "PrimarySale contract: add NEXT_PUBLIC_PRIMARY_SALE_ADDRESS."
      : null;

  const isEmitterWallet = Boolean(
    address &&
      chainInvest?.emitter &&
      address.toLowerCase() === chainInvest.emitter.toLowerCase()
  );

  const ystBalanceDisplay =
    myYstHuman !== null && Number.isFinite(myYstHuman)
      ? myYstHuman.toLocaleString("en-US", {
          maximumFractionDigits: 8,
          minimumFractionDigits: 0,
        })
      : "0";

  const myPositionBlock =
    chainInvest ? (
      <div className="border border-border p-md bg-black mb-xl">
        {!address ? (
          <>
            <p className="font-mono text-caption text-text-secondary uppercase mb-md tracking-wide">
              YOUR POSITION
            </p>
            <p className="font-mono text-body-sm text-text-disabled">
              Connect wallet to view your position.
            </p>
          </>
        ) : isEmitterWallet ? (
          <>
            <p className="font-mono text-caption text-text-secondary uppercase mb-md tracking-wide">
              EMITTER WALLET
            </p>
            {myYstBalancePending ? (
              <p className="font-mono text-subheading text-text-disabled tabular-nums animate-pulse">
                …
              </p>
            ) : (
              <div className="flex flex-col gap-sm font-mono text-caption">
                <p className="font-mono text-[11px] text-text-secondary leading-relaxed normal-case">
                  You are the issuer. This address holds minted YST for the primary sale — inventory,
                  not a purchased investor position (no USDC principal / revenue share here).
                </p>
                <div className="flex justify-between items-baseline gap-md border-t border-border-visible pt-sm">
                  <span className="text-text-secondary uppercase">YST inventory</span>
                  <span className="text-text-display tabular-nums">
                    {ystBalanceDisplay} YST
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="font-mono text-caption text-text-secondary uppercase mb-md tracking-wide">
              YOUR POSITION
            </p>
            {myYstBalancePending ? (
              <p className="font-mono text-subheading text-text-disabled tabular-nums animate-pulse">
                …
              </p>
            ) : (
              <div className="flex flex-col gap-sm font-mono text-caption">
                <div className="flex justify-between items-baseline gap-md border-b border-border-visible pb-sm">
                  <span className="text-text-secondary uppercase">USDC (principal)</span>
                  <span className="text-text-display tabular-nums">
                    {formatNumber(myInvestedUsdc ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-md border-b border-border-visible pb-sm">
                  <span className="text-text-secondary uppercase">YST balance</span>
                  <span className="text-text-display tabular-nums">
                    {ystBalanceDisplay} YST
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-md">
                  <span className="text-text-secondary uppercase">Revenue share</span>
                  <span className="text-text-display tabular-nums">
                    {myRevenueShareOfProtocolPct > 0
                      ? `${myRevenueShareOfProtocolPct.toFixed(4)}%`
                      : "0%"}
                  </span>
                </div>
                <p className="font-mono text-[9px] text-text-disabled uppercase tracking-wide pt-xs leading-relaxed">
                  Of the {stream.feePercent}% protocol revenue stream (your YST / total supply).
                </p>
              </div>
            )}
          </>
        )}
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <Header />

      <main className="px-md sm:px-xl py-2xl max-w-[1200px] mx-auto">
        <Link
          href="/#marketplace"
          className="font-mono text-label uppercase tracking-label text-text-disabled hover:text-text-secondary transition-colors duration-200 ease-nothing mb-xl inline-block"
        >
          ← MARKETPLACE
        </Link>

        {/* L'Anatomie du Deal (Header) */}
        <header className="mb-2xl border border-border p-xl rounded-technical dot-grid flex flex-col md:flex-row gap-xl md:items-center md:justify-between bg-black">
          <div className="flex flex-wrap items-center gap-md">
            <h1 className="font-grotesk text-display-md sm:text-display-lg text-text-display leading-none">
              {stream.ensName}
            </h1>
            <span className={`inline-flex items-center px-md py-[4px] border font-mono text-[10px] sm:text-label uppercase tracking-label rounded-sm ${
              isLive ? "border-success text-success animate-pulse" : "border-text-display text-text-display"
            }`}>
              {isLive ? "[v] OPERATIONAL / LIVE_REVENUE_FLOW" : "ENS_VERIFIED"}
            </span>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-xl md:gap-2xl font-mono text-body-sm">
            <div>
              <span className="text-text-disabled block mb-xs uppercase text-label tracking-label">OFFERING</span>
              <span className="text-text-display uppercase">{stream.feePercent}% FUTURE_REVENUE</span>
            </div>
            <div>
              <span className="text-text-disabled block mb-xs uppercase text-label tracking-label">TERM</span>
              <span className="text-text-display uppercase block">{Math.round(stream.duration / 30)} MONTHS</span>
              <span className="text-text-disabled text-[10px] sm:text-[11px] uppercase tracking-wider block mt-xs">EXPIRES_IN: {Math.max(stream.duration - 48, 0)} DAYS</span>
            </div>
          </div>
        </header>

        {chainInvest && primaryRaiseComplete && (
          <div className="mb-2xl border border-success/50 bg-success/5 rounded-technical px-xl py-md font-mono text-caption text-success">
            PRIMARY ROUND COMPLETE · Nominal raise target reached (
            {formatNumber(Math.round(raiseCapUsdc))} USDC). Operational views and revenue
            routing below.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-2xl items-start">
          <div className="flex flex-col gap-2xl">
            
            {isLive ? (
              <>
                <section className="border border-border p-xl rounded-technical bg-black grid grid-cols-1 md:grid-cols-3 gap-xl md:divide-x divide-border-visible dot-grid">
                  {/* 1. Offering */}
                  <div className="font-mono text-caption sm:text-body-sm">
                    <h3 className="text-caption text-text-secondary uppercase mb-lg tracking-label">1. THE OFFERING</h3>
                    <div className="flex justify-between mb-sm"><span className="text-text-disabled uppercase">Protocol</span><span className="text-text-display">{stream.ensName}</span></div>
                    <div className="flex justify-between mb-sm"><span className="text-text-disabled uppercase">Offering</span><span className="text-text-display">{stream.feePercent}% REVENUE</span></div>
                    <div className="flex justify-between mb-sm"><span className="text-text-disabled uppercase">Supply</span><span className="text-text-display tabular-nums">{formatNumber(totalYst)} YST</span></div>
                    <div className="flex justify-between"><span className="text-text-disabled uppercase">Expiry</span><span className="text-text-display">{Math.max(stream.duration - 48, 0)} DAYS</span></div>
                  </div>
                  {/* 2. 24H Protocol Revenue */}
                  <div className="font-mono text-caption sm:text-body-sm md:pl-xl flex flex-col">
                    <h3 className="text-caption text-text-secondary uppercase mb-lg tracking-label">2. 24H PROTOCOL REVENUE</h3>
                    <div className="flex-1 flex flex-col justify-center mb-md">
                      <div className="text-success text-[28px] sm:text-[32px] tabular-nums leading-none font-bold" style={{ textShadow: "0 0 10px rgba(34,197,94,0.3)" }}>
                        ${formatNumber(Math.round(HISTORICAL_ANNUAL_REVENUE / 365))}
                      </div>
                    </div>
                    <div className="flex justify-between border-t border-border-visible pt-sm">
                      <span className="text-text-disabled uppercase">Streamed ({stream.feePercent}%)</span>
                      <span className="text-text-display tabular-nums">+${formatNumber(Math.round((HISTORICAL_ANNUAL_REVENUE / 365) * (stream.feePercent / 100)))}</span>
                    </div>
                  </div>
                  {/* 3. Live Evolution */}
                  <div className="font-mono text-caption sm:text-body-sm md:pl-xl">
                    <h3 className="text-caption text-text-secondary uppercase mb-lg tracking-label">3. LIVE EVOLUTION</h3>
                    <div className="text-text-disabled mb-xs uppercase">USDC RAISED (100%)</div>
                    <div className="text-text-display tabular-nums font-mono text-[14px] sm:text-[16px] mb-lg">
                      {formatNumber(Math.round(stream.vaultFill))} /{" "}
                      {formatNumber(Math.round(raiseCapUsdc))}
                    </div>
                    <SegmentedProgress
                      value={Math.min(stream.vaultFill, raiseCapUsdc)}
                      max={Math.max(raiseCapUsdc, 1)}
                      segments={12}
                      status="success"
                      size="standard"
                      variant="blocks"
                      animated={false}
                    />
                  </div>
                </section>

                <ArcActivityFeed
                  items={feedItems}
                  feedHint={
                    chainInvest && !demoRevenue
                      ? "Historique = tous les frais générés par les mocks Base/Polygon partagés (même vault). Les horaires peuvent précéder la création de ce stream."
                      : undefined
                  }
                />
                
                {/* Multi-Chain Hub */}
                <div className="mt-xl">
                  <ArcConsolidationHub
                    totalBaseRevenue={totalBaseRevenue}
                    totalPolygonRevenue={totalPolygonRevenue}
                    liveSync={hubLiveSync}
                    chainlinkAutomationActive={chainlinkAutomationActive}
                  />
                </div>

                {chainInvest && !demoRevenue && (
                  <div className="font-mono text-[10px] text-text-disabled border border-border rounded-technical p-md leading-relaxed space-y-md">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md border-b border-border-visible pb-md">
                      <div className="text-text-secondary uppercase tracking-wide">
                        Revenue mocks (Base + Polygon) → Router → vault
                      </div>
                      <div className="flex items-center gap-sm">
                        <span className="text-text-disabled uppercase text-[9px]">
                          Génération fees
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={mockFeesSwitchOn}
                          disabled={mockTogglePending || mockFeesFlagLoading}
                          onClick={() => void setMockFeesGeneration(!mockFeesSwitchOn)}
                          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
                            mockFeesSwitchOn
                              ? "border-success bg-success/20"
                              : "border-border bg-black"
                          } ${mockTogglePending || mockFeesFlagLoading ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-text-display shadow transition-transform ${
                              mockFeesSwitchOn ? "translate-x-5 bg-success" : "translate-x-0"
                            }`}
                          />
                        </button>
                        <span className="text-[9px] tabular-nums text-text-secondary min-w-[4rem]">
                          {mockFeesFlagLoading
                            ? "…"
                            : mockFeesSwitchOn
                              ? "ON"
                              : mockFeesSwitchMixed
                                ? "MIX"
                                : "OFF"}
                        </span>
                      </div>
                    </div>
                    {mockFeesSwitchMixed ? (
                      <p className="text-accent normal-case text-[10px]">
                        Base et Polygon diffèrent sur <code className="text-text-secondary">feesEnabled</code>{" "}
                        — utilise l’interrupteur pour les remettre au même état.
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-sm">
                      <div className="flex flex-col sm:flex-row flex-wrap gap-sm items-stretch sm:items-start">
                        <button
                          type="button"
                          disabled={alignSplittersPending || !chainInvest.splitter}
                          onClick={() => void alignMocksToStreamRouter()}
                          className="font-mono text-[10px] uppercase border border-success px-md py-sm text-success hover:bg-success/10 rounded-sm disabled:opacity-40 disabled:cursor-not-allowed w-fit"
                        >
                          {alignSplittersPending
                            ? "Alignement…"
                            : "Aligner les mocks sur ce stream (setSplitter)"}
                        </button>
                        <button
                          type="button"
                          disabled={halveBoundsPending}
                          onClick={() => void halveMockFeeBounds()}
                          className="font-mono text-[10px] uppercase border border-text-secondary px-md py-sm text-text-secondary hover:bg-white/5 rounded-sm disabled:opacity-40 w-fit"
                        >
                          {halveBoundsPending ? "…" : "Diviser min/max par 2 (moins vite)"}
                        </button>
                      </div>
                      <p className="text-text-disabled normal-case text-[9px] max-w-md">
                        <code className="text-text-secondary">setSplitter</code> : même clé owner que les
                        autres actions mock. <code className="text-text-secondary">setFeeBounds</code> : réduit
                        chaque tick (~2× moins d’USDC par appel si tu divises par 2).
                      </p>
                    </div>
                    {mockPanelMessage ? (
                      <p
                        className={`normal-case text-[10px] ${
                          mockPanelMessage.startsWith("Mocks alignés")
                            ? "text-success"
                            : "text-accent"
                        }`}
                      >
                        {mockPanelMessage}
                      </p>
                    ) : null}
                    <p className="text-text-disabled normal-case">
                      Levée complète : le serveur appelle{" "}
                      <code className="text-text-secondary">generateFees()</code> tant que l’interrupteur
                      est ON et que la page est ouverte (~8–15&nbsp;s). Crank :{" "}
                      <code className="text-text-secondary">MOCK_CRANK_PRIVATE_KEY</code> + ETH Sepolia.
                    </p>
                    {!feesGenerationEnabled ? (
                      <p className="text-text-secondary normal-case">
                        Crank en pause — interrupteur{" "}
                        <span className="text-text-display">OFF</span> (aucun{" "}
                        <code className="text-text-secondary">generateFees</code>). Un ancien{" "}
                        <span className="text-accent">LAST_TICK_ERR</span> peut encore s’afficher si le solde
                        mock était vide avant la coupure ; ignore-le.
                      </p>
                    ) : (
                      <p
                        className={
                          mockFeeCrank.pending
                            ? "text-text-secondary animate-pulse"
                            : mockFeeCrank.status?.ok === false
                              ? "text-accent"
                              : "text-success"
                        }
                      >
                        {mockFeeCrank.pending
                          ? "CRANK…"
                          : mockFeeCrank.status
                            ? `${mockFeeCrank.status.ok ? "LAST_TICK_OK" : "LAST_TICK_ERR"} · ${mockFeeCrank.status.message}`
                            : "En attente du premier tick…"}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* 1. The Offering */}
                <section className="border border-border p-xl rounded-technical dot-grid">
                  <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-xl">
                    1. THE OFFERING
                  </h2>
                  
                  <div className="font-mono text-body-sm">
                    <div className="flex items-center justify-between border-b border-border-visible py-md">
                      <span className="text-text-disabled">PROTOCOL</span>
                      <span className="text-text-display">{stream.ensName}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border-visible py-md">
                      <span className="text-text-disabled">OFFERING</span>
                      <span className="text-text-display">{stream.feePercent}% of all future revenue.</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border-visible py-md">
                      <span className="text-text-disabled">SUPPLY</span>
                      <span className="text-text-display">{formatNumber(totalYst)} YST Units.</span>
                    </div>
                    <div className="flex items-center justify-between pt-md">
                      <span className="text-text-disabled">PRICE</span>
                      <span className="text-text-display">{pricePerUnit.toFixed(2)} USDC / Unit.</span>
                    </div>
                  </div>
                </section>

                {/* 2. The Valuation Engine */}
                <section className="border border-border rounded-technical overflow-hidden">
                  <div className="p-xl border-b border-border bg-black">
                    <h2 className="font-mono text-label uppercase tracking-label text-text-secondary lg:mb-0">
                      2. THE VALUATION ENGINE
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
                    <div className="p-xl bg-black">
                      <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-lg">
                        HISTORICAL_ANNUAL_REVENUE
                      </span>
                      <span className="font-mono text-[20px] sm:text-[24px] text-text-display headline-tight block">
                        ${formatNumber(HISTORICAL_ANNUAL_REVENUE)}
                      </span>
                    </div>
                    <div className="p-xl bg-black">
                      <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-lg">
                        DISCOUNTED_VALUATION
                      </span>
                      <span className="font-mono text-[20px] sm:text-[24px] text-text-display headline-tight block mb-md tabular-nums">
                        $
                        {formatNumber(
                          nominalUsdc !== undefined && nominalUsdc > 0
                            ? nominalUsdc
                            : stream.vaultTarget
                        )}
                      </span>
                      <span className="font-mono text-caption text-text-disabled uppercase">
                        (Chainlink Risk Score: {stream.discount}%)
                      </span>
                    </div>
                    <div className="p-xl bg-black">
                      <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-lg">
                        TARGET_DISTRIBUTION
                      </span>
                      <span className="font-mono text-[20px] sm:text-[24px] text-text-display headline-tight block mb-md tabular-nums">
                        ${formatNumber(TARGET_DISTRIBUTION)}
                      </span>
                      <span className="font-mono text-caption text-text-disabled uppercase">
                        (Total projected revenue)
                      </span>
                    </div>
                  </div>
                </section>

                {/* 3. Live Evolution */}
                <section className="border border-border p-xl sm:p-2xl rounded-technical bg-black text-center flex flex-col items-center justify-center">
                  <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-2xl w-full text-left">
                    3. LIVE EVOLUTION (SIMULATION)
                  </h2>
                  
                  <div className="mb-2xl w-full">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-lg">
                      USDC RAISED (
                      {raiseCapUsdc > 0
                        ? Math.min(
                            100,
                            Math.round((stream.vaultFill / raiseCapUsdc) * 100)
                          )
                        : 0}
                      %)
                    </span>
                    <span className="font-mono text-display-sm sm:text-display-lg text-text-display leading-none tabular-nums tracking-snug">
                      {formatNumber(Math.round(stream.vaultFill))} /{" "}
                      {formatNumber(Math.round(raiseCapUsdc))}
                    </span>
                  </div>
                  
                  <div className="w-full">
                    <SegmentedProgress
                        value={Math.min(stream.vaultFill, raiseCapUsdc)}
                        max={Math.max(raiseCapUsdc, 1)}
                        segments={48}
                        status="neutral"
                        size="standard"
                        variant="blocks"
                        animated={true}
                    />
                  </div>
                </section>

                {/* 4. The Upside */}
                <section className="p-xl border border-border rounded-technical flex flex-col md:flex-row md:items-start md:justify-between bg-surface gap-xl">
                  <div className="flex-1">
                    <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-md">
                      4. THE UPSIDE
                    </h2>
                    <div className="font-mono text-caption text-text-disabled uppercase max-w-lg mb-sm">
                      Note: You are paying $
                      {formatNumber(
                        nominalUsdc !== undefined && nominalUsdc > 0
                          ? nominalUsdc
                          : stream.vaultTarget
                      )}{" "}
                      for a right to ${formatNumber(TARGET_DISTRIBUTION)} of actual cash-flow.
                    </div>
                    <div className="font-mono text-[10px] sm:text-[11px] text-accent uppercase tracking-wide max-w-lg">
                      * Projection assumes revenues are maintained. Actual yields are dynamic and may perform above or below estimates.
                    </div>
                  </div>
                  <div className="md:text-right border-t md:border-t-0 md:border-l border-border-visible pt-md md:pt-0 md:pl-xl whitespace-nowrap">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-xs">
                      PROJECTED_YIELD
                    </span>
                    <span className="font-mono text-display-sm sm:text-[32px] text-success tabular-nums leading-none">
                      +{projectedYield.toFixed(1)}%
                    </span>
                  </div>
                </section>
              </>
            )}
          </div>

           {/* 5. Interaction */}
           <aside className="border border-border p-xl lg:p-2xl rounded-technical lg:sticky lg:top-xl bg-black dot-grid">
             <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-xl">
              5. {isLive ? "EARNINGS CONSOLE" : "INTERACTION"}
             </h2>
             
             {isLive ? (
               <div className="flex flex-col gap-xl">
                 {chainInvest && mockSplitterMismatch ? (
                   <div className="border border-accent p-md bg-accent/5 font-mono text-[11px] text-text-secondary leading-relaxed space-y-sm">
                     <p className="text-accent uppercase tracking-wide">
                       Mock → mauvais Router
                     </p>
                     <p className="normal-case text-text-disabled">
                       Les contrats mock Base/Polygon appellent un{" "}
                       <code className="text-text-secondary">splitter</code> différent du Router de{" "}
                       <strong className="text-text-primary">ce</strong> stream. Les USDC partent donc vers un{" "}
                       <strong className="text-text-primary">autre</strong> vault :{" "}
                       <code className="text-text-secondary">earned</code> reste 0 ici alors que le feed affiche des
                       frais.
                     </p>
                     <p className="normal-case text-text-disabled">
                       <strong className="text-text-primary">Fix (owner des mocks)</strong> :{" "}
                       <code className="text-text-secondary break-all">
                         setSplitter({chainInvest.splitter})
                       </code>{" "}
                       sur chaque mock (même adresse que la Factory pour ce stream).
                     </p>
                   </div>
                 ) : null}
                 <div className="border border-success p-xl bg-success/5 shadow-[0_0_15px_rgba(34,197,94,0.1)] relative overflow-hidden group">
                   <div className="absolute inset-0 bg-success/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
                   
                   <span className="font-mono text-caption text-success uppercase block mb-sm relative z-10">
                     MY_ACCUMULATED_YIELD
                   </span>
                   <div className="font-mono text-display-md sm:text-[40px] text-success leading-none tabular-nums shadow-success relative z-10 mb-xl min-h-[2.5rem]" style={{ textShadow: "0 0 10px rgba(34,197,94,0.5)" }}>
                     {!address ? (
                       <span className="text-text-disabled text-body-sm tracking-wide">CONNECT WALLET</span>
                     ) : demoFeedActive ? (
                       <>{yieldNum.toFixed(4)} USDC</>
                     ) : !arc.liveSync ? (
                       <span className="text-text-disabled text-body-sm tracking-wide">SWITCH TO SEPOLIA</span>
                     ) : mockSplitterMismatch ? (
                       <span className="text-text-disabled text-body-sm tracking-wide normal-case">
                         0 (fees vers autre vault)
                       </span>
                     ) : arc.loadingEarned ? (
                       <span className="text-text-disabled animate-pulse tracking-wide">SYNCING...</span>
                     ) : (
                       <>{yieldNum.toFixed(4)} USDC</>
                     )}
                   </div>

                   {/* Breakeven Indicator */}
                   <div className="relative z-10 pt-md border-t border-success/30">
                     <div className="flex justify-between items-end mb-xs">
                        <span className="font-mono text-[10px] text-success/80 uppercase tracking-widest">BREAKEVEN_PROGRESS</span>
                        <span className="font-mono text-[10px] text-success tabular-nums">
                          {breakevenBaseUsdc > 0
                            ? ((yieldNum / breakevenBaseUsdc) * 100).toFixed(2)
                            : "0.00"}
                          %
                        </span>
                     </div>
                     <div className="w-full h-[6px] bg-black border border-success/30 overflow-hidden">
                       <div
                         className="h-full bg-success transition-all duration-300 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                         style={{
                           width: `${Math.min(
                             breakevenBaseUsdc > 0 ? (yieldNum / breakevenBaseUsdc) * 100 : 0,
                             100
                           )}%`,
                         }}
                       />
                     </div>
                     <div className="flex justify-between mt-sm text-text-disabled">
                        <span className="font-mono text-[9px] uppercase">ROI 0</span>
                        <span className="font-mono text-[9px] uppercase">
                          INITIAL: {formatNumber(breakevenBaseUsdc)} USDC
                        </span>
                     </div>
                   </div>
                 </div>

                 {myPositionBlock}

                 <div className="border border-border p-md bg-black">
                   <p className="font-mono text-caption text-text-secondary uppercase leading-relaxed flex items-center justify-between mb-sm pb-sm border-b border-border-visible">
                     <span>VAULT_LIQUIDITY:</span>
                     <span className="text-text-display tabular-nums cursor-default hover:text-success transition-colors">
                       {arc.loadingVaultLiquidity
                         ? "…"
                         : (arc.vaultLiquidityUsdcDisplay ?? "—")}
                     </span>
                   </p>
                   <p className="font-mono text-caption text-text-secondary uppercase leading-relaxed flex items-center justify-between mb-sm pb-sm border-b border-border-visible">
                     <span>PRICE_FLOOR V4:</span>
                     <span className="text-text-display tabular-nums text-text-disabled">--</span>
                   </p>
                   <p className="font-mono text-caption text-text-secondary uppercase leading-relaxed flex items-center justify-between">
                     <span>ROUTING_STATUS:</span>
                     {demoFeedActive || arc.routingStatusActive ? (
                       <span className="text-success tabular-nums flex items-center gap-xs">
                         <span className="w-[6px] h-[6px] rounded-full bg-success animate-pulse" />
                         ACTIVE
                       </span>
                     ) : (
                       <span className="text-red-500 tabular-nums flex items-center gap-xs">
                         <span className="w-[6px] h-[6px] rounded-full bg-red-500" />
                         INACTIVE
                       </span>
                     )}
                   </p>
                 </div>

                 <div className="flex flex-col gap-sm w-full">
                   {demoFeedActive ? (
                     <button
                       type="button"
                       disabled
                       className="w-full font-mono text-[13px] sm:text-[14px] uppercase tracking-[0.06em] px-md py-xl border border-border bg-black text-text-disabled opacity-50 cursor-not-allowed"
                     >
                       CLAIM (démo synthétique — pas on-chain)
                     </button>
                   ) : chainInvest ? (
                     <>
                       <InvestorClaimButton
                         ystToken={chainInvest.ystToken}
                         disabled={claimYieldDisabled}
                         className="w-full font-mono text-[13px] sm:text-[14px] uppercase tracking-[0.06em] px-md py-xl border border-success bg-black text-success transition-all duration-300 ease-nothing hover:bg-success hover:text-black hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-black disabled:hover:text-success rounded-sm"
                       />
                       <p className="font-mono text-[9px] text-text-disabled normal-case text-center leading-snug">
                         Envoie <code className="text-text-secondary">claimRewards()</code> sur le YST de ce
                         stream — transfère l’USDC accumulé depuis le vault (frais 50 bps au claim dans le
                         contrat).
                       </p>
                     </>
                   ) : (
                     <button
                       type="button"
                       disabled
                       className="w-full font-mono text-[13px] sm:text-[14px] uppercase tracking-[0.06em] px-md py-xl border border-border bg-black text-text-disabled opacity-50"
                     >
                       CLAIM (stream hors chaîne)
                     </button>
                   )}
                   <div className="flex justify-center items-center gap-xs mt-1">
                     <Image src="/arc_logo_white_sharp.png" alt="Arc" width={10} height={10} className="opacity-50 brightness-0 invert" />
                     <span className="font-mono text-[9px] text-text-disabled uppercase tracking-widest">CONSOLIDATED_BY_ARC</span>
                   </div>
                 </div>
                 
                 <button
                   type="button"
                   className="w-full font-mono text-[11px] sm:text-[12px] uppercase tracking-widest px-md py-lg border border-border-visible text-text-disabled hover:text-text-display hover:border-text-display transition-colors ease-nothing"
                 >
                   [ SECONDARY MARKET ]
                 </button>
               </div>
             ) : (
               <div className="flex flex-col gap-0">
                 {myPositionBlock}
                 <label
                   htmlFor="usdc-in"
                   className="font-mono text-label uppercase tracking-label text-text-secondary block mb-md"
                 >
                   INVEST_AMOUNT (USDC)
                 </label>
                 <p className="font-mono text-[10px] text-text-disabled uppercase tracking-wide mb-sm">
                   Max {formatNumber(Math.round(maxInvestUsdc))} USDC
                   {stream.vaultFill > 0
                     ? ` (${formatNumber(Math.round(raiseCapUsdc))} raise − ${formatNumber(Math.round(stream.vaultFill))} filled)`
                     : ` (raise cap)`}
                 </p>
                 <input
                   id="usdc-in"
                   type="text"
                   inputMode="decimal"
                   placeholder="0.00"
                   value={usdcRaw}
                   onChange={(e) => {
                     const cleaned = e.target.value.replace(/[^\d.]/g, "");
                     if (cleaned === "") {
                       setUsdcRaw("");
                       return;
                     }
                     const n = parseFloat(cleaned);
                     if (!Number.isFinite(n)) {
                       setUsdcRaw(cleaned);
                       return;
                     }
                     if (maxInvestUsdc > 0 && n > maxInvestUsdc) {
                       setUsdcRaw(
                         Number.isInteger(maxInvestUsdc)
                           ? String(maxInvestUsdc)
                           : maxInvestUsdc.toFixed(6).replace(/\.?0+$/, "")
                       );
                       return;
                     }
                     setUsdcRaw(cleaned);
                   }}
                   className="w-full bg-black border border-border px-md py-lg font-mono text-subheading text-text-display tabular-nums outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing mb-xl"
                 />

                 <div className="border border-border p-md bg-black mb-xl">
                   <p className="font-mono text-caption text-text-secondary uppercase leading-relaxed flex items-center justify-between mb-sm pb-sm border-b border-border-visible">
                     <span>RECEIVING:</span>
                     <span className="text-text-display tabular-nums">{formatNumber(ystReceived)} YST</span>
                   </p>
                   <p className="font-mono text-caption text-text-secondary uppercase leading-relaxed flex items-center justify-between">
                     <span>REVENUE SHARE:</span>
                     <span className="text-text-display tabular-nums">
                       {revenueSharePct > 0 ? revenueSharePct.toFixed(4) : "0.00"}%
                     </span>
                   </p>
                 </div>

                 {investError && (
                   <p className="font-mono text-[10px] text-accent mb-md uppercase leading-relaxed">
                     {investError}
                   </p>
                 )}
                 <button
                   type="button"
                   onClick={onInvestClick}
                   disabled={
                     investBusy ||
                     !chainInvest ||
                     usdcNum <= 0 ||
                     maxInvestUsdc <= 0 ||
                     !primarySaleConfigured
                   }
                   title={investDisabledReason ?? undefined}
                   className="w-full font-mono text-[13px] sm:text-[14px] uppercase tracking-[0.06em] px-md py-xl border border-text-display bg-black text-text-display transition-colors duration-200 ease-nothing hover:bg-text-display hover:text-black mt-auto disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-black disabled:hover:text-text-display"
                 >
                   {investBusy
                     ? phase === "approving"
                       ? "[ APPROVE USDC… ]"
                       : "[ INVEST & MINT YST… ]"
                     : "[ INVEST & MINT YST ]"}
                 </button>
                 {investDisabledReason && chainInvest && (
                   <p className="font-mono text-[9px] text-text-disabled uppercase tracking-wide mt-sm text-center">
                     {investDisabledReason}
                   </p>
                 )}
                  {chainInvest && primarySaleConfigured && (
                    <p className="font-mono text-[9px] text-text-disabled uppercase tracking-wide mt-xs text-center leading-relaxed">
                      The issuer must have approved PrimarySale for the YST token (infinite or sufficient amount).
                    </p>
                  )}
               </div>
             )}
           </aside>
        </div>
      </main>
    </div>
  );
}
