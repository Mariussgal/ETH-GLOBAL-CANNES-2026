"use client";

import StreamCard, { type StreamData } from "@/components/StreamCard";
import { useMarketplaceOnChainStreams } from "@/hooks/useMarketplaceOnChainStreams";
import { MOCK_STREAMS } from "@/lib/mock-streams";
import { formatNumber } from "@/lib/format";
import Link from "next/link";
import { useMemo } from "react";
import { useEnsSubdomainStatus } from "@/hooks/useEnsSubdomainStatus";

function StreamCardWithEns({
  stream,
  emitter: _emitter,
}: {
  stream: StreamData;
  emitter: `0x${string}`;
}) {
  const { isDefaulted } = useEnsSubdomainStatus(stream.protocol);

  const resolved: StreamData = useMemo(
    () => ({
      ...stream,
      defaulted: stream.defaulted || isDefaulted,
    }),
    [stream, isDefaulted]
  );

  return <StreamCard stream={resolved} />;
}

export default function MarketplaceSection() {
  const { rows: onChain, isLoading, isError } = useMarketplaceOnChainStreams();

  const { totalVaultValue, activeStreams, totalCount } = useMemo(() => {
    const mockFill = MOCK_STREAMS.reduce((s, v) => s + v.vaultFill, 0);
    const mockActive = MOCK_STREAMS.filter((s) => !s.defaulted).length;
    const chainFill = onChain.reduce((s, r) => s + r.stream.vaultFill, 0);
    const chainActive = onChain.filter((r) => !r.stream.defaulted).length;
    return {
      totalVaultValue: mockFill + chainFill,
      activeStreams: mockActive + chainActive,
      totalCount: MOCK_STREAMS.length + onChain.length,
    };
  }, [onChain]);

  return (
    <section id="marketplace" className="px-xl py-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-lg mb-2xl">
        <div>
          <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm">
            MARKETPLACE
          </span>
          <div className="flex items-baseline gap-md flex-wrap">
            <span className="font-mono text-display-md sm:text-display-lg text-text-display">
              ${formatNumber(totalVaultValue)}
            </span>
            <span className="font-mono text-label uppercase tracking-label text-text-secondary">
              TVL
            </span>
          </div>
        </div>
        <div className="flex items-baseline gap-lg">
          <div className="flex items-baseline gap-xs">
            <span className="font-mono text-heading text-text-display">
              {activeStreams}
            </span>
            <span className="font-mono text-label uppercase tracking-label text-text-secondary">
              ACTIVE
            </span>
          </div>
          <div className="flex items-baseline gap-xs">
            <span className="font-mono text-heading text-text-display">
              {totalCount}
            </span>
            <span className="font-mono text-label uppercase tracking-label text-text-secondary">
              TOTAL
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-sm mb-lg">
        <span className="font-mono text-label uppercase tracking-label text-text-secondary">
          ACTIVE STREAMS
        </span>
        <div className="flex flex-wrap items-center gap-x-md gap-y-xs">
          {isLoading && (
            <span className="font-mono text-caption text-text-disabled">
              Sync Sepolia…
            </span>
          )}
          {isError && (
            <span className="font-mono text-caption text-accent">
              Lecture Factory impossible (RPC).
            </span>
          )}
          <span className="font-mono text-label uppercase tracking-label text-text-disabled">
            {totalCount} RESULTS
          </span>
          <Link
            href="/create"
            className="font-mono text-caption text-success hover:underline"
          >
            + Créer un stream
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        {onChain.map(({ stream, emitter }) => (
          <StreamCardWithEns
            key={`chain-${stream.id}`}
            stream={stream}
            emitter={emitter}
          />
        ))}
        {MOCK_STREAMS.map((stream) => (
          <StreamCard key={`mock-${stream.id}`} stream={stream} />
        ))}
      </div>
    </section>
  );
}
