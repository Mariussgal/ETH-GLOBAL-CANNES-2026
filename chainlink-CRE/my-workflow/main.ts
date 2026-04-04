import { cre, Runner, type Runtime, type HTTPPayload, decodeJson, HTTPClient, consensusMedianAggregation, consensusIdenticalAggregation, type HTTPSendRequester, EVMClient, Report } from "@chainlink/cre-sdk";
import { SDK_PB } from "@chainlink/cre-sdk/pb";
import { create } from "@bufbuild/protobuf";

interface Config {}

// ============================================================
// ADRESSES SEPOLIA — à mettre à jour après redéploiement P1
// ============================================================
const STREAM_FACTORY_ADDRESS = "1Bc1135c04Ad7236C56b8EBc1F3b25A8A0ecb5D6"; // TODO: confirmer avec P1
const MASTER_SETTLER_ADDRESS = "2F3dd4718A8e8f709d82aC37840565ABCEddA780"; // TODO: confirmer avec P1
const PROXY_URL = "http://ysm-defilama-proxy.ysm-market-proxy.workers.dev/fees/";

// ============================================================
// ABI ENCODING — helpers manuels (abi.encode compatible)
// ============================================================

const encodeUint256 = (value: number | bigint): string =>
  BigInt(value).toString(16).padStart(64, "0");

const encodeUint8 = (value: number): string =>
  value.toString(16).padStart(64, "0");

const encodeBool = (value: boolean): string =>
  (value ? 1 : 0).toString(16).padStart(64, "0");

/**
 * Encode un bytes dynamique (length slot + data padded to 32 bytes)
 */
const encodeBytesPayload = (hexData: string): string => {
  const len = hexData.length / 2;
  const lenHex = len.toString(16).padStart(64, "0");
  const paddedLen = Math.ceil(len / 32) * 64;
  const padded = hexData.padEnd(paddedLen, "0");
  return lenHex + padded;
};

/**
 * Encode le report final : abi.encode(uint8 workflowType, bytes innerPayload)
 *
 * Slots ABI :
 *   [0x00] uint8  workflowType   (padded to 32 bytes)
 *   [0x20] offset → bytes data  = 0x40 (2 slots)
 *   [0x40] length de innerPayload
 *   [0x60+] innerPayload data    (padded to 32 bytes)
 */
const encodeReport = (workflowType: number, innerPayloadHex: string): Uint8Array => {
  const typeSlot   = encodeUint8(workflowType);
  const offsetSlot = encodeUint256(0x40); // offset fixe : 2 slots × 32 bytes = 64
  const payloadBody = encodeBytesPayload(innerPayloadHex);

  const fullHex = typeSlot + offsetSlot + payloadBody;
  const bytes = new Uint8Array(fullHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(fullHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const makeReport = (rawReportBytes: Uint8Array): Report => {
  const reportResponse = create(SDK_PB.ReportResponseSchema, {
    rawReport: rawReportBytes,
  });
  return new Report(reportResponse);
};

// ============================================================
// Chainlink latestAnswer() → int256 (8 décimales), encodé sur 32 bytes
// ============================================================

const decodeLatestAnswerUsd = (data: Uint8Array | undefined): number | null => {
  if (!data || data.length < 32) return null;
  const slice = data.subarray(data.length - 32);
  let hex = "";
  for (let i = 0; i < 32; i++) {
    hex += slice[i]!.toString(16).padStart(2, "0");
  }
  const unsigned = BigInt("0x" + hex);
  const signBit = 1n << 255n;
  const signed = unsigned >= signBit ? unsigned - (1n << 256n) : unsigned;
  const usd = Number(signed) / 1e8;
  return Number.isFinite(usd) && usd > 0 ? usd : null;
};

// ============================================================
// HTTP helpers
// ============================================================

const fetchEthSpotBinanceApi = (sendRequester: HTTPSendRequester, url: string): number => {
  try {
    const response = sendRequester.sendRequest({ url, method: "GET" }).result();
    const data = JSON.parse(new TextDecoder().decode(response.body));
    const p = parseFloat(data.price);
    return Number.isFinite(p) && p > 0 ? p : 3500;
  } catch {
    return 3500;
  }
};

const fetchEthPrice30dApi = (sendRequester: HTTPSendRequester, url: string): number => {
  try {
    const response = sendRequester.sendRequest({ url, method: "GET" }).result();
    const data = JSON.parse(new TextDecoder().decode(response.body));
    if (data && data[0] && data[0][4]) return parseFloat(data[0][4]);
    return 3200;
  } catch { return 3200; }
};

const fetchProxyStatsApi = (sendRequester: HTTPSendRequester, url: string): string => {
  try {
    const response = sendRequester.sendRequest({ url, method: "GET" }).result();
    return new TextDecoder().decode(response.body);
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
};

// ============================================================
// WORKFLOW #1 — Calcul décote (workflowType = 1)
// Trigger : HTTP  |  Payload attendu : { "slug": "..." }
// Report  : abi.encode(uint8=1, bytes=abi.encode(uint256 discountBps))
// ============================================================

const onDecoteTrigger = async (runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> => {
  let slug = "quickswap";
  try {
    const body = decodeJson(payload.input) as any;
    if (body?.slug) slug = body.slug;
  } catch {}

  runtime.log(`[WORKFLOW #1] Calcul décote pour slug : ${slug}`);

  const httpClient = new HTTPClient();

  // --- Prix ETH actuel : Chainlink feed Sepolia, sinon spot Binance (la simu renvoie souvent data vide) ---
  let ethUsdPriceNow = 3500;
  const spotUrl = "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT";
  try {
    const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
    const reply = evm.callContract(runtime, {
      call: {
        to: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // ETH/USD feed Sepolia
        data: "0x50d25bcd", // latestAnswer()
      }
    }).result();
    const fromFeed = decodeLatestAnswerUsd(reply.data);
    if (fromFeed != null) {
      ethUsdPriceNow = fromFeed;
      runtime.log(`[WORKFLOW #1] ETH/USD actuel (Chainlink) : $${ethUsdPriceNow.toFixed(2)}`);
    } else {
      ethUsdPriceNow = httpClient.sendRequest(runtime, fetchEthSpotBinanceApi, consensusMedianAggregation())(spotUrl).result();
      runtime.log(`[WORKFLOW #1] ETH/USD actuel (Binance, feed vide en simu) : $${ethUsdPriceNow.toFixed(2)}`);
    }
  } catch (e: any) {
    try {
      ethUsdPriceNow = httpClient.sendRequest(runtime, fetchEthSpotBinanceApi, consensusMedianAggregation())(spotUrl).result();
      runtime.log(`[WORKFLOW #1] ETH/USD actuel (Binance, feed erreur) : $${ethUsdPriceNow.toFixed(2)} — ${e.message}`);
    } catch {
      runtime.log(`[WORKFLOW #1] Prix spot indisponible, fallback $${ethUsdPriceNow} : ${e.message}`);
    }
  }

  // --- Prix ETH il y a 30j via Binance ---
  let ethUsdPrice30d = 3200;
  try {
    const t30j = Math.floor(Date.now() / 86400000) * 86400000 - 30 * 24 * 3600 * 1000;
    const url = `https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=1&endTime=${t30j}`;
    ethUsdPrice30d = httpClient.sendRequest(runtime, fetchEthPrice30dApi, consensusMedianAggregation())(url).result();
    runtime.log(`[WORKFLOW #1] ETH/USD il y a 30j : $${ethUsdPrice30d}`);
  } catch (e: any) {
    runtime.log(`[WORKFLOW #1] Binance indisponible, fallback $${ethUsdPrice30d} : ${e.message}`);
  }

  // --- rScore via proxy DeFiLlama ---
  let rScore = 0.8;
  try {
    const statsJson = httpClient.sendRequest(runtime, fetchProxyStatsApi, consensusIdenticalAggregation())(`${PROXY_URL}${slug}`).result();
    const stats = JSON.parse(statsJson);
    if (stats && !stats.error) {
      rScore = stats.rScore ?? 0.8;
      runtime.log(`[WORKFLOW #1] rScore proxy : ${rScore}`);
    }
  } catch (e: any) {
    runtime.log(`[WORKFLOW #1] Proxy indisponible, fallback rScore=${rScore} : ${e.message}`);
  }

  // --- Calcul décote ---
  const sigma = 0.165;
  const marketRisk = ethUsdPriceNow < ethUsdPrice30d
    ? 1 - ethUsdPriceNow / ethUsdPrice30d
    : 0;
  let decote = 0.25 * (sigma * 3.46) + 0.35 * (1 - rScore) + 0.40 * marketRisk;
  decote = Math.min(Math.max(decote, 0.10), 0.50);
  const discountBps = Math.floor(decote * 100) * 100;

  runtime.log(`[WORKFLOW #1] Décote : ${Math.floor(decote * 100)}% = ${discountBps} bps (marketRisk=${marketRisk.toFixed(3)}, rScore=${rScore})`);

  // --- Envoi on-chain via CRE ---
  // report = abi.encode(uint8=1, bytes=abi.encode(uint256 discountBps))
  const innerPayload = encodeUint256(discountBps);
  const reportBytes  = encodeReport(1, innerPayload);

  // Log du hex pour test manuel via demo-sender.ts
  let reportHex = "0x";
  for (let i = 0; i < reportBytes.length; i++) reportHex += reportBytes[i]!.toString(16).padStart(2, "0");
  runtime.log(`[WORKFLOW #1] REPORT_HEX=${reportHex}`);

  try {
    const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
    evm.writeReport(runtime, {
      receiver: "0x" + STREAM_FACTORY_ADDRESS,
      report: makeReport(reportBytes),
    }).result();
    runtime.log(`[WORKFLOW #1] ✅ writeReport envoyé → StreamFactory (${discountBps} bps)`);
  } catch (e: any) {
    runtime.log(`[WORKFLOW #1] ⚠️ writeReport non exécuté (normal en simulation) : ${e.message}`);
  }

  return "OK";
};

// ============================================================
// WORKFLOW #2 — Gate (workflowType = 2)
// Trigger : HTTP  |  Payload attendu : { "slug": "..." }
// Report  : abi.encode(uint8=2, bytes=abi.encode(bool approved))
// ============================================================

const onGateTrigger = async (runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> => {
  let slug = "quickswap";
  try {
    const body = decodeJson(payload.input) as any;
    if (body?.slug) slug = body.slug;
  } catch {}

  runtime.log(`[WORKFLOW #2] Évaluation Gate pour : ${slug}`);

  const httpClient = new HTTPClient();
  let avg30 = 0, rScore = 0.5, daysOfData = 0;

  try {
    const statsJson = httpClient.sendRequest(runtime, fetchProxyStatsApi, consensusIdenticalAggregation())(`${PROXY_URL}${slug}`).result();
    const stats = JSON.parse(statsJson);
    if (stats && !stats.error) {
      avg30      = stats.avg30 ?? 0;
      rScore     = stats.rScore ?? 0.5;
      daysOfData = stats.daysOfData ?? 0;
      runtime.log(`[WORKFLOW #2] Stats proxy : avg30=$${avg30.toFixed(0)}/j, rScore=${rScore}, days=${daysOfData}`);
    }
  } catch (e: any) {
    runtime.log(`[WORKFLOW #2] Proxy indisponible : ${e.message}`);
  }

  const approved = avg30 >= 1000 && rScore >= 0.5 && daysOfData >= 90;

  runtime.log(`[WORKFLOW #2] Critère revenus avg30=$${avg30.toFixed(0)} ≥ $1000 → ${avg30 >= 1000 ? "✓" : "✗"}`);
  runtime.log(`[WORKFLOW #2] Critère rScore ${rScore} ≥ 0.5 → ${rScore >= 0.5 ? "✓" : "✗"}`);
  runtime.log(`[WORKFLOW #2] Critère ancienneté ${daysOfData}j ≥ 90j → ${daysOfData >= 90 ? "✓" : "✗"}`);
  runtime.log(`[WORKFLOW #2] Gate ${slug} : ${approved ? "ACCEPTÉ ✅" : "REFUSÉ ❌"}`);

  // --- Envoi on-chain via CRE ---
  // report = abi.encode(uint8=2, bytes=abi.encode(bool approved))
  const innerPayload = encodeBool(approved);
  const reportBytes  = encodeReport(2, innerPayload);

  // Log du hex pour test manuel via demo-sender.ts
  let reportHex = "0x";
  for (let i = 0; i < reportBytes.length; i++) reportHex += reportBytes[i]!.toString(16).padStart(2, "0");
  runtime.log(`[WORKFLOW #2] REPORT_HEX=${reportHex}`);

  try {
    const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
    evm.writeReport(runtime, {
      receiver: "0x" + STREAM_FACTORY_ADDRESS,
      report: makeReport(reportBytes),
    }).result();
    runtime.log(`[WORKFLOW #2] ✅ writeReport envoyé → StreamFactory (approved=${approved})`);
  } catch (e: any) {
    runtime.log(`[WORKFLOW #2] ⚠️ writeReport non exécuté (normal en simulation) : ${e.message}`);
  }

  return "OK";
};

// ============================================================
// WORKFLOW #3 — Settlement
// Trigger : Cron  |  Report : vide (0x)
// ============================================================

const onSettlementTrigger = async (runtime: Runtime<Config>, _payload: any): Promise<string> => {
  runtime.log(`[WORKFLOW #3] Settlement déclenché`);

  try {
    const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
    evm.writeReport(runtime, {
      receiver: "0x" + MASTER_SETTLER_ADDRESS,
      report: makeReport(new Uint8Array(0)),
    }).result();
    runtime.log(`[WORKFLOW #3] ✅ writeReport envoyé → MasterSettler`);
  } catch (e: any) {
    runtime.log(`[WORKFLOW #3] ⚠️ writeReport non exécuté (normal en simulation) : ${e.message}`);
  }

  return "OK";
};

// ============================================================
// INIT
// ============================================================

const initWorkflow = (_config: Config) => {
  const http1 = new cre.capabilities.HTTPCapability();
  const http2 = new cre.capabilities.HTTPCapability();
  const cron  = new cre.capabilities.CronCapability();

  return [
    cre.handler(http1.trigger({}), onDecoteTrigger),
    cre.handler(http2.trigger({}), onGateTrigger),
    cre.handler(cron.trigger({ schedule: "0 0 * * *" }), onSettlementTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
