import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http, webSocket, type Transport } from "viem";
import { mainnet, sepolia } from "wagmi/chains";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";

/**
 * HTTP transport without JSON-RPC batching (some providers respond with 400 on atypical batches).
 * Light retry + slightly larger timeout for the browser.
 */
function safeHttp(url: string) {
  return http(url, {
    batch: false,
    retryCount: 2,
    timeout: 25_000,
  });
}

/** Sepolia: priority to local key, then stable public RPCs (avoids drpc/publicnode if 400/429 are frequent) */
const SEPOLIA_RPC_URLS = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim(),
      "https://rpc.sepolia.org",
      "https://11155111.rpc.thirdweb.com",
      "https://1rpc.io/sepolia",
    ].filter((u): u is string => Boolean(u && u.startsWith("http")))
  )
);

/**
 * Sepolia: Optional Alchemy WebSocket (`NEXT_PUBLIC_SEPOLIA_ALCHEMY_WEBSOCKET=true`).
 * Default HTTP only: some browsers / requests return 400 on WSS;
 * the HTTP+Alchemy fallback remains reliable.
 */
function buildSepoliaTransport(): Transport {
  const alchemyHttps = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim();
  const parts: Transport[] = [];
  const useAlchemyWs =
    process.env.NEXT_PUBLIC_SEPOLIA_ALCHEMY_WEBSOCKET === "1" ||
    process.env.NEXT_PUBLIC_SEPOLIA_ALCHEMY_WEBSOCKET === "true";

  if (useAlchemyWs && alchemyHttps?.includes("alchemy.com")) {
    const wss = alchemyHttps.replace(/^https:/i, "wss:");
    parts.push(webSocket(wss, { reconnect: true }));
  }

  parts.push(...SEPOLIA_RPC_URLS.map((url) => safeHttp(url)));

  return parts.length === 1 ? parts[0]! : fallback(parts);
}

/**
 * Mainnet: do not use `http()` alone — Viem points by default to `https://eth.merkle.io`
 * (often ERR_FAILED / unstable from the browser).
 */
/** Without eth.llamarpc.com: often blocked by ad blockers (ERR_BLOCKED_BY_CLIENT). */
const MAINNET_RPC_URLS = [
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
  "https://ethereum.publicnode.com",
];

export const wagmiConfig = getDefaultConfig({
  appName: "YSM — Yield Stream Marketplace",
  projectId: walletConnectProjectId,
  chains: [sepolia, mainnet],
  ssr: true,
  transports: {
    [sepolia.id]: buildSepoliaTransport(),
    [mainnet.id]: fallback(MAINNET_RPC_URLS.map((url) => safeHttp(url))),
  },
});
