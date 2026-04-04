/**
 * Active / désactive `setFeesEnabled` sur les deux mocks (owner uniquement).
 * Même auth que crank : PRIVATE_KEY + CRANK_SECRET optionnel.
 *
 * POST body JSON : { "enabled": true | false }
 */

import { NextResponse } from "next/server";
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ADDRESSES } from "@/contracts";

export const dynamic = "force-dynamic";

const ABI = parseAbi(["function setFeesEnabled(bool enabled) external"]);

function normalizePk(raw: string): `0x${string}` {
  const t = raw.trim();
  return (t.startsWith("0x") ? t : `0x${t}`) as `0x${string}`;
}

export async function POST(request: Request) {
  const secret = process.env.CRANK_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const pkRaw = process.env.PRIVATE_KEY?.trim();
  if (!pkRaw) {
    return NextResponse.json({ error: "PRIVATE_KEY not set" }, { status: 503 });
  }

  let body: { enabled?: boolean };
  try {
    body = (await request.json()) as { enabled?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "expected { enabled: boolean }" }, { status: 400 });
  }

  let account;
  try {
    account = privateKeyToAccount(normalizePk(pkRaw));
  } catch {
    return NextResponse.json({ error: "invalid PRIVATE_KEY" }, { status: 500 });
  }

  const rpc =
    process.env.SEPOLIA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() ||
    "https://rpc.sepolia.org";
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpc),
  });

  const results: { label: string; hash?: string; ok: boolean; error?: string }[] = [];

  for (const [label, address] of [
    ["Base", ADDRESSES.mockBase],
    ["Polygon", ADDRESSES.mockPolygon],
  ] as const) {
    try {
      const hash = await client.writeContract({
        address,
        abi: ABI,
        functionName: "setFeesEnabled",
        args: [body.enabled],
      });
      results.push({ label, ok: true, hash });
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: string }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      results.push({ label, ok: false, error: msg });
    }
  }

  const allOk = results.every((r) => r.ok);
  /** Always 200: the client reads `allOk` + `results` (avoids "Bad Gateway" on owner failure). */
  return NextResponse.json({
    results,
    from: account.address,
    allOk,
  });
}
