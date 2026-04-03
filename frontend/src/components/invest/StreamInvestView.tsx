"use client";

import Header from "@/components/Header";
import SegmentedProgress from "@/components/SegmentedProgress";
import ArcSourceBadge from "@/components/ArcSourceBadge";
import StreamLiveEngine from "@/components/invest/StreamLiveEngine";
import type { StreamData } from "@/components/StreamCard";
import { formatNumber } from "@/lib/format";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

interface StreamInvestViewProps {
  stream: StreamData;
}

const TARGET_UNIT_USDC = 1;

function projectedApyPercent(stream: StreamData): string {
  const raw =
    stream.feePercent * 2.15 +
    stream.discount * 0.12 +
    Math.min(8, (1 / stream.priceFloor) * 0.35);
  return Math.max(4, Math.min(48, raw)).toFixed(1);
}

export default function StreamInvestView({ stream }: StreamInvestViewProps) {
  const [usdcRaw, setUsdcRaw] = useState("");

  const totalYst = useMemo(
    () => stream.vaultFill / stream.priceFloor,
    [stream]
  );

  const priceFloorFromVault = useMemo(
    () => stream.vaultFill / totalYst,
    [stream.vaultFill, totalYst]
  );

  const fillPercent = Math.round(
    (stream.vaultFill / stream.vaultTarget) * 100
  );

  const vaultStatus =
    fillPercent >= 80 ? "success" : fillPercent >= 40 ? "neutral" : "warning";

  const usdcNum = useMemo(() => {
    const n = parseFloat(usdcRaw.replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [usdcRaw]);

  const ystReceived = usdcNum > 0 ? usdcNum / stream.priceFloor : 0;

  const revenueSharePct =
    totalYst + ystReceived > 0
      ? (ystReceived / (totalYst + ystReceived)) * stream.feePercent
      : 0;

  const apyDisplay = projectedApyPercent(stream);

  const statusLabel = stream.defaulted
    ? "DEFAULTED"
    : "AUCTION_ACTIVE";

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <Header />

      <main className="px-md sm:px-xl py-2xl max-w-[1200px] mx-auto">
        <Link
          href="/#marketplace"
          className="font-mono text-label uppercase tracking-label text-text-disabled hover:text-text-secondary transition-colors duration-200 ease-nothing"
        >
          ← MARKETPLACE
        </Link>

        {/* ── 1. En-tête confiance ── */}
        <header className="mt-xl border border-border p-xl dot-grid rounded-technical">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-lg">
            <div>
              <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm">
                PROTOCOL
              </span>
              <div className="flex flex-wrap items-center gap-md gap-y-sm">
                <h1 className="font-grotesk text-display-md sm:text-display-lg text-text-display font-medium tracking-snug">
                  {stream.ensName}
                </h1>
                <span className="inline-flex items-center gap-xs px-md py-sm border-2 border-text-display bg-black font-mono text-label uppercase tracking-label text-text-display">
                  ENS_VERIFIED
                </span>
              </div>
              <p className="font-mono text-caption text-text-disabled mt-md uppercase">
                SLUG: {stream.protocol}
              </p>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-sm">
              <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                STATUS
              </span>
              <div className="flex items-center gap-sm">
                <span className="relative flex h-[8px] w-[8px]">
                  {!stream.defaulted && (
                    <>
                      <span className="absolute inline-flex h-full w-full rounded-full bg-text-display opacity-50 animate-ping" />
                      <span className="relative inline-flex h-[8px] w-[8px] rounded-full bg-text-display" />
                    </>
                  )}
                  {stream.defaulted && (
                    <span className="relative inline-flex h-[8px] w-[8px] rounded-full bg-accent" />
                  )}
                </span>
                <span className="font-mono text-body-sm text-text-display uppercase tracking-wide">
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-2xl mt-2xl items-start">
          <div className="flex flex-col gap-2xl">
            {/* ── 2. Analyse du deal ── */}
            <section className="border border-border p-xl rounded-technical">
              <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-lg">
                THE ARBITRAGE
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-xl mb-xl">
                <div className="border border-border-visible p-md bg-black">
                  <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-sm">
                    CURRENT PRICE (DISCOUNTED)
                  </span>
                  <span className="font-mono text-display-md sm:text-display-lg text-text-display tabular-nums">
                    ${stream.priceFloor.toFixed(4)}
                  </span>
                  <span className="font-mono text-caption text-text-disabled block mt-sm uppercase">
                    per YST
                  </span>
                </div>
                <div className="border border-border-visible p-md bg-black">
                  <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-sm">
                    TARGET VALUE
                  </span>
                  <span className="font-mono text-display-md sm:text-display-lg text-text-display tabular-nums">
                    ${TARGET_UNIT_USDC.toFixed(2)}
                  </span>
                  <span className="font-mono text-caption text-text-disabled block mt-sm uppercase">
                    USDC / future revenue unit
                  </span>
                </div>
              </div>

              <div className="border-t border-border pt-lg mb-lg">
                <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-xs">
                  PRICE FLOOR (USDC_IN_VAULT / TOTAL_YST)
                </span>
                <p className="font-mono text-body-sm text-text-primary tabular-nums">
                  ${formatNumber(Math.round(stream.vaultFill))} /{" "}
                  {totalYst.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  YST ≈{" "}
                  <span className="text-text-display">
                    ${priceFloorFromVault.toFixed(4)}
                  </span>
                </p>
              </div>

              <div className="border border-border-visible p-md bg-black">
                <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-sm">
                  PROJECTED APY
                </span>
                <p className="font-mono text-display-xl leading-none text-text-display tabular-nums tracking-tight">
                  {apyDisplay}%
                </p>
              </div>
            </section>

            {/* ── 3. Live engine + vault fill ── */}
            <section>
              <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-md">
                FLOW ENGINE
              </h2>
              <StreamLiveEngine stream={stream} />
              <div className="mt-md border border-border p-md rounded-technical bg-black">
                <div className="flex justify-between items-baseline mb-sm">
                  <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                    VAULT FILL
                  </span>
                  <span className="font-mono text-body-sm text-text-primary tabular-nums">
                    {fillPercent}%
                  </span>
                </div>
                <SegmentedProgress
                  value={stream.vaultFill}
                  max={stream.vaultTarget}
                  segments={28}
                  status={vaultStatus}
                  size="standard"
                  variant="blocks"
                  animated
                />
                <div className="flex justify-between mt-xs font-mono text-caption text-text-disabled tabular-nums">
                  <span>${formatNumber(stream.vaultFill)}</span>
                  <span>${formatNumber(stream.vaultTarget)}</span>
                </div>
              </div>
            </section>

            {/* ── 5. Collatéral & Arc ── */}
            <section className="border border-border p-xl rounded-technical flex flex-col sm:flex-row sm:items-center sm:justify-between gap-lg">
              <div>
                <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm">
                  COLLATERAL
                </span>
                <span className="font-mono text-body-sm text-text-display uppercase">
                  SAFETY_DEPOSIT: 10% LOCKED
                </span>
                <p className="font-mono text-caption text-text-disabled mt-sm max-w-md">
                  Issuer collateral locked for the auction period.
                </p>
              </div>
              <div className="flex items-center gap-sm border border-border px-md py-sm bg-black">
                <Image
                  src="/arc_logo_final.png"
                  alt="Arc"
                  width={20}
                  height={20}
                  className="brightness-0 invert opacity-80"
                />
                <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                  POWERED BY ARC
                </span>
              </div>
            </section>

            <div className="flex flex-wrap gap-sm">
              <span className="font-mono text-caption uppercase text-text-disabled">
                SOURCES
              </span>
              {stream.sources.map((src) => (
                <ArcSourceBadge key={src} chain={src} />
              ))}
            </div>
          </div>

          {/* ── 4. Terminal d’investissement ── */}
          <aside className="border border-border p-xl lg:p-2xl rounded-technical lg:sticky lg:top-xl dot-grid">
            <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-xl">
              INVEST
            </h2>
            <label
              htmlFor="usdc-in"
              className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm"
            >
              AMOUNT (USDC)
            </label>
            <input
              id="usdc-in"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={usdcRaw}
              onChange={(e) =>
                setUsdcRaw(e.target.value.replace(/[^\d.]/g, ""))
              }
              className="w-full bg-black border border-border-visible px-md py-sm font-mono text-body-sm text-text-primary tabular-nums outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing rounded-technical mb-lg"
            />

            <div className="border border-border p-md bg-black mb-lg">
              <p className="font-mono text-caption text-text-secondary leading-relaxed">
                You will receive{" "}
                <span className="text-text-display tabular-nums">
                  {ystReceived.toLocaleString("en-US", {
                    maximumFractionDigits: 4,
                  })}
                </span>{" "}
                YST tokens, granting you{" "}
                <span className="text-text-display tabular-nums">
                  {revenueSharePct.toFixed(2)}
                </span>
                % of future revenues.
              </p>
            </div>

            <button
              type="button"
              className="w-full font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.06em] px-md py-lg rounded-technical bg-text-display text-black transition-opacity duration-200 ease-nothing hover:opacity-90 min-h-[52px]"
            >
              EXECUTE INVESTMENT &amp; MINT YST
            </button>

            <p className="font-mono text-[10px] text-text-disabled mt-md leading-relaxed uppercase">
              Exit Liquidity guaranteed by Uniswap v4 Hook arbitrage
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
