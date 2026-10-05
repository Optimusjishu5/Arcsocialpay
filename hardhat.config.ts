import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import * as dotenv from "dotenv";

// Loads .env for ARC_TESTNET_RPC / DEPLOYER_PRIVATE_KEY. Missing file is fine
// (local hardhat network needs neither).
dotenv.config();

const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET_RPC = process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const deployerAccounts: string[] =
  DEPLOYER_PRIVATE_KEY && DEPLOYER_PRIVATE_KEY.length > 0 ? [DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Matches foundry.toml (evm_version = "paris") so CREATE2 addresses
      // predicted off-chain agree across both toolchains.
      evmVersion: "paris",
    },
  },
  paths: {
    // Shared with Foundry (src = "contracts"). Forge outputs go to
    // contracts/out + contracts/cache; Hardhat uses ./artifacts + ./cache_hardhat
    // below, so the two toolchains never clobber each other.
    // NOTE: contracts/script/DeployCreate2.s.sol imports forge-std via a RELATIVE
    // path on purpose — Hardhat does not read remappings.txt, and the relative
    // import resolves to the same file under `forge build`.
    sources: "./contracts",
    tests: "./test",
    cache: "./cache_hardhat",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    arcTestnet: {
      url: ARC_TESTNET_RPC,
      chainId: ARC_TESTNET_CHAIN_ID,
      accounts: deployerAccounts,
    },
  },
};

export default config;
