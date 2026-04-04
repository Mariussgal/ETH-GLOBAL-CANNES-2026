/**
 * Historique des réceptions (Buy) pour un émetteur via Etherscan API V2.
 * Filtre les événements Buy(address indexed buyer, address indexed yst, address indexed emitter, uint256 amountUsdc).
 */

import { hexToBigInt } from "viem";
import type { Log } from "viem";
import { ADDRESSES, SEPOLIA_CHAIN_ID } from "@/contracts";

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";
const USDC_DECIMALS = 6;

/** topic0 = keccak256("Buy(address,address,address,uint256)") */
export const BUY_EVENT_TOPIC0 = "0xde6f78816c7cf51f4788ee96f4201880e6439f04ca37d578c772c72b2204a919" as const;

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
  issuerAddress: `0x${string}`,
  lookbackBlocks: bigint = BigInt(50_000)
): Promise<IssuerReceiveTx[]> {
  if (!apiKey) throw new Error("Etherscan API key missing");

  // On cherche l'émetteur dans le topic3 (3ème paramètre indexé de Buy)
  const topic3 = issuerAddress.toLowerCase().padStart(66, "0") as `0x${string}`;

  const params = new URLSearchParams({
    chainid: String(SEPOLIA_CHAIN_ID),
    module: "logs",
    action: "getLogs",
    address: ADDRESSES.primarySale,
    topic0: BUY_EVENT_TOPIC0,
    topic0_3_opr: "and",
    topic3: topic3,
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
  return rows.map((r: any) => {
    // Topic 1 = buyer
    const buyer = `0x${r.topics[1].slice(26)}` as `0x${string}`;
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
