import { ethers } from "hardhat";

async function main() {
    const [owner, investor1, investor2] = await ethers.getSigners();
    console.log("═══ YSM DEMO FLOW — LOCAL ═══\n");

    console.log("[Setup] Deploying mock USDC...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    console.log("Mock USDC:", usdcAddress);

    await usdc.mint(owner.address, ethers.parseUnits("1000000", 6));
    await usdc.mint(investor1.address, ethers.parseUnits("100000", 6));

    console.log("\n[1] Deploying core contracts...");

    const VaultFactory = await ethers.getContractFactory("Vault");
    const vault = await VaultFactory.deploy(usdcAddress, owner.address);
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();

    const TokenFactory = await ethers.getContractFactory("YSTToken");
    const token = await TokenFactory.deploy("YST-quickswapv3", "YST", vaultAddress, owner.address);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    const SplitterFactory = await ethers.getContractFactory("Router");
    const splitter = await SplitterFactory.deploy(usdcAddress, vaultAddress, owner.address, 1_000);
    await splitter.waitForDeployment();
    const splitterAddress = await splitter.getAddress();

    console.log("Vault   :", vaultAddress);
    console.log("Token   :", tokenAddress);
    console.log("Router  :", splitterAddress);

    console.log("\n[2] Initializing stream...");
    const now = Math.floor(Date.now() / 1000);
    const streamParams = {
        totalYST: ethers.parseUnits("182220", 6),
        streamBps: 1_000,
        discountBps: 3_000,
        startTime: now,
        endTime: now + 365 * 24 * 3600,
        capitalRaised: ethers.parseUnits("127554", 6),
        active: true
    };
    await vault.initStream(tokenAddress, streamParams);
    console.log("Stream initialized ✓");

    console.log("\n[3] Minting YST to investor1...");
    await token.mint(investor1.address, streamParams.totalYST);
    const balance = await token.balanceOf(investor1.address);
    console.log("Investor1 YST balance:", ethers.formatUnits(balance, 6));

    console.log("\n[4] Simulating fee generation (3 cycles)...");
    const feeAmount = ethers.parseUnits("499", 6);

    for (let i = 0; i < 3; i++) {
        await usdc.approve(splitterAddress, feeAmount);
        await splitter.splitFees(feeAmount);
        console.log(`  Fee cycle ${i + 1}: ${ethers.formatUnits(feeAmount, 6)} USDC split`);
    }

    console.log("\n[5] Checking earned rewards...");
    const earned = await token.earned(investor1.address);
    console.log("Investor1 earned:", ethers.formatUnits(earned, 6), "USDC");

    console.log("\n[6] Claiming rewards...");
    const balanceBefore = await usdc.balanceOf(investor1.address);
    await (token as any).connect(investor1).claimRewards();
    const balanceAfter = await usdc.balanceOf(investor1.address);
    console.log("Claimed:", ethers.formatUnits(balanceAfter - balanceBefore, 6), "USDC");

    console.log("\n[7] Price floor check...");
    const floor = await vault.priceFloor();
    console.log("Price floor:", ethers.formatUnits(floor, 18), "USDC/YST");

    console.log("\n═══ FLOW COMPLETE ✓ ═══");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});