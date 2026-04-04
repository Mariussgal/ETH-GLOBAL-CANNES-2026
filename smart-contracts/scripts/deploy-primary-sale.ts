import { ethers } from "hardhat";

const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("PrimarySale");
  const sale = await Factory.deploy(USDC_SEPOLIA);
  await sale.waitForDeployment();
  const addr = await sale.getAddress();
  console.log("PrimarySale deployed at:", addr);
}

main().catch((e) => { console.error(e); process.exit(1); });