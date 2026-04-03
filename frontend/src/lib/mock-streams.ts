import type { StreamData } from "@/components/StreamCard";

/** Données démo — alignées sur le plan d’attaque YSM */
export const MOCK_STREAMS: StreamData[] = [
  {
    id: 1,
    protocol: "quickswap-v3",
    ensName: "quickswap.eth",
    feePercent: 10,
    duration: 365,
    daysRemaining: 185,
    discount: 30,
    vaultFill: 724_100,
    vaultTarget: 2_534_000,
    priceFloor: 0.8012,
    sources: ["BASE", "POLYGON"],
    defaulted: false,
  },
  {
    id: 2,
    protocol: "mockbase-dex",
    ensName: "mockbase.eth",
    feePercent: 10,
    duration: 180,
    daysRemaining: 142,
    discount: 15,
    vaultFill: 18_200,
    vaultTarget: 45_000,
    priceFloor: 0.9214,
    sources: ["BASE"],
    defaulted: false,
  },
  {
    id: 3,
    protocol: "defi-ghost",
    ensName: "defighost.eth",
    feePercent: 8,
    duration: 365,
    daysRemaining: 0,
    discount: 50,
    vaultFill: 3_100,
    vaultTarget: 95_000,
    priceFloor: 0.0326,
    sources: ["POLYGON"],
    defaulted: true,
  },
  {
    id: 4,
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
