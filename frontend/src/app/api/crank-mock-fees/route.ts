/**
 * Appelle `generateFees()` sur MockQuickswapBase + MockQuickswapPolygon (Sepolia).
 * Les frais USDC passent par le `splitter` de chaque mock (Router) → `depositFees` sur le vault.
 *
 * POST ou GET (pour Vercel Cron). Si `CRANK_SECRET` est défini : header
 * `Authorization: Bearer <CRANK_SECRET>`.
 *
 * Env : MOCK_CRANK_PRIVATE_KEY, CRANK_SECRET (optionnel), SEPOLIA_RPC_URL (optionnel).
 */

import { NextResponse } from "next/server";
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ADDRESSES } from "@/contracts";

export const dynamic = "force-dynamic";

const MOCK_ABI = parseAbi(["function generateFees() external"]);

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

async function runCrank(): Promise<NextResponse> {
  const pkRaw = process.env.MOCK_CRANK_PRIVATE_KEY?.trim();
  if (!pkRaw) {
    return NextResponse.json(
      {
        error: "MOCK_CRANK_PRIVATE_KEY not set",
        hint: "Add a Sepolia-funded wallet key to crank mock fees on-chain.",
      },
      { status: 503 }
    );
  }

  let account;
  try {
    account = privateKeyToAccount(normalizePk(pkRaw));
  } catch {
    return NextResponse.json({ error: "invalid MOCK_CRANK_PRIVATE_KEY" }, { status: 500 });
  }

  const rpc = process.env.SEPOLIA_RPC_URL?.trim() || "https://rpc.sepolia.org";
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpc),
  });

  const targets = [
    { label: "Base", address: ADDRESSES.mockBase },
    { label: "Polygon", address: ADDRESSES.mockPolygon },
  ] as const;

  const results: {
    label: string;
    address: string;
    ok: boolean;
    hash?: string;
    error?: string;
  }[] = [];

  for (const t of targets) {
    try {
      const hash = await client.writeContract({
        address: t.address,
        abi: MOCK_ABI,
        functionName: "generateFees",
      });
      results.push({ label: t.label, address: t.address, ok: true, hash });
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: string }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      results.push({ label: t.label, address: t.address, ok: false, error: msg });
    }
  }

  const anyOk = results.some((r) => r.ok);
  return NextResponse.json(
    { results, cranker: account.address },
    { status: anyOk ? 200 : 502 }
  );
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  return runCrank();
}

/** Vercel Cron envoie souvent un GET — même logique que POST. */
export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  return runCrank();
}
