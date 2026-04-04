"use client";

import Header from "@/components/Header";
import IssuerStreamCard from "@/components/dashboard/IssuerStreamCard";
import { useMarketplaceOnChainStreams } from "@/hooks/useMarketplaceOnChainStreams";
import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useIssuerReceiveHistory } from "@/hooks/useIssuerReceiveHistory";

const SEPOLIA_TX_URL = "https://sepolia.etherscan.io/tx/";

function SkeletonCard() {
  return (
    <div className="flex flex-col border border-border rounded-card bg-black/80 overflow-hidden animate-pulse">
      <div className="px-lg py-md border-b border-border flex items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          <div className="h-[10px] w-32 bg-surface-raised rounded mb-sm" />
          <div className="h-5 w-48 bg-surface-raised rounded" />
        </div>
        <div className="h-[22px] w-20 bg-surface-raised rounded-sm shrink-0" />
      </div>
      <div className="p-lg flex flex-col gap-lg flex-1">
        <div>
          <div className="flex justify-between mb-sm">
            <div className="h-[11px] w-28 bg-surface-raised rounded" />
            <div className="h-[11px] w-24 bg-surface-raised rounded" />
          </div>
          <div className="h-3 w-full bg-surface-raised rounded" />
        </div>
        <div className="mt-auto h-10 w-full bg-surface-raised rounded-technical" />
      </div>
    </div>
  );
}

export default function IssuerDashboard() {
  const { address, isConnected } = useAccount();
  const { rows, isLoading, isError } = useMarketplaceOnChainStreams();

  const issuerRows = useMemo(
    () =>
      address
        ? rows.filter(
            (r) => r.emitter.toLowerCase() === address.toLowerCase()
          )
        : [],
    [rows, address]
  );

  const { receiveEntries: rawEntries, isLoading: receiveHistoryLoading } = useIssuerReceiveHistory();
  
  // Filtrage pour ne garder que les tx qui correspondent aux streams de la factory actuelle
  const receiveEntries = useMemo(() => {
    if (issuerRows.length === 0) return [];
    // On trouve le timestamp le plus ancien parmi nos streams (secondes -> ms)
    const minTime = Math.min(...issuerRows.map(r => r.stream.createdAt)) * 1000;
    // On garde une petite marge (ex: 5 min) au cas où la tx de création et le log de fetch soient proches
    return rawEntries.filter(e => new Date(e.timestamp).getTime() >= (minTime - 300_000));
  }, [rawEntries, issuerRows]);

  const totalRaised = useMemo(
    () => issuerRows.reduce((acc, r) => acc + r.stream.vaultFill, 0),
    [issuerRows]
  );
  const totalCap = useMemo(
    () => issuerRows.reduce((acc, r) => acc + r.nominalCapUsdc, 0),
    [issuerRows]
  );

  const showEmpty =
    isConnected &&
    address &&
    !isLoading &&
    !isError &&
    issuerRows.length === 0;

  const showStreams =
    isConnected && address && !isLoading && issuerRows.length > 0;

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <Header />

      <main className="px-md sm:px-xl py-xl max-w-[1280px] mx-auto">
        {/* ── Page header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-lg mb-2xl border-b border-border pb-lg">
          <div>
            <div className="flex items-center gap-sm mb-sm">
              <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                ISSUER MODE · SEPOLIA
              </span>
            </div>
            <h1 className="font-grotesk text-display-sm sm:text-display-md text-text-display tracking-tight">
              Emitter Dashboard
            </h1>
            <p className="font-mono text-caption text-text-disabled mt-sm max-w-lg">
              Streams deployed from this wallet · YST on-chain infrastructure
            </p>
          </div>
          <Link
            href="/"
            className="font-mono text-label uppercase tracking-label text-text-disabled hover:text-text-secondary transition-colors self-start sm:self-auto"
          >
            ← HOME
          </Link>
        </div>

        {/* ── Stats strip (only when streams are loaded) ── */}
        {showStreams && (
          <div className="grid grid-cols-3 gap-px border border-border rounded-technical mb-2xl overflow-hidden">
            {[
              { label: "STREAMS", value: String(issuerRows.length) },
              {
                label: "RECEIVED (USDC)",
                value: `$${new Intl.NumberFormat("en-US").format(Math.round(totalRaised))}`,
              },
              {
                label: "TARGET CAP",
                value: `$${new Intl.NumberFormat("en-US").format(Math.round(totalCap))}`,
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-col gap-xs px-lg py-md bg-surface/40"
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-disabled">
                  {label}
                </span>
                <span className="font-grotesk text-heading text-text-display tabular-nums">
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Receive history (Issuer specific) ── */}
        {showStreams && (
          <section className="mb-2xl border border-border rounded-technical overflow-hidden bg-black shadow-[0_0_15px_rgba(255,255,255,0.02)]">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-md bg-surface/30">
              <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                Receive history
              </span>
              <span className="font-mono text-[10px] text-text-disabled uppercase">
                CAPITAL_INFLOW_RECORDS · [ STATUS: ESCROWED ]
              </span>
            </div>
            {receiveHistoryLoading && receiveEntries.length === 0 ? (
              <div className="font-mono text-body-sm text-text-secondary py-xl text-center">
                [ SCANNING_PRIMARY_MARKET_RECEIPTS… ]
              </div>
            ) : receiveEntries.length === 0 ? (
              <div className="font-mono text-body-sm text-text-disabled py-xl text-center">
                [ NO_INCOMING_CAPITAL_DETECTED_FOR_THIS_ISSUER ]
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] font-mono text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-disabled">
                      <th className="px-4 py-3 font-normal">Date (UTC)</th>
                      <th className="px-4 py-3 font-normal">From (Buyer)</th>
                      <th className="px-4 py-3 font-normal tabular-nums">Amount Received</th>
                      <th className="px-4 py-3 font-normal text-right">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveEntries.map((e) => (
                      <tr
                        key={e.hash}
                        className="border-b border-border/80 hover:bg-surface/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-text-display tabular-nums whitespace-nowrap">
                          {new Date(e.timestamp).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 text-text-secondary tabular-nums">
                          {e.buyer.slice(0, 6)}…{e.buyer.slice(-4)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-success">
                          ${e.amountUsdc.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`${SEPOLIA_TX_URL}${e.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] text-text-secondary hover:text-text-display underline underline-offset-2"
                          >
                            Etherscan ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 bg-surface/10 border-t border-border">
                  <p className="font-mono text-[10px] text-text-disabled leading-relaxed max-w-2xl">
                    Note: Incoming capital is currently held in the <span className="text-text-secondary">PrimarySale</span> escrow contract until the campaign duration ends or is finalized.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Not connected ── */}
        {!isConnected && (
          <div className="border border-dashed border-border-visible rounded-card p-2xl md:p-3xl text-center dot-grid relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 pointer-events-none" />
            <div className="relative">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-disabled mb-xs">
                AUTHENTICATION REQUIRED
              </p>
              <p className="font-grotesk text-heading text-text-display mb-xl">
                Connect your wallet
              </p>
              <p className="font-mono text-caption text-text-secondary mb-2xl max-w-sm mx-auto">
                Link an emitter wallet to load your active streams and deploy
                new infrastructure.
              </p>
            </div>
          </div>
        )}

        {/* ── Loading skeletons ── */}
        {isConnected && address && isLoading && (
          <div className="space-y-md">
            <div className="flex items-center gap-sm mb-lg">
              <span className="inline-block w-[6px] h-[6px] rounded-full bg-text-disabled animate-pulse" />
              <span className="font-mono text-label uppercase tracking-label text-text-disabled">
                LOADING_FACTORY_STATE…
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {isConnected && address && isError && (
          <div className="border border-accent/30 bg-accent/5 rounded-technical p-xl flex items-start gap-md">
            <span className="font-mono text-accent text-[18px] leading-none mt-[2px]">
              ✕
            </span>
            <div>
              <p className="font-mono text-label uppercase tracking-label text-accent mb-xs">
                RPC_READ_FAILED
              </p>
              <p className="font-mono text-caption text-text-secondary">
                Factory state could not be fetched. Verify your RPC endpoint and
                network connection.
              </p>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {showEmpty && (
          <div className="border border-dashed border-border-visible rounded-card p-2xl md:p-4xl text-center max-w-2xl mx-auto relative overflow-hidden dot-grid">
            <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/80 pointer-events-none" />
            <div className="relative">
            
              <pre className="font-mono text-body-sm text-text-secondary whitespace-pre-wrap text-left inline-block mb-2xl leading-relaxed">
                {`> NO ACTIVE STREAMS DETECTED.\n> INITIALIZE INFRASTRUCTURE?`}
              </pre>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-md">
                <Link
                  href="/create"
                  className="inline-flex items-center gap-sm font-mono text-[13px] uppercase tracking-[0.06em] px-xl py-md bg-text-display text-black rounded-pill hover:opacity-90 active:scale-[0.98] transition-all duration-150"
                >
                  <span className="text-[16px] leading-none">+</span>
                  LAUNCH STREAM
                </Link>

              </div>
            </div>
          </div>
        )}

        {/* ── Stream grid ── */}
        {showStreams && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
            {issuerRows.map((row) => (
              <IssuerStreamCard
                key={`${row.vault}-${row.stream.id}`}
                row={row}
              />
            ))}

            <Link
              href="/create"
              className="flex flex-col items-center justify-center min-h-[280px] border border-dashed border-border rounded-card bg-black/40 hover:border-success/50 hover:bg-success/5 transition-colors duration-200 ease-nothing group"
            >
              <span className="font-mono text-display-lg text-text-disabled group-hover:text-success mb-md transition-colors duration-200">
                +
              </span>
              <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-text-secondary group-hover:text-text-display transition-colors duration-200">
                LAUNCH NEW STREAM
              </span>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
