import { ethers } from "hardhat";

const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const NEW_SPLITTER = "0xaCD8f042eE1E29580A84e213760D144957eec148";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with:", deployer.address);

    console.log("\n[1/3] Deploying MockProtocol...");
    const MockProtocol = await ethers.getContractFactory("MockProtocol");
    const mock = await MockProtocol.deploy(USDC_SEPOLIA, deployer.address); // initial dummy splitter
    await mock.waitForDeployment();
    const mockAddress = await mock.getAddress();
    console.log("MockProtocol deployed:", mockAddress);
    
    console.log("Calling setSplitter on MockProtocol...");
    let tx = await mock.setSplitter(NEW_SPLITTER);
    await tx.wait();
    console.log("Splitter set to:", NEW_SPLITTER);

    console.log("\n[2/3] Deploying MockQuickswapBase...");
    const MockBase = await ethers.getContractFactory("MockQuickswapBase");
    const mockBase = await MockBase.deploy(USDC_SEPOLIA, deployer.address);
    await mockBase.waitForDeployment();
    const mockBaseAddress = await mockBase.getAddress();
    console.log("MockQuickswapBase deployed:", mockBaseAddress);

    console.log("Calling setSplitter on MockQuickswapBase...");
    tx = await mockBase.setSplitter(NEW_SPLITTER);
    await tx.wait();
    console.log("Splitter set to:", NEW_SPLITTER);

    console.log("\n[3/3] Deploying MockQuickswapPolygon...");
    const MockPolygon = await ethers.getContractFactory("MockQuickswapPolygon");
    const mockPolygon = await MockPolygon.deploy(USDC_SEPOLIA, deployer.address);
    await mockPolygon.waitForDeployment();
    const mockPolygonAddress = await mockPolygon.getAddress();
    console.log("MockQuickswapPolygon deployed:", mockPolygonAddress);

    console.log("Calling setSplitter on MockQuickswapPolygon...");
    tx = await mockPolygon.setSplitter(NEW_SPLITTER);
    await tx.wait();
    console.log("Splitter set to:", NEW_SPLITTER);

    console.log("\n════════════════════════════════════════");
    console.log("REDEPLOYMENT SUMMARY MOCKS");
    console.log("════════════════════════════════════════");
    console.log("MockProtocol       :", mockAddress);
    console.log("MockQuickswapBase  :", mockBaseAddress);
    console.log("MockQuickswapPolygon:", mockPolygonAddress);
    console.log("Splitter Address   :", NEW_SPLITTER);
    console.log("════════════════════════════════════════");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
