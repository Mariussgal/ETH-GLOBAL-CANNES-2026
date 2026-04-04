"use client";

import Header from "@/components/Header";
import InvestorClaimButton from "@/components/dashboard/InvestorClaimButton";
import { useInvestorPositions } from "@/hooks/useInvestorPositions";
import { formatNumber } from "@/lib/format";
import { SEPOLIA_CHAIN_ID } from "@/contracts";
import Link from "next/link";
import { formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId } from "wagmi";

const USDC_DECIMALS = 6;

export default function InvestorDashboard() {
  const chainId = useChainId();
  const liveSync = chainId === SEPOLIA_CHAIN_ID;

  const {
    address,
    activePositions,
    aggregates,
    isLoading,
    isError,
    hasNoPosition,
  } = useInvestorPositions();

  const claimableStreams = aggregates.claimableStreamCount ?? 0;

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <Header />

      <main className="px-md sm:px-xl py-xl max-w-[1280px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-lg mb-2xl border-b border-border pb-lg">
          <div>
            <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm">
              INVESTOR MODE
            </span>
            <h1 className="font-grotesk text-display-sm sm:text-display-md text-text-display">
              Portfolio · Arc Vaults
            </h1>
            <p className="font-mono text-caption text-text-disabled mt-sm max-w-lg">
              YST positions and USDC rewards (Sepolia). Streams where you are
              the emitter are excluded — use the{" "}
              <Link href="/dashboard/issuer" className="text-text-secondary hover:underline">
                issuer dashboard
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-md">
            <div
              className={`inline-flex items-center gap-xs font-mono text-[10px] uppercase tracking-widest px-sm py-[3px] border rounded-sm ${
                liveSync
                  ? "border-success text-success bg-success/10"
                  : "border-border text-text-disabled bg-black/40"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${liveSync ? "bg-success shadow-[0_0_6px_rgba(34,197,94,0.9)]" : "bg-text-disabled"}`}
              />
              LIVE_SYNC
            </div>
            <Link
              href="/"
              className="font-mono text-label uppercase tracking-label text-text-disabled hover:text-text-secondary transition-colors"
            >
              ← HOME
            </Link>
          </div>
        </div>

        {!address && (
          <div className="border border-border rounded-technical p-2xl text-center dot-grid">
            <p className="font-mono text-body-sm text-text-secondary mb-xl">
              Connect a wallet to load your Arc positions.
            </p>
            <ConnectButton />
          </div>
        )}

        {address && isLoading && (
          <div className="font-mono text-body-sm text-text-secondary py-3xl text-center">
            [ SYNCING_VAULT_MULTICALL… ]
          </div>
        )}

        {address && !isLoading && isError && (
          <div className="font-mono text-body-sm text-accent py-3xl text-center">
            Read failed. Check RPC / Factory.
          </div>
        )}

        {address && !isLoading && !isError && (
          <>
            {/* Stats — style Arc hub */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-md mb-2xl">
              <div className="border border-border p-lg rounded-technical bg-black dot-grid relative overflow-hidden">
                <div className="absolute inset-0 bg-success/5 pointer-events-none blur-xl opacity-40" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-disabled block mb-sm relative z-10">
                  TOTAL STAKED
                </span>
                <span className="font-mono text-[22px] sm:text-[26px] text-text-display tabular-nums relative z-10">
                  ${formatNumber(Math.round(aggregates.totalStakedUsdc))}
                </span>
                <span className="font-mono text-[9px] text-text-disabled uppercase mt-xs block relative z-10">
                  YST notional (1:1 USDC)
                </span>
              </div>
              <div className="border border-border p-lg rounded-technical bg-black dot-grid relative overflow-hidden">
                <div className="absolute inset-0 bg-text-display/5 pointer-events-none blur-xl opacity-30" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-disabled block mb-sm relative z-10">
                  TOTAL EARNED
                </span>
                <span className="font-mono text-[22px] sm:text-[26px] text-text-display tabular-nums relative z-10">
                  ${formatNumber(Math.round(aggregates.totalEarnedUsdc * 100) / 100)}
                </span>
                <span className="font-mono text-[9px] text-text-disabled uppercase mt-xs block relative z-10">
                  Σ vault.earned (accrued)
                </span>
              </div>
              <div className="border border-border p-lg rounded-technical bg-black dot-grid relative overflow-hidden">
                <div className="absolute inset-0 bg-warning/5 pointer-events-none blur-xl opacity-30" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-disabled block mb-sm relative z-10">
                  PENDING REWARDS
                </span>
                <span className="font-mono text-[22px] sm:text-[26px] text-success tabular-nums relative z-10">
                  ${formatNumber(Math.round(aggregates.pendingRewardsUsdc * 100) / 100)}
                </span>
                <span className="font-mono text-[9px] text-text-disabled uppercase mt-xs block relative z-10">
                  {claimableStreams} stream{claimableStreams !== 1 ? "s" : ""} with rewards
                </span>
              </div>
            </section>

            {hasNoPosition ? (
              <div className="border border-dashed border-border-visible rounded-technical p-2xl md:p-3xl text-center max-w-xl mx-auto">
                <pre className="font-mono text-body-sm text-text-secondary whitespace-pre-wrap text-left inline-block mb-xl">
                  {`> NO POSITIONS ON ARC VAULTS.
> EXPLORE THE MARKETPLACE?`}
                </pre>
                <Link
                  href="/#marketplace"
                  className="inline-flex font-mono text-[13px] uppercase tracking-[0.06em] px-xl py-md bg-text-display text-black rounded-pill hover:opacity-90 transition-opacity"
                >
                  &gt; EXPLORE MARKETPLACE
                </Link>
              </div>
            ) : (
              <div className="border border-border rounded-technical overflow-hidden bg-black">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-md bg-surface/30">
                  <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                    POSITIONS
                  </span>
                  <span className="font-mono text-[10px] text-text-disabled uppercase">
                    {activePositions.length} ROWS
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] font-mono text-left text-body-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-disabled">
                        <th className="px-4 py-3 font-normal">Stream</th>
                        <th className="px-4 py-3 font-normal tabular-nums">Your YST</th>
                        <th className="px-4 py-3 font-normal tabular-nums">Pending (USDC)</th>
                        <th className="px-4 py-3 font-normal text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePositions.map((p) => {
                        const ystStr = formatUnits(
                          p.ystBalance,
                          p.ystDecimals
                        );
                        const ystNum = parseFloat(ystStr);
                        const earnedStr = formatUnits(
                          p.earnedUsdc,
                          USDC_DECIMALS
                        );
                        const earnedNum = parseFloat(earnedStr);
                        const id = p.row.stream.id;
                        return (
                          <tr
                            key={`${p.row.vault}-${id}`}
                            className="border-b border-border/80 hover:bg-surface/20 transition-colors"
                          >
                            <td className="px-4 py-3 text-text-display max-w-[220px]">
                              <span className="block truncate font-grotesk text-body-sm">
                                {p.row.stream.ensName}
                              </span>
                              <span className="text-[10px] text-text-disabled uppercase">
                                #{String(id).padStart(3, "0")} · {p.row.stream.protocol}
                              </span>
                            </td>
                            <td className="px-4 py-3 tabular-nums text-text-primary">
                              {Number.isFinite(ystNum)
                                ? formatNumber(
                                    Math.round(ystNum * 1000) / 1000
                                  )
                                : "—"}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-success">
                              {Number.isFinite(earnedNum)
                                ? formatNumber(
                                    Math.round(earnedNum * 100) / 100
                                  )
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-sm">
                                <Link
                                  href={`/invest/${id}`}
                                  className="font-mono text-[10px] uppercase tracking-wider px-sm py-[6px] border border-border-visible text-text-secondary hover:border-text-display hover:text-text-display transition-colors rounded-sm"
                                >
                                  VIEW
                                </Link>
                                <InvestorClaimButton
                                  ystToken={p.row.ystToken}
                                  disabled={p.earnedUsdc === BigInt(0)}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
