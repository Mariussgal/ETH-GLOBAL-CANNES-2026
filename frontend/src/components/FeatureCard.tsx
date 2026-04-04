"use client";

import { useState } from "react";

interface FeatureCardProps {
  index: string;
  title: string;
  plainEnglish: string;
  description: string;
  metric?: string;
  metricLabel?: string;
  glossary?: { term: string; definition: string }[];
}

function GlossaryTooltip({
  term,
  definition,
}: {
  term: string;
  definition: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="font-mono text-caption text-text-secondary underline decoration-dashed underline-offset-2 hover:text-text-primary transition-colors duration-150 cursor-help"
        aria-describedby={`tooltip-${term}`}
      >
        {term}
      </button>

      {open && (
        <span
          id={`tooltip-${term}`}
          role="tooltip"
          className="
            absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
            w-[220px] bg-surface-raised border border-border-visible
            px-md py-sm
            font-mono text-[10px] leading-relaxed text-text-secondary
            shadow-[0_0_0_1px_rgba(255,255,255,0.06)]
            pointer-events-none
          "
        >
          {/* Arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border-visible" />
          <span className="block text-text-disabled uppercase tracking-widest text-[9px] mb-[3px]">
            {term}
          </span>
          {definition}
        </span>
      )}
    </span>
  );
}

/**
 * Replaces `[[Term]]` markers in a description string with inline GlossaryTooltip components.
 */
function RichDescription({
  text,
  glossary = [],
}: {
  text: string;
  glossary: { term: string; definition: string }[];
}) {
  const glossaryMap = new Map(glossary.map((g) => [g.term, g.definition]));
  const parts = text.split(/\[\[([^\]]+)\]\]/g);

  return (
    <p className="font-grotesk text-body-sm text-text-secondary leading-relaxed">
      {parts.map((part, i) => {
        if (i % 2 === 1 && glossaryMap.has(part)) {
          return (
            <GlossaryTooltip
              key={i}
              term={part}
              definition={glossaryMap.get(part)!}
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export default function FeatureCard({
  index,
  title,
  plainEnglish,
  description,
  metric,
  metricLabel,
  glossary = [],
}: FeatureCardProps) {
  return (
    <div className="bg-surface border border-border rounded-card p-lg flex flex-col justify-between min-h-[260px] transition-colors duration-200 ease-nothing hover:border-border-visible group">
      {/* Top — Index + Title */}
      <div>
        <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-md">
          {index}
        </span>

        <h3 className="font-grotesk text-subheading sm:text-heading text-text-display font-medium mb-[6px]">
          {title}
        </h3>

        {/* Plain-English hook */}
        <p className="font-grotesk text-body-sm text-text-primary italic mb-sm leading-snug border-l border-border-visible pl-sm">
          {plainEnglish}
        </p>

        {/* Technical detail, with optional glossary tooltips */}
        <RichDescription text={description} glossary={glossary} />
      </div>

      {/* Bottom — Metric */}
      {metric ? (
        <div className="mt-lg pt-md border-t border-border">
          <span className="font-mono text-heading sm:text-display-md text-text-display">
            {metric}
          </span>
          {metricLabel && (
            <span className="font-mono text-label uppercase tracking-label text-text-secondary ml-sm">
              {metricLabel}
            </span>
          )}
        </div>
      ) : (
        /* Empty spacer so cards stay same height */
        <div className="mt-lg pt-md border-t border-border opacity-0 select-none" aria-hidden>
          &nbsp;
        </div>
      )}
    </div>
  );
}
