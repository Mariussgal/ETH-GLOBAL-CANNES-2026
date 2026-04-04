import { NextResponse } from "next/server";
import { ADDRESSES } from "@/contracts";
import {
  fetchFeesGeneratedLogsEtherscan,
  getSepoliaBlockNumberEtherscan,
  serializeLog,
  TOTAL_HISTORY_LOOKBACK_BLOCKS,
} from "@/lib/etherscanFeesLogs";

/**
 * Historique FeesGenerated pour le LIVE ACTIVITY FEED.
 * The key is read server-side (.env.local) — no need for NEXT_PUBLIC to be injected into the client bundle.
 */
export async function GET() {
  const apiKey =
    process.env.ETHERSCAN_API_KEY?.trim() ??
    process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { ok: false as const, error: "no_etherscan_key" },
      { status: 200 }
    );
  }

  try {
    const latest = await getSepoliaBlockNumberEtherscan(apiKey);
    const fromBlock =
      latest > TOTAL_HISTORY_LOOKBACK_BLOCKS
        ? latest - TOTAL_HISTORY_LOOKBACK_BLOCKS
        : BigInt(0);

    // Etherscan free ~3 req/s : espacer eth_blockNumber et le 1er getLogs (sinon NOTOK rate limit)
    await new Promise((r) => setTimeout(r, 1100));

    // Séquentiel : Etherscan free ~3 req/s — éviter Promise.all + rafales sur getLogs
    const baseLogs = await fetchFeesGeneratedLogsEtherscan(
      apiKey,
      ADDRESSES.mockBase,
      fromBlock,
      latest
    );
    await new Promise((r) => setTimeout(r, 1100));
    const polyLogs = await fetchFeesGeneratedLogsEtherscan(
      apiKey,
      ADDRESSES.mockPolygon,
      fromBlock,
      latest
    );

    return NextResponse.json({
      ok: true as const,
      latest: latest.toString(),
      baseLogs: baseLogs.map(serializeLog),
      polyLogs: polyLogs.map(serializeLog),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 200 }
    );
  }
}
