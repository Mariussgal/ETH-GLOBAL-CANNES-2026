/**
 * demo-sender.ts
 *
 * Script de test d'intégration pour le hackathon (mode local / sans node CRE).
 *
 * Ce qu'il fait :
 *   1. Prend les bytes produits par "cre workflow simulate" (REPORT_HEX dans les logs)
 *   2. Les envoie à Factory.devReport() sur Sepolia via ton wallet
 *   3. Prouve que le format encodé par le workflow est valide et que le contrat réagit bien
 *
 * Usage :
 *   Étape 1 — Récupère le REPORT_HEX dans les logs du simulate :
 *     cre workflow simulate ./my-workflow --http-payload '{"slug":"quickswap"}' -T staging-settings --skip-type-checks --non-interactive --trigger-index 1
 *     → cherche la ligne : [WORKFLOW #2] REPORT_HEX=0x...
 *
 *   Étape 2 — Lance ce script :
 *     bun run demo-sender.ts
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });
dotenv.config();

// ============================================================
// CONFIG — à mettre à jour avec les adresses P1 après déploiement
// ============================================================

const RPC_URL        = "https://ethereum-sepolia-rpc.publicnode.com";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0x0a52b6D02f55ae19Ff3973559Bf2b8129EfcC73B";

// streamKey du stream à tester — keccak256(abi.encodePacked(protocolSlug, emitterAddress))
// Exemple pour quickswap + ton wallet : calcule-le ou demande à P1
const STREAM_KEY = process.env.STREAM_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

// Colle ici le REPORT_HEX des logs du simulate (ou en argument CLI)
const REPORT_HEX_GATE    = process.env.REPORT_HEX_GATE    || "0x"; // workflow #2
const REPORT_HEX_DECOTE  = process.env.REPORT_HEX_DECOTE  || "0x"; // workflow #1

// ============================================================
// ABI — seulement devReport + les events utiles
// ============================================================

const FACTORY_ABI = [
  // Fonction de test (DEMO ONLY — à ajouter par P1)
  "function devReport(bytes32 streamKey, bytes calldata report) external",

  // Events pour confirmer que ça a marché
  "event GateValidated(bytes32 indexed streamKey, bool passed)",
  "event GateRejected(bytes32 indexed streamKey, string reason)",
  "event DiscountCalculated(bytes32 indexed streamKey, uint256 discountBps)",
  "event StreamCreated(bytes32 indexed streamKey, address splitter, address vault, address ystToken, uint256 capitalRaised, uint256 discountBps)",

  // Lecture de l'état pour vérifier
  "function pendingStreams(bytes32) external view returns (address emitter, string protocolSlug, uint256 streamBps, uint256 durationDays, uint256 capitalRaised, uint256 collateralAmount, bool gateValidated, bool discountReceived, uint256 discountBps, bool executed)",
];

async function send(label: string, reportHex: string) {
  if (!reportHex || reportHex === "0x") {
    console.log(`⏭️  [${label}] Pas de REPORT_HEX, skipped.`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(process.env.CRE_ETH_PRIVATE_KEY!, provider);
  const factory  = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);

  console.log(`\n==========================================`);
  console.log(`🧪 Test intégration [${label}]`);
  console.log(`==========================================`);
  console.log(`📦 StreamKey  : ${STREAM_KEY}`);
  console.log(`📄 Report hex : ${reportHex.slice(0, 66)}...`);

  // État avant
  const before = await factory.pendingStreams(STREAM_KEY);
  console.log(`\n📊 État avant :`);
  console.log(`   gateValidated   : ${before.gateValidated}`);
  console.log(`   discountReceived: ${before.discountReceived}`);
  console.log(`   discountBps     : ${before.discountBps.toString()}`);

  console.log(`\n📡 Envoi de devReport() sur Sepolia...`);
  const tx = await factory.devReport(STREAM_KEY, reportHex, { gasLimit: 500_000 });
  console.log(`🔍 Tx : https://sepolia.etherscan.io/tx/${tx.hash}`);

  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) {
    console.error(`❌ Transaction revertée !`);
    return;
  }

  // Décode les events
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (!parsed) continue;
      if (parsed.name === "GateValidated")      console.log(`✅ GateValidated → passed=${parsed.args.passed}`);
      if (parsed.name === "GateRejected")       console.log(`❌ GateRejected → ${parsed.args.reason}`);
      if (parsed.name === "DiscountCalculated") console.log(`✅ DiscountCalculated → ${parsed.args.discountBps} bps`);
      if (parsed.name === "StreamCreated")      console.log(`🎉 StreamCreated → vault=${parsed.args.vault}`);
    } catch {}
  }

  // État après
  const after = await factory.pendingStreams(STREAM_KEY);
  console.log(`\n📊 État après :`);
  console.log(`   gateValidated   : ${after.gateValidated}`);
  console.log(`   discountReceived: ${after.discountReceived}`);
  console.log(`   discountBps     : ${after.discountBps.toString()}`);
  console.log(`   executed        : ${after.executed}`);
}

async function main() {
  console.log("🚀 demo-sender — Test d'intégration CRE → Sepolia");
  console.log(`🔗 Factory : ${FACTORY_ADDRESS}`);

  // Ordre logique : Gate d'abord, Décote ensuite
  await send("Gate (WF #2)",   REPORT_HEX_GATE);
  await send("Décote (WF #1)", REPORT_HEX_DECOTE);

  console.log("\n🏁 Terminé !");
}

main().catch(console.error);
