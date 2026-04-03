"use client";

interface ArcSourceBadgeProps {
  chain: string;
}

export default function ArcSourceBadge({ chain }: ArcSourceBadgeProps) {
  return (
    <span className="inline-flex items-center px-[12px] py-[4px] border border-border-visible rounded-technical font-mono text-caption uppercase tracking-label text-text-secondary transition-colors duration-200 ease-nothing hover:text-text-primary hover:border-text-secondary">
      {chain}
    </span>
  );
}
