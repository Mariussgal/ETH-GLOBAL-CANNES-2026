import type { StreamData } from "@/components/StreamCard";

/** Demo data — aligned with the YSM attack plan */
/** IDs 201+ reserved for 1–N on-chain streams (Factory `streamKeys`) */
export const MOCK_STREAMS: StreamData[] = [];

export function getStreamById(id: string | number): StreamData | undefined {
  const n = typeof id === "string" ? parseInt(id, 10) : id;
  if (Number.isNaN(n)) return undefined;
  return MOCK_STREAMS.find((s) => s.id === n);
}
