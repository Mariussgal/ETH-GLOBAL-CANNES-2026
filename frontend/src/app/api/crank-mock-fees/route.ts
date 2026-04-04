/**
 * Appelle `generateFees()` sur MockQuickswapBase + MockQuickswapPolygon (Sepolia).
 * Les frais USDC passent par le `splitter` de chaque mock (Router) → `depositFees` sur le vault.
 *
 * POST ou GET (pour Vercel Cron). Si `CRANK_SECRET` est défini : header
 * `Authorization: Bearer <CRANK_SECRET>`.
 *
 * Env : PRIVATE_KEY, CRANK_SECRET (optionnel),
 * SEPOLIA_RPC_URL ou NEXT_PUBLIC_SEPOLIA_RPC_URL (recommandé : même URL Alchemy que le client).
 */

import { NextResponse } from "next/server";
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ADDRESSES } from "@/contracts";

export const dynamic = "force-dynamic";

const MOCK_ABI = parseAbi(["function generateFees() external"]);

/** Sélecteurs d’erreurs custom MockQuickswapBase / Polygon (Solidity). */
const MOCK_ERROR_HINTS: Record<string, string> = {
  "0xf4d678b8":
    "InsufficientBalance — le mock n’a pas assez d’USDC Sepolia sur son adresse : envoyer du USDC test au contrat mock (≥ minFee, souvent ≥ 0,1 USDC).",
  "0x36c13ba1": "FeesDisabled — setFeesEnabled(true) (owner) ou interrupteur ON dans l’UI.",
  "0x2a35a324": "TooEarly — attendre le cooldown (minCooldown) entre deux generateFees.",
};

function hintForRevertError(message: string): string | undefined {
  const m = message.toLowerCase();
  for (const [sel, hint] of Object.entries(MOCK_ERROR_HINTS)) {
    if (m.includes(sel.slice(2).toLowerCase()) || m.includes(sel)) return hint;
  }
  if (m.includes("insufficientbalance") || m.includes("0xf4d678b8"))
    return MOCK_ERROR_HINTS["0xf4d678b8"];
  return undefined;
}

/** Revert attendu quand l’interrupteur a mis feesEnabled(false) — pas une vraie panne. */
function isFeesDisabledError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("0x36c13ba1") ||
    m.includes("feesdisabled") ||
    m.includes("fees disabled")
  );
}

/**
 * Certains RPC / viem renvoient ce texte au lieu du revert décodé quand generateFees revert
 * (ex. 2e tx après la 1re) — même contexte « fees OFF ».
 */
function isLikelyBenignRpcNoise(message: string): boolean {
  return (
    message.includes("Missing or invalid parameters") &&
    message.includes("Double check you have provided")
  );
}

function isExpectedSkipAfterFeesOff(message: string | undefined): boolean {
  if (!message) return false;
  return isFeesDisabledError(message) || isLikelyBenignRpcNoise(message);
}

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
  const pkRaw = process.env.PRIVATE_KEY?.trim();
  if (!pkRaw) {
    return NextResponse.json(
      {
        error: "PRIVATE_KEY not set",
        hint: "Add a Sepolia-funded wallet key to crank mock fees on-chain.",
      },
      { status: 503 }
    );
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
      const ex = e as { shortMessage?: string; details?: string; cause?: unknown };
      const msg =
        typeof ex.shortMessage === "string"
          ? ex.shortMessage
          : e instanceof Error
            ? e.message
            : String(e);
      const details =
        typeof ex.details === "string"
          ? ex.details
          : ex.cause instanceof Error
            ? ex.cause.message
            : undefined;
      const full = details && !msg.includes(details) ? `${msg} — ${details}` : msg;
      const hint = hintForRevertError(full);
      results.push({
        label: t.label,
        address: t.address,
        ok: false,
        error: hint ? `${full} → ${hint}` : full,
      });
    }
  }

  const anyOk = results.some((r) => r.ok);
  const allFeesDisabled =
    results.length >= 2 &&
    results.every((r) => !r.ok && r.error && isExpectedSkipAfterFeesOff(r.error));

  /**
   * Après OFF, un dernier tick peut encore appeler generateFees → revert sur les deux mocks.
   * HTTP 200 + `allFeesDisabled` pour éviter 502 / Bad Gateway dans la console navigateur.
   */
  const httpOk = anyOk || allFeesDisabled;

  return NextResponse.json(
    {
      results,
      cranker: account.address,
      allFeesDisabled,
    },
    { status: httpOk ? 200 : 502 }
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
