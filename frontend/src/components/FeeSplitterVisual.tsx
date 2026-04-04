"use client";

import { useEffect, useState } from "react";

export default function FeeSplitterVisual() {
  const [vaultCount, setVaultCount] = useState(14023);
  const [displayCount, setDisplayCount] = useState(14023);
  const [txLogs, setTxLogs] = useState<string[]>([]);

  // Steppy target update
  useEffect(() => {
    const interval = setInterval(() => {
      setVaultCount((prev) => prev + Math.floor(Math.random() * 5) + 2);

      // Generate a fake hex tx hash
      const hash = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
      const newLog = `0x${hash.slice(0, 3)}...${hash.slice(-2)} (SYNCED)`;

      setTxLogs(prev => {
        const next = [...prev, newLog];
        if (next.length > 4) next.shift();
        return next;
      });

    }, 1200); // Target jumps every 1.2s

    return () => clearInterval(interval);
  }, []);

  // Smooth tweening to target
  useEffect(() => {
    if (displayCount < vaultCount) {
      const timer = setTimeout(() => {
        setDisplayCount(prev => prev + 1);
      }, 30); // fast tick
      return () => clearTimeout(timer);
    }
  }, [displayCount, vaultCount]);

  return (
    <div className="relative w-full h-[500px] border border-border-visible bg-black flex items-center justify-center overflow-hidden p-6">
      {/* Background dot matrix specifically for this card */}
      <div className="absolute inset-0 dot-grid opacity-[0.1] pointer-events-none" />

      {/* Frame decoration */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-text-disabled" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-text-disabled" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-text-disabled" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-text-disabled" />

      {/* Meta info top left */}
      <div className="absolute top-4 left-4 font-mono text-[10px] text-text-disabled uppercase flex flex-col gap-1">
        <span>FLOW_RATE: 0.85 TPS</span>
        <span>PROTOCOL_SYNC: <span className="text-text-display">OK</span></span>
      </div>

      {/* Main Diagram Area */}
      <div className="relative w-full max-w-[420px] h-full flex flex-col justify-center gap-10">

        {/* Entry Nodes (Dual Source) */}
        <div className="flex justify-between items-center w-full">
          <div className="flex flex-col gap-8 relative -translate-y-7">
            <span className="absolute -top-[28px] font-mono text-[10px] text-text-disabled tracking-widest flex items-center gap-1.5"><img src="/arc_logo_final.png" alt="Arc" className="h-3 brightness-0 invert opacity-40 inline-block" /> CONSOLIDATION</span>
            <div className="flex items-center gap-3 w-[180px] justify-between">
              <span className="font-mono text-[10px] text-text-disabled uppercase">BASE_SOURCE</span>
              <div className="relative w-16 h-[2px] bg-border-visible overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-text-display animate-steppy-flow" style={{ animationDuration: '0.45s' }} />
              </div>
            </div>
            <div className="flex items-center gap-3 w-[180px] justify-between">
              <span className="font-mono text-[10px] text-text-disabled uppercase">POLYGON_SOURCE</span>
              <div className="relative w-16 h-[2px] bg-border-visible overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-text-secondary animate-steppy-flow animation-delay-500" style={{ animationDuration: '0.45s' }} />
              </div>
            </div>
          </div>

          {/* Splitter Box Area */}
          <div className="relative flex flex-col items-center shrink-0">
            {/* Descending CL Signal */}
            <div className="absolute bottom-[calc(100%+4px)] flex flex-col items-center">
              <div className="flex items-center gap-2 mb-2">
                <img src="/Chainlink_Logo.png" alt="Chainlink" className="h-[12px] brightness-0 invert opacity-60" />
                <span className="font-mono text-[11px] tracking-widest text-text-disabled uppercase">CL_CRE_AUTOMATION</span>
              </div>
              <div className="h-16 w-[1px] border-r border-dashed border-border-visible relative overflow-hidden">
                <div className="absolute top-0 -left-[3px] w-2 h-2 bg-text-secondary animate-steppy-drop" />
              </div>
            </div>

            <div className="border border-text-primary px-5 py-3 relative bg-black z-10 w-[160px] flex flex-col justify-center items-center">
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="scanline-crt" />
              </div>
              <div className="absolute -top-1 -left-1 w-1 h-1 bg-text-primary" />
              <div className="absolute -top-1 -right-1 w-1 h-1 bg-text-primary" />
              <div className="absolute -bottom-1 -left-1 w-1 h-1 bg-text-primary" />
              <div className="absolute -bottom-1 -right-1 w-1 h-1 bg-text-primary" />
              <span className="font-mono text-[8px] bg-text-primary text-black px-1 py-[1px] absolute top-0 -translate-y-1/2 flex items-center gap-1 z-20 whitespace-nowrap">
                <img src="/ens.png" className="h-2 brightness-0 opacity-80" alt="ens" /> ENS_IDENTITY_VERIFIED
              </span>
              <span className="font-mono text-body-sm text-text-display tracking-widest relative z-10 mt-1">YST_SPLITTER</span>
            </div>

            {/* Status Syncing */}
            <div className="mt-3 w-full flex flex-col justify-center items-center gap-1 z-10">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_5px_rgba(0,180,90,0.8)]" />
                <span className="font-mono text-[10px] text-success/80 tracking-widest uppercase">Syncing</span>
              </div>
              <span className="font-mono text-[8px] text-text-disabled mt-1 uppercase text-center">
                ISSUER: quickswap.ens <br /> STATUS: RESOLVED
              </span>
            </div>
          </div>

          <div className="flex-1 max-w-[40px]" />
        </div>

        {/* Output paths */}
        <div className="flex flex-col gap-8 w-full justify-end items-end relative">
          {/* Path lines */}
          <div className="absolute right-[140px] top-[-32px] w-[2px] h-[150px] bg-border-visible">
            <div className="absolute w-full h-2 bg-text-display animate-split-drop" />
          </div>

          <div className="absolute right-0 top-[38px] w-[140px] h-[2px] bg-border-visible">
            <div className="absolute h-full w-2 bg-text-display animate-split-flow-vault" />
          </div>
          <div className="absolute right-0 top-[116px] w-[140px] h-[2px] bg-border-visible">
            <div className="absolute h-full w-2 bg-text-display animate-split-flow-treasury" />
          </div>

          {/* YST Vault Node */}
          <div className="flex items-center gap-4 relative z-10 translate-x-[40px]">
            <div className="flex flex-col items-end mr-6">
              <span className="font-mono text-[10px] text-text-secondary">VAULT_FILL</span>
              <span className="font-mono text-body-sm text-text-display leading-none">+{displayCount}$</span>
            </div>
            <div className="w-[120px] border border-border-visible border-dashed px-3 py-1.5 flex justify-center bg-black">
              <span className="font-mono text-[11px] text-text-secondary tracking-widest">YST_VAULT</span>
            </div>
            <span className="font-mono text-[10px] text-text-primary opacity-100 font-bold ml-2">10%</span>
          </div>

          {/* Treasury Node */}
          <div className="flex items-center gap-4 relative z-10 translate-x-[40px]">
            <div className="w-[120px] border border-text-primary px-3 py-1.5 flex justify-center bg-black relative">
              {/* Scanline inside treasury box */}
              <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(255,255,255,0.05)_50%)] bg-[length:100%_4px] pointer-events-none" />
              <span className="font-mono text-[11px] text-text-display tracking-widest relative z-10">TREASURY</span>
            </div>
            <span className="font-mono text-[10px] text-text-primary opacity-100 font-bold ml-2">90%</span>
          </div>
        </div>
      </div>

      {/* Transaction Logs Overlay */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1 font-mono text-[9px] text-text-disabled uppercase pointer-events-none opacity-50">
        {txLogs.map((log, i) => (
          <span key={`${i}-${log}`} className="animate-pulse">{log}</span>
        ))}
      </div>
    </div>
  );
}
