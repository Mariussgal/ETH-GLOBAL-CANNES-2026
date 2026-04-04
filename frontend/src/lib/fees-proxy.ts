/**
 * DeFiLlama data (CRE worker) → annualization avg30×365.
 * Browser side: `/api/fees/[slug]` (Next relays in server mode, no CORS to worker).
 * Server side: direct worker call if needed.
 */
const DEFAULT_FEES_PROXY_BASE =
  process.env.NEXT_PUBLIC_FEES_PROXY_URL?.replace(/\/$/, "") ??
  "https://ysm-defilama-proxy.ysm-market-proxy.workers.dev/fees";

export type FeesProxyPayload = {
  annualUsd: number;
  avg30: number;
  avg60prev: number;
  rScore: number;
};

type FeesProxyJson = {
  error?: string;
  slug?: string;
  avg30?: number;
  avg60prev?: number;
  rScore?: number;
  detail?: string;
};

function feesUrl(protocolSlug: string): string {
  if (typeof window !== "undefined") {
    return `/api/fees/${encodeURIComponent(protocolSlug)}`;
  }
  return `${DEFAULT_FEES_PROXY_BASE}/${encodeURIComponent(protocolSlug)}`;
}

export async function fetchFeesFromProxy(
  protocolSlug: string
): Promise<FeesProxyPayload | null> {
  const res = await fetch(feesUrl(protocolSlug));
  const data = (await res.json()) as FeesProxyJson;
  if (!res.ok) {
    if (
      res.status === 502 &&
      data.error === "fees_upstream_unreachable"
    ) {
      throw new Error(
        "The fees relay (worker) is unreachable from the Next server. Check FEES_PROXY_URL or the network."
      );
    }
    return null;
  }
  if (data.error) return null;
  const avg30 = Number(data.avg30);
  const avg60prev = Number.isFinite(Number(data.avg60prev))
    ? Number(data.avg60prev)
    : avg30;
  const rScore = Number.isFinite(Number(data.rScore)) ? Number(data.rScore) : 1;
  if (!Number.isFinite(avg30) || avg30 < 0) return null;
  return {
    annualUsd: Math.round(avg30 * 365),
    avg30,
    avg60prev,
    rScore,
  };
}
