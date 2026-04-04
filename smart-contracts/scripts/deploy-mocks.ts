import { ethers } from "hardhat";

const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const SPLITTER = "0xaCD8f042eE1E29580A84e213760D144957eec148";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  console.log("\n[1/2] Deploying MockQuickswapBase...");
  const Base = await ethers.getContractFactory("MockQuickswapBase");
  const mockBase = await Base.deploy(USDC_SEPOLIA, SPLITTER);
  await mockBase.waitForDeployment();
  const baseAddr = await mockBase.getAddress();
  console.log("MockQuickswapBase:", baseAddr);

  console.log("\n[2/2] Deploying MockQuickswapPolygon...");
  const Polygon = await ethers.getContractFactory("MockQuickswapPolygon");
  const mockPolygon = await Polygon.deploy(USDC_SEPOLIA, SPLITTER);
  await mockPolygon.waitForDeployment();
  const polygonAddr = await mockPolygon.getAddress();
  console.log("MockQuickswapPolygon:", polygonAddr);

  console.log("\n════════════════════════════════════════");
  console.log("MockQuickswapBase   :", baseAddr);
  console.log("MockQuickswapPolygon:", polygonAddr);
  console.log("════════════════════════════════════════");
  console.log("\nVerify:");
  console.log(`npx hardhat verify --network sepolia ${baseAddr} "${USDC_SEPOLIA}" "${SPLITTER}"`);
  console.log(`npx hardhat verify --network sepolia ${polygonAddr} "${USDC_SEPOLIA}" "${SPLITTER}"`);
}

main().catch((e) => { console.error(e); process.exit(1); });