import type { StreamData } from "@/components/StreamCard";

/** Demo data — aligned with the YSM attack plan */
/** IDs 201+ reserved for 1–N on-chain streams (Factory `streamKeys`) */
export const MOCK_STREAMS: StreamData[] = [

  {
    id: 204,
    protocol: "quickswap-v4",
    ensName: "quickswap.eth",
    feePercent: 12,
    duration: 365,
    daysRemaining: 300,
    discount: 20,
    vaultFill: 1_200_000,
    vaultTarget: 1_200_000,
    priceFloor: 1.15,
    sources: ["BASE", "ARBITRUM"],
    defaulted: false,
  },
];

export function getStreamById(id: string | number): StreamData | undefined {
  const n = typeof id === "string" ? parseInt(id, 10) : id;
  if (Number.isNaN(n)) return undefined;
  return MOCK_STREAMS.find((s) => s.id === n);
}
