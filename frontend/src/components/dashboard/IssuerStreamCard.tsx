"use client";

import ActivateAutomationButton from "@/components/dashboard/ActivateAutomationButton";
import SegmentedProgress from "@/components/SegmentedProgress";
import { useCreAutomationStatus } from "@/hooks/useCreAutomationStatus";
import type { OnChainStreamRow } from "@/hooks/useMarketplaceOnChainStreams";
import { formatNumber } from "@/lib/format";
import { computeStreamKey } from "@/lib/stream-key";
import Link from "next/link";
import { useMemo } from "react";
import type { Address } from "viem";
import { formatUnits } from "viem";

const USDC_DECIMALS = 6;

type Props = {
  row: OnChainStreamRow;
};

export default function IssuerStreamCard({ row }: Props) {
  const { stream, fundingRatio } = row;
  const streamKey = useMemo(
    () =>
      computeStreamKey(stream.protocol, row.emitter as Address) as `0x${string}`,
    [stream.protocol, row.emitter]
  );
  const { chainlinkAutomationActive } = useCreAutomationStatus(streamKey);

  const feesUsdc = Number(formatUnits(row.totalFeesWei, USDC_DECIMALS));
  const targetUsdc = stream.vaultTarget;
  const raisedUsdc = fundingRatio * targetUsdc;
  const pct = Math.round(fundingRatio * 100);

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
          {chainlinkAutomationActive && (
            <span className="font-mono text-[8px] uppercase tracking-wider px-sm py-[3px] border border-[#375BD2]/70 text-[#9ECFFF] rounded-sm">
              CRE LINKED
            </span>
          )}
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
            Objectif nominal (USDC) · YST sorti du wallet émetteur
          </span>
        </div>

        <div className="border border-border-visible rounded-technical p-md bg-surface/50">
          <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-xs">
            REVENUE PERFORMANCE
          </span>
          <span className="font-mono text-display-sm text-success tabular-nums">
            ${formatNumber(feesUsdc)}
          </span>
          <span className="font-mono text-[9px] text-text-disabled uppercase mt-xs block">
            totalFeesReceived (USDC)
          </span>
        </div>

        <Link
          href={`/invest/${stream.id}`}
          className="mt-auto font-mono text-[12px] uppercase tracking-[0.08em] text-center py-md border border-text-display text-text-display hover:bg-text-display hover:text-black transition-colors duration-200 ease-nothing rounded-technical"
        >
          VIEW ANALYTICS
        </Link>

        <ActivateAutomationButton row={row} />
      </div>
    </article>
  );
}
