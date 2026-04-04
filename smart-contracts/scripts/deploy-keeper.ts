import { ethers } from "hardhat";

const FACTORY = "0x1Bc1135c04Ad7236C56b8EBc1F3b25A8A0ecb5D6";

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