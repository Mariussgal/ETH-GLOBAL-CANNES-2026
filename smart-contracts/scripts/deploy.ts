import { ethers } from "hardhat";

const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const CRE_FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with:", deployer.address);
    console.log("Balance:", ethers.formatEther(
        await ethers.provider.getBalance(deployer.address)), "ETH"
    );

    console.log("\n[1/7] Deploying Factory...");
    const FactoryContract = await ethers.getContractFactory("Factory");
    const factory = await FactoryContract.deploy(USDC_SEPOLIA);
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    console.log("Factory deployed:", factoryAddress);

    console.log("\n[2/7] Deploying demo Router...");
    const RouterContract = await ethers.getContractFactory("Router");
    const router = await RouterContract.deploy(
        USDC_SEPOLIA,
        deployer.address,
        deployer.address,
        1_000
    );
    await router.waitForDeployment();
    const routerAddress = await router.getAddress();
    console.log("Router deployed:", routerAddress);

    console.log("\n[3/7] Deploying MockProtocol...");
    const MockProtocol = await ethers.getContractFactory("MockProtocol");
    const mock = await MockProtocol.deploy(USDC_SEPOLIA, routerAddress);
    await mock.waitForDeployment();
    const mockAddress = await mock.getAddress();
    console.log("MockProtocol deployed:", mockAddress);

    console.log("\n[4/7] Deploying MockQuickswapBase...");
    const MockBase = await ethers.getContractFactory("MockQuickswapBase");
    const mockBase = await MockBase.deploy(USDC_SEPOLIA, routerAddress);
    await mockBase.waitForDeployment();
    const mockBaseAddress = await mockBase.getAddress();
    console.log("MockQuickswapBase deployed:", mockBaseAddress);

    console.log("\n[5/7] Deploying MockQuickswapPolygon...");
    const MockPolygon = await ethers.getContractFactory("MockQuickswapPolygon");
    const mockPolygon = await MockPolygon.deploy(USDC_SEPOLIA, routerAddress);
    await mockPolygon.waitForDeployment();
    const mockPolygonAddress = await mockPolygon.getAddress();
    console.log("MockQuickswapPolygon deployed:", mockPolygonAddress);

    console.log("\n[6/7] Deploying Keeper...");
    const KeeperContract = await ethers.getContractFactory("Keeper");
    const keeper = await KeeperContract.deploy(
        factoryAddress,
        600
    );
    await keeper.waitForDeployment();
    const keeperAddress = await keeper.getAddress();
    console.log("Keeper deployed:", keeperAddress);

    console.log("\n[7/7] Deploying PriceFloorHook...");
    const PriceFloorHook = await ethers.getContractFactory("PriceFloorHook");
    const hook = await PriceFloorHook.deploy();
    await hook.waitForDeployment();
    const hookAddress = await hook.getAddress();
    console.log("PriceFloorHook deployed:", hookAddress);

    console.log("\n════════════════════════════════════════");
    console.log("DEPLOYMENT SUMMARY — SEPOLIA");
    console.log("════════════════════════════════════════");
    console.log("Factory            :", factoryAddress);
    console.log("Router (demo)      :", routerAddress);
    console.log("MockProtocol       :", mockAddress);
    console.log("MockQuickswapBase  :", mockBaseAddress);
    console.log("MockQuickswapPolygon:", mockPolygonAddress);
    console.log("Keeper             :", keeperAddress);
    console.log("PriceFloorHook     :", hookAddress);
    console.log("USDC Circle        :", USDC_SEPOLIA);
    console.log("CRE Forwarder      :", CRE_FORWARDER);
    console.log("════════════════════════════════════════");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});