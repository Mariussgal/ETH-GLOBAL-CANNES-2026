import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";

export const wagmiConfig = getDefaultConfig({
  appName: "YSM — Yield Stream Marketplace",
  projectId: walletConnectProjectId,
  chains: [sepolia, mainnet],
  ssr: true,
  transports: {
    // On force un RPC public stable et permissif (CORS-friendly) pour la démo
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
    [mainnet.id]: http(),
  },
});