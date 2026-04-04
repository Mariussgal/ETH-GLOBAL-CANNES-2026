import { ethers } from "hardhat";

const FACTORY = "0x249c8855b842Cf044De78596702471098B31B082";

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