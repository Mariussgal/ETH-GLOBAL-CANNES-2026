"use client";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-xl py-md border-b border-border">
      {/* Wordmark */}
      <div className="flex items-center gap-md">
        <h1 className="font-grotesk text-heading text-text-display font-medium tracking-snug">
          YSM
        </h1>
        <span className="hidden sm:inline-block font-mono text-label uppercase tracking-label text-text-disabled">
          YIELD STREAM MARKETPLACE
        </span>
      </div>

      {/* System status + Connect */}
      <div className="flex items-center gap-lg">
        {/* Status indicator */}
        <div className="hidden sm:flex items-center gap-sm">
          <span className="relative flex h-[6px] w-[6px]">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
            <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-success" />
          </span>
          <span className="font-mono text-label uppercase tracking-label text-text-secondary">
            OPERATIONAL
          </span>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-[1px] h-[20px] bg-border-visible" />

        {/* Connect Wallet */}
        <button className="font-mono text-[13px] uppercase tracking-[0.06em] px-lg py-[12px] rounded-pill bg-text-display text-black transition-opacity duration-200 ease-nothing hover:opacity-90 active:opacity-80 min-h-[44px]">
          CONNECT WALLET
        </button>
      </div>
    </header>
  );
}
