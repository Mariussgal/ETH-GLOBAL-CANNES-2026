"use client";

import SegmentedProgress from "./SegmentedProgress";
import ArcSourceBadge from "./ArcSourceBadge";
import { formatNumber } from "@/lib/format";

export interface StreamData {
  id: number;
  protocol: string;
  ensName: string;
  feePercent: number;
  duration: number;
  daysRemaining: number;
  discount: number;
  vaultFill: number;
  vaultTarget: number;
  priceFloor: number;
  sources: string[];
  defaulted: boolean;
}

interface StreamCardProps {
  stream: StreamData;
}

export default function StreamCard({ stream }: StreamCardProps) {
  const fillPercent = Math.round((stream.vaultFill / stream.vaultTarget) * 100);
  const vaultStatus = fillPercent >= 80 ? "success" : fillPercent >= 40 ? "neutral" : "warning";

  return (
    <div className="bg-surface border border-border rounded-card p-lg group transition-colors duration-200 ease-nothing hover:border-border-visible">
      {/* Top row: ENS name + status */}
      <div className="flex items-start justify-between mb-sm">
        <div>
          <span className="font-mono text-label uppercase tracking-label text-text-secondary">
            STREAM #{String(stream.id).padStart(3, "0")}
          </span>
          <h3 className="font-grotesk text-heading text-text-display mt-xs">
            {stream.ensName}
          </h3>
          {/* Offering line */}
          <p className="font-mono text-caption text-text-secondary mt-xs">
            Offering {stream.feePercent}% of future fees for{" "}
            {Math.round(stream.duration / 30)} months
          </p>
        </div>
        {stream.defaulted ? (
          <span className="inline-flex items-center gap-xs px-[12px] py-[4px] border border-accent rounded-technical font-mono text-caption uppercase tracking-label text-accent bg-accent-subtle">
            <span className="w-[6px] h-[6px] rounded-full bg-accent" />
            DEFAULTED
          </span>
        ) : (
          <span className="inline-flex items-center gap-xs px-[12px] py-[4px] border border-border-visible rounded-technical font-mono text-caption uppercase tracking-label text-success">
            <span className="w-[6px] h-[6px] rounded-full bg-success" />
            ACTIVE
          </span>
        )}
      </div>

      {/* Vault fill progress */}
      <div className="mb-md mt-lg">
        <div className="flex items-baseline justify-between mb-sm">
          <span className="font-mono text-label uppercase tracking-label text-text-secondary">
            VAULT FILL
          </span>
          <span className="font-mono text-body-sm text-text-primary">
            {fillPercent}%
          </span>
        </div>
        <SegmentedProgress
          value={stream.vaultFill}
          max={stream.vaultTarget}
          segments={24}
          status={vaultStatus}
        />
        <div className="flex justify-between mt-xs">
          <span className="font-mono text-caption text-text-disabled flex items-center">
            ${formatNumber(stream.vaultFill)}
          </span>
          <span className="font-mono text-caption text-text-disabled">
            ${formatNumber(stream.vaultTarget)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border mb-md" />

      {/* Data row: Price Floor + Discount + Duration */}
      <div className="grid grid-cols-3 gap-md mb-md">
        <div>
          <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-xs">
            PRICE FLOOR
          </span>
          <span className="font-mono text-subheading text-text-display flex items-center">
            ${stream.priceFloor.toFixed(4)}
          </span>
        </div>
        <div>
          <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-xs">
            DISCOUNT
          </span>
          <span className="font-mono text-subheading text-text-display">
            {stream.discount}%
          </span>
        </div>
        <div>
          <span className="font-mono text-label uppercase tracking-label text-text-secondary block mb-xs">
            REMAINING
          </span>
          <span className="font-mono text-subheading text-text-display">
            {stream.daysRemaining}
            <span className="text-label text-text-secondary ml-[4px]">D</span>
          </span>
        </div>
      </div>

      {/* Bottom row: Chain sources + fee % */}
      <div className="flex items-end justify-between">
        <div>
          <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-sm">
            REVENUE SOURCES
          </span>
          <div className="flex items-center gap-sm">
            {stream.sources.map((src) => (
              <ArcSourceBadge key={src} chain={src} />
            ))}
          </div>
        </div>
        <span className="font-mono text-caption uppercase tracking-label text-text-disabled">
          {stream.feePercent}% FEES
        </span>
      </div>
    </div>
  );
}
