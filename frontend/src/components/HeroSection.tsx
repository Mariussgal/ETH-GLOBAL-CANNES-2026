"use client";

import Link from "next/link";
import Image from "next/image";
import DataTicker from "./DataTicker";
import FeeSplitterVisual from "./FeeSplitterVisual";
import { useMarketplaceSync } from "./MarketplaceSyncContext";
import SegmentedProgress from "./SegmentedProgress";

export default function HeroSection() {
  const { isSyncing, progress, startAccessFlow } = useMarketplaceSync();

  return (
    <>
      <DataTicker />
      <section className="min-h-[calc(100vh-32px)] flex flex-col pt-8 md:pt-12 lg:pt-16 px-xl pb-2xl relative overflow-hidden">
        {/* Global Film Grain */}
        <div className="noise-grain" />
        
        {/* Cinematic Grain / Scanline */}
        <div className="scanline-overlay pointer-events-none" />
        
        {/* Dot-matrix background */}
        <div className="absolute inset-0 dot-grid-subtle opacity-[0.04] pointer-events-none" />

        <div className="relative z-10 w-full max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-2xl items-center">
          {/* Left Column: Top Text & CTAs */}
          <div>
            {/* Tertiary — System label */}
            <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-lg relative">
              <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-2 h-[1px] bg-accent" />
              YIELD STREAM MARKETPLACE — ETHGLOBAL CANNES 2026
            </span>

            {/* Primary — Headline */}
            <h1 className="font-grotesk text-display-md sm:text-display-lg lg:text-display-xl font-light text-text-display leading-none tracking-tight mb-xl">
              MONETIZE YOUR
              <br />
              FUTURE REVENUE.
              <br />
              <span className="text-text-secondary">NO DEBT. NO DILUTION.</span>
            </h1>

            {/* Secondary — Sub-headline */}
            <p className="font-mono text-body-sm sm:text-body text-text-secondary max-w-[500px] mb-2xl border-l-[1px] border-border-visible pl-4">
              The first 100% automated marketplace for DeFi revenue-based financing.
            </p>

            <div className="flex flex-col gap-sm items-start">
              {isSyncing && (
                <div className="w-full max-w-[220px]">
                  <SegmentedProgress
                    value={progress}
                    max={100}
                    segments={20}
                    status="neutral"
                    size="compact"
                    variant="bar"
                  />
                </div>
              )}
              <div className="flex items-center gap-md flex-wrap">
              <button
                type="button"
                onClick={startAccessFlow}
                disabled={isSyncing}
                aria-busy={isSyncing}
                className="font-mono text-[13px] uppercase tracking-[0.06em] px-xl py-md bg-text-display text-black rounded-pill transition-opacity duration-200 ease-nothing hover:opacity-90 active:opacity-80 min-h-[52px] disabled:opacity-40 disabled:pointer-events-none"
              >
                ACCESS MARKETPLACE
              </button>
              <Link
                href="/create"
                className="font-mono text-[13px] uppercase tracking-[0.06em] px-xl py-md border border-border-visible text-text-primary rounded-pill transition-all duration-300 ease-nothing min-h-[52px] flex items-center hover:border-transparent btn-dot-matrix-hover relative overflow-hidden z-10"
              >
                <span>MONETIZE REVENUE</span>
              </Link>
              </div>
            </div>

            {/* Sponsor attribution */}
            <div className="mt-2xl flex items-center gap-lg flex-wrap">
              <span className="font-mono text-[10px] uppercase text-text-disabled mr-2 border-r border-border-visible pr-4">INFRA_PROVIDED_BY</span>
              <a href="https://docs.chain.link" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-50 hover:opacity-80 transition-opacity duration-200 ease-nothing">
                <Image src="/Chainlink_Logo.png" alt="Chainlink" width={20} height={20} className="brightness-0 invert" />
                <span className="font-mono text-caption uppercase tracking-label text-text-disabled">Chainlink</span>
              </a>
              <a href="https://docs.ens.domains" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-50 hover:opacity-80 transition-opacity duration-200 ease-nothing">
                <Image src="/ens.png" alt="ENS" width={20} height={20} className="brightness-0 invert" />
                <span className="font-mono text-caption uppercase tracking-label text-text-disabled">ENS</span>
              </a>

              <a href="https://docs.arc.ag" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-50 hover:opacity-80 transition-opacity duration-200 ease-nothing">
                <Image src="/arc_logo_final.png" alt="Arc" width={20} height={20} className="brightness-0 invert" />
                <span className="font-mono text-caption uppercase tracking-label text-text-disabled">Arc</span>
              </a>
            </div>
          </div>

          {/* Right Column: Abstract Technical Visual */}
          <div className="hidden lg:flex justify-end relative">
            <FeeSplitterVisual />
            {/* Edge decorative brackets */}
            <div className="absolute -top-4 -right-4 w-4 h-4 border-t border-r border-border-visible" />
            <div className="absolute -bottom-4 -right-4 w-4 h-4 border-b border-r border-border-visible" />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-xl left-xl">
          <span className="font-mono text-label uppercase tracking-label text-text-disabled">
            SCROLL ↓
          </span>
        </div>
      </section>
    </>
  );
}
