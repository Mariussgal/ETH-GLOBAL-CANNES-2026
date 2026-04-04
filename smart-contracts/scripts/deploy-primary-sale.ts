/**
 * Déploie `PrimarySale` sur Sepolia (USDC Sepolia aligné avec la Factory).
 * Usage : PRIVATE_KEY=0x... npx hardhat run scripts/deploy-primary-sale.ts --network sepolia
 */
import { ethers } from "hardhat";

const USDC_SEPOLIA = "0x1c7D4B196Cb0274891fA4630730B4863E77a56B9";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("PrimarySale");
  const sale = await Factory.deploy(USDC_SEPOLIA);
  await sale.waitForDeployment();
  const addr = await sale.getAddress();
  console.log("PrimarySale deployed at:", addr);
  console.log("Add to frontend .env.local:");
  console.log(`NEXT_PUBLIC_PRIMARY_SALE_ADDRESS=${addr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
