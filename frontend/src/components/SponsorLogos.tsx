// Monochrome SVG logos for sponsor integrations — Nothing Design compliant (white on black)

export function ChainlinkLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 37 40" fill="currentColor" className={className} aria-label="Chainlink">
      <path d="M18.5 0L37 10v20L18.5 40 0 30V10L18.5 0zm0 4.36L3.7 12.18v15.64L18.5 35.64l14.8-7.82V12.18L18.5 4.36zm0 5.09l9.25 4.88v9.34L18.5 28.55l-9.25-4.88v-9.34L18.5 9.45z" />
    </svg>
  );
}

export function ENSLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className} aria-label="ENS">
      <path d="M23.8 16.6c1.5-2.3 3.8-3.7 6.3-4.2l1.2-.2c.4 0 .7.3.7.7v33.7c0 .4-.3.7-.7.7-.3 0-.5-.2-.6-.4L23.1 18.5c-.3-0.6-.1-1.3.7-1.9z" />
      <path d="M76.2 83.4c-1.5 2.3-3.8 3.7-6.3 4.2l-1.2.2c-.4 0-.7-.3-.7-.7V53.4c0-.4.3-.7.7-.7.3 0 .5.2.6.4l7.6 28.4c.3.6.1 1.3-.7 1.9z" />
      <path d="M30.6 87.3c-9-5.2-14.5-14.8-14.5-25.7V38.4c0-1.5.8-2.8 2.1-3.5l.4-.2c.3-.2.7 0 .8.4l17.4 50.1c.2.5-.1 1-.6 1.2-.2.1-.4 0-.6-.1l-5-3z" />
      <path d="M69.4 12.7c9 5.2 14.5 14.8 14.5 25.7v23.2c0 1.5-.8 2.8-2.1 3.5l-.4.2c-.3.2-.7 0-.8-.4L63.2 14.8c-.2-.5.1-1 .6-1.2.2-.1.4 0 .6.1l5 3z" />
    </svg>
  );
}

export function UniswapLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="currentColor" className={className} aria-label="Uniswap">
      <path d="M16.6 6.3c-.4-.1-.5-.1-.3-.1.3 0 1 .2 1.5.4.8.3.9.4.9.1 0-.2-.1-.3-.3-.4-.3-.1-1.4-.2-1.8 0zm2.6.8c-.2-.2-.2-.4-.1-.5.2-.2.6-.1.8.1.2.2.2.4.1.5-.2.2-.6.1-.8-.1z" />
      <path fillRule="evenodd" d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm-5.6 8.8c1.3-.7 2.2-.9 3.8-.9 1.2 0 1.8.2 2.8.7 1.5.8 2.5 2.1 3.2 4.2.3.9.8 3 .9 3.7.1.5.3 1.2.6 1.7.5.9 1.3 1.5 2.8 2.1 1.2.5 1.5.7 1.5 1.1 0 .7-1.1 1.3-2.8 1.5-1.6.2-2.7-.1-3.9-1-1-.7-1.3-1.2-2.3-3.6-.5-1.2-1-2.1-1.5-2.7-.8-.9-1.5-1.2-2.5-1.2-1.4 0-2.2.8-2.7 2.5-.3 1.1-.3 3.2 0 4.8.4 1.8 1.2 3 2.5 3.6.7.3.7.3 3.3.4 2.7 0 3.3.1 4.3.7 1.6.8 2.7 2.5 3 4.6.2 1.2 0 3.2-.5 4.6-1 2.8-3.1 4.4-6 4.7-2.2.2-4.4-.5-5.8-1.9-1.5-1.5-2.2-3.4-2.5-6.4-.1-1.1-.1-5.7 0-7.3.3-3.8 1-6.4 2.3-8.4.5-.8 1.6-1.9 2.4-2.3z" />
    </svg>
  );
}

import Image from "next/image";

export function ArcLogo({ className = "" }: { className?: string }) {
  return (
    <Image 
      src="/logo_arc.png" 
      alt="Arc" 
      width={40} 
      height={40} 
      className={className} 
    />
  );
}
