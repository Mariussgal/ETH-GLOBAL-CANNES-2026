import { hexToBigInt, toEventHash } from "viem";
import type { Log } from "viem";
import { SEPOLIA_CHAIN_ID } from "@/contracts";

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

// topic0 = keccak256("FeesReceived(uint256,uint256,uint256,uint256)")
const FEES_RECEIVED_TOPIC0 = toEventHash(
    "FeesReceived(uint256,uint256,uint256,uint256)"
);

export async function fetchFeesReceivedLogsEtherscan(
    apiKey: string,
    routerAddress: `0x${string}`,
    fromBlock: bigint,
    toBlock: bigint
): Promise<Log[]> {
    const params = new URLSearchParams({
        chainid: String(SEPOLIA_CHAIN_ID),
        module: "logs",
        action: "getLogs",
        address: routerAddress,
        fromBlock: fromBlock.toString(10),
        toBlock: toBlock.toString(10),
        topic0: FEES_RECEIVED_TOPIC0,
        page: "1",
        offset: "1000",
        apikey: apiKey,
    });

    const res = await fetch(`${ETHERSCAN_V2}?${params.toString()}`);
    const json = await res.json() as { status: string; message: string; result: unknown[] | string };

    if (json.status !== "1") return [];

    return (json.result as {
        address: string; blockHash: string; blockNumber: string;
        data: string; logIndex: string; transactionHash: string;
        transactionIndex: string; topics: string[];
    }[]).map((row) => ({
        address: row.address as `0x${string}`,
        blockHash: row.blockHash as `0x${string}`,
        blockNumber: hexToBigInt(row.blockNumber as `0x${string}`),
        data: row.data as `0x${string}`,
        logIndex: Number(hexToBigInt((row.logIndex || "0x0") as `0x${string}`)),
        transactionHash: row.transactionHash as `0x${string}`,
        transactionIndex: Number(hexToBigInt((row.transactionIndex || "0x0") as `0x${string}`)),
        topics: row.topics as [`0x${string}`, ...`0x${string}`[]],
        removed: false,
    }));
}