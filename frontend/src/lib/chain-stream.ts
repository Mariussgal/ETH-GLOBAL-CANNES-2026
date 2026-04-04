import type { StreamData } from "@/components/StreamCard";
import { formatUnits } from "viem";

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
  priceFloorRaw: bigint | undefined
): StreamData {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const { streamBps, discountBps, startTime, endTime, capitalRaised } = streamParams;
  const durationDays = Number((endTime - startTime) / BigInt(86400));
  const daysRemaining = endTime > now ? Number((endTime - now) / BigInt(86400)) : 0;
  const targetUsdc = Number(capitalRaised) / 1e6;
  const fillUsdc = Number(totalFeesReceived) / 1e6;

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
    ensName: `${record.protocolSlug} · issuer`,
    feePercent: Number(streamBps) / 100,
    duration: durationDays,
    daysRemaining,
    discount: Number(discountBps) / 100,
    vaultFill: fillUsdc,
    vaultTarget: targetUsdc,
    priceFloor,
    sources: ["SEPOLIA"],
    defaulted: false,
  };
}
