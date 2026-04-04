"use client";

import Image from "next/image";
import SegmentedProgress from "@/components/SegmentedProgress";
import { SEPOLIA_CHAIN_ID } from "@/contracts";

interface ArcConsolidationHubProps {
  totalBaseRevenue: number;
  totalPolygonRevenue: number;
  totalArcRevenue?: number;
  /** Badge LIVE_SYNC vert lorsque `isConnected && chainId === 11155111` (Sepolia) */
  liveSync?: boolean;
  /** Badge CHAINLINK_AUTOMATION vert lorsque l'automation est active. */
  chainlinkAutomationActive?: boolean;
}

export default function ArcConsolidationHub({
  totalBaseRevenue,
  totalPolygonRevenue,
  totalArcRevenue = 0,
  liveSync = false,
  chainlinkAutomationActive = false,
}: ArcConsolidationHubProps) {
  // Calculate flow distributions
  const total = totalBaseRevenue + totalPolygonRevenue + totalArcRevenue;
  const baseFlow = total > 0 ? Math.round((totalBaseRevenue / total) * 100) : 0;
  const polygonFlow = total > 0 ? Math.round((totalPolygonRevenue / total) * 100) : 0;
  const arcFlow = total > 0 ? Math.round((totalArcRevenue / total) * 100) : 0;

  return (
    <section className="border border-border p-xl sm:p-2xl rounded-technical bg-black flex flex-col items-center justify-center relative overflow-hidden dot-grid">
      {/* Subtle background glow */}
      <div className="absolute inset-0 bg-success/5 pointer-events-none blur-xl" />

      {/* Terminal Header */}
      <div className="w-full text-center mb-xl relative z-10">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-sm sm:gap-xl mb-xs flex-wrap">
          <h2 className="font-mono text-label uppercase tracking-label text-text-secondary">
            MULTI-CHAIN YIELD ROUTING
          </h2>
          <div
            className={`inline-flex items-center gap-xs font-mono text-[10px] uppercase tracking-widest px-sm py-[3px] border rounded-sm ${
              liveSync
                ? "border-success text-success bg-success/10"
                : "border-border text-text-disabled bg-black/40"
            }`}
            title={
              liveSync
                ? `Connecté à Sepolia (chain ${SEPOLIA_CHAIN_ID})`
                : "Connectez le wallet sur Sepolia (11155111) pour LIVE_SYNC"
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${liveSync ? "bg-success shadow-[0_0_6px_rgba(34,197,94,0.9)]" : "bg-text-disabled"}`}
            />
            LIVE_SYNC
          </div>

          {chainlinkAutomationActive && (
            <div
              className="inline-flex items-center gap-xs font-mono text-[10px] uppercase tracking-widest px-sm py-[3px] border border-success/40 text-success bg-success/5 rounded-sm"
              title="Chainlink Automation (CRE) detects protocol fees on L2s and triggers Sepolia minting."
            >
              <div className="flex gap-[2px]">
                <span className="w-1 h-1 bg-success rounded-full animate-bounce" />
                <span className="w-1 h-1 bg-success rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1 h-1 bg-success rounded-full animate-bounce [animation-delay:-0.3s]" />
              </div>
              CHAINLINK_AUTOMATION
            </div>
          )}
        </div>
        <span className="font-mono text-[10px] text-text-disabled uppercase">
          Consolidating fragmented liquidity across EVM networks
        </span>
      </div>

      {/* Center: Arc Logo & Status */}
      <div className="flex flex-col items-center justify-center mb-2xl relative z-10 mt-md">
        <div className="w-20 h-20 sm:w-24 sm:h-24 mb-xl relative flex items-center justify-center bg-black rounded-full border border-border p-md shadow-[0_0_20px_rgba(255,255,255,0.05)]">
            {/* Pulsing rings */}
            <div className="absolute inset-[-10px] border border-text-display/20 rounded-full animate-ping opacity-20" />
            <div className="absolute inset-[-20px] border border-text-display/40 rounded-full animate-ping opacity-40 animation-delay-500" />
            <Image 
                src="/arc_logo_white_sharp.png" 
                alt="Arc Protocol" 
                layout="fill"
                objectFit="contain"
                className="p-md brightness-0 invert opacity-90 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] z-10" 
            />
        </div>
        <div className="font-mono text-caption text-success uppercase tracking-widest flex items-center gap-sm bg-success/5 px-md py-sm border border-success/30 rounded-sm">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.8)]" />
          STATUS: CONSOLIDATED_VIA_ARC
        </div>
      </div>

      {/* Three Progress Bars side by side */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2xl relative z-10 pt-lg border-t border-border-visible">

        {/* Base Flow */}
        <div className="flex flex-col items-center p-md">
          <span className="font-mono text-caption uppercase mb-sm tracking-widest text-[#0052FF]" style={{ textShadow: "0 0 5px rgba(0,82,255,0.3)" }}>
            BASE_FLOW
          </span>
          <span className="font-mono text-[24px] text-text-display tabular-nums leading-none mb-xl">
            {baseFlow}%
          </span>
          <div className="w-full">
            <SegmentedProgress
              value={baseFlow}
              max={100}
              segments={20}
              status="neutral"
              size="standard"
              variant="blocks"
              animated={true}
            />
          </div>
          <div className="flex justify-between w-full mt-sm">
            <span className="font-mono text-[10px] text-text-disabled uppercase">Yield Asset</span>
            <span className="font-mono text-[10px] text-[#0052FF] uppercase">NATIVE_USDC</span>
          </div>
        </div>

        {/* Polygon Flow */}
        <div className="flex flex-col items-center p-md">
          <span className="font-mono text-caption uppercase mb-sm tracking-widest text-[#8247E5]" style={{ textShadow: "0 0 5px rgba(130,71,229,0.3)" }}>
            POLYGON_FLOW
          </span>
          <span className="font-mono text-[24px] text-text-display tabular-nums leading-none mb-xl">
            {polygonFlow}%
          </span>
          <div className="w-full">
            <SegmentedProgress
              value={polygonFlow}
              max={100}
              segments={20}
              status="neutral"
              size="standard"
              variant="blocks"
              animated={true}
            />
          </div>
          <div className="flex justify-between w-full mt-sm">
             <span className="font-mono text-[10px] text-text-disabled uppercase">Yield Asset</span>
             <span className="font-mono text-[10px] text-[#8247E5] uppercase">NATIVE_USDC</span>
          </div>
        </div>

        {/* Arc Flow */}
        <div className="flex flex-col items-center p-md">
          <span className="font-mono text-caption uppercase mb-sm tracking-widest text-[#F5A623]" style={{ textShadow: "0 0 5px rgba(245,166,35,0.3)" }}>
            ARC_FLOW
          </span>
          <span className="font-mono text-[24px] text-text-display tabular-nums leading-none mb-xl">
            {arcFlow}%
          </span>
          <div className="w-full">
            <SegmentedProgress
              value={arcFlow}
              max={100}
              segments={20}
              status="neutral"
              size="standard"
              variant="blocks"
              animated={true}
            />
          </div>
          <div className="flex justify-between w-full mt-sm">
            <span className="font-mono text-[10px] text-text-disabled uppercase">Yield Asset</span>
            <span className="font-mono text-[10px] text-[#F5A623] uppercase">NATIVE_USDC</span>
          </div>
        </div>

      </div>
    </section>
  );
}
