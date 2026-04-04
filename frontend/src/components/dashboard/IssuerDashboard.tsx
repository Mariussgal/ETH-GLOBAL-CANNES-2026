"use client";

import Header from "@/components/Header";
import IssuerStreamCard from "@/components/dashboard/IssuerStreamCard";
import { useMarketplaceOnChainStreams } from "@/hooks/useMarketplaceOnChainStreams";
import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

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

  const showEmpty =
    isConnected &&
    address &&
    !isLoading &&
    !isError &&
    issuerRows.length === 0;

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <Header />

      <main className="px-md sm:px-xl py-xl max-w-[1280px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-lg mb-2xl border-b border-border pb-lg">
          <div>
            <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm">
              ISSUER MODE
            </span>
            <h1 className="font-grotesk text-display-sm sm:text-display-md text-text-display">
              Emitter Dashboard
            </h1>
            <p className="font-mono text-caption text-text-disabled mt-sm max-w-lg">
              Streams déployés depuis ce wallet · Sepolia
            </p>
          </div>
          <Link
            href="/"
            className="font-mono text-label uppercase tracking-label text-text-disabled hover:text-text-secondary transition-colors"
          >
            ← HOME
          </Link>
        </div>

        {!isConnected && (
          <div className="border border-border rounded-technical p-2xl text-center dot-grid">
            <p className="font-mono text-body-sm text-text-secondary mb-xl">
              Connect a wallet to load your streams.
            </p>
            <ConnectButton />
          </div>
        )}

        {isConnected && address && isLoading && (
          <div className="font-mono text-body-sm text-text-secondary py-3xl text-center">
            [ LOADING_FACTORY_STATE… ]
          </div>
        )}

        {isConnected && address && isError && (
          <div className="font-mono text-body-sm text-accent py-3xl text-center">
            Factory read failed. Check RPC / network.
          </div>
        )}

        {showEmpty && (
          <div className="border border-dashed border-border-visible rounded-technical p-2xl md:p-3xl text-center max-w-xl mx-auto">
            <pre className="font-mono text-body-sm text-text-secondary whitespace-pre-wrap text-left inline-block mb-xl">
              {`> NO ACTIVE STREAMS DETECTED.
> INITIALIZE INFRASTRUCTURE?`}
            </pre>
            <Link
              href="/create"
              className="inline-flex font-mono text-[13px] uppercase tracking-[0.06em] px-xl py-md bg-text-display text-black rounded-pill hover:opacity-90 transition-opacity"
            >
              LAUNCH STREAM
            </Link>
          </div>
        )}

        {isConnected &&
          address &&
          !isLoading &&
          issuerRows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
              {issuerRows.map((row) => (
                <IssuerStreamCard key={`${row.vault}-${row.stream.id}`} row={row} />
              ))}

              <Link
                href="/create"
                className="flex flex-col items-center justify-center min-h-[280px] border border-dashed border-border-visible rounded-card bg-black/40 hover:border-success/50 hover:bg-success/5 transition-colors duration-200 ease-nothing group"
              >
                <span className="font-mono text-display-lg text-text-disabled group-hover:text-success mb-md">
                  +
                </span>
                <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-text-secondary group-hover:text-text-display">
                  LAUNCH NEW STREAM
                </span>
              </Link>
            </div>
          )}
      </main>
    </div>
  );
}
