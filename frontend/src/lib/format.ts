/**
 * Format a number with commas as thousands separator on the integer part only.
 * Avoids `298,114.2,857` when the value has decimals (ancien bug : regex sur toute la chaîne).
 * Décimales : jusqu’à 2 pour les montants non entiers.
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const roundedInt = Math.round(n);
  const isIntegerLike = Math.abs(n - roundedInt) < 1e-4;
  const str = isIntegerLike ? String(roundedInt) : n.toFixed(2);
  const [intRaw, frac] = str.split(".");
  const neg = intRaw.startsWith("-");
  const core = neg ? intRaw.slice(1) : intRaw;
  const grouped = core.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const intPart = neg ? `-${grouped}` : grouped;
  return frac !== undefined ? `${intPart}.${frac}` : intPart;
}
