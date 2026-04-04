import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import BentoGrid from "@/components/BentoGrid";
import MarketplaceSection from "@/components/MarketplaceSection";
import { MarketplaceSyncProvider } from "@/components/MarketplaceSyncContext";
import Image from "next/image";

export default function Home() {
  return (
    <MarketplaceSyncProvider>
      <div className="min-h-screen bg-black">
        <Header />

        {/* ── HERO ── */}
        <HeroSection />

        {/* ── BENTO GRID ── */}
        <BentoGrid />

        {/* ── MARKETPLACE (on-chain + démo) ── */}
        <MarketplaceSection />

        {/* ── FOOTER ── */}
        <footer className="px-xl py-2xl border-t border-border">
          {/* Built with */}
          <div className="mb-xl flex flex-col items-center">

            <div className="mt-xl flex flex-col items-center">

              <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-sm text-center">
                BUILT BY
              </span>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center">
                <a href="https://linkedin.com/in/nohem-mg" target="_blank" rel="noopener noreferrer" className="font-mono text-body-sm text-text-secondary hover:text-text-primary transition-colors duration-200">Nohem Monnet-Gani</a>
                <span className="font-mono text-body-sm text-text-disabled opacity-40">&</span>
                <a href="https://linkedin.com/in/marius-gal" target="_blank" rel="noopener noreferrer" className="font-mono text-body-sm text-text-secondary hover:text-text-primary transition-colors duration-200">Marius Gal</a>
                <span className="font-mono text-body-sm text-text-disabled opacity-40">&</span>
                <a href="https://linkedin.com/in/cyriac-mirkovik" target="_blank" rel="noopener noreferrer" className="font-mono text-body-sm text-text-secondary hover:text-text-primary transition-colors duration-200">Cyriac Mirkovik</a>
              </div>
              <div className="flex items-center justify-center gap-2xl flex-wrap shrink-0 mt-xl">
                <a href="https://docs.chain.link" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-60 hover:opacity-100 transition-opacity duration-200 ease-nothing">
                  <Image src="/Chainlink_Logo.png" alt="Chainlink" width={24} height={24} className="brightness-0 invert" />
                </a>
                <a href="https://docs.ens.domains" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-60 hover:opacity-100 transition-opacity duration-200 ease-nothing">
                  <Image src="/ens.png" alt="ENS" width={24} height={24} className="brightness-0 invert" />
                </a>

                <a href="https://docs.arc.ag" target="_blank" rel="noopener noreferrer" className="flex items-center gap-sm opacity-60 hover:opacity-100 transition-opacity duration-200 ease-nothing">
                  <Image src="/arc_logo_final.png" alt="Arc" width={24} height={24} className="brightness-0 invert" />
                </a>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="pt-md border-t border-border flex flex-col sm:flex-row items-center justify-between gap-md">
            <span className="font-mono text-caption text-text-disabled flex-1 text-center sm:text-left w-full sm:w-auto">
              YIELD STREAM MARKETPLACE — ETHGLOBAL CANNES 2026
            </span>


            <span className="font-mono text-caption text-text-disabled flex-1 text-center sm:text-right w-full sm:w-auto">
              SEPOLIA TESTNET
            </span>
          </div>
        </footer>
      </div>
    </MarketplaceSyncProvider>
  );
}
