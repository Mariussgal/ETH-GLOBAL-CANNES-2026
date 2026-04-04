"use client";

import Header from "@/components/Header";
import InvestorClaimButton from "@/components/dashboard/InvestorClaimButton";
import { useInvestorClaimHistory } from "@/hooks/useInvestorClaimHistory";
import { useInvestorPositions } from "@/hooks/useInvestorPositions";
import { formatNumber } from "@/lib/format";
import { SEPOLIA_CHAIN_ID } from "@/contracts";
import Link from "next/link";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useChainId } from "wagmi";

const SEPOLIA_TX_URL = "https://sepolia.etherscan.io/tx/";

const USDC_DECIMALS = 6;

export default function InvestorDashboard() {
  const chainId = useChainId();
  const liveSync = chainId === SEPOLIA_CHAIN_ID;

  const {
    address,
    investorPositions,
    activePositions,
    aggregates,
    isLoading,
    isError,
    hasNoPosition,
  } = useInvestorPositions();

  const vaultAddresses = useMemo(
    () => investorPositions.map((p) => p.row.vault),
    [investorPositions]
  );

  const {
    claimEntries,
    totalClaimedUsdc,
    isLoading: claimHistoryLoading,
    isError: claimHistoryError,
    errorMessage: claimHistoryErrorMessage,
  } = useInvestorClaimHistory({
    vaultAddresses,
    userAddress: address,
    enabled: Boolean(address),
  });

  const vaultToStreamLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of investorPositions) {
      m.set(p.row.vault.toLowerCase(), p.row.stream.ensName);
    }
    return m;
  }, [investorPositions]);

  /** USDC already withdrawn (net) per vault — sum of `RewardsClaimed` events. */
  const claimedUsdcByVault = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of claimEntries) {
      const k = e.vault.toLowerCase();
      m.set(k, (m.get(k) ?? 0) + e.amountUsdc);
    }
    return m;
  }, [claimEntries]);

  /** `vault.earned` = pending; events = already withdrawn (net after fees). */
  const totalLifetimeEarnedUsdc = totalClaimedUsdc + aggregates.pendingRewardsUsdc;

  const claimableStreams = aggregates.claimableStreamCount ?? 0;

  const showMarketplaceEmpty =
    hasNoPosition &&
    totalClaimedUsdc === 0 &&
    claimEntries.length === 0 &&
    !claimHistoryLoading &&
    !claimHistoryError;

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
                  {claimHistoryLoading ? (
                    <span className="text-text-secondary">…</span>
                  ) : (
                    `$${formatNumber(Math.round(totalLifetimeEarnedUsdc * 10000) / 10000)}`
                  )}
                </span>
                <span className="font-mono text-[9px] text-text-disabled mt-xs block relative z-10 leading-snug normal-case">
                  Retirés{" "}
                  <span className="text-text-secondary tabular-nums">
                    {claimHistoryError
                      ? "—"
                      : `$${formatNumber(Math.round(totalClaimedUsdc * 10000) / 10000)}`}
                  </span>
                  {" · "}
                  Pending{" "}
                  <span className="text-text-secondary tabular-nums">
                    ${formatNumber(Math.round(aggregates.pendingRewardsUsdc * 10000) / 10000)}
                  </span>
                  {claimHistoryLoading ? (
                    <span className="text-text-disabled"> (syncing history…)</span>
                  ) : null}
                  {claimHistoryError ? (
                    <span className="text-accent block mt-1">
                      Claim history unavailable (RPC). The total above
                      only includes pending until logs succeed.
                    </span>
                  ) : null}
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

        {address && (
          <section className="mb-2xl border border-border rounded-technical overflow-hidden bg-black">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-md bg-surface/30">
              <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                Claim history
              </span>
              <span className="font-mono text-[10px] text-text-disabled uppercase">
                RewardsClaimed (net USDC)
              </span>
            </div>
            {claimHistoryError && !claimHistoryLoading ? (
              <div className="px-4 py-xl font-mono text-body-sm text-accent text-center leading-relaxed">
                <p className="mb-sm">
                  Failed to load logs (block range limit or RPC error).
                </p>
                <p className="text-[11px] text-text-secondary normal-case max-w-lg mx-auto">
                  {claimHistoryErrorMessage}
                </p>
              </div>
            ) : claimHistoryLoading && claimEntries.length === 0 ? (
              <div className="font-mono text-body-sm text-text-secondary py-xl text-center">
                [ SCANNING_YIELD_DISTRIBUTIONS… ]
              </div>
            ) : claimEntries.length === 0 ? (
              <div className="font-mono text-body-sm text-text-disabled py-xl text-center">
                [ NO_YIELD_CLAIMED_YET_BY_THIS_INVESTOR ]
              </div>
            ) : (
              <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] font-mono text-left text-body-sm">
                      <thead>
                        <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-disabled">
                          <th className="px-4 py-3 font-normal">Stream</th>
                          <th className="px-4 py-3 font-normal tabular-nums">Amount (USDC)</th>
                          <th className="px-4 py-3 font-normal">Block</th>
                          <th className="px-4 py-3 font-normal text-right">Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claimEntries.map((e) => {
                          const label =
                            vaultToStreamLabel.get(e.vault.toLowerCase()) ??
                            `${e.vault.slice(0, 6)}…${e.vault.slice(-4)}`;
                          return (
                            <tr
                              key={`${e.txHash}-${e.logIndex}`}
                              className="border-b border-border/80 hover:bg-surface/20 transition-colors"
                            >
                              <td className="px-4 py-3 text-text-display max-w-[220px] truncate">
                                {label}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-success">
                                {e.amountUsdc.toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 6,
                                })}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-text-disabled text-[12px]">
                                {e.blockNumber.toString()}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <a
                                  href={`${SEPOLIA_TX_URL}${e.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-[11px] text-text-secondary hover:text-text-display underline underline-offset-2"
                                >
                                  Etherscan ↗
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {showMarketplaceEmpty ? (
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
            ) : !hasNoPosition ? (
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
                  <table className="w-full min-w-[880px] font-mono text-left text-body-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-disabled">
                        <th className="px-4 py-3 font-normal">Stream</th>
                        <th className="px-4 py-3 font-normal tabular-nums">Your YST</th>
                        <th className="px-4 py-3 font-normal tabular-nums">Pending (USDC)</th>
                        <th className="px-4 py-3 font-normal tabular-nums">Total earned (USDC)</th>
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
                        const claimedVault =
                          claimedUsdcByVault.get(p.row.vault.toLowerCase()) ?? 0;
                        const totalEarnedNum = earnedNum + claimedVault;
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
                            <td className="px-4 py-3 tabular-nums text-text-display">
                              {claimHistoryLoading ? (
                                <span className="text-text-secondary">…</span>
                              ) : claimHistoryError ? (
                                <span title="Claim history unavailable — amount = pending only">
                                  {Number.isFinite(earnedNum)
                                    ? formatNumber(
                                        Math.round(earnedNum * 10000) / 10000
                                      )
                                    : "—"}
                                </span>
                              ) : Number.isFinite(totalEarnedNum) ? (
                                formatNumber(
                                  Math.round(totalEarnedNum * 10000) / 10000
                                )
                              ) : (
                                "—"
                              )}
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
            ) : (
              <div className="border border-dashed border-border rounded-technical p-xl text-center max-w-xl mx-auto">
                <p className="font-mono text-body-sm text-text-secondary">
                  Aucune position ouverte (YST / rewards à zéro). Les totaux ci-dessus
                  do include USDC already withdrawn via the on-chain history.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
