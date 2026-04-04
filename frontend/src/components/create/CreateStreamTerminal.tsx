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
import { formatNumber } from "@/lib/format";

const ENS_APP = "https://app.ens.domains";

/** CRE-style mock components (σ, R, trend) — animés via SegmentedProgress */
const CRE_COMPONENTS = {
  volatility: { label: "VOLATILITY (σ)", max: 100, value: 62, status: "warning" as const },
  regularity: { label: "REGULARITY (R_SCORE)", max: 100, value: 78, status: "success" as const },
  trendPenalty: { label: "TREND_PENALTY", max: 100, value: 45, status: "neutral" as const },
};

const RECOMMENDED_DISCOUNT = 30;

function formatUsdFromAnswer(answer: bigint): string {
  const n = Number(answer) / 1e8;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function marketRiskFromAnswer(answer: bigint): number {
  const mod = Number((answer % BigInt(10000)) + BigInt(30));
  return Math.min(100, mod);
}

/** Affichage USDC avec au plus une décimale (ex. 11 923,1). */
function formatUsdcShort(n: number): string {
  const v = Math.round(n * 10) / 10;
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

/** Label ENS → slug passé à `createStreamDirect` / nom du token `YST-{slug}` (ex. nohemmg.eth → nohemmg). */
function protocolSlugFromEns(ens: string | undefined | null): string {
  if (!ens?.trim()) return "";
  const lower = ens.trim().toLowerCase();
  const withoutEth = lower.endsWith(".eth") ? lower.slice(0, -4) : lower;
  const firstLabel = withoutEth.split(".")[0] ?? "";
  const slug = firstLabel.replace(/[^a-z0-9-]/g, "").slice(0, 48);
  return slug;
}

export default function CreateStreamTerminal() {
  const router = useRouter();
  const publicClient = usePublicClient({ chainId: SEPOLIA_CHAIN_ID });
  const { address, status, chainId, isConnected } = useAccount();
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

  const feedAddress =
    chainId !== undefined ? ETH_USD_AGGREGATOR_V3[chainId] : undefined;

  const { data: roundData, isPending: isFeedPending } = useReadContract({
    address: feedAddress,
    abi: aggregatorV3LatestRoundAbi,
    functionName: "latestRoundData",
    chainId,
    query: {
      enabled: Boolean(feedAddress && isConnected),
    },
  });

  const ethUsdDisplay = useMemo(() => {
    if (!roundData) return null;
    const answer = roundData[1];
    return formatUsdFromAnswer(answer);
  }, [roundData]);

  const marketRiskValue = useMemo(() => {
    if (!roundData) return 52;
    return marketRiskFromAnswer(roundData[1]);
  }, [roundData]);

  /** Part des revenus annuels estimés que vous cédez (1–50 %). */
  const [revenuePct, setRevenuePct] = useState(10);
  const revenueTrackRef = useRef<HTMLDivElement>(null);

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
  /**
   * Revenu annuel agrégé (Chainlink). Mock : tirage aléatoire au montage (hors SSR).
   */
  const [annualRevenueUsd, setAnnualRevenueUsd] = useState(260_000);

  useEffect(() => {
    setAnnualRevenueUsd(Math.round(180_000 + Math.random() * 160_000));
  }, []);

  /** Slug dérivé du label ENS ; repli court si le label ne donne aucun caractère [a-z0-9-] (sinon DEPLOY reste désactivé). */
  const protocolSlug = useMemo(() => {
    const fromEns = protocolSlugFromEns(ensName);
    if (fromEns.length > 0) return fromEns;
    if (address) return `emit${address.slice(2, 10).toLowerCase()}`;
    return "";
  }, [ensName, address]);

  /** Tranche = revenu annuel × part cédée ; après décote CRE = tranche × (1 − décote). */
  const offeringEconomics = useMemo(() => {
    if (!Number.isFinite(annualRevenueUsd) || annualRevenueUsd <= 0) return null;
    const nominalUsd = annualRevenueUsd * (revenuePct / 100);
    const discountFrac = RECOMMENDED_DISCOUNT / 100;
    const afterDiscountUsd = nominalUsd * (1 - discountFrac);
    return { nominalUsd, afterDiscountUsd };
  }, [annualRevenueUsd, revenuePct]);

  const onSepolia = activeChainId === SEPOLIA_CHAIN_ID;

  const deployReady =
    identityReady &&
    onSepolia &&
    protocolSlug.trim().length > 0 &&
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
    isWritePending,
    awaitingReceipt,
    offeringEconomics,
  ]);

  const deploy = useCallback(() => {
    if (!deployReady || !offeringEconomics) return;
    const slug = protocolSlug.trim();
    const nominalUsd = offeringEconomics.nominalUsd;
    if (!Number.isFinite(nominalUsd) || nominalUsd <= 0) return;
    const streamBps = BigInt(revenuePct * 100);
    if (streamBps < BigInt(100) || streamBps > BigInt(5000)) return;
    const durationDays = BigInt(durationMonths * 30);
    const capitalRaised = BigInt(Math.round(nominalUsd * 1e6));
    const discountBps = BigInt(RECOMMENDED_DISCOUNT * 100);

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
    protocolSlug,
    revenuePct,
    durationMonths,
    resetWrite,
    writeContract,
  ]);

  useEffect(() => {
    /** `isReceiptSuccess` = reçu RPC récupéré ; une tx peut être incluse avec `status: reverted`. */
    if (!receipt || receipt.status !== "success" || !publicClient) return;
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
  }, [receipt, publicClient, router]);

  const terminalBody = useMemo(() => {
    const lines: string[] = [];
    lines.push(`> PROTOCOL_SLUG (depuis ENS): ${protocolSlug || "—"}`);
    lines.push(`> YST_SYMBOL: YST (imposé par le Factory)`);
    lines.push(`> REV_ANNUEL_USD (mock Chainlink): ${formatNumber(Math.round(annualRevenueUsd))}`);
    lines.push(
      `> VOUS_VENDEZ (droits): ${offeringEconomics ? formatNumber(Math.round(offeringEconomics.nominalUsd)) : "—"} USDC`
    );
    lines.push(
      `> VOUS_RECEVEZ_NET: ${offeringEconomics ? formatUsdcShort(offeringEconomics.afterDiscountUsd) : "—"} USDC`
    );
    lines.push(`> FACTORY: ${ADDRESSES.streamFactory}`);
    lines.push(`> USDC: immutable in Factory constructor — not passed in createStreamDirect`);
    lines.push(`> MSG.VALUE: 0 ETH (no protocol fee on Factory)`);
    lines.push("");

    if (writeError) {
      lines.push(`> ERROR: ${writeError.message.slice(0, 280)}`);
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
    annualRevenueUsd,
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
                    L’identifiant on-chain est dérivé automatiquement de ce nom (pas de saisie manuelle).
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-xl">
                <div className="border border-success/30 rounded-technical px-md py-md bg-success/5">
                  <p className="font-mono text-label uppercase tracking-label text-success mb-sm">
                    Revenus annuels estimés (Chainlink)
                  </p>
                  <p className="font-grotesk text-body-sm text-text-secondary mb-sm">
                    Agrégation des revenus générés sur l’exercice précédent via les feeds Chainlink. En
                    attendant, valeur <span className="text-text-display">aléatoire</span> entre 180k$ et
                    340k$.
                  </p>
                  <p className="font-mono text-display-sm sm:text-display-md text-text-display tabular-nums">
                    ${formatNumber(Math.round(annualRevenueUsd))}{" "}
                    <span className="text-caption text-text-disabled font-mono">USD / an (mock)</span>
                  </p>
                </div>

                <div className="border border-border-visible rounded-technical px-md py-md bg-black/40">
                  <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-sm">
                    Identifiant on-chain (auto)
                  </p>
                  {protocolSlug ? (
                    <>
                      <p className="font-mono text-body-sm text-text-primary">
                        Slug : <span className="text-text-display">{protocolSlug}</span>
                      </p>
                      <p className="font-mono text-body-sm text-text-primary mt-xs">
                        Token : <span className="text-text-display">YST-{protocolSlug}</span> · symbole{" "}
                        <span className="text-text-display">YST</span> (fixe, Factory)
                      </p>
                    </>
                  ) : (
                    <p className="font-mono text-caption text-accent">
                      Impossible de dériver le slug depuis l’ENS — vérifiez votre primary name.
                    </p>
                  )}
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
                        ({RECOMMENDED_DISCOUNT}%) liée au risque du flux (évaluation CRE / Chainlink).
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
                Composantes de décote (workflow CRE #1). ETH/USD via Chainlink Data Feeds.
              </p>

              <div className="mb-lg border border-border-visible rounded-technical px-md py-sm font-mono text-caption text-text-secondary">
                <span className="text-text-disabled uppercase tracking-wider block mb-xs">
                  Revenu annuel (mock Chainlink)
                </span>
                <span className="text-text-display tabular-nums text-body-sm">
                  ${formatNumber(Math.round(annualRevenueUsd))}
                </span>
                <span className="text-text-disabled"> USD — même valeur que dans la configuration.</span>
              </div>

              <div className="space-y-lg mb-xl">
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {CRE_COMPONENTS.volatility.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {CRE_COMPONENTS.volatility.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={CRE_COMPONENTS.volatility.value}
                    max={CRE_COMPONENTS.volatility.max}
                    segments={20}
                    status={CRE_COMPONENTS.volatility.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {CRE_COMPONENTS.regularity.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {CRE_COMPONENTS.regularity.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={CRE_COMPONENTS.regularity.value}
                    max={CRE_COMPONENTS.regularity.max}
                    segments={20}
                    status={CRE_COMPONENTS.regularity.status}
                    size="standard"
                    variant="blocks"
                    animated
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-xs">
                    <span className="font-mono text-label uppercase tracking-label text-text-secondary">
                      {CRE_COMPONENTS.trendPenalty.label}
                    </span>
                    <span className="font-mono text-body-sm text-text-display tabular-nums">
                      {CRE_COMPONENTS.trendPenalty.value}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={CRE_COMPONENTS.trendPenalty.value}
                    max={CRE_COMPONENTS.trendPenalty.max}
                    segments={20}
                    status={CRE_COMPONENTS.trendPenalty.status}
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
                      {isFeedPending && feedAddress ? "…" : marketRiskValue}
                    </span>
                  </div>
                  <SegmentedProgress
                    value={marketRiskValue}
                    max={100}
                    segments={20}
                    status="neutral"
                    size="standard"
                    variant="blocks"
                    animated
                  />
                  <p className="font-mono text-caption text-text-disabled mt-xs tabular-nums">
                    {feedAddress ? (
                      <>
                        ETH/USD:{" "}
                        {isFeedPending
                          ? "[LOADING…]"
                          : ethUsdDisplay
                            ? `$${ethUsdDisplay}`
                            : "[FEED ERROR]"}
                      </>
                    ) : (
                      "Switch to Sepolia or Ethereum for live feed"
                    )}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-lg">
                <p className="font-mono text-label uppercase tracking-label text-text-secondary mb-sm">
                  OUTPUT
                </p>
                <p className="font-mono text-body-sm text-text-display tabular-nums leading-snug">
                  RECOMMENDED_DISCOUNT: {RECOMMENDED_DISCOUNT}%
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
