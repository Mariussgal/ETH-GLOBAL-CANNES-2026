import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import Web3Provider from "@/components/Web3Provider";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["300", "400", "500", "700"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "YSM — Yield Stream Marketplace",
  description:
    "Sell future DeFi protocol revenues. No debt. No dilution. 100% on-chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${spaceMono.variable} antialiased bg-black text-text-primary md:overflow-x-hidden`}
      >
        <div className="fixed inset-0 pointer-events-none noise-grain z-[9999] opacity-[0.08]" />
        <div className="fixed inset-0 pointer-events-none scanline-overlay z-[9998] opacity-[0.1]" />
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
