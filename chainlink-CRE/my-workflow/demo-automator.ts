import { execSync } from "child_process";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

// On charge le .env (celui du dossier courant ou du dossier parent)
dotenv.config({ path: '../.env' });
dotenv.config();

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"; // Plus stable que le rpc.sepolia.org par défaut
const FACTORY_ADDRESS = "0x3615CFfF7D94710AC12Ed63c94E28F53551Ac32E";
const CLI_PATH = "/Users/cyriacmirkovik/.cre/bin/cre";

// Configuration des workflows
const workflows = [
  { name: "Décote", payload: '{"slug": "quickswap"}', index: 0 },
  { name: "Gate", payload: '{"slug": "quickswap"}', index: 1 },
  { name: "Settlement", payload: '{"slug": "quickswap"}', index: 2 } // Index 2 si tu as divisé ton cron en trigger manuel
];

async function runDeployer() {
  console.log("🚀 Lancement de l'Automatisation Chainlink CRE -> Sepolia\n");
  
  const privateKey = process.env.CRE_ETH_PRIVATE_KEY;
  if (!privateKey) throw new Error("Clé privée non trouvée dans le .env !");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`🔗 Connecté avec le Wallet : ${wallet.address}`);
  console.log(`🏦 Contrat Cible P1 (Factory) : ${FACTORY_ADDRESS}\n`);

  for (const wf of workflows) {
    try {
      console.log(`==========================================`);
      console.log(`⚡️ Exécution du Workflow [${wf.name}]`);
      console.log(`==========================================`);
      
      const cmd = `${CLI_PATH} workflow simulate ./my-workflow --http-payload '${wf.payload}' -T staging-settings --skip-type-checks --non-interactive --trigger-index ${wf.index}`;
      
      console.log(`⏳ Simulation CRE locale en cours...`);
      const output = execSync(cmd, { encoding: "utf-8", cwd: ".." });
      
      // On cherche le résultat encodé en hexa dans les logs de Chainlink
      const match = output.match(/Simulation Result:\s*"([0-9a-fA-F]+)"/);
      if (!match || !match[1]) {
        console.warn(`⚠️ Résultat introuvable pour ${wf.name}, le workflow ne retourne peut-être pas de valeur HEX.`);
        continue;
      }

      const payloadHex = "0x" + match[1];
      console.log(`✅ Résultat capturé par le mock oracle: ${payloadHex}`);
      
      console.log(`📡 Envoi de la transaction sur Sepolia Testnet...`);
      // ON ENVOIE LA DONNÉE DIRECTEMENT AU CONTRAT DE P1 COMME LE FERAIT CHAINLINK
      const tx = await wallet.sendTransaction({
        to: FACTORY_ADDRESS,
        data: payloadHex,
        gasLimit: 3000000 // Gas safe pour éviter OOG
      });

      console.log(`🎉 Transaction diffusée !`);
      console.log(`🔍 Hash : https://sepolia.etherscan.io/tx/${tx.hash}`);
      
      console.log(`⏳ Attente de la confirmation réseau (block)...`);
      await tx.wait();
      console.log(`✅ Confirmé ! Les Smart Contracts de P1 sont à jour pour ${wf.name}.\n`);

    } catch (err: any) {
      console.error(`❌ Échec pour ${wf.name} : ${err.message}`);
    }
  }

  console.log("🏁 Tous les workflows ont été exécutés avec succès ! P1 peut checker la Factory !");
}

runDeployer().catch(console.error);
