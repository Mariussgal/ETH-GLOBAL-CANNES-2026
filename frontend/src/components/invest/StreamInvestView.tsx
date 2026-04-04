"use client";

import Header from "@/components/Header";
import SegmentedProgress from "@/components/SegmentedProgress";
import type { StreamData } from "@/components/StreamCard";
import { formatNumber } from "@/lib/format";
import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import ArcConsolidationHub from "./ArcConsolidationHub";
import ArcActivityFeed from "./ArcActivityFeed";
import { useArcSepoliaSync } from "@/hooks/useArcSepoliaSync";

interface StreamInvestViewProps {
  stream: StreamData;
}

export default function StreamInvestView({ stream }: StreamInvestViewProps) {
  const { address } = useAccount();
  const [usdcRaw, setUsdcRaw] = useState("");

  const usdcNum = useMemo(() => {
    const n = parseFloat(usdcRaw.replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [usdcRaw]);

  // Derived metrics based on prompt equations
  const TARGET_DISTRIBUTION = stream.vaultTarget / (1 - stream.discount / 100);
  const HISTORICAL_ANNUAL_REVENUE = TARGET_DISTRIBUTION / (stream.feePercent / 100);
  
  const projectedYield = ((TARGET_DISTRIBUTION - stream.vaultTarget) / stream.vaultTarget) * 100;
  
  const totalYst = stream.vaultTarget; // 1:1 mapping based on "78,000 YST units for $78k"
  const pricePerUnit = 1.00; // Fixed as per prompt
  
  const ystReceived = usdcNum > 0 ? usdcNum / pricePerUnit : 0;
  const revenueSharePct = totalYst > 0 ? (ystReceived / totalYst) * stream.feePercent : 0;

  const isLive = stream.vaultFill >= stream.vaultTarget;

  const protocolShort = useMemo(
    () => stream.ensName.split(".")[0].toUpperCase(),
    [stream.ensName]
  );

  const arc = useArcSepoliaSync({
    enabled: isLive,
    fallbackProtocolLabel: protocolShort,
  });

  const yieldNum =
    isLive && arc.liveSync && arc.accumulatedYieldUsdc !== null
      ? parseFloat(arc.accumulatedYieldUsdc)
      : 0;

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
                    <div className="text-text-display tabular-nums font-mono text-[14px] sm:text-[16px] mb-lg">{formatNumber(stream.vaultTarget)} / {formatNumber(stream.vaultTarget)}</div>
                    <SegmentedProgress value={stream.vaultTarget} max={stream.vaultTarget} segments={12} status="success" size="standard" variant="blocks" animated={false} />
                  </div>
                </section>

                <ArcActivityFeed items={arc.feedItems} />
                
                {/* Multi-Chain Hub */}
                <div className="mt-xl">
                  <ArcConsolidationHub
                    totalBaseRevenue={arc.totalBaseRevenue}
                    totalPolygonRevenue={arc.totalPolygonRevenue}
                    liveSync={arc.liveSync}
                  />
                </div>
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
                        ${formatNumber(stream.vaultTarget)}
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
                      USDC RAISED ({Math.round((stream.vaultFill / stream.vaultTarget) * 100)}%)
                    </span>
                    <span className="font-mono text-display-sm sm:text-display-lg text-text-display leading-none tabular-nums tracking-snug">
                      {formatNumber(Math.round(stream.vaultFill))} / {formatNumber(stream.vaultTarget)}
                    </span>
                  </div>
                  
                  <div className="w-full">
                    <SegmentedProgress
                        value={stream.vaultFill}
                        max={stream.vaultTarget}
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
                      Note: You are paying ${formatNumber(stream.vaultTarget)} for a right to ${formatNumber(TARGET_DISTRIBUTION)} of actual cash-flow.
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
                 <div className="border border-success p-xl bg-success/5 shadow-[0_0_15px_rgba(34,197,94,0.1)] relative overflow-hidden group">
                   <div className="absolute inset-0 bg-success/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
                   
                   <span className="font-mono text-caption text-success uppercase block mb-sm relative z-10">
                     MY_ACCUMULATED_YIELD
                   </span>
                   <div className="font-mono text-display-md sm:text-[40px] text-success leading-none tabular-nums shadow-success relative z-10 mb-xl min-h-[2.5rem]" style={{ textShadow: "0 0 10px rgba(34,197,94,0.5)" }}>
                     {!address ? (
                       <span className="text-text-disabled text-body-sm tracking-wide">CONNECT WALLET</span>
                     ) : !arc.liveSync ? (
                       <span className="text-text-disabled text-body-sm tracking-wide">SWITCH TO SEPOLIA</span>
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
                        <span className="font-mono text-[10px] text-success tabular-nums">{((yieldNum / 500) * 100).toFixed(2)}%</span>
                     </div>
                     <div className="w-full h-[6px] bg-black border border-success/30 overflow-hidden">
                       <div className="h-full bg-success transition-all duration-300 shadow-[0_0_8px_rgba(34,197,94,0.8)]" style={{ width: `${Math.min((yieldNum / 500) * 100, 100)}%` }} />
                     </div>
                     <div className="flex justify-between mt-sm text-text-disabled">
                        <span className="font-mono text-[9px] uppercase">ROI 0</span>
                        <span className="font-mono text-[9px] uppercase">INITIAL: 500.00 USDC</span>
                     </div>
                   </div>
                 </div>

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
                     {arc.routingStatusActive ? (
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
                   <button
                     type="button"
                     className="w-full font-mono text-[13px] sm:text-[14px] uppercase tracking-[0.06em] px-md py-xl border border-success bg-black text-success transition-all duration-300 ease-nothing hover:bg-success hover:text-black hover:shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                   >
                     [ CLAIM_CURRENT_YIELD ]
                   </button>
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
                 <label
                   htmlFor="usdc-in"
                   className="font-mono text-label uppercase tracking-label text-text-secondary block mb-md"
                 >
                   INVEST_AMOUNT (USDC)
                 </label>
                 <input
                   id="usdc-in"
                   type="text"
                   inputMode="decimal"
                   placeholder="0.00"
                   value={usdcRaw}
                   onChange={(e) =>
                     setUsdcRaw(e.target.value.replace(/[^\d.]/g, ""))
                   }
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

                 <button
                   type="button"
                   className="w-full font-mono text-[13px] sm:text-[14px] uppercase tracking-[0.06em] px-md py-xl border border-text-display bg-black text-text-display transition-colors duration-200 ease-nothing hover:bg-text-display hover:text-black mt-auto"
                 >
                   [ INVEST & MINT YST ]
                 </button>
               </div>
             )}
           </aside>
        </div>
      </main>
    </div>
  );
}
