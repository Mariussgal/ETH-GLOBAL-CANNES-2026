/**
 * bridge-arc-to-sepolia.ts
 *
 * Bride des USDC depuis ton wallet Arc Testnet vers le Router YSM sur Sepolia
 * via Circle CCTP (Bridge Kit SDK).
 *
 * Usage :
 *   npx ts-node scripts/bridge-arc-to-sepolia.ts
 *
 * Vars d'env requises (.env) :
 *   PRIVATE_KEY         = clé privée du wallet owner Arc (avec 0x)
 *   BRIDGE_AMOUNT_USDC  = montant à bridger en USDC (ex: "5.00")
 */

import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import * as dotenv from "dotenv";
dotenv.config();

// ── Config ──────────────────────────────────────────────────────────────────

/** Router YSM sur Sepolia — destination des fees Arc */
const SEPOLIA_ROUTER = "0xBf08Bc411afe9e2D96e8B743447D4dAD948Cd28c";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const AMOUNT = process.env.BRIDGE_AMOUNT_USDC ?? "5.00";

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!PRIVATE_KEY?.startsWith("0x")) {
    throw new Error("PRIVATE_KEY manquant ou invalide dans .env");
  }

  console.log(`\n🌉 Bridge Arc Testnet → Ethereum Sepolia`);
  console.log(`   Amount    : ${AMOUNT} USDC`);
  console.log(`   Recipient : ${SEPOLIA_ROUTER} (YSM Router)\n`);

  const kit = new BridgeKit();

  const adapter = createViemAdapterFromPrivateKey({
    privateKey: PRIVATE_KEY,
  });

  const result = await kit.bridge({
    from: {
      adapter,
      chain: "Arc_Testnet",
    },
    to: {
      recipientAddress: SEPOLIA_ROUTER,
      chain: "Ethereum_Sepolia",
      useForwarder: true,   // Circle gère le mint côté Sepolia automatiquement
    },
    amount: AMOUNT,
  });

  console.log("✅ Bridge initié !");
  console.log("   Result:", JSON.stringify(result, (_key, val) =>
    typeof val === "bigint" ? val.toString() : val, 2));
  console.log("\n⏳ Attends ~1-3 min que Circle finalise le mint sur Sepolia.");
  console.log("   Ensuite, appelle flushBalance() sur le Router Sepolia depuis l'UI.");
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
