import { formatUnits, parseUnits } from "viem";

/**
 * Même formule que `PrimarySale.buy` :
 * `ystOut = (amountUsdc * 10**decimals) / 1_000_000`
 */
export function ystWeiFromUsdcAmount(amountUsdc: bigint, ystDecimals: number): bigint {
  if (ystDecimals < 0 || ystDecimals > 77) return BigInt(0);
  const factor = parseUnits("1", ystDecimals);
  return (amountUsdc * factor) / BigInt(1_000_000);
}

/** Montant YST « humain » pour un montant USDC (aligné on-chain). */
export function ystHumanFromUsdc(usdcHuman: number, ystDecimals: number): number {
  if (usdcHuman <= 0 || !Number.isFinite(usdcHuman)) return 0;
  const amount = parseUnits(usdcHuman.toFixed(6), 6);
  const wei = ystWeiFromUsdcAmount(amount, ystDecimals);
  return parseFloat(formatUnits(wei, ystDecimals));
}
