import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 1 },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    sepolia: {
      url: vars.has("SEPOLIA_RPC_URL") ? vars.get("SEPOLIA_RPC_URL") : "",
      accounts: vars.has("SEPOLIA_PRIVATE_KEY") ? [vars.get("SEPOLIA_PRIVATE_KEY")] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: vars.has("ETHERSCAN_API_KEY") ? vars.get("ETHERSCAN_API_KEY") : "",
  },
};

export default config;