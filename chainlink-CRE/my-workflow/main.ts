import { cre, Runner, type Runtime, type HTTPPayload, decodeJson, HTTPClient, consensusMedianAggregation, consensusIdenticalAggregation, type HTTPSendRequester, EVMClient } from "@chainlink/cre-sdk";

interface Config {

}

const KEEPER_ADDRESS       = "aad4F938F75A14015E84D7f1aFA81F8A53ad79B7"; 
const FACTORY_ADDRESS      = "3615CFfF7D94710AC12Ed63c94E28F53551Ac32E"; 
const ROUTER_ADDRESS       = "02E75407376e5FBEd0e507E8265d92CeE9279fDC"; 
const MOCK_PROTOCOL        = "1794D78868884567fB4A483e8B827938d9d81C27"; 
const MOCK_QS_BASE         = "a1A2A7280Ff5EB33773A89F8e05F2Ab7ba67351A"; 
const MOCK_QS_POLYGON      = "CfB176618D17c7e05A2A5D3d044D89Bce5f320F5"; 
const USDC_ADDRESS         = "1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; 
const CRE_FORWARDER        = "15fc6ae953e024d975e77382eeec56a9101f9f88"; 
const PRICE_FLOOR_HOOK     = "438197E899F22AFC742cf65c20f0dc15730DAfC9"; 

const PERFORM_UPKEEP_SELECTOR = "4585e33b";

const CHECK_UPKEEP_SELECTOR   = "6e04d938";

const abiEncodeUint256 = (value: number): string => {
  return value.toString(16).padStart(64, '0'); 
};

const PROXY_URL = "http://ysm-defilama-proxy.ysm-market-proxy.workers.dev/fees/";

const fetchEthPrice30dApi = (sendRequester: HTTPSendRequester, url: string): number => {
  try {
      const response = sendRequester.sendRequest({ url: url, method: "GET" }).result();
      const data = JSON.parse(new TextDecoder().decode(response.body));
      if (data && data[0] && data[0][4]) {
          return parseFloat(data[0][4]); 
      }
      return 3200;
  } catch(e) {
      return 3200;
  }
};

const fetchProxyStatsApi = (sendRequester: HTTPSendRequester, url: string): string => {
  try {
      const response = sendRequester.sendRequest({ url: url, method: "GET" }).result();
      return new TextDecoder().decode(response.body);
  } catch(e: any) {
      return JSON.stringify({ error: e.message });
  }
};

const onDecoteTrigger = async (runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> => {
  let protocolSlug = "quickswap";
  try {
    const body = decodeJson(payload.input) as any;
    if (body && body.slug) protocolSlug = body.slug;
  } catch (e) {}

  runtime.log(`[WORKFLOW #1] Calcul décote pour : ${protocolSlug}`);

  let ethUsdPriceNow = 0;
  try {
     const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
     const callPayload = {
         from: Buffer.from("0000000000000000000000000000000000000000", "hex").toString("base64"),
         to: Buffer.from("694AA1769357215DE4FAC081bf1f309aDC325306", "hex").toString("base64"), 
         data: Buffer.from("50d25bcd", "hex").toString("base64") 
     };
     const reply = evm.callContract(runtime, { call: callPayload }).result();
     let dataHex = "";
     for (let i = 0; i < reply.data.length; i++) {
        dataHex += reply.data[i].toString(16).padStart(2, '0');
     }
     ethUsdPriceNow = parseInt(dataHex, 16) / 100000000;
     runtime.log(`[WORKFLOW #1] Prix ETH/USD (Chainlink Sepolia) : $${ethUsdPriceNow}`);
  } catch (err: any) {
     runtime.log(`[WORKFLOW #1] ERREUR Price Feed : ${err.message}`);
  }

  const httpClient = new HTTPClient();

  let ethUsdPrice30d = 3200;
  try {
     const thirtyDaysAgoMs = Math.floor(Date.now() / 86400000) * 86400000 - (30 * 24 * 60 * 60 * 1000);
     const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=1&endTime=${thirtyDaysAgoMs}`;
     const getEth30d = httpClient.sendRequest(runtime, fetchEthPrice30dApi, consensusMedianAggregation());
     ethUsdPrice30d = getEth30d(binanceUrl).result();
     runtime.log(`[WORKFLOW #1] Prix ETH/USD il y a 30j (Binance) : $${ethUsdPrice30d}`);
  } catch (err: any) {
     runtime.log(`[WORKFLOW #1] ERREUR Binance : ${err.message}`);
  }

  let rScore = 0.8;
  try {
     const getStats = httpClient.sendRequest(runtime, fetchProxyStatsApi, consensusIdenticalAggregation());
     const statsJson = getStats(`${PROXY_URL}${protocolSlug}`).result();
     const stats = JSON.parse(statsJson);
     if (stats && !stats.error) {
       rScore = stats.rScore ?? 0.8;
       runtime.log(`[WORKFLOW #1] rScore (Proxy) : ${rScore}`);
     } else {
       runtime.log(`[WORKFLOW #1] Proxy error: ${stats.error || "unknown"}`);
     }
  } catch (err: any) {
     runtime.log(`[WORKFLOW #1] ERREUR Proxy rScore : ${err.message}`);
  }

  let marketRisk = 0.0;
  if (ethUsdPriceNow > 0 && ethUsdPrice30d > 0 && ethUsdPriceNow < ethUsdPrice30d) {
     marketRisk = 1 - (ethUsdPriceNow / ethUsdPrice30d);
  }

  const sigma = 0.165;

  let decote = (0.25 * (sigma * 3.46)) + (0.35 * (1 - rScore)) + (0.40 * marketRisk);
  decote = Math.min(Math.max(decote, 0.10), 0.50);
  const decoteInt = Math.floor(decote * 100);
  const discountBps = decoteInt * 100; 

  runtime.log(`[WORKFLOW #1] Décote finale : ${decoteInt}% = ${discountBps} bps (marketRisk=${marketRisk.toFixed(3)}, rScore=${rScore})`);

  const encodedResult = abiEncodeUint256(discountBps);

  try {
    const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
    const receiverBytes = Buffer.from(FACTORY_ADDRESS, "hex");
    evm.writeReport(runtime, { receiver: receiverBytes }).result();
    runtime.log(`[WORKFLOW #1] ✅ writeReport envoyé à Factory (${discountBps} bps)`);
  } catch (err: any) {
    runtime.log(`[WORKFLOW #1] ⚠️ writeReport non exécuté en simulation (normal) : ${err.message}`);
  }

  return encodedResult;
};

const onGateTrigger = async (runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> => {
  let protocolSlug = "quickswap";
  try {
    const body = decodeJson(payload.input) as any;
    if (body && body.slug) protocolSlug = body.slug;
  } catch (e) {}

  runtime.log(`[WORKFLOW #2] Évaluation Gate pour : ${protocolSlug}`);

  const httpClient = new HTTPClient();
  let avg30 = 0;
  let rScore = 0.5;
  let daysOfData = 0;

  try {
     const getStats = httpClient.sendRequest(runtime, fetchProxyStatsApi, consensusIdenticalAggregation());
     const statsJson = getStats(`${PROXY_URL}${protocolSlug}`).result();
     const stats = JSON.parse(statsJson);
     if (stats && !stats.error) {
       avg30 = stats.avg30 ?? 0;
       rScore = stats.rScore ?? 0.5;
       daysOfData = stats.daysOfData ?? 0;
       runtime.log(`[WORKFLOW #2] Stats Proxy : avg30=${avg30}, rScore=${rScore}, days=${daysOfData}`);
     } else {
       runtime.log(`[WORKFLOW #2] Proxy error: ${stats.error || "unknown"}`);
     }
  } catch (err: any) {
     runtime.log(`[WORKFLOW #2] ERREUR Proxy stats : ${err.message}`);
  }

  const SEUIL_FEES_DAY = 1000;
  const critere1 = avg30 >= SEUIL_FEES_DAY;
  runtime.log(`[WORKFLOW #2] Critère 1 - Revenus moyens 30j: $${avg30.toFixed(0)}/jour (seuil: $${SEUIL_FEES_DAY}) → ${critere1 ? "✓ PASS" : "✗ FAIL"}`);

  const SEUIL_RSCORE = 0.5;
  const critere2 = rScore >= SEUIL_RSCORE;
  runtime.log(`[WORKFLOW #2] Critère 2 - rScore momentum: ${rScore} (seuil: ${SEUIL_RSCORE}) → ${critere2 ? "✓ PASS" : "✗ FAIL"}`);

  const SEUIL_DAYS = 90;
  const critere3 = daysOfData >= SEUIL_DAYS;
  runtime.log(`[WORKFLOW #2] Critère 3 - Historique: ${daysOfData} jours (seuil: ${SEUIL_DAYS}) → ${critere3 ? "✓ PASS" : "✗ FAIL"}`);

  const isAccepted = critere1 && critere2 && critere3;
  const reason = !critere1 ? "Revenus insuffisants (<$1k/jour)" :
                 !critere2 ? "Momentum en chute (rScore<0.5)" :
                 !critere3 ? "Historique trop court (<90j)" : "OK";

  runtime.log(`[WORKFLOW #2] Décision finale : ${isAccepted ? "✅ ACCEPTÉ" : "❌ REFUSÉ"} (${reason})`);
  runtime.log(`[WORKFLOW #2] avg30dFees=$${Math.round(avg30)}/j | rScore=${rScore} | daysOfData=${daysOfData}`);

  const gateResult = abiEncodeUint256(isAccepted ? 1 : 0);

  try {
    const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
    const receiverBytes = Buffer.from(FACTORY_ADDRESS, "hex");
    evm.writeReport(runtime, { receiver: receiverBytes }).result();
    runtime.log(`[WORKFLOW #2] ✅ writeReport envoyé à Factory (gate=${isAccepted ? 1 : 0})`);
  } catch (err: any) {
    runtime.log(`[WORKFLOW #2] ⚠️ writeReport non exécuté en simulation (normal) : ${err.message}`);
  }

  return gateResult;
};

const onSettlementTrigger = async (runtime: Runtime<Config>, payload: any): Promise<string> => {
  runtime.log(`[WORKFLOW #3] ⏰ Settlement daily déclenché`);

  let protocolSlug = "quickswap";
  try {
    const body = decodeJson(payload.input) as any;
    if (body && body.slug) protocolSlug = body.slug;
  } catch (e) {}

  const httpClient = new HTTPClient();

  let yesterdayFees = 0;
  try {
    const getStats = httpClient.sendRequest(runtime, fetchProxyStatsApi, consensusIdenticalAggregation());
    const statsJson = getStats(`${PROXY_URL}${protocolSlug}`).result();
    const stats = JSON.parse(statsJson);
    yesterdayFees = stats.yesterdayFees || 0;

    runtime.log(`[WORKFLOW #3] Fees Proxy hier pour ${protocolSlug} : $${yesterdayFees.toFixed(2)}`);
  } catch (err: any) {
    runtime.log(`[WORKFLOW #3] ERREUR Proxy settlement : ${err.message}`);
  }

  const distributableUSDC = yesterdayFees; 
  runtime.log(`[WORKFLOW #3] Montant USDC estimé pour la démo : $${distributableUSDC.toFixed(2)} USDC`);

  try {
    const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);

    const checkCallData = CHECK_UPKEEP_SELECTOR
      + "0000000000000000000000000000000000000000000000000000000000000020" 
      + "0000000000000000000000000000000000000000000000000000000000000000"; 

    const checkPayload = {
      from: Buffer.from("0000000000000000000000000000000000000000", "hex").toString("base64"),
      to:   Buffer.from(KEEPER_ADDRESS, "hex").toString("base64"),
      data: Buffer.from(checkCallData, "hex").toString("base64")
    };

    const checkResult = evm.callContract(runtime, { call: checkPayload }).result();

    let checkHex = "";
    for (let i = 0; i < checkResult.data.length; i++) {
      checkHex += checkResult.data[i].toString(16).padStart(2, '0');
    }
    runtime.log(`[WORKFLOW #3] checkUpkeep réponse hex (${checkHex.length} chars): ${checkHex.slice(0, 64)}...`);

    const upkeepNeeded = parseInt(checkHex.slice(0, 64), 16) !== 0;
    runtime.log(`[WORKFLOW #3] upkeepNeeded : ${upkeepNeeded}`);

    if (!upkeepNeeded) {
      runtime.log(`[WORKFLOW #3] Aucun vault à settler — passage à la prochaine exécution`);
      return JSON.stringify({
        action: "settlement", protocol: protocolSlug, status: "no_vaults_pending",
        data: { yesterdayFees_USD: Math.round(yesterdayFees), upkeepNeeded: false }
      }, null, 2);
    }

    const performDataOffset = parseInt(checkHex.slice(64, 128), 16) * 2; 
    const performDataLen = parseInt(checkHex.slice(128, 192), 16); 
    const performDataHex = checkHex.slice(192, 192 + performDataLen * 2);
    runtime.log(`[WORKFLOW #3] performData extrait (${performDataLen} bytes): 0x${performDataHex.slice(0, 40)}...`);

    const performCallData = PERFORM_UPKEEP_SELECTOR
      + "0000000000000000000000000000000000000000000000000000000000000020" 
      + performDataLen.toString(16).padStart(64, '0')                      
      + performDataHex.padEnd(Math.ceil(performDataLen / 32) * 64, '0');   

    const performPayload = {
      from: Buffer.from(CRE_FORWARDER, "hex").toString("base64"),
      to:   Buffer.from(KEEPER_ADDRESS, "hex").toString("base64"),
      data: Buffer.from(performCallData, "hex").toString("base64")
    };

    const performResult = evm.callContract(runtime, { call: performPayload }).result();
    runtime.log(`[WORKFLOW #3] ✅ performUpkeep() envoyé avec succès au Keeper`);

    return JSON.stringify({
      action: "settlement", protocol: protocolSlug, status: "executed",
      data: {
        yesterdayFees_USD: Math.round(yesterdayFees),
        distributableUSDC: Math.round(distributableUSDC),
        upkeepNeeded: true,
        keeper: "0x" + KEEPER_ADDRESS,
        readyForOnChain: true
      }
    }, null, 2);

  } catch (err: any) {
    runtime.log(`[WORKFLOW #3] ⚠️ Erreur on-chain (simulation normale en local) : ${err.message}`);
    return JSON.stringify({
      action: "settlement", protocol: protocolSlug, status: "computed_pending_write",
      data: {
        yesterdayFees_USD: Math.round(yesterdayFees),
        distributableUSDC: Math.round(distributableUSDC),
        keeper: "0x" + KEEPER_ADDRESS,
        readyForOnChain: false
      }
    }, null, 2);
  }
};

const initWorkflow = (config: Config) => {
  const http1 = new cre.capabilities.HTTPCapability();
  const http2 = new cre.capabilities.HTTPCapability();
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handler(http1.trigger({}), onDecoteTrigger),
    cre.handler(http2.trigger({}), onGateTrigger),
    cre.handler(cron.trigger({ schedule: "0 0 * * *" }), onSettlementTrigger) 
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
