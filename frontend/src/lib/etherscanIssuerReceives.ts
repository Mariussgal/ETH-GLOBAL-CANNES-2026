/**
 * Historique des réceptions (Buy) pour un émetteur via Etherscan API V2.
 * Filtre les événements Buy(address indexed buyer, address indexed yst, address indexed emitter, uint256 amountUsdc).
 */

import { hexToBigInt } from "viem";
import { ADDRESSES, SEPOLIA_CHAIN_ID } from "@/contracts";

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";
const USDC_DECIMALS = 6;

/** topic0 = keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_EVENT_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export type IssuerReceiveTx = {
  hash: `0x${string}`;
  buyer: `0x${string}`;
  amountUsdc: number;
  timestamp: string;
  blockNumber: string;
};

/** Évite tout RPC, passe par le proxy Etherscan pour les logs du PrimarySale filtrés par topic3 (emitter). */
export async function fetchIssuerBuyLogsEtherscan(
  apiKey: string,
  issuerAddress: `0x${string}`
): Promise<IssuerReceiveTx[]> {
  if (!apiKey) throw new Error("Etherscan API key missing");

  // On cherche les transferts USDC DEPUIS le PrimarySale VERS l'émetteur
  const topic1 = `0x${ADDRESSES.primarySale.toLowerCase().slice(2).padStart(64, "0")}` as `0x${string}`;
  const topic2 = `0x${issuerAddress.toLowerCase().slice(2).padStart(64, "0")}` as `0x${string}`;

  const params = new URLSearchParams({
    chainid: String(SEPOLIA_CHAIN_ID),
    module: "logs",
    action: "getLogs",
    fromBlock: "6000000", // On remonte assez loin sur Sepolia
    toBlock: "latest",
    address: ADDRESSES.usdc,
    topic0: TRANSFER_EVENT_TOPIC0,
    topic1: topic1,
    topic2: topic2,
    page: "1",
    offset: "1000",
    apikey: apiKey,
  });

  const res = await fetch(`${ETHERSCAN_V2}?${params.toString()}`);
  const json = await res.json();

  if (json.status !== "1") {
    if (json.message === "No records found") return [];
    throw new Error(`Etherscan API: ${json.message}`);
  }

  const rows = Array.isArray(json.result) ? json.result : [];
  return rows.map((r: { topics: string[]; data: `0x${string}`; transactionHash: string; timeStamp: string; blockNumber: string }) => {
    // Topic 2 = to (issuer)
    const buyer = `0x${r.topics[1].slice(26)}` as `0x${string}`; // Show 'from' if needed, but primarySale is the payer
    // Data = amountUsdc (uint256)
    const amountRaw = hexToBigInt(r.data);
    const amountUsdc = Number(amountRaw) / 10 ** USDC_DECIMALS;

    return {
      hash: r.transactionHash as `0x${string}`,
      buyer,
      amountUsdc,
      timestamp: r.timeStamp ? new Date(parseInt(r.timeStamp) * 1000).toISOString() : new Date().toISOString(),
      blockNumber: r.blockNumber
    };
  }).reverse(); // Most recent first
}
