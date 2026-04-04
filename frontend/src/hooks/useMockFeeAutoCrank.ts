"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

/** Délai aléatoire entre deux cranks (ms) : ~10 s en moyenne, souvent. */
const JITTER_MIN_MS = 8_000;
const JITTER_MAX_MS = 15_000;

function randomDelayMs(): number {
  return JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);
}

export type MockFeeCrankStatus = {
  at: number;
  ok: boolean;
  message: string;
};

type Opts = {
  /** Levée à 100 % + stream on-chain (pas démo revenue synthétique). */
  enabled: boolean;
  /** Si false : `feesEnabled` off-chain sur les mocks — ne pas spammer generateFees. */
  feesGenerationEnabled?: boolean;
};

/**
 * Appelle `POST /api/crank-mock-fees` en boucle avec délai aléatoire entre chaque tick
 * (aligné sur `minCooldown` des mocks, ex. 5 s on-chain).
 */
export function useMockFeeAutoCrank(opts: Opts) {
  const { enabled, feesGenerationEnabled = true } = opts;
  const runCrank = enabled && feesGenerationEnabled;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MockFeeCrankStatus | null>(null);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Évite d’afficher un vieux LAST_TICK_ERR après passage interrupteur OFF → ON. */
  useEffect(() => {
    if (!feesGenerationEnabled) {
      setStatus(null);
      setPending(false);
    }
  }, [feesGenerationEnabled]);

  const crank = useCallback(async () => {
    setPending(true);
    try {
      const headers: HeadersInit = {};
      const secret = process.env.NEXT_PUBLIC_CRANK_SECRET?.trim();
      if (secret) {
        headers.Authorization = `Bearer ${secret}`;
      }
      const res = await fetch("/api/crank-mock-fees", {
        method: "POST",
        headers,
      });
      const json = (await res.json()) as {
        error?: string;
        allFeesDisabled?: boolean;
        results?: { label: string; ok: boolean; hash?: string; error?: string }[];
        cranker?: string;
      };
      /** Dernier tick après interrupteur OFF : le serveur renvoie 200 + allFeesDisabled. */
      const ok = res.ok || json.allFeesDisabled === true;
      let message = "";
      if (json.allFeesDisabled) {
        message =
          "SKIPPED — fees désactivés (interrupteur OFF) ; dernier tick sans effet.";
      } else if (json.results?.length) {
        message = json.results
          .map((r) => `${r.label}: ${r.ok ? (r.hash?.slice(0, 10) ?? "ok") : (r.error ?? "err")}`)
          .join(" · ");
      } else {
        message = json.error ?? res.statusText;
      }
      if (mounted.current) {
        setStatus({ at: Date.now(), ok, message });
      }
      if (ok) {
        void queryClient.invalidateQueries();
      }
    } catch (e) {
      if (mounted.current) {
        setStatus({
          at: Date.now(),
          ok: false,
          message: e instanceof Error ? e.message : "fetch failed",
        });
      }
    } finally {
      if (mounted.current) setPending(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!runCrank) return;
    let cancelled = false;
    let timeoutId: number | undefined;

    const loop = async () => {
      while (!cancelled && mounted.current) {
        await crank();
        if (cancelled) break;
        await new Promise<void>((resolve) => {
          timeoutId = window.setTimeout(resolve, randomDelayMs());
        });
      }
    };

    void loop();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [runCrank, crank]);

  return { status, pending, crankAgain: crank };
}
