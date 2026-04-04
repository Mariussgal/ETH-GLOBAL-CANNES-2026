"use client";

import Header from "@/components/Header";
import IssuerStreamCard from "@/components/dashboard/IssuerStreamCard";
import { useMarketplaceOnChainStreams } from "@/hooks/useMarketplaceOnChainStreams";
import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

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
                label: "RAISED (USDC)",
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
              <ConnectButton />
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
