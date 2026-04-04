import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { fetchInvestorClaimsEtherscan } from "@/lib/etherscanInvestorClaims";

const MAX_VAULTS = 400;

type Body = {
  vaults?: string[];
  user?: string;
};

/**
 * Historique `RewardsClaimed` via [Etherscan API V2](https://docs.etherscan.io/api-reference/endpoint/getlogs-topics.md)
 * (topic0 + topic1 for the user, then server-side filter on Arc vaults).
 * Clé : `ETHERSCAN_API_KEY` ou `NEXT_PUBLIC_ETHERSCAN_API_KEY` dans `.env.local`.
 */
export async function POST(req: Request) {
  const apiKey =
    process.env.ETHERSCAN_API_KEY?.trim() ??
    process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { ok: false as const, error: "no_etherscan_key" },
      { status: 200 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "invalid_json" },
      { status: 400 }
    );
  }

  const userRaw = body.user?.trim();
  const vaultsRaw = body.vaults;

  if (!userRaw || !isAddress(userRaw)) {
    return NextResponse.json(
      { ok: false as const, error: "invalid_user" },
      { status: 400 }
    );
  }

  if (!Array.isArray(vaultsRaw)) {
    return NextResponse.json(
      { ok: false as const, error: "invalid_vaults" },
      { status: 400 }
    );
  }

  if (vaultsRaw.length > MAX_VAULTS) {
    return NextResponse.json(
      { ok: false as const, error: "too_many_vaults" },
      { status: 400 }
    );
  }

  const vaults: `0x${string}`[] = [];
  const seen = new Set<string>();
  for (const v of vaultsRaw) {
    if (typeof v !== "string" || !isAddress(v)) continue;
    const a = getAddress(v);
    const k = a.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    vaults.push(a);
  }

  if (vaults.length === 0) {
    return NextResponse.json(
      { ok: false as const, error: "no_valid_vaults" },
      { status: 400 }
    );
  }

  try {
    const user = getAddress(userRaw);
    const { entries, totalClaimedUsdc } = await fetchInvestorClaimsEtherscan(
      apiKey,
      vaults,
      user
    );
    return NextResponse.json({
      ok: true as const,
      source: "etherscan" as const,
      entries,
      totalClaimedUsdc,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 200 }
    );
  }
}
