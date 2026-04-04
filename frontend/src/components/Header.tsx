"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import Image from "next/image";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-xl py-md gap-md flex-wrap">
      {/* Wordmark */}
      <div className="flex items-center gap-lg flex-wrap">
        <Link href="/" className="flex items-center shrink-0">
          <Image src="/logoYSM.png" alt="YSM" width={100} height={48} className="h-12 w-auto" />
        </Link>
        <nav
          className="hidden sm:flex items-center gap-x-md gap-y-sm font-mono text-[11px] uppercase tracking-wider text-text-disabled"
          aria-label="Dashboards"
        >
          <Link
            href="/dashboard/issuer"
            className="hover:text-text-secondary transition-colors"
          >
            Issuer
          </Link>
          <span className="text-border" aria-hidden>
            /
          </span>
          <Link
            href="/dashboard/investor"
            className="hover:text-text-secondary transition-colors"
          >
            Investor
          </Link>
        </nav>
      </div>

      {/* System status + RainbowKit (UI type bouton d’origine) */}
      <div className="flex items-center gap-lg">
        <ConnectButton.Custom>
          {({
            account,
            chain,
            mounted,
            openAccountModal,
            openChainModal,
            openConnectModal,
          }) => {
            const ready = mounted;
            const connected = ready && account && chain;

            return (
              <div
                className={!ready ? "min-h-[44px] min-w-[200px]" : undefined}
                {...(!ready && {
                  "aria-hidden": true,
                  style: {
                    opacity: 0,
                    pointerEvents: "none",
                    userSelect: "none",
                  },
                })}
              >
                {!connected ? (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className="font-mono text-[13px] uppercase tracking-[0.06em] px-lg py-[12px] rounded-pill bg-text-display text-black transition-opacity duration-200 ease-nothing hover:opacity-90 active:opacity-80 min-h-[44px]"
                  >
                    CONNECT WALLET
                  </button>
                ) : chain.unsupported ? (
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="font-mono text-[12px] uppercase tracking-[0.06em] px-lg py-[12px] rounded-pill border border-accent text-accent transition-opacity duration-200 ease-nothing hover:opacity-90 min-h-[44px]"
                  >
                    NETWORK NOT SUPPORTED
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="font-mono text-[12px] uppercase tracking-[0.06em] px-lg py-[12px] rounded-pill border border-border-visible text-text-primary transition-colors duration-200 ease-nothing hover:border-text-secondary min-h-[44px]"
                  >
                    {account.ensName ?? account.displayName}
                  </button>
                )}
              </div>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header >
  );
}
