"use client";

import Header from "@/components/Header";
import SegmentedProgress from "@/components/SegmentedProgress";
import {
  aggregatorV3LatestRoundAbi,
  ETH_USD_AGGREGATOR_V3,
} from "@/lib/chainlink-feeds";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useEnsName,
  useReadContract,
} from "wagmi";
import { mainnet } from "wagmi/chains";

const ENS_APP = "https://app.ens.domains";

/** CRE-style mock components (σ, R, trend) — animés via SegmentedProgress */
const CRE_COMPONENTS = {
  volatility: { label: "VOLATILITY (σ)", max: 100, value: 62, status: "warning" as const },
  regularity: { label: "REGULARITY (R_SCORE)", max: 100, value: 78, status: "success" as const },
  trendPenalty: { label: "TREND_PENALTY", max: 100, value: 45, status: "neutral" as const },
};

const RECOMMENDED_DISCOUNT = 30;

function formatUsdFromAnswer(answer: bigint): string {
  const n = Number(answer) / 1e8;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function marketRiskFromAnswer(answer: bigint): number {
  const mod = Number((answer % BigInt(10000)) + BigInt(30));
  return Math.min(100, mod);
}

export default function CreateStreamTerminal() {
  const { address, status, chainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const {
    data: ensName,
    isPending: isEnsPending,
    isSuccess: isEnsSuccess,
  } = useEnsName({
    address,
    chainId: mainnet.id,
    query: { enabled: Boolean(address) },
  });

  const feedAddress =
    chainId !== undefined ? ETH_USD_AGGREGATOR_V3[chainId] : undefined;

  const { data: roundData, isPending: isFeedPending } = useReadContract({
    address: feedAddress,
    abi: aggregatorV3LatestRoundAbi,
    functionName: "latestRoundData",
    chainId,
    query: {
      enabled: Boolean(feedAddress && isConnected),
    },
  });

  const ethUsdDisplay = useMemo(() => {
    if (!roundData) return null;
    const answer = roundData[1];
    return formatUsdFromAnswer(answer);
  }, [roundData]);

  const marketRiskValue = useMemo(() => {
    if (!roundData) return 52;
    return marketRiskFromAnswer(roundData[1]);
  }, [roundData]);

  const [protocolSlug, setProtocolSlug] = useState("quickswap-v3");
  const [revenuePct, setRevenuePct] = useState(10);
  const [durationMonths, setDurationMonths] = useState(12);
  const [softCap, setSoftCap] = useState("250000");

  const identityBlocked =
    isConnected && !isEnsPending && isEnsSuccess && !ensName;

  const identityReady =
    isConnected && !isEnsPending && isEnsSuccess && Boolean(ensName);

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
              Terminal protocole — configuration instrument + synthèse risque CRE.
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

        {/* Wallet non connecté */}
        {mounted && !isConnected && status !== "connecting" && (
          <section className="border border-border-visible p-2xl dot-grid rounded-technical transition-opacity duration-300 ease-[steps(8,end)]">
            <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-md">
              WALLET
            </p>
            <p className="font-grotesk text-body text-text-primary mb-lg">
              Connectez un portefeuille pour la vérification ENS et le déploiement.
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

        {/* Gate ENS — bloqué */}
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
              Primary ENS name requis pour émettre un stream. Configurez l’enregistrement inverse
              sur Ethereum, puis revenez.
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

              <div className="flex flex-col gap-xl">
                <div>
                  <label
                    htmlFor="protocol-slug"
                    className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm"
                  >
                    PROTOCOL_SLUG
                  </label>
                  <input
                    id="protocol-slug"
                    value={protocolSlug}
                    onChange={(e) => setProtocolSlug(e.target.value.toLowerCase())}
                    placeholder="quickswap-v3"
                    className="w-full bg-black border border-border-visible px-md py-sm font-mono text-body-sm text-text-primary outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing rounded-technical"
                  />
                  <p className="font-mono text-caption text-text-disabled mt-xs">
                    Interrogation DeFiLlama — ex: quickswap-v3
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-baseline mb-sm">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      REVENUE_PERCENTAGE
                    </span>
                    <span className="font-mono text-heading text-text-display tabular-nums">
                      {revenuePct}%
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-[4px]">
                    {Array.from({ length: 50 }, (_, i) => {
                      const v = i + 1;
                      const active = v <= revenuePct;
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-label={`${v}%`}
                          onClick={() => setRevenuePct(v)}
                          className={`h-[10px] flex-1 min-w-[6px] max-w-[14px] rounded-[1px] transition-colors duration-150 ease-nothing ${
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

                <div>
                  <label
                    htmlFor="soft-cap"
                    className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm"
                  >
                    SOFT_CAP (USDC)
                  </label>
                  <input
                    id="soft-cap"
                    inputMode="decimal"
                    value={softCap}
                    onChange={(e) => setSoftCap(e.target.value.replace(/[^\d.]/g, ""))}
                    className="w-full bg-black border border-border-visible px-md py-sm font-mono text-body-sm text-text-primary tabular-nums outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing rounded-technical"
                  />
                </div>
              </div>

              <div className="mt-2xl pt-xl border-t border-border">
                <button
                  type="button"
                  className="w-full font-mono text-[12px] sm:text-[13px] uppercase tracking-[0.05em] px-md py-lg rounded-technical bg-text-display text-black transition-opacity duration-200 ease-nothing hover:opacity-90 btn-dot-matrix-hover"
                >
                  INITIALIZE STREAM &amp; DEPOSIT COLLATERAL
                </button>
                <p className="font-mono text-caption text-text-disabled mt-md text-center leading-relaxed">
                  10% security collateral will be locked via Arc Consolidation
                </p>
              </div>
            </section>

            <aside className="border border-border p-xl lg:p-2xl rounded-technical lg:sticky lg:top-xl">
              <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-md">
                CHAINLINK CRE — RISK SUMMARY
              </h2>
              <p className="font-grotesk text-body-sm text-text-secondary mb-lg">
                Composantes de décote (workflow CRE #1). ETH/USD via Chainlink Data Feeds.
              </p>

              <div className="space-y-lg mb-xl">
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {CRE_COMPONENTS.volatility.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {CRE_COMPONENTS.volatility.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={CRE_COMPONENTS.volatility.value}
                    max={CRE_COMPONENTS.volatility.max}
                    segments={20}
                    status={CRE_COMPONENTS.volatility.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {CRE_COMPONENTS.regularity.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {CRE_COMPONENTS.regularity.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={CRE_COMPONENTS.regularity.value}
                    max={CRE_COMPONENTS.regularity.max}
                    segments={20}
                    status={CRE_COMPONENTS.regularity.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {CRE_COMPONENTS.trendPenalty.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {CRE_COMPONENTS.trendPenalty.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={CRE_COMPONENTS.trendPenalty.value}
                    max={CRE_COMPONENTS.trendPenalty.max}
                    segments={20}
                    status={CRE_COMPONENTS.trendPenalty.status}
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
                      {isFeedPending && feedAddress ? "…" : marketRiskValue}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={marketRiskValue}
                    max={100}
                    segments={20}
                    status="neutral"
                    size="standard"
                    variant="blocks"
                    animated
                  />
                  <p className="font-mono text-caption text-text-disabled mt-xs tabular-nums">
                    {feedAddress ? (
                      <>
                        ETH/USD:{" "}
                        {isFeedPending
                          ? "[LOADING…]"
                          : ethUsdDisplay
                            ? `$${ethUsdDisplay}`
                            : "[FEED ERROR]"}
                      </>
                    ) : (
                      "Switch to Sepolia or Ethereum for live feed"
                    )}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-lg">
                <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-sm">
                  OUTPUT
                </p>
                <p className="font-mono text-display-lg text-text-display tabular-nums leading-none transition-all duration-300 ease-[steps(8,end)]">
                  RECOMMENDED_DISCOUNT: {RECOMMENDED_DISCOUNT}%
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
