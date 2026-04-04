import type { StreamData } from "@/components/StreamCard";
import { formatUnits } from "viem";

/** USDC levés au primaire : aligné Factory mint × PrimarySale (wei YST vendus / 1e12 → raw USDC 6 dec). */
const YST_WEI_PER_USDC_RAW = BigInt("1000000000000");

export function primaryMarketRaisedUsdc(
  capYstWei: bigint,
  emitterYstBalanceWei: bigint
): number {
  if (emitterYstBalanceWei >= capYstWei) return 0;
  const soldWei = capYstWei - emitterYstBalanceWei;
  const usdcRaw6 = soldWei / YST_WEI_PER_USDC_RAW;
  try {
    return parseFloat(formatUnits(usdcRaw6, 6));
  } catch {
    return Number(usdcRaw6) / 1e6;
  }
}

export function parseVaultStreamTuple(raw: unknown): {
  totalYST: bigint;
  streamBps: bigint;
  discountBps: bigint;
  startTime: bigint;
  endTime: bigint;
  capitalRaised: bigint;
  active: boolean;
} | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const [totalYST, streamBps, discountBps, startTime, endTime, capitalRaised, active] = raw;
    return {
      totalYST: totalYST as bigint,
      streamBps: streamBps as bigint,
      discountBps: discountBps as bigint,
      startTime: startTime as bigint,
      endTime: endTime as bigint,
      capitalRaised: capitalRaised as bigint,
      active: Boolean(active),
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    totalYST: o.totalYST as bigint,
    streamBps: o.streamBps as bigint,
    discountBps: o.discountBps as bigint,
    startTime: o.startTime as bigint,
    endTime: o.endTime as bigint,
    capitalRaised: o.capitalRaised as bigint,
    active: Boolean(o.active),
  };
}

export function parseFactoryRecord(raw: unknown): {
  splitter: `0x${string}`;
  vault: `0x${string}`;
  ystToken: `0x${string}`;
  emitter: `0x${string}`;
  protocolSlug: string;
  createdAt: bigint;
  active: boolean;
} | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const [splitter, vault, ystToken, emitter, protocolSlug, createdAt, active] = raw;
    return {
      splitter: splitter as `0x${string}`,
      vault: vault as `0x${string}`,
      ystToken: ystToken as `0x${string}`,
      emitter: emitter as `0x${string}`,
      protocolSlug: String(protocolSlug),
      createdAt: createdAt as bigint,
      active: Boolean(active),
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    splitter: o.splitter as `0x${string}`,
    vault: o.vault as `0x${string}`,
    ystToken: o.ystToken as `0x${string}`,
    emitter: o.emitter as `0x${string}`,
    protocolSlug: String(o.protocolSlug),
    createdAt: o.createdAt as bigint,
    active: Boolean(o.active),
  };
}

export function buildChainStreamCardData(
  indexOneBased: number,
  record: NonNullable<ReturnType<typeof parseFactoryRecord>>,
  streamParams: NonNullable<ReturnType<typeof parseVaultStreamTuple>>,
  totalFeesReceived: bigint,
  priceFloorRaw: bigint | undefined,
  opts?: {
    /** Si défini : levée marché primaire (USDC), pas les frais vault. */
    emitterYstBalanceWei?: bigint;
    /** Supply YST « réelle » (souvent `totalSupply()`), plus fiable que `stream.totalYST` seul. */
    capYstWei?: bigint;
  }
): StreamData {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const { streamBps, discountBps, startTime, endTime, capitalRaised, totalYST } = streamParams;
  const durationDays = Number((endTime - startTime) / BigInt(86400));
  const daysRemaining = endTime > now ? Number((endTime - now) / BigInt(86400)) : 0;
  const targetUsdc = Number(capitalRaised) / 1e6;
  const capForPrimary = opts?.capYstWei ?? totalYST;
  const fillUsdc =
    opts?.emitterYstBalanceWei !== undefined
      ? primaryMarketRaisedUsdc(capForPrimary, opts.emitterYstBalanceWei)
      : Number(totalFeesReceived) / 1e6;

  let priceFloor = 0;
  if (priceFloorRaw !== undefined && priceFloorRaw > BigInt(0)) {
    try {
      priceFloor = parseFloat(formatUnits(priceFloorRaw, 18));
    } catch {
      priceFloor = 0;
    }
  }


  return {
    id: indexOneBased,
    protocol: record.protocolSlug,
    ensName: `${record.protocolSlug}.ysm.eth`,
    feePercent: Number(streamBps) / 100,
    duration: durationDays,
    daysRemaining,
    discount: Number(discountBps) / 100,
    vaultFill: fillUsdc,
    vaultTarget: targetUsdc,
    nominalRaiseCapUsdc: targetUsdc,
    totalTokenSupply: Number(capForPrimary) / 1e12 / 1e6, // Conversion 18 → 6 dec pour affichage "humain"
    priceFloor,
    sources: ["SEPOLIA"],
    defaulted: false,
    createdAt: Number(record.createdAt),
  };
}
