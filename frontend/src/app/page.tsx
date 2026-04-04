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
