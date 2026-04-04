/**
 * Historique FeesGenerated via [Etherscan API V2](https://docs.etherscan.io/api-reference/endpoint/getlogs-address-topics.md)
 * — évite les limites eth_getLogs des RPC (Alchemy free : 10 blocs / requête, CU/s, etc.).
 */

import { hexToBigInt } from "viem";
import type { Log } from "viem";
import { SEPOLIA_CHAIN_ID } from "@/contracts";

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

/** Fenêtre d’historique pour le feed (Sepolia ~12s/bloc : ~2 jours à 20k blocs) */
export const TOTAL_HISTORY_LOOKBACK_BLOCKS = BigInt(20_000);

/**
 * Plage max par requête getLogs (blocs inclusifs : from..from+span-1).
 * Doit couvrir TOTAL_HISTORY_LOOKBACK_BLOCKS + 1 blocs (latest − N … latest).
 */
const ETHERSCAN_GETLOGS_BLOCK_SPAN = 25_000n;

/** Transport JSON pour Route Handler → client (viem Log contient des bigint) */
export type SerializedLog = {
  address: `0x${string}`;
  blockHash: `0x${string}`;
  blockNumber: string;
  data: `0x${string}`;
  logIndex: number;
  transactionHash: `0x${string}`;
  transactionIndex: number;
  topics: [`0x${string}`, ...`0x${string}`[]];
  removed: boolean;
};

export function serializeLog(log: Log): SerializedLog {
  const bn = log.blockNumber ?? BigInt(0);
  return {
    address: log.address,
    blockHash: (log.blockHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`,
    blockNumber: bn.toString(),
    data: log.data,
    logIndex: log.logIndex ?? 0,
    transactionHash: (log.transactionHash ??
      "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`,
    transactionIndex: log.transactionIndex ?? 0,
    topics:
      log.topics.length > 0
        ? (log.topics as [`0x${string}`, ...`0x${string}`[]])
        : ([
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          ] as [`0x${string}`, ...`0x${string}`[]]),
    removed: log.removed ?? false,
  };
}

export function deserializeLog(s: SerializedLog): Log {
  return {
    ...s,
    blockNumber: BigInt(s.blockNumber),
  };
}

/** Dernier bloc Sepolia via [eth_blockNumber](https://docs.etherscan.io/api-reference/endpoint/ethblocknumber.md) (évite tout RPC). */
export async function getSepoliaBlockNumberEtherscan(apiKey: string): Promise<bigint> {
  const params = new URLSearchParams({
    chainid: String(SEPOLIA_CHAIN_ID),
    module: "proxy",
    action: "eth_blockNumber",
    apikey: apiKey,
  });
  const res = await fetch(`${ETHERSCAN_V2}?${params.toString()}`);
  const raw = (await res.json()) as Record<string, unknown>;
  let hex: string | undefined;
  if (typeof raw.result === "string" && raw.result.startsWith("0x")) {
    hex = raw.result;
  } else if (raw.result && typeof raw.result === "object" && raw.result !== null) {
    const inner = (raw.result as { result?: string }).result;
    if (typeof inner === "string" && inner.startsWith("0x")) hex = inner;
  }
  if (!hex) {
    throw new Error("Etherscan eth_blockNumber: réponse inattendue");
  }
  return hexToBigInt(hex as `0x${string}`);
}

/** topic0 = keccak256("FeesGenerated(string,string,uint256,uint256)") — mocks Quickswap */
export const FEES_GENERATED_TOPIC0 =
  "0x2f9eb16e2e890b493daf7af97049a73b812afea7a5dd16282061b8ef265cc3f7" as const;

type EtherscanLogRow = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
};

function mapEtherscanRowToLog(row: EtherscanLogRow): Log {
  const li = row.logIndex && row.logIndex !== "0x" ? row.logIndex : "0x0";
  const ti = row.transactionIndex && row.transactionIndex !== "0x" ? row.transactionIndex : "0x0";
  return {
    address: row.address as `0x${string}`,
    blockHash: row.blockHash as `0x${string}`,
    blockNumber: hexToBigInt(row.blockNumber as `0x${string}`),
    data: row.data as `0x${string}`,
    logIndex: Number(hexToBigInt(li as `0x${string}`)),
    transactionHash: row.transactionHash as `0x${string}`,
    transactionIndex: Number(hexToBigInt(ti as `0x${string}`)),
    topics: row.topics as [`0x${string}`, ...`0x${string}`[]],
    removed: false,
  };
}

/**
 * Récupère tous les logs FeesGenerated sur [fromBlock, toBlock] (pagination 1000 max / page par plage).
 */
export async function fetchFeesGeneratedLogsEtherscan(
  apiKey: string,
  contractAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<Log[]> {
  if (!apiKey) {
    throw new Error("Etherscan: clé API manquante");
  }
  if (fromBlock > toBlock) return [];

  const out: Log[] = [];
  let chunkStart = fromBlock;
  while (chunkStart <= toBlock) {
    const chunkEnd =
      chunkStart + ETHERSCAN_GETLOGS_BLOCK_SPAN - 1n <= toBlock
        ? chunkStart + ETHERSCAN_GETLOGS_BLOCK_SPAN - 1n
        : toBlock;

    const chunk = await fetchFeesGeneratedLogsEtherscanRange(
      apiKey,
      contractAddress,
      chunkStart,
      chunkEnd
    );
    out.push(...chunk);

    chunkStart = chunkEnd + 1n;
    if (chunkStart <= toBlock) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return out;
}

async function fetchFeesGeneratedLogsEtherscanRange(
  apiKey: string,
  contractAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<Log[]> {
  const out: Log[] = [];
  let page = 1;
  const offset = 1000;
  const from = fromBlock.toString(10);
  const to = toBlock.toString(10);

  while (true) {
    const params = new URLSearchParams({
      chainid: String(SEPOLIA_CHAIN_ID),
      module: "logs",
      action: "getLogs",
      address: contractAddress,
      fromBlock: from,
      toBlock: to,
      topic0: FEES_GENERATED_TOPIC0,
      page: String(page),
      offset: String(offset),
      apikey: apiKey,
    });

    const url = `${ETHERSCAN_V2}?${params.toString()}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      status: string;
      message: string;
      result: EtherscanLogRow[] | string;
    };

    if (json.status !== "1") {
      const msg = String(json.message ?? "");
      const r = typeof json.result === "string" ? json.result : "";
      if (
        msg.toLowerCase().includes("no records") ||
        r.toLowerCase().includes("no records") ||
        msg === "No transactions found"
      ) {
        break;
      }
      throw new Error(`Etherscan getLogs: ${msg} ${r}`);
    }

    const rows = Array.isArray(json.result) ? json.result : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      out.push(mapEtherscanRowToLog(row));
    }

    if (rows.length < offset) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 400));
  }

  return out;
}
