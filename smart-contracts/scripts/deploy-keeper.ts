import { ethers } from "hardhat";

const FACTORY = "0xCe897e27860F6c317DA7b4C7bB0252b941B2dCeC";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with:", deployer.address);

    const KeeperContract = await ethers.getContractFactory("Keeper");
    const keeper = await KeeperContract.deploy(FACTORY, 600);
    await keeper.waitForDeployment();
    const keeperAddress = await keeper.getAddress();
    console.log("Keeper deployed:", keeperAddress);
    console.log(`\nnpx hardhat verify --network sepolia ${keeperAddress} "${FACTORY}" "600"`);
}

main().catch((err) => { console.error(err); process.exit(1); });