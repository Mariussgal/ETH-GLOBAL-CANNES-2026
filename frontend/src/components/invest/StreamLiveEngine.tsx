"use client";

import type { StreamData } from "@/components/StreamCard";

interface StreamLiveEngineProps {
  stream: StreamData;
}

/** Compact flow engine — dot-matrix, fees towards the stream vault (demo). */
export default function StreamLiveEngine({ stream }: StreamLiveEngineProps) {
  return (
    <div className="relative w-full min-h-[200px] border border-border bg-black overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-[0.12] pointer-events-none" />
      <div className="relative z-10 p-md flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label uppercase tracking-label text-text-secondary">
            LIVE ENGINE — STREAM #{String(stream.id).padStart(3, "0")}
          </span>
          <span className="font-mono text-caption text-text-disabled uppercase">
            {stream.protocol}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div className="flex flex-col gap-3 min-w-0 flex-1">
            {stream.sources.map((src, i) => (
              <div key={src} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-text-disabled uppercase shrink-0 w-[100px]">
                  {src}_FEES
                </span>
                <div className="relative flex-1 h-[2px] bg-border max-w-[180px] overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full w-[8px] bg-text-display animate-steppy-flow"
                    style={{ animationDuration: `${0.4 + i * 0.08}s` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="relative w-[2px] h-12 sm:h-16 bg-border overflow-hidden">
              <div className="absolute left-0 top-0 w-full h-[6px] bg-text-secondary animate-steppy-drop" />
            </div>
            <div className="border border-border px-3 py-2 bg-black min-w-[120px] text-center">
              <span className="font-mono text-[9px] text-text-disabled uppercase tracking-widest block mb-1">
                YST_VAULT
              </span>
              <span className="font-mono text-body-sm text-text-display tabular-nums">
                +{stream.vaultFill.toLocaleString("en-US")}$
              </span>
            </div>
          </div>
        </div>

        <p className="font-mono text-[9px] text-text-disabled uppercase tracking-wide">
          INBOUND ROUTING · ARC CONSOLIDATION · CHECKPOINT OK
        </p>
      </div>
    </div>
  );
}
