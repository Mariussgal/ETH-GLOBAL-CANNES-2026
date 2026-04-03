"use client";

export default function DataTicker() {
  return (
    <div className="w-full border-y border-border-visible bg-black relative z-50 flex h-8 items-center border-b">
      <div className="animate-marquee whitespace-nowrap flex items-center font-mono text-label uppercase tracking-label text-text-secondary">
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>YSM_NETWORK_TVL: <span className="text-text-display">$42,109,334.00</span></span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>ACTIVE_STREAMS: <span className="text-text-display">124</span></span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>24H_VOLUME: <span className="text-text-display">$1,204,500</span></span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>CHAINLINK_CCIP: <span className="text-success">OPERATIONAL</span></span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span className="relative group cursor-crosshair z-50">
          CHAINLINK_DATA_FEEDS: <span className="text-success">SYNCED</span>
          <div className="absolute left-0 top-full mt-2 hidden group-hover:flex bg-text-display text-black font-mono text-[10px] px-2 py-1 shadow-[0_0_10px_rgba(255,255,255,0.3)] pointer-events-none whitespace-nowrap z-[1000]">
            LATEST_SYNC_BLOCK: 1948201
            <div className="absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-text-display"></div>
          </div>
        </span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>VAULT_FILL_RATE: <span className="text-text-display">94.2%</span></span>

        {/* Duplicate for seamless scrolling */}
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>YSM_NETWORK_TVL: <span className="text-text-display">$42,109,334.00</span></span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>ACTIVE_STREAMS: <span className="text-text-display">124</span></span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>24H_VOLUME: <span className="text-text-display">$1,204,500</span></span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>CHAINLINK_CCIP: <span className="text-success">OPERATIONAL</span></span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span className="relative group cursor-crosshair z-50">
          CHAINLINK_DATA_FEEDS: <span className="text-success">SYNCED</span>
          <div className="absolute left-0 top-full mt-2 hidden group-hover:flex bg-text-display text-black font-mono text-[10px] px-2 py-1 shadow-[0_0_10px_rgba(255,255,255,0.3)] pointer-events-none whitespace-nowrap z-[1000]">
            LATEST_SYNC_BLOCK: 1948201
            <div className="absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-text-display"></div>
          </div>
        </span>
        
        <span className="mx-xl text-text-disabled">{"///"}</span>
        <span>VAULT_FILL_RATE: <span className="text-text-display">94.2%</span></span>
      </div>
    </div>
  );
}
