"use client";

import Image from "next/image";
import Link from "next/link";
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
  /** Levée primaire : plafond nominal (USDC) depuis `capitalRaised` — pour « 100 % » et caps d’invest. */
  nominalRaiseCapUsdc?: number;
  totalTokenSupply?: number;
  priceFloor: number;
  sources: string[];
  defaulted: boolean;
  createdAt: number;
}

interface StreamCardProps {
  stream: StreamData;
}

export default function StreamCard({ stream }: StreamCardProps) {
  const raiseCap =
    stream.nominalRaiseCapUsdc !== undefined && stream.nominalRaiseCapUsdc > 0
      ? stream.nominalRaiseCapUsdc
      : stream.vaultTarget;
  const fillPercent =
    raiseCap > 0
      ? Math.min(100, Math.round((stream.vaultFill / raiseCap) * 100))
      : 0;
  const vaultStatus = fillPercent >= 80 ? "success" : fillPercent >= 40 ? "neutral" : "warning";

  return (
    <Link
      href={`/invest/${stream.id}`}
      className="flex flex-col h-full bg-surface border border-border rounded-card p-lg group transition-colors duration-200 ease-nothing hover:border-border-visible"
    >
      {/* Top row: ENS name + status */}
      <div className="flex items-start justify-between mb-sm">
        <div>
          <span className="font-mono text-label uppercase tracking-label text-text-secondary">
            STREAM #{String(stream.id).padStart(3, "0")}
          </span>
          <h3 className="font-grotesk text-heading text-text-display mt-xs">
            {stream.ensName}
          </h3>
          {stream.ensName.endsWith(".ysm.eth") && (
            <a
              href={`https://app.ens.domains/${stream.ensName}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-[4px] mt-xs font-mono text-[10px] text-text-disabled hover:text-success transition-colors duration-150"
            >
              <Image
                src="/ens.png"
                alt="ENS"
                width={10}
                height={10}
                className="brightness-0 invert opacity-50"
              />
              {stream.ensName}
            </a>
          )}
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
          value={Math.min(stream.vaultFill, raiseCap)}
          max={Math.max(raiseCap, 1)}
          segments={24}
          status={vaultStatus}
        />
        <div className="flex justify-between mt-xs">
          <span className="font-mono text-caption text-text-disabled flex items-center">
            ${formatNumber(stream.vaultFill)}
          </span>
          <span className="font-mono text-caption text-text-disabled">
            ${formatNumber(raiseCap)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border mb-md" />

      {/* Data row: Discount + Remaining */}
      <div className="grid grid-cols-2 gap-md mb-md">
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

      {/* Bottom row: Chain sources + fee % plus Invest button */}
      <div className="flex items-end justify-between mt-auto">
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
        <div className="flex items-center gap-md">
          <span className="font-mono text-caption uppercase tracking-label text-text-disabled hidden sm:inline-block">
            {stream.feePercent}% FEES
          </span>
          <span className="inline-flex items-center justify-center font-mono text-[12px] uppercase px-[12px] py-[6px] border border-text-primary text-text-primary rounded-technical transition-colors duration-200 ease-nothing group-hover:bg-text-primary group-hover:text-black">
            {fillPercent >= 100 ? "[ OPEN_POSITION ]" : "[ INVEST ]"}
          </span>
        </div>
      </div>
    </Link>
  );
}
