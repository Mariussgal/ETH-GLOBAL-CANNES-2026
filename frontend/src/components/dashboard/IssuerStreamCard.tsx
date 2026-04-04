"use client";


import ActivateAutomationButton from "@/components/dashboard/ActivateAutomationButton";
import EndCampaignButton from "@/components/dashboard/EndCampaignButton";

import SegmentedProgress from "@/components/SegmentedProgress";
import type { OnChainStreamRow } from "@/hooks/useMarketplaceOnChainStreams";
import { formatNumber } from "@/lib/format";
import Link from "next/link";

type Props = {
  row: OnChainStreamRow;
};

export default function IssuerStreamCard({ row }: Props) {
  const { stream, nominalCapUsdc } = row;

  /** Primary raise: `vaultFill` = actual USDC collected; `vaultTarget` on StreamData = face value (do not use here). */
  const targetUsdc = nominalCapUsdc;
  const raisedUsdc = stream.vaultFill;
  const pct =
    targetUsdc > 0
      ? Math.min(100, Math.round((raisedUsdc / targetUsdc) * 100))
      : 0;

  return (
    <article className="flex flex-col border border-border rounded-card bg-black/80 overflow-hidden group hover:border-border-visible transition-colors duration-200 ease-nothing">
      <div className="px-lg py-md border-b border-border flex items-start justify-between gap-md dot-grid">
        <div className="min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-disabled block mb-xs">
            STREAM #{String(stream.id).padStart(3, "0")} · {stream.protocol}
          </span>
          <h3 className="font-grotesk text-heading text-text-display truncate">
            {stream.ensName}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-xs shrink-0">
          <span className="font-mono text-[9px] uppercase tracking-wider px-sm py-[4px] border border-success/60 text-success rounded-sm">
            LIVE ON SEPOLIA
          </span>
        </div>
      </div>

      <div className="p-lg flex flex-col gap-lg flex-1">
        <div>
          <div className="flex justify-between items-baseline mb-sm">
            <span className="font-mono text-label uppercase tracking-label text-text-secondary">
              FUNDING PROGRESS
            </span>
            <span className="font-mono text-body-sm text-text-display tabular-nums">
              {pct}% · ${formatNumber(Math.round(raisedUsdc))} / $
              {formatNumber(targetUsdc)}
            </span>
          </div>
          <SegmentedProgress
            value={raisedUsdc}
            max={Math.max(targetUsdc, 1)}
            segments={28}
            status={pct >= 80 ? "success" : pct >= 35 ? "neutral" : "warning"}
            size="compact"
            variant="blocks"
          />
          <span className="font-mono text-[9px] text-text-disabled uppercase mt-xs block">
            Nominal target (USDC) · YST issued from emitter wallet
          </span>
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-disabled">
              PAYOUT STATUS
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-wider ${
                pct === 100 ? "text-success" : "text-text-secondary"
              }`}
            >
              {pct === 100 ? "FULLY DISBURSED" : "DIRECT TO WALLET"}
            </span>
          </div>
          <p className="font-mono text-[9px] text-text-disabled leading-tight">
            {pct === 100
              ? "All raised capital was transferred to your wallet during the sale transactions."
              : "USDC from primary sales are sent directly to your wallet upon each purchase."}
          </p>
        </div>

        <Link
          href={`/invest/${stream.id}`}
          className="mt-auto font-mono text-[12px] uppercase tracking-[0.08em] text-center py-md border border-text-display text-text-display hover:bg-text-display hover:text-black transition-colors duration-200 ease-nothing rounded-technical"
        >
          VIEW ANALYTICS
        </Link>

        <ActivateAutomationButton row={row} />
        <EndCampaignButton row={row} />

      </div>
    </article>
  );
}
