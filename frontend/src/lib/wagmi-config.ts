import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

/**
 * @see https://rainbowkit.com/docs/installation
 * En production, créez un projet sur https://cloud.walletconnect.com et définissez
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. La valeur littérale YOUR_PROJECT_ID active
 * l’ID de démo intégré par RainbowKit (hors prod, pratique pour le build local).
 */
const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";

export const wagmiConfig = getDefaultConfig({
  appName: "YSM — Yield Stream Marketplace",
  projectId: walletConnectProjectId,
  chains: [sepolia, mainnet],
  ssr: true,
  transports: {
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
});
