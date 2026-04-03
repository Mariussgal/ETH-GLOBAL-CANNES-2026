import { ethers } from "hardhat";

const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with:", deployer.address);
    console.log("Balance:", ethers.formatEther(
        await ethers.provider.getBalance(deployer.address)), "ETH"
    );

    console.log("\nDeploying Factory...");
    const FactoryContract = await ethers.getContractFactory("Factory");
    const factory = await FactoryContract.deploy(USDC_SEPOLIA);
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    console.log("Factory deployed:", factoryAddress);

    console.log("\nVerify with:");
    console.log(`npx hardhat verify --network sepolia ${factoryAddress} "${USDC_SEPOLIA}"`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});