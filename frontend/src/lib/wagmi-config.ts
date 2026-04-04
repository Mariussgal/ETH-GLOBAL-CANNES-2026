import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http, webSocket, type Transport } from "viem";
import { mainnet, sepolia } from "wagmi/chains";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";

/**
 * Transport HTTP sans batch JSON-RPC (certains fournisseurs répondent 400 sur des lots atypiques).
 * Retry léger + timeout un peu plus large pour le navigateur.
 */
function safeHttp(url: string) {
  return http(url, {
    batch: false,
    retryCount: 2,
    timeout: 25_000,
  });
}

/** Sepolia : priorité à la clé locale, puis RPC publics stables (évite drpc/publicnode si 400/429 fréquents) */
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
 * Sepolia : WebSocket Alchemy optionnel (`NEXT_PUBLIC_SEPOLIA_ALCHEMY_WEBSOCKET=true`).
 * Par défaut HTTP uniquement : certains navigateurs / requêtes renvoient 400 sur le WSS ;
 * le fallback HTTP+Alchemy reste fiable.
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
 * Mainnet : ne pas utiliser `http()` seul — Viem pointe par défaut sur `https://eth.merkle.io`
 * (souvent ERR_FAILED / instable depuis le navigateur).
 */
/** Sans eth.llamarpc.com : souvent bloqué par les bloqueurs de pub (ERR_BLOCKED_BY_CLIENT). */
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
