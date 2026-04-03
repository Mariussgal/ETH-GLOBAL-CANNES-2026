import { darkTheme, type Theme } from "@rainbow-me/rainbowkit";

/**
 * Thème RainbowKit aligné sur Nothing / OLED black :
 * fonds #000, rayons ≤ 4px, monochrome blanc/gris, pas de dégradés ni ombres décoratives.
 * @see https://rainbowkit.com/docs/theming
 */
export function getNothingRainbowKitTheme(): Theme {
  const base = darkTheme({
    accentColor: "#FFFFFF",
    accentColorForeground: "#000000",
    borderRadius: "small",
    overlayBlur: "none",
    fontStack: "system",
  });

  return {
    ...base,
    colors: {
      ...base.colors,
      accentColor: "#FFFFFF",
      accentColorForeground: "#000000",
      actionButtonBorder: "rgba(255, 255, 255, 0.12)",
      actionButtonBorderMobile: "rgba(255, 255, 255, 0.16)",
      actionButtonSecondaryBackground: "#111111",
      closeButton: "rgba(255, 255, 255, 0.5)",
      closeButtonBackground: "#1a1a1a",
      connectButtonBackground: "#000000",
      connectButtonBackgroundError: "#1a1a1a",
      connectButtonInnerBackground: "#111111",
      connectButtonText: "#FFFFFF",
      connectButtonTextError: "#FFFFFF",
      connectionIndicator: "#FFFFFF",
      downloadBottomCardBackground: "#111111",
      downloadTopCardBackground: "#111111",
      error: "#666666",
      generalBorder: "#333333",
      generalBorderDim: "#222222",
      menuItemBackground: "#111111",
      modalBackdrop: "rgba(0, 0, 0, 0.65)",
      modalBackground: "#000000",
      modalBorder: "#333333",
      modalText: "#FFFFFF",
      modalTextDim: "rgba(255, 255, 255, 0.35)",
      modalTextSecondary: "rgba(255, 255, 255, 0.55)",
      profileAction: "#111111",
      profileActionHover: "#1a1a1a",
      profileForeground: "#0a0a0a",
      selectedOptionBorder: "#333333",
      standby: "#888888",
    },
    radii: {
      ...base.radii,
      actionButton: "4px",
      connectButton: "4px",
      menuButton: "4px",
      modal: "4px",
      modalMobile: "4px",
    },
    fonts: {
      body: 'var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif',
    },
    shadows: {
      connectButton: "none",
      dialog: "none",
      profileDetailsAction: "none",
      selectedOption: "none",
      selectedWallet: "none",
      walletLogo: "none",
    },
    blurs: {
      ...base.blurs,
      modalOverlay: "blur(0px)",
    },
  };
}
