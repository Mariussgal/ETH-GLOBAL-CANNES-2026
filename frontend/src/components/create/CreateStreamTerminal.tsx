"use client";

import Header from "@/components/Header";
import SegmentedProgress from "@/components/SegmentedProgress";
import {
  aggregatorV3LatestRoundAbi,
  ETH_USD_AGGREGATOR_V3,
} from "@/lib/chainlink-feeds";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useEnsName,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { ADDRESSES, SEPOLIA_CHAIN_ID, STREAM_FACTORY_ABI } from "@/contracts";
import { fetchFeesFromProxy } from "@/lib/fees-proxy";
import { formatNumber } from "@/lib/format";
import { computeStreamKey } from "@/lib/stream-key";
import type { Address } from "viem";

const ENS_APP = "https://app.ens.domains";

/** CRE-style mock components (σ, R, trend) — animés via SegmentedProgress */
const CRE_COMPONENTS = {
  volatility: { label: "VOLATILITY (σ)", max: 100, value: 62, status: "warning" as const },
  regularity: { label: "REGULARITY (R_SCORE)", max: 100, value: 78, status: "success" as const },
  trendPenalty: { label: "TREND_PENALTY", max: 100, value: 45, status: "neutral" as const },
};

function formatUsdFromAnswer(answer: bigint): string {
  const n = Number(answer) / 1e8;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Risque marché 0–100 à partir de la fraîcheur du round Chainlink (updatedAt).
 * Oracle récent → score bas ; données stale → score élevé (décote plus forte).
 */
function marketRiskFromOracleUpdatedAt(updatedAtSeconds: bigint): number {
  const u = Number(updatedAtSeconds);
  if (!Number.isFinite(u) || u <= 0) return 55;
  const now = Math.floor(Date.now() / 1000);
  const ageSec = Math.max(0, now - u);
  const SOFT = 180; // ~3 min
  const HARD = 7200; // 2 h → plafond risque
  if (ageSec <= SOFT) {
    return Math.round(10 + (ageSec / SOFT) * 22);
  }
  return Math.min(
    100,
    Math.round(32 + ((ageSec - SOFT) / Math.max(1, HARD - SOFT)) * 68)
  );
}

/** Décote % (5–55) agrégée sur σ, R, trend et risque marché — pas une « recommandation », sortie du modèle CRE affiché. */
function computeCreDecotePercent(
  volatility: number,
  regularity: number,
  trendPenalty: number,
  marketRisk: number
): number {
  const stress =
    0.26 * volatility +
    0.26 * (100 - regularity) +
    0.24 * trendPenalty +
    0.24 * marketRisk;
  const pct = Math.round(5 + (stress / 100) * 50);
  return Math.min(55, Math.max(5, pct));
}

/** Affichage USDC avec au plus une décimale (ex. 11 923,1). */
function formatUsdcShort(n: number): string {
  const v = Math.round(n * 10) / 10;
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

/** Label ENS → base du slug ; le nom ERC20 on-chain = le slug Factory exact (ex. nohemmg-s2), symbole `YST`. */
function protocolSlugFromEns(ens: string | undefined | null): string {
  if (!ens?.trim()) return "";
  const lower = ens.trim().toLowerCase();
  const withoutEth = lower.endsWith(".eth") ? lower.slice(0, -4) : lower;
  const firstLabel = withoutEth.split(".")[0] ?? "";
  const slug = firstLabel.replace(/[^a-z0-9-]/g, "").slice(0, 48);
  return slug;
}

/** Saisie utilisateur pour le lookup DeFiLlama (démo / hackathon) — même alphabet que les slugs Llama. */
function normalizeFeesSlugOverride(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
}

/** Suffixe après le slug ENS pour `createStreamDirect` — plusieurs streams / même identité démo. */
function normalizeDeploySuffix(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
}

function demoDeploySeqStorageKey(wallet: string): string {
  return `arc-demo-deploy-seq:${wallet.toLowerCase()}`;
}

export default function CreateStreamTerminal() {
  const router = useRouter();
  const publicClient = usePublicClient({ chainId: SEPOLIA_CHAIN_ID });
  const { address, status, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    data: receipt,
    isPending: isConfirming,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: sepolia.id,
    query: {
      enabled: Boolean(txHash),
    },
  });

  /** Vrai seulement après un clic DEPLOY : tx envoyée, attente d’inclusion (pas d’état fantôme sans hash). */
  const awaitingReceipt = Boolean(txHash) && isConfirming;

  /** Primary ENS : mainnet et Sepolia (souvent seul le testnet est configuré pour le hackathon). */
  const {
    data: ensNameMainnet,
    isPending: isEnsPendingMainnet,
  } = useEnsName({
    address,
    chainId: mainnet.id,
    query: { enabled: Boolean(address) },
  });

  const {
    data: ensNameSepolia,
    isPending: isEnsPendingSepolia,
  } = useEnsName({
    address,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  });

  const ensName = ensNameSepolia ?? ensNameMainnet;
  const isEnsPending = isEnsPendingMainnet || isEnsPendingSepolia;

  const identityBlocked =
    isConnected && !isEnsPending && !ensName;

  const identityReady =
    isConnected && !isEnsPending && Boolean(ensName);

  /** Toujours Sepolia : même feed que les contrats Arc sur testnet, lecture via RPC sans dépendre du réseau du wallet. */
  const sepoliaEthUsdFeed = ETH_USD_AGGREGATOR_V3[SEPOLIA_CHAIN_ID];

  const {
    data: roundData,
    isPending: isFeedPending,
    isError: isFeedError,
  } = useReadContract({
    address: sepoliaEthUsdFeed,
    abi: aggregatorV3LatestRoundAbi,
    functionName: "latestRoundData",
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: identityReady,
    },
  });

  const ethUsdDisplay = useMemo(() => {
    if (!roundData) return null;
    const answer = roundData[1];
    return formatUsdFromAnswer(answer);
  }, [roundData]);

  const marketRiskValue = useMemo(() => {
    if (isFeedError || !roundData) return 55;
    return marketRiskFromOracleUpdatedAt(roundData[3]);
  }, [roundData, isFeedError]);

  /** Part des revenus annuels estimés que vous cédez (1–50 %). */
  const [revenuePct, setRevenuePct] = useState(10);
  const revenueTrackRef = useRef<HTMLDivElement>(null);
  /** Évite un double +1 localStorage en React Strict Mode sur la même tx. */
  const deploySeqBumpedForTxHash = useRef<string | null>(null);

  const setRevenuePctFromClientX = useCallback((clientX: number) => {
    const el = revenueTrackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const ratio = rect.width > 0 ? x / rect.width : 0;
    const v = Math.max(1, Math.min(50, Math.round(ratio * 49) + 1));
    setRevenuePct(v);
  }, []);

  const [durationMonths, setDurationMonths] = useState(12);
  /** Annualisation avg30×365 depuis le proxy DeFiLlama (workflow CRE). */
  const [annualRevenueUsd, setAnnualRevenueUsd] = useState(0);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState<string | null>(null);
  const [feesStats, setFeesStats] = useState<{
    avg30: number;
    avg60prev: number;
    rScore: number;
  } | null>(null);
  /**
   * Slug DeFiLlama optionnel (ex. uniswap). Vide = on tente le slug ENS.
   * Indépendant du slug passé à la Factory (`onChainDeploySlug`).
   */
  const [feesSlugOverrideInput, setFeesSlugOverrideInput] = useState("");
  /** Nombre de déploiements réussis déjà enregistrés (localStorage) — prochain slug auto : `{ens}-s{deploySeq+1}`. */
  const [deploySeq, setDeploySeq] = useState(0);
  /** Si non vide, remplace le suffixe auto `-sN` (ex. pitch2, demo-b). */
  const [customDeploySuffix, setCustomDeploySuffix] = useState("");

  /** Slug dérivé du label ENS ; repli court si le label ne donne aucun caractère [a-z0-9-] (sinon DEPLOY reste désactivé). */
  const protocolSlug = useMemo(() => {
    const fromEns = protocolSlugFromEns(ensName);
    if (fromEns.length > 0) return fromEns;
    if (address) return `emit${address.slice(2, 10).toLowerCase()}`;
    return "";
  }, [ensName, address]);

  useEffect(() => {
    if (!address) return;
    try {
      const raw = localStorage.getItem(demoDeploySeqStorageKey(address));
      setDeploySeq(raw ? Math.max(0, parseInt(raw, 10)) || 0 : 0);
    } catch {
      setDeploySeq(0);
    }
  }, [address]);

  /**
   * Slug exact passé à `createStreamDirect` — doit être unique par wallet pour éviter StreamAlreadyExists.
   * Démo : `{ens}-s1`, `{ens}-s2`, … ou suffixe personnalisé.
   */
  const onChainDeploySlug = useMemo(() => {
    if (!protocolSlug) return "";
    const custom = normalizeDeploySuffix(customDeploySuffix);
    if (custom.length > 0) return `${protocolSlug}-${custom}`;
    return `${protocolSlug}-s${deploySeq + 1}`;
  }, [protocolSlug, customDeploySuffix, deploySeq]);

  /** `keccak256(abi.encodePacked(onChainDeploySlug, msg.sender))` — collision si slug déjà utilisé. */
  const predictedStreamKey = useMemo(() => {
    if (!onChainDeploySlug || !address) return undefined;
    return computeStreamKey(onChainDeploySlug, address as Address);
  }, [onChainDeploySlug, address]);

  const { data: existingStreamRecord } = useReadContract({
    address: ADDRESSES.streamFactory,
    abi: STREAM_FACTORY_ABI,
    functionName: "getStream",
    args: predictedStreamKey ? [predictedStreamKey] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: Boolean(identityReady && predictedStreamKey),
      staleTime: 12_000,
    },
  });

  const { data: factoryStreamKeys } = useReadContract({
    address: ADDRESSES.streamFactory,
    abi: STREAM_FACTORY_ABI,
    functionName: "getAllStreamKeys",
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: Boolean(identityReady && predictedStreamKey),
      staleTime: 12_000,
    },
  });

  const existingStreamInvestId = useMemo(() => {
    if (!predictedStreamKey || !factoryStreamKeys?.length) return undefined;
    const pk = predictedStreamKey.toLowerCase();
    const i = factoryStreamKeys.findIndex((k) => k.toLowerCase() === pk);
    return i >= 0 ? i + 1 : undefined;
  }, [factoryStreamKeys, predictedStreamKey]);

  const streamAlreadyExists = Boolean(existingStreamRecord?.active);

  const feesLookupSlug = useMemo(() => {
    const o = normalizeFeesSlugOverride(feesSlugOverrideInput);
    if (o.length > 0) return o;
    return protocolSlug;
  }, [feesSlugOverrideInput, protocolSlug]);

  useEffect(() => {
    if (!identityReady || !feesLookupSlug) {
      setAnnualRevenueUsd(0);
      setFeesStats(null);
      setFeesError(null);
      setFeesLoading(false);
      return;
    }
    let cancelled = false;
    setFeesLoading(true);
    setFeesError(null);
    void (async () => {
      try {
        const payload = await fetchFeesFromProxy(feesLookupSlug);
        if (cancelled) return;
        if (!payload) {
          setFeesError(
            "Aucune donnée DeFiLlama pour ce slug — essayez un protocole listé (ex. uniswap, aave) dans le champ optionnel ci-dessus."
          );
          setAnnualRevenueUsd(0);
          setFeesStats(null);
          return;
        }
        setAnnualRevenueUsd(payload.annualUsd);
        setFeesStats({
          avg30: payload.avg30,
          avg60prev: payload.avg60prev,
          rScore: payload.rScore,
        });
      } catch (e) {
        if (!cancelled) {
          setFeesError(
            e instanceof Error
              ? e.message
              : "Impossible de charger les frais (réponse invalide ou réseau). Réessayez."
          );
          setAnnualRevenueUsd(0);
          setFeesStats(null);
        }
      } finally {
        if (!cancelled) setFeesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityReady, feesLookupSlug]);

  const creMetrics = useMemo(() => {
    if (!feesStats) {
      return {
        volatility: CRE_COMPONENTS.volatility,
        regularity: CRE_COMPONENTS.regularity,
        trendPenalty: CRE_COMPONENTS.trendPenalty,
      };
    }
    const { avg30, avg60prev, rScore } = feesStats;
    const denom = Math.max(avg30, avg60prev, 1);
    const volatility = Math.min(
      100,
      Math.round((100 * Math.abs(avg30 - avg60prev)) / denom)
    );
    const regularity = Math.min(
      100,
      Math.round((Math.min(2, Math.max(0, rScore)) / 2) * 100)
    );
    const trendPenalty = Math.min(
      100,
      Math.max(0, Math.round(50 + (volatility - regularity) * 0.5))
    );
    return {
      volatility: { ...CRE_COMPONENTS.volatility, value: volatility },
      regularity: { ...CRE_COMPONENTS.regularity, value: regularity },
      trendPenalty: { ...CRE_COMPONENTS.trendPenalty, value: trendPenalty },
    };
  }, [feesStats]);

  const creDecotePercent = useMemo(() => {
    return computeCreDecotePercent(
      creMetrics.volatility.value,
      creMetrics.regularity.value,
      creMetrics.trendPenalty.value,
      marketRiskValue
    );
  }, [creMetrics, marketRiskValue]);

  /** Tranche = revenu annuel × part cédée ; après décote CRE = tranche × (1 − décote). */
  const offeringEconomics = useMemo(() => {
    if (!Number.isFinite(annualRevenueUsd) || annualRevenueUsd <= 0) return null;
    const nominalUsd = annualRevenueUsd * (revenuePct / 100);
    const discountFrac = creDecotePercent / 100;
    const afterDiscountUsd = nominalUsd * (1 - discountFrac);
    return { nominalUsd, afterDiscountUsd };
  }, [annualRevenueUsd, revenuePct, creDecotePercent]);

  const onSepolia = activeChainId === SEPOLIA_CHAIN_ID;

  const deployReady =
    identityReady &&
    onSepolia &&
    protocolSlug.trim().length > 0 &&
    onChainDeploySlug.trim().length > 0 &&
    !streamAlreadyExists &&
    !isWritePending &&
    !awaitingReceipt &&
    Boolean(offeringEconomics && offeringEconomics.nominalUsd > 0);

  const deployBlockedHint = useMemo(() => {
    if (deployReady) return null;
    if (!isConnected || isEnsPending || !ensName) return null;
    if (!onSepolia) {
      return "Le bouton DEPLOY est inactif : passez d’abord sur le réseau Sepolia (bouton ci-dessus ou wallet).";
    }
    if (!protocolSlug.trim()) {
      return "Identifiant protocole indisponible — reconnectez le portefeuille.";
    }
    if (streamAlreadyExists) {
      return "Ce slug Factory existe déjà pour ce wallet — changez le suffixe démo (ou videz le champ pour passer au compteur auto suivant).";
    }
    if (feesLoading) {
      return "Chargement des frais protocole (DeFiLlama via proxy)…";
    }
    if (feesError || annualRevenueUsd <= 0) {
      return (
        feesError ??
        "Revenu annuel indisponible — renseignez un slug DeFiLlama dans le champ optionnel (ex. uniswap) ou vérifiez la connexion."
      );
    }
    if (isWritePending) {
      return "Une signature est attendue dans le wallet (vous venez de cliquer sur DEPLOY).";
    }
    if (awaitingReceipt) {
      return "Déploiement en cours : votre transaction est en attente d’inclusion sur Sepolia (souvent quelques secondes).";
    }
    if (!offeringEconomics || offeringEconomics.nominalUsd <= 0) {
      return "Montant d’offre invalide — vérifiez la part de revenus.";
    }
    return null;
  }, [
    deployReady,
    isConnected,
    isEnsPending,
    ensName,
    onSepolia,
    protocolSlug,
    onChainDeploySlug,
    streamAlreadyExists,
    feesLoading,
    feesError,
    annualRevenueUsd,
    isWritePending,
    awaitingReceipt,
    offeringEconomics,
  ]);

  const deploy = useCallback(() => {
    if (!deployReady || !offeringEconomics) return;
    const slug = onChainDeploySlug.trim();
    const nominalUsd = offeringEconomics.nominalUsd;
    if (!Number.isFinite(nominalUsd) || nominalUsd <= 0) return;
    const streamBps = BigInt(revenuePct * 100);
    if (streamBps < BigInt(100) || streamBps > BigInt(5000)) return;
    const durationDays = BigInt(durationMonths * 30);
    const capitalRaised = BigInt(Math.round(nominalUsd * 1e6));
    const discountBps = BigInt(creDecotePercent * 100);

    resetWrite();
    writeContract({
      address: ADDRESSES.streamFactory,
      abi: STREAM_FACTORY_ABI,
      functionName: "createStreamDirect",
      args: [slug, streamBps, durationDays, capitalRaised, discountBps],
      chainId: SEPOLIA_CHAIN_ID,
    });
  }, [
    deployReady,
    offeringEconomics,
    onChainDeploySlug,
    revenuePct,
    durationMonths,
    creDecotePercent,
    resetWrite,
    writeContract,
  ]);

  useEffect(() => {
    /** `isReceiptSuccess` = reçu RPC récupéré ; une tx peut être incluse avec `status: reverted`. */
    if (!receipt || receipt.status !== "success" || !publicClient) return;
    const txHashDone = receipt.transactionHash;
    if (address && txHashDone && deploySeqBumpedForTxHash.current !== txHashDone) {
      deploySeqBumpedForTxHash.current = txHashDone;
      try {
        const key = demoDeploySeqStorageKey(address);
        const raw = localStorage.getItem(key);
        const n = raw ? Math.max(0, parseInt(raw, 10)) || 0 : 0;
        const next = n + 1;
        localStorage.setItem(key, String(next));
        setDeploySeq(next);
      } catch {
        /* ignore */
      }
    }
    let cancelled = false;
    void (async () => {
      try {
        const keys = await publicClient.readContract({
          address: ADDRESSES.streamFactory,
          abi: STREAM_FACTORY_ABI,
          functionName: "getAllStreamKeys",
        });
        if (cancelled) return;
        const newId = keys.length;
        if (newId >= 1) {
          router.push(`/invest/${newId}`);
        }
      } catch {
        /* redirect optionnelle si lecture Factory échoue */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [receipt, publicClient, router, address]);

  const terminalBody = useMemo(() => {
    const lines: string[] = [];
    lines.push(`> PROTOCOL_SLUG (depuis ENS): ${protocolSlug || "—"}`);
    lines.push(`> DEPLOY_SLUG (Factory): ${onChainDeploySlug || "—"}`);
    lines.push(
      `> FEES_SLUG (DeFiLlama): ${feesLookupSlug || "—"}${normalizeFeesSlugOverride(feesSlugOverrideInput) ? " [override]" : ""}`
    );
    lines.push(`> YST_SYMBOL: YST (imposé par le Factory)`);
    lines.push(
      `> REV_ANNUEL_USD (DeFiLlama avg30×365): ${feesLoading ? "…" : formatNumber(Math.round(annualRevenueUsd))}`
    );
    lines.push(
      `> VOUS_VENDEZ (droits): ${offeringEconomics ? formatNumber(Math.round(offeringEconomics.nominalUsd)) : "—"} USDC`
    );
    lines.push(
      `> VOUS_RECEVEZ_NET: ${offeringEconomics ? formatUsdcShort(offeringEconomics.afterDiscountUsd) : "—"} USDC`
    );
    lines.push(`> TAUX_DECOTE_CRE: ${creDecotePercent}% (σ, R_SCORE, trend, ETH/USD feed)`);
    lines.push(`> FACTORY: ${ADDRESSES.streamFactory}`);
    lines.push(`> USDC: immutable in Factory constructor — not passed in createStreamDirect`);
    lines.push(`> MSG.VALUE: 0 ETH (no protocol fee on Factory)`);
    lines.push("");

    if (writeError) {
      const em = writeError.message;
      if (/StreamAlreadyExists/i.test(em)) {
        lines.push(
          "> ERROR: StreamAlreadyExists — ce DEPLOY_SLUG est déjà utilisé avec ce wallet. Changez le suffixe démo."
        );
      } else {
        lines.push(`> ERROR: ${em.slice(0, 280)}`);
      }
    } else if (receipt?.status === "reverted") {
      lines.push("> ÉCHEC ON-CHAIN (revert) — pas de vault, pas de redirection.");
      lines.push(
        "> Ex. NotOwner : mauvais contrat / fonction réservée au owner — vérifier l’adresse Factory déployée."
      );
    } else if (receipt?.status === "success") {
      lines.push("> DEPLOYMENT SUCCESSFUL. VAULT CREATED.");
      lines.push("> REDIRECTING TO INVEST VIEW…");
    } else if (awaitingReceipt) {
      lines.push("> DEPLOYING SMART CONTRACTS ON SEPOLIA...");
      lines.push(`> TX_HASH: ${txHash}`);
    } else if (isWritePending) {
      lines.push("> AWAITING WALLET CONFIRMATION...");
    } else {
      lines.push("> STATUS: IDLE — SUBMIT WHEN READY.");
    }
    return lines.join("\n");
  }, [
    protocolSlug,
    onChainDeploySlug,
    feesLookupSlug,
    feesSlugOverrideInput,
    annualRevenueUsd,
    feesLoading,
    creDecotePercent,
    revenuePct,
    offeringEconomics,
    writeError,
    receipt,
    txHash,
    awaitingReceipt,
    isWritePending,
  ]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-black text-text-primary">
      <Header />

      <main className="px-md sm:px-xl py-2xl max-w-[1400px] mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-md mb-2xl">
          <div>
            <Link
              href="/"
              className="font-mono text-label uppercase tracking-label text-text-disabled hover:text-text-secondary transition-colors duration-200 ease-nothing"
            >
              ← MARKETPLACE
            </Link>
            <h1 className="font-grotesk text-display-md text-text-display font-medium tracking-snug mt-md">
              Deploy stream
            </h1>
            <p className="font-grotesk text-body-sm text-text-secondary mt-sm max-w-md">
              Terminal protocole — configuration instrument + synthèse risque CRE.
            </p>
          </div>

          {mounted && identityReady && (
            <div
              className="font-mono text-label uppercase tracking-label text-text-secondary border border-border px-md py-sm rounded-technical transition-opacity duration-300 ease-[steps(6,end)]"
              style={{ opacity: 1 }}
            >
              ISSUER_IDENTITY:{" "}
              <span className="text-text-primary">{ensName}</span> |{" "}
              <span className="text-success">VERIFIED</span>
            </div>
          )}
        </div>

        {/* Wallet non connecté */}
        {mounted && !isConnected && status !== "connecting" && (
          <section className="border border-border-visible p-2xl dot-grid rounded-technical transition-opacity duration-300 ease-[steps(8,end)]">
            <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-md">
              WALLET
            </p>
            <p className="font-grotesk text-body text-text-primary mb-lg">
              Connectez un portefeuille pour la vérification ENS et le déploiement.
            </p>
            <button
              type="button"
              onClick={() => openConnectModal?.()}
              disabled={!openConnectModal}
              className="font-mono text-[13px] uppercase tracking-[0.06em] px-lg py-[12px] rounded-pill bg-text-display text-black transition-opacity duration-200 ease-nothing hover:opacity-90 disabled:opacity-40"
            >
              CONNECT WALLET
            </button>
          </section>
        )}

        {mounted && status === "connecting" && (
          <p className="font-mono text-body-sm text-text-secondary">[CONNECTING…]</p>
        )}

        {/* Gate ENS — bloqué */}
        {mounted && isConnected && isEnsPending && (
          <p className="font-mono text-body-sm text-text-secondary">[RESOLVING ENS…]</p>
        )}

        {mounted && identityBlocked && (
          <section className="relative overflow-hidden border-2 border-accent rounded-technical min-h-[320px] flex flex-col items-center justify-center p-2xl dot-grid">
            <div className="absolute inset-0 pointer-events-none opacity-[0.15] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,0,0,0.08)_2px,rgba(255,0,0,0.08)_4px)]" />
            <p className="font-mono text-display-md sm:text-display-lg text-accent text-center tracking-tight leading-none mb-lg relative z-10 transition-transform duration-500 ease-[steps(12,end)]">
              IDENTITY_REQUIRED
            </p>
            <p className="font-grotesk text-body-sm text-text-secondary text-center max-w-lg mb-xl relative z-10">
              Un nom ENS primaire (reverse record) est requis — vérifié sur{" "}
              <span className="text-text-primary">Sepolia</span> et{" "}
              <span className="text-text-primary">Ethereum</span>. Configurez l’enregistrement inverse
              sur le réseau où votre nom est déployé, puis revenez.
            </p>
            <a
              href={ENS_APP}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 font-mono text-[13px] uppercase tracking-[0.08em] px-2xl py-md border border-text-display text-text-display rounded-pill hover:bg-text-display hover:text-black transition-colors duration-200 ease-nothing"
            >
              REGISTER ON ENS
            </a>
          </section>
        )}

        {/* Formulaire + widget risque */}
        {mounted && identityReady && (
          <div
            className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-2xl items-start transition-opacity duration-500 ease-[steps(10,end)]"
          >
            <section className="border border-border p-xl lg:p-2xl rounded-technical">
              <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-xl">
                CONFIGURATION
              </h2>

              {ensName && (
                <div className="mb-xl border border-border-visible rounded-technical px-md py-sm space-y-sm">
                  <p className="font-mono text-body-sm text-text-secondary">
                    <span className="text-text-disabled uppercase text-label tracking-label block mb-xs">
                      Protocole vérifié (ENS)
                    </span>
                    <span className="text-text-display">{ensName}</span>
                  </p>
                  <p className="font-mono text-caption text-text-disabled">
                    Le slug ENS sert de base ; chaque déploiement ajoute un suffixe unique (voir ci-dessous) pour
                    permettre plusieurs streams en démo. DeFiLlama reste optionnel pour les montants.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-xl">
                <div className="border border-border-visible rounded-technical px-md py-md bg-black/40">
                  <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-sm">
                    Slug Factory (déploiement)
                  </p>
                  {protocolSlug ? (
                    <>
                      <p className="font-mono text-body-sm text-text-primary">
                        Base ENS : <span className="text-text-display">{protocolSlug}</span>
                      </p>
                      <p className="font-mono text-body-sm text-text-primary mt-xs">
                        Slug envoyé à <span className="text-text-disabled">createStreamDirect</span> :{" "}
                        <span className="text-text-display">{onChainDeploySlug}</span>
                      </p>
                      <p className="font-mono text-body-sm text-text-primary mt-xs">
                        Token (nom ERC20) : <span className="text-text-display">{onChainDeploySlug}</span> ·
                        symbole <span className="text-text-display">YST</span>
                      </p>
                      <label
                        htmlFor="deploy-suffix"
                        className="font-mono text-caption text-text-disabled block mt-md mb-xs"
                      >
                        Suffixe personnalisé (optionnel)
                      </label>
                      <input
                        id="deploy-suffix"
                        type="text"
                        autoComplete="off"
                        placeholder={`auto : -s${deploySeq + 1}`}
                        value={customDeploySuffix}
                        onChange={(e) => setCustomDeploySuffix(e.target.value)}
                        className="w-full bg-black border border-border-visible px-md py-sm font-mono text-body-sm text-text-display placeholder:text-text-disabled outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing rounded-technical"
                      />
                      <p className="font-mono text-caption text-text-disabled mt-sm leading-relaxed">
                        Vide = prochain slug automatique{" "}
                        <span className="text-text-secondary">{protocolSlug}-s{deploySeq + 1}</span> (compteur
                        mémorisé par wallet après chaque déploiement réussi). Renseignez un suffixe (ex.{" "}
                        <span className="text-text-display">pitch</span>) pour forcer un nom précis.
                      </p>
                    </>
                  ) : (
                    <p className="font-mono text-caption text-accent">
                      Impossible de dériver le slug depuis l’ENS — vérifiez votre primary name.
                    </p>
                  )}
                </div>

                <div className="border border-border-visible rounded-technical px-md py-md bg-black/40">
                  <label
                    htmlFor="fees-slug-override"
                    className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm"
                  >
                    Slug DeFiLlama (optionnel, démo)
                  </label>
                  <p className="font-grotesk text-body-sm text-text-secondary mb-md leading-snug">
                    Si votre ENS (ex. <span className="text-text-display">nohemmg</span>) ne correspond pas à un
                    protocole sur DeFiLlama, saisissez un slug public pour les chiffres de frais :{" "}
                    <span className="text-text-display">uniswap</span>,{" "}
                    <span className="text-text-display">aave</span>, etc. Le nom du token suit le slug Factory :{" "}
                    <span className="text-text-display">{onChainDeploySlug || "…"}</span> (nom du token, symbole
                    YST).
                  </p>
                  <input
                    id="fees-slug-override"
                    type="text"
                    autoComplete="off"
                    placeholder="ex. uniswap"
                    value={feesSlugOverrideInput}
                    onChange={(e) => setFeesSlugOverrideInput(e.target.value)}
                    className="w-full bg-black border border-border-visible px-md py-sm font-mono text-body-sm text-text-display placeholder:text-text-disabled tabular-nums outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing rounded-technical"
                  />
                  <p className="font-mono text-caption text-text-disabled mt-sm">
                    Requête frais :{" "}
                    <span className="text-text-secondary">{feesLookupSlug || "—"}</span>
                    {normalizeFeesSlugOverride(feesSlugOverrideInput) ? (
                      <span className="text-success"> (remplace le slug ENS pour les données uniquement)</span>
                    ) : null}
                  </p>
                </div>

                <div className="border border-success/30 rounded-technical px-md py-md bg-success/5">
                  <p className="font-mono text-label uppercase tracking-label text-success mb-sm">
                    Revenus annuels estimés (DeFiLlama)
                  </p>
                  <p className="font-grotesk text-body-sm text-text-secondary mb-sm">
                    Moyenne des frais sur 30 jours (USD/jour) via le proxy Cloudflare du workflow CRE,
                    annualisée ×365 — même source que l’évaluation Chainlink CRE hors chaîne.
                  </p>
                  <p className="font-mono text-display-sm sm:text-display-md text-text-display tabular-nums">
                    {feesLoading ? (
                      <span className="text-text-disabled">Chargement…</span>
                    ) : feesError ? (
                      <span className="text-caption text-accent font-mono leading-snug">{feesError}</span>
                    ) : (
                      <>
                        ${formatNumber(Math.round(annualRevenueUsd))}{" "}
                        <span className="text-caption text-text-disabled font-mono">USD / an</span>
                      </>
                    )}
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-baseline mb-sm gap-md">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      Part des revenus futurs vendue
                    </span>
                    <span className="font-mono text-heading text-text-display tabular-nums">
                      {revenuePct}%
                    </span>
                  </div>
                  <p className="font-mono text-caption text-text-disabled mb-sm">
                    Part de votre <span className="text-text-secondary">revenu annuel estimé</span> que vous
                    proposez aux investisseurs. Cliquez une case ou{" "}
                    <span className="text-text-disabled/90">
                      maintenez et glissez sur la barre (gauche = moins, droite = plus).
                    </span>
                  </p>
                  <div
                    ref={revenueTrackRef}
                    role="slider"
                    tabIndex={0}
                    aria-valuemin={1}
                    aria-valuemax={50}
                    aria-valuenow={revenuePct}
                    aria-label="Part des revenus futurs vendue, de 1 à 50 pour cent"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setRevenuePctFromClientX(e.clientX);
                    }}
                    onPointerMove={(e) => {
                      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                      setRevenuePctFromClientX(e.clientX);
                    }}
                    onPointerUp={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                    onPointerCancel={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                        e.preventDefault();
                        setRevenuePct((p) => Math.max(1, p - 1));
                      }
                      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setRevenuePct((p) => Math.min(50, p + 1));
                      }
                    }}
                    className="flex flex-wrap gap-[4px] cursor-grab touch-none select-none rounded-technical py-1 outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-border-visible focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {Array.from({ length: 50 }, (_, i) => {
                      const v = i + 1;
                      const active = v <= revenuePct;
                      return (
                        <div
                          key={v}
                          aria-hidden
                          className={`h-[10px] flex-1 min-w-[6px] max-w-[14px] rounded-[1px] transition-colors duration-150 ease-nothing pointer-events-none ${
                            active ? "bg-text-display" : "bg-border"
                          }`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between font-mono text-caption text-text-disabled mt-xs tabular-nums">
                    <span>1%</span>
                    <span>50%</span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="duration"
                    className="font-mono text-label uppercase tracking-label text-text-secondary block mb-sm"
                  >
                    STREAM_DURATION (MO)
                  </label>
                  <input
                    id="duration"
                    type="number"
                    min={1}
                    max={120}
                    value={durationMonths}
                    onChange={(e) =>
                      setDurationMonths(
                        Math.min(120, Math.max(1, Number(e.target.value) || 1))
                      )
                    }
                    className="w-full bg-black border border-border-visible px-md py-sm font-mono text-body-sm text-text-primary tabular-nums outline-none focus:border-text-secondary transition-colors duration-200 ease-nothing rounded-technical"
                  />
                </div>

                {offeringEconomics && (
                  <div className="border border-success/25 rounded-technical px-md py-md space-y-lg bg-success/5">
                    <p className="font-mono text-label uppercase tracking-label text-text-secondary">
                      Lecture émetteur
                    </p>

                <div>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-success mb-xs">
                        Vous vendez
                      </p>
                      <p className="font-grotesk text-display-sm sm:text-display-md text-text-primary tabular-nums leading-none">
                        {formatNumber(Math.round(offeringEconomics.nominalUsd))}{" "}
                        <span className="font-mono text-body-sm text-text-disabled">USDC</span>
                      </p>
                      <p className="font-grotesk text-body-sm text-text-secondary mt-sm leading-snug">
                        Valeur des <strong className="text-text-primary font-medium">droits sur vos revenus</strong>{" "}
                        que les investisseurs achètent ({revenuePct}% de l’estimation annuelle).
                      </p>
                    </div>

                    <div className="border-t border-border-visible pt-md">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-text-display mb-xs">
                        Vous recevez au net
                      </p>
                      <p className="font-grotesk text-display-sm sm:text-display-md text-success tabular-nums leading-none">
                        {formatUsdcShort(offeringEconomics.afterDiscountUsd)}{" "}
                        <span className="font-mono text-body-sm text-success/80">USDC</span>
                      </p>
                      <p className="font-grotesk text-body-sm text-text-secondary mt-sm leading-snug">
                        Ce qui vous revient <strong className="text-text-primary font-medium">après la décote</strong>{" "}
                        ({creDecotePercent}%) calculée sur la synthèse CRE (σ, R, trend, marché ETH/USD).
                      </p>
                    </div>
                </div>
                )}
              </div>

              <div className="mt-2xl pt-xl border-t border-border space-y-md">
                {!onSepolia && isConnected && (
                  <div className="flex flex-col gap-sm">
                    <p className="font-mono text-caption text-accent uppercase tracking-wide">
                      WRONG_NETWORK — Sepolia requis pour createStreamDirect
                    </p>
                    <button
                      type="button"
                      onClick={() => switchChain?.({ chainId: SEPOLIA_CHAIN_ID })}
                      disabled={!switchChain || isSwitchingChain}
                      className="w-full font-mono text-[12px] uppercase tracking-[0.06em] px-md py-sm border border-accent text-accent rounded-technical hover:bg-accent hover:text-black transition-colors disabled:opacity-40"
                    >
                      {isSwitchingChain ? "[SWITCHING…]" : "SWITCH TO SEPOLIA"}
                    </button>
                  </div>
                )}

                <div className="rounded-technical border border-border-visible bg-black/80 p-md min-h-[220px]">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-text-disabled mb-sm">
                    DEPLOYMENT_TERMINAL
                  </p>
                  <pre className="font-mono text-[11px] sm:text-body-sm text-success/90 whitespace-pre-wrap break-all leading-relaxed">
                    {terminalBody}
                  </pre>
                </div>

                {receipt?.status === "reverted" && (
                  <p className="font-mono text-caption text-accent leading-relaxed border border-accent/50 rounded-technical px-md py-sm bg-accent/5">
                    Transaction échouée on-chain (revert — ex. NotOwner). Aucun vault créé, pas de
                    redirection. Vérifiez l’adresse Factory dans le code et l’explorateur Sepolia pour le
                    détail.
                  </p>
                )}

                {streamAlreadyExists && (
                  <div className="rounded-technical border border-accent/60 bg-accent/5 px-md py-md space-y-sm">
                    <p className="font-mono text-label uppercase tracking-label text-accent">
                      StreamAlreadyExists
                    </p>
                    <p className="font-grotesk text-body-sm text-text-secondary leading-snug">
                      Un vault existe déjà pour{" "}
                      <span className="font-mono text-text-display text-caption">
                        keccak256({onChainDeploySlug || "…"}, votre adresse)
                      </span>
                      . Changez le <strong className="text-text-primary font-medium">suffixe démo</strong>{" "}
                      (ou laissez le compteur auto passer au suivant après un déploiement réussi). Le champ
                      DeFiLlama ne modifie pas ce slug.
                    </p>
                    {existingStreamInvestId != null ? (
                      <Link
                        href={`/invest/${existingStreamInvestId}`}
                        className="inline-flex font-mono text-[12px] uppercase tracking-[0.06em] px-md py-sm border border-text-display text-text-display rounded-technical hover:bg-text-display hover:text-black transition-colors"
                      >
                        Ouvrir /invest/{existingStreamInvestId}
                      </Link>
                    ) : (
                      <Link
                        href="/"
                        className="inline-flex font-mono text-[12px] uppercase tracking-[0.06em] px-md py-sm border border-border-visible text-text-secondary rounded-technical hover:border-text-display transition-colors"
                      >
                        Marketplace
                      </Link>
                    )}
                  </div>
                )}

                {deployBlockedHint && (
                  <p className="font-mono text-caption text-warning leading-relaxed border border-warning/40 rounded-technical px-md py-sm bg-warning/5">
                    {deployBlockedHint}
                  </p>
                )}

                <button
                  type="button"
                  onClick={deploy}
                  disabled={!deployReady}
                  title={deployBlockedHint ?? (deployReady ? "Déployer le stream sur Sepolia" : undefined)}
                  className="w-full font-mono text-[12px] sm:text-[13px] uppercase tracking-[0.05em] px-md py-lg rounded-technical bg-text-display text-black transition-opacity duration-200 ease-nothing hover:opacity-90 btn-dot-matrix-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  DEPLOY
                </button>
                <p className="font-mono text-caption text-text-disabled text-center leading-relaxed">
                  Aucun frais en ETH vers la Factory (msg.value = 0). USDC géré en interne au déploiement
                  du Vault.
                </p>
              </div>
            </section>

            <aside className="border border-border p-xl lg:p-2xl rounded-technical lg:sticky lg:top-xl">
              <h2 className="font-mono text-label uppercase tracking-label text-text-secondary mb-md">
                CHAINLINK CRE — RISK SUMMARY
              </h2>
              <p className="font-grotesk text-body-sm text-text-secondary mb-lg">
                Quatre entrées (frais DeFiLlama + oracle ETH/USD Sepolia) agrégées en un taux de décote sur le flux,
                pas une suggestion arbitraire.
              </p>

              <div className="mb-lg border border-border-visible rounded-technical px-md py-sm font-mono text-caption text-text-secondary">
                <span className="text-text-disabled uppercase tracking-wider block mb-xs">
                  Revenu annuel (DeFiLlama)
                </span>
                <span className="text-text-display tabular-nums text-body-sm">
                  {feesLoading ? "…" : feesError ? "—" : `$${formatNumber(Math.round(annualRevenueUsd))}`}
                </span>
                <span className="text-text-disabled"> USD — aligné sur la colonne configuration.</span>
              </div>

              <div className="space-y-lg mb-xl">
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {creMetrics.volatility.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {feesLoading ? "…" : creMetrics.volatility.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={creMetrics.volatility.value}
                    max={creMetrics.volatility.max}
                    segments={20}
                    status={creMetrics.volatility.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {creMetrics.regularity.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {feesLoading ? "…" : creMetrics.regularity.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={creMetrics.regularity.value}
                    max={creMetrics.regularity.max}
                    segments={20}
                    status={creMetrics.regularity.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {creMetrics.trendPenalty.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {feesLoading ? "…" : creMetrics.trendPenalty.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={creMetrics.trendPenalty.value}
                    max={creMetrics.trendPenalty.max}
                    segments={20}
                    status={creMetrics.trendPenalty.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      MARKET_RISK (ETH/USD FEED)
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {isFeedPending ? "…" : isFeedError ? "—" : marketRiskValue}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={isFeedError ? 0 : marketRiskValue}
                    max={100}
                    segments={20}
                    status="neutral"
                    size="standard"
                    variant="blocks"
                    animated
                  />
                  <p className="font-mono text-caption text-text-disabled mt-xs tabular-nums">
                    ETH/USD (Sepolia Chainlink):{" "}
                        {isFeedPending
                          ? "[LOADING…]"
                      : isFeedError || !ethUsdDisplay
                        ? "[FEED ERROR]"
                        : `$${ethUsdDisplay}`}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-lg">
                <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-sm">
                  DÉCOTE DU FLUX
                </p>
                <p className="font-mono text-display-sm text-text-display tabular-nums leading-snug">
                  {creDecotePercent}%
                </p>
                <p className="font-mono text-caption text-text-disabled mt-sm leading-relaxed">
                  Pondération : 26 % volatilité · 26 % (100 − régularité) · 24 % trend · 24 % risque marché
                  (fraîcheur feed ETH/USD). Plage 5–55 %.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
