/** Persistance locale du Live Activity Feed (historique réel après F5) */

export type PersistedFeedItem = {
  id: number;
  time: string;
  amount: number;
  protocol: string;
  chainLabel: string;
  txHash?: `0x${string}`;
};

export const FEED_PERSIST_MAX = 10;

export function feedStorageKey(streamId: number): string {
  return `ysm-arc-activity-feed:v2:${streamId}`;
}

export function loadFeedFromStorage(streamId: number): PersistedFeedItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(feedStorageKey(streamId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const rows = parsed.slice(0, FEED_PERSIST_MAX) as PersistedFeedItem[];
    if (!rows.every((r) => typeof r?.id === "number" && typeof r?.time === "string")) return null;
    return rows;
  } catch {
    return null;
  }
}

export function saveFeedToStorage(streamId: number, items: readonly PersistedFeedItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      feedStorageKey(streamId),
      JSON.stringify(items.slice(0, FEED_PERSIST_MAX))
    );
  } catch {
    //
  }
}

export function nextFeedIdAfterHydration(items: readonly PersistedFeedItem[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((r) => r.id)) + 1;
}
