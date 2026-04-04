/**
 * Appelle `setSplitter(address)` sur MockQuickswapBase + MockQuickswapPolygon.
 * Réservé à l’owner des mocks (souvent la même clé que `setFeesEnabled` si ownership transférée).
 *
 * POST JSON : { "splitter": "0x..." } — adresse du Router du stream (Factory `getStream`).
 *
 * Env : MOCK_CRANK_PRIVATE_KEY, CRANK_SECRET (optionnel),
 * SEPOLIA_RPC_URL ou NEXT_PUBLIC_SEPOLIA_RPC_URL.
 */

import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ADDRESSES } from "@/contracts";

export const dynamic = "force-dynamic";

const ABI = parseAbi(["function setSplitter(address _newSplitter) external"]);

function normalizePk(raw: string): `0x${string}` {
  const t = raw.trim();
  return (t.startsWith("0x") ? t : `0x${t}`) as `0x${string}`;
}

function authorize(request: Request): NextResponse | null {
  const secret = process.env.CRANK_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  return null;
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  const pkRaw = process.env.MOCK_CRANK_PRIVATE_KEY?.trim();
  if (!pkRaw) {
    return NextResponse.json(
      { error: "MOCK_CRANK_PRIVATE_KEY not set" },
      { status: 503 }
    );
  }

  let body: { splitter?: string };
  try {
    body = (await request.json()) as { splitter?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const splitter = body.splitter?.trim() ?? "";
  if (!isAddress(splitter)) {
    return NextResponse.json(
      { error: "expected { splitter: \"0x...\" } (address)" },
      { status: 400 }
    );
  }

  let account;
  try {
    account = privateKeyToAccount(normalizePk(pkRaw));
  } catch {
    return NextResponse.json({ error: "invalid MOCK_CRANK_PRIVATE_KEY" }, { status: 500 });
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

  const targets = [
    { label: "Base", address: ADDRESSES.mockBase },
    { label: "Polygon", address: ADDRESSES.mockPolygon },
  ] as const;

  const results: { label: string; hash?: string; ok: boolean; error?: string }[] = [];

  for (const t of targets) {
    try {
      const hash = await client.writeContract({
        address: t.address,
        abi: ABI,
        functionName: "setSplitter",
        args: [splitter as `0x${string}`],
      });
      results.push({ label: t.label, ok: true, hash });
    } catch (e: unknown) {
      const ex = e as { shortMessage?: string };
      const msg =
        typeof ex.shortMessage === "string"
          ? ex.shortMessage
          : e instanceof Error
            ? e.message
            : String(e);
      results.push({ label: t.label, ok: false, error: msg });
    }
  }

  const anyOk = results.some((r) => r.ok);
  return NextResponse.json(
    {
      results,
      from: account.address,
      hint: anyOk
        ? undefined
        : "Vérifie que MOCK_CRANK_PRIVATE_KEY est owner des mocks (transferOwnership).",
    },
    { status: anyOk ? 200 : 502 }
  );
}
