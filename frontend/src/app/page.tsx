import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import BentoGrid from "@/components/BentoGrid";
import StreamCard from "@/components/StreamCard";
import { MOCK_STREAMS } from "@/lib/mock-streams";
import { formatNumber } from "@/lib/format";
import { MarketplaceSyncProvider } from "@/components/MarketplaceSyncContext";
import Image from "next/image";

export default function Home() {
  const totalVaultValue = MOCK_STREAMS.reduce((s, v) => s + v.vaultFill, 0);
  const activeStreams = MOCK_STREAMS.filter((s) => !s.defaulted).length;

  return (
    <MarketplaceSyncProvider>
      <div className="min-h-screen bg-black">
        <Header />

        {/* ── HERO ── */}
        <HeroSection />

        {/* ── BENTO GRID ── */}
        <BentoGrid />

        {/* ── MARKETPLACE ── */}
        <section id="marketplace" className="px-xl py-3xl">
          {/* Section header with hero metric */}
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
                  {MOCK_STREAMS.length}
                </span>
                <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                  TOTAL
                </span>
              </div>
            </div>
          </div>

          {/* Stream cards grid */}
          <div className="flex items-center justify-between mb-lg">
            <span className="font-mono text-label uppercase tracking-label text-text-secondary">
              ACTIVE STREAMS
            </span>
            <span className="font-mono text-label uppercase tracking-label text-text-disabled">
              {MOCK_STREAMS.length} RESULTS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {MOCK_STREAMS.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="px-xl py-2xl border-t border-border">
          {/* Built with */}
          <div className="mb-xl flex flex-col items-center">
            <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-md text-center">
              BUILT WITH
            </span>
            <div className="flex items-center justify-center gap-2xl flex-wrap">
              <a href="https://docs.chain.link" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-60 hover:opacity-100 transition-opacity duration-200 ease-nothing">
                <Image src="/Chainlink_Logo.png" alt="Chainlink" width={24} height={24} className="brightness-0 invert" />
                <span className="font-mono text-body-sm text-text-secondary">Chainlink CRE</span>
              </a>
              <a href="https://docs.ens.domains" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-60 hover:opacity-100 transition-opacity duration-200 ease-nothing">
                <Image src="/ens.png" alt="ENS" width={24} height={24} className="brightness-0 invert" />
                <span className="font-mono text-body-sm text-text-secondary">ENS</span>
              </a>

              <a href="https://docs.arc.ag" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-60 hover:opacity-100 transition-opacity duration-200 ease-nothing">
                <Image src="/arc_logo_final.png" alt="Arc" width={24} height={24} className="brightness-0 invert" />
                <span className="font-mono text-body-sm text-text-secondary">Arc</span>
              </a>
            </div>
          </div>

          {/* Copyright */}
          <div className="pt-md border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-md">
            <span className="font-mono text-caption text-text-disabled">
              YIELD STREAM MARKETPLACE — ETHGLOBAL CANNES 2026
            </span>
            <span className="font-mono text-caption text-text-disabled">
              SEPOLIA TESTNET
            </span>
          </div>
        </footer>
      </div>
    </MarketplaceSyncProvider>
  );
}
