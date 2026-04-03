import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        black: "var(--black)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        border: "var(--border)",
        "border-visible": "var(--border-visible)",
        "text-disabled": "var(--text-disabled)",
        "text-secondary": "var(--text-secondary)",
        "text-primary": "var(--text-primary)",
        "text-display": "var(--text-display)",
        accent: "var(--accent)",
        "accent-subtle": "var(--accent-subtle)",
        success: "var(--success)",
        warning: "var(--warning)",
        interactive: "var(--interactive)",
      },
      fontFamily: {
        grotesk: [
          "var(--font-space-grotesk)",
          "DM Sans",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-space-mono)",
          "JetBrains Mono",
          "SF Mono",
          "monospace",
        ],
      },
      spacing: {
        "2xs": "2px",
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
        "3xl": "64px",
        "4xl": "96px",
      },
      letterSpacing: {
        label: "0.08em",
        tight: "-0.03em",
        snug: "-0.02em",
        normal: "-0.01em",
      },
      fontSize: {
        "display-xl": ["72px", { lineHeight: "1.0", letterSpacing: "-0.03em" }],
        "display-lg": ["48px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-md": ["36px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        heading: ["24px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        subheading: ["18px", { lineHeight: "1.3", letterSpacing: "0" }],
        body: ["16px", { lineHeight: "1.5", letterSpacing: "0" }],
        "body-sm": ["14px", { lineHeight: "1.5", letterSpacing: "0.01em" }],
        caption: ["12px", { lineHeight: "1.4", letterSpacing: "0.04em" }],
        label: ["11px", { lineHeight: "1.2", letterSpacing: "0.08em" }],
      },
      borderRadius: {
        technical: "4px",
        compact: "8px",
        card: "12px",
        pill: "999px",
      },
      transitionTimingFunction: {
        nothing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
