/**
 * Ajuste `setFeeBounds(min, max)` sur les deux mocks (USDC 6 décimales).
 *
 * POST JSON :
 * - `{ "halve": true }` — divise min/max par 2 sur chaque mock (plancher min ≥ 1 wei).
 * - `{ "minFeeUsdc": 0.05, "maxFeeUsdc": 12.5 }` — bornes explicites (nombres humains).
 *
 * Owner uniquement : même clé que les autres routes mock (`MOCK_CRANK_PRIVATE_KEY`).
 */

import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ADDRESSES } from "@/contracts";

export const dynamic = "force-dynamic";

const READ_ABI = parseAbi([
  "function minFeeUsdc() view returns (uint256)",
  "function maxFeeUsdc() view returns (uint256)",
]);
const WRITE_ABI = parseAbi([
  "function setFeeBounds(uint256 _min, uint256 _max) external",
]);

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

function rpcUrl() {
  return (
    process.env.SEPOLIA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() ||
    "https://rpc.sepolia.org"
  );
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  const pkRaw = process.env.MOCK_CRANK_PRIVATE_KEY?.trim();
  if (!pkRaw) {
    return NextResponse.json({ error: "MOCK_CRANK_PRIVATE_KEY not set" }, { status: 503 });
  }

  let body: { halve?: boolean; minFeeUsdc?: number; maxFeeUsdc?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pk = normalizePk(pkRaw);
  let account;
  try {
    account = privateKeyToAccount(pk);
  } catch {
    return NextResponse.json({ error: "invalid MOCK_CRANK_PRIVATE_KEY" }, { status: 500 });
  }

  const transport = http(rpcUrl());
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });

  const targets = [
    { label: "Base", address: ADDRESSES.mockBase },
    { label: "Polygon", address: ADDRESSES.mockPolygon },
  ] as const;

  const results: {
    label: string;
    ok: boolean;
    hash?: string;
    min?: string;
    max?: string;
    error?: string;
  }[] = [];

  for (const t of targets) {
    try {
      let minB: bigint;
      let maxB: bigint;

      if (body.halve === true) {
        const min = await publicClient.readContract({
          address: t.address,
          abi: READ_ABI,
          functionName: "minFeeUsdc",
        });
        const max = await publicClient.readContract({
          address: t.address,
          abi: READ_ABI,
          functionName: "maxFeeUsdc",
        });
        const halfMin = min / BigInt(2);
        minB = halfMin === BigInt(0) ? BigInt(1) : halfMin;
        const halfMax = max / BigInt(2);
        maxB = halfMax >= minB ? halfMax : minB;
      } else if (
        typeof body.minFeeUsdc === "number" &&
        typeof body.maxFeeUsdc === "number" &&
        Number.isFinite(body.minFeeUsdc) &&
        Number.isFinite(body.maxFeeUsdc) &&
        body.minFeeUsdc > 0 &&
        body.maxFeeUsdc >= body.minFeeUsdc
      ) {
        minB = parseUnits(body.minFeeUsdc.toFixed(6), 6);
        maxB = parseUnits(body.maxFeeUsdc.toFixed(6), 6);
      } else {
        return NextResponse.json(
          {
            error: "expected { halve: true } or { minFeeUsdc, maxFeeUsdc } (positive, max >= min)",
          },
          { status: 400 }
        );
      }

      const hash = await walletClient.writeContract({
        address: t.address,
        abi: WRITE_ABI,
        functionName: "setFeeBounds",
        args: [minB, maxB],
      });
      results.push({
        label: t.label,
        ok: true,
        hash,
        min: minB.toString(),
        max: maxB.toString(),
      });
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: string }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      results.push({ label: t.label, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    results,
    from: account.address,
    allOk: results.every((r) => r.ok),
  });
}
