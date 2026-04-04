"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArcActivityItem } from "@/components/invest/ArcActivityFeed";
import { shouldSimulateDemoRevenue } from "@/lib/demo-revenue-protocol";

const TICK_MS = 14_000;

function formatClockFromUnix(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

/**
 * Lignes synthétiques pour la démo « revenus protocole » (nohem-mg, etc.) sans dépendre des mocks Base/Polygon.
 */
export function useDemoProtocolRevenueFeed(
  protocolSlug: string,
  enabled: boolean
): {
  feedItems: ArcActivityItem[];
  /** Totaux USDC affichés dans le hub (séparés Base / Polygon pour le style existant) */
  demoBaseUsdc: number;
  demoPolygonUsdc: number;
} {
  const [rows, setRows] = useState<ArcActivityItem[]>([]);
  const seq = useRef(0);
  const demo = enabled && shouldSimulateDemoRevenue(protocolSlug);

  const pushSynthetic = useCallback(() => {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const baseBias = seq.current % 2 === 0;
    seq.current += 1;
    const amount = 120 + Math.round(Math.random() * 380);
    const id = `demo-nohem-${nowSec}-${seq.current}`;
    const item: ArcActivityItem = {
      id,
      time: formatClockFromUnix(nowSec),
      amount,
      protocol: `${protocolSlug} · SIM`,
      chainLabel: baseBias ? "Base" : "Polygon",
    };
    setRows((prev) => [item, ...prev].slice(0, 12));
  }, [protocolSlug]);

  useEffect(() => {
    if (!demo) {
      setRows([]);
      return;
    }
    pushSynthetic();
    const id = window.setInterval(pushSynthetic, TICK_MS);
    return () => window.clearInterval(id);
  }, [demo, pushSynthetic]);

  const totals = useMemo(() => {
    if (!demo || rows.length === 0) {
      return { demoBaseUsdc: 0, demoPolygonUsdc: 0 };
    }
    let base = 0;
    let poly = 0;
    for (const r of rows) {
      if (r.chainLabel === "Base") base += r.amount;
      else poly += r.amount;
    }
    return { demoBaseUsdc: base, demoPolygonUsdc: poly };
  }, [demo, rows]);

  return {
    feedItems: demo ? rows : [],
    demoBaseUsdc: totals.demoBaseUsdc,
    demoPolygonUsdc: totals.demoPolygonUsdc,
  };
}
