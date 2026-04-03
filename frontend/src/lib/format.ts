/**
 * Format a number with commas as thousands separator.
 * Uses a deterministic approach to avoid SSR/client hydration mismatches.
 */
export function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
