"use client";

import { memo, useMemo } from "react";
import ArcSourceBadge from "@/components/ArcSourceBadge";

const SEPOLIA_TX_URL = "https://sepolia.etherscan.io/tx/";

export type ArcActivityItem = {
  /** Clé stable (ex. txHash-logIndex) pour déduplication et hydratation on-chain */
  id: string;
  time: string;
  amount: number;
  protocol: string;
  chainLabel: string;
  /** Si présent, lien vers la transaction sur l’explorateur Sepolia */
  txHash?: `0x${string}`;
};

type ArcActivityFeedProps = {
  items: readonly ArcActivityItem[];
  emptyMessage?: string;
};

/**
 * Liste purement contrôlée par le parent : aucun état interne sur les lignes,
 * pour éviter toute perte d’historique lors des re-renders (clés stables par `id`).
 */
function ArcActivityFeedComponent({
  items,
  emptyMessage = "Waiting for network routing...",
}: ArcActivityFeedProps) {
  const hasItems = items.length > 0;

  const list = useMemo(
    () =>
      items.map((item, idx) => (
        <div
          key={item.id}
          className="flex flex-wrap gap-x-md gap-y-sm w-full items-center transition-all duration-300 transform translate-y-0 opacity-100"
          style={{ opacity: 1 - idx * 0.15 }}
        >
          <span className="text-text-disabled whitespace-nowrap">[{item.time}]</span>
          <ArcSourceBadge chain={item.chainLabel} />
          <span
            className="text-success flex-1 min-w-[100px] ml-sm"
            style={{ textShadow: "0 0 5px rgba(34,197,94,0.3)" }}
          >
            +{item.amount.toFixed(4)} USDC
          </span>
          <span className="text-text-secondary">({item.protocol})</span>
          {item.txHash ? (
            <a
              href={`${SEPOLIA_TX_URL}${item.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-text-disabled hover:text-success border border-border hover:border-success/50 px-sm py-[2px] rounded-sm shrink-0 transition-colors"
              title="Voir sur Sepolia Etherscan"
            >
              ↗ EXPLORER
            </a>
          ) : null}
        </div>
      )),
    [items]
  );

  return (
    <section className="border border-border rounded-technical bg-black flex flex-col relative overflow-hidden flex-1">
      <div className="p-xl border-b border-border-visible flex justify-between items-center bg-black z-10">
        <h2 className="font-mono text-label uppercase tracking-label text-text-secondary flex items-center gap-sm">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          LIVE ACTIVITY FEED
        </h2>
        <span className="font-mono text-caption text-text-disabled">
          LAST_FEE_RECEIVED: {hasItems ? "live" : "pending"}
        </span>
      </div>
      <div className="p-xl h-[300px] font-mono text-body-sm relative z-0">
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent pointer-events-none z-10" />
        <div className="flex flex-col gap-md overflow-hidden h-full">
          {hasItems ? list : <div className="text-text-disabled animate-pulse">{emptyMessage}</div>}
        </div>
      </div>
    </section>
  );
}

export default memo(ArcActivityFeedComponent);
