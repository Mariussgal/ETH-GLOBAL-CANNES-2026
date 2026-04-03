"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { animate } from "framer-motion";

type Ctx = {
  isSyncing: boolean;
  progress: number;
  startAccessFlow: () => void;
};

const MarketplaceSyncContext = createContext<Ctx | null>(null);

const SYNC_DURATION_S = 0.85;

export function MarketplaceSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const busyRef = useRef(false);

  const startAccessFlow = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsSyncing(true);
    setDisplayProgress(0);

    animate(0, 100, {
      duration: SYNC_DURATION_S,
      ease: [0.25, 0.1, 0.25, 1],
      onUpdate: (v) => setDisplayProgress(Math.round(v)),
    }).then(() => {
      setDisplayProgress(100);
      setIsSyncing(false);
      busyRef.current = false;
      document
        .getElementById("marketplace")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const value = useMemo(
    () => ({
      isSyncing,
      progress: displayProgress,
      startAccessFlow,
    }),
    [isSyncing, displayProgress, startAccessFlow]
  );

  return (
    <MarketplaceSyncContext.Provider value={value}>
      {children}
    </MarketplaceSyncContext.Provider>
  );
}

export function useMarketplaceSync() {
  const ctx = useContext(MarketplaceSyncContext);
  if (!ctx) {
    throw new Error(
      "useMarketplaceSync must be used within MarketplaceSyncProvider"
    );
  }
  return ctx;
}
