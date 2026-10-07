import { ethers, network } from "hardhat";
import type { BaseContract } from "ethers";

/**
 * Deploys Create2Factory.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-create2factory.ts                 # local hardhat network
 *   npx hardhat run scripts/deploy-create2factory.ts --network localhost
 *   npx hardhat run scripts/deploy-create2factory.ts --network arc
 *
 * Env (see .env.example):
 *   ARC_MAINNET_RPC       RPC URL for Arc Mainnet (default https://rpc.mainnet.arc.io)
 *   DEPLOYER_PRIVATE_KEY  0x-prefixed deployer key (required for arc)
 */

interface FactoryWithPrediction extends BaseContract {
  computeAddress(deployer: string, userSalt: string, bytecodeHash: string): Promise<string>;
}

async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  console.log(`Network: ${network.name} (chainId=${chainId})`);

  // Mainnet safety: refuse to broadcast on the wrong chain (e.g. a
  // misconfigured ARC_MAINNET_RPC pointing at a testnet or another EVM chain).
  if (network.name === "arc" || network.name === "arcTestnet") {
    if (chainId !== 5042) {
      throw new Error(
        `Refusing to deploy: network "${network.name}" must be Arc Mainnet (chainId 5042), ` +
          `but the RPC returned chainId ${chainId}. Check ARC_MAINNET_RPC in .env.`,
      );
    }
  }

  const deployer = (await ethers.getSigners())[0];
  if (!deployer) {
    throw new Error(
      "No signer available. For arc set DEPLOYER_PRIVATE_KEY in .env; " +
        "for local runs use the in-process hardhat network or `npx hardhat node` + --network localhost.",
    );
  }
  console.log(`Deployer: ${deployer.address}`);

  // Fail fast on an empty deployer (gas is USDC on Arc — zero balance = no deploy).
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${balance.toString()} wei`);
  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has zero balance on chainId ${chainId}. Fund it with USDC on Arc Mainnet first.`,
    );
  }

  const Factory = await ethers.getContractFactory("Create2Factory");
  const factory = (await Factory.deploy()) as unknown as FactoryWithPrediction;
  await factory.waitForDeployment();
  const address = await factory.getAddress();
  console.log(`Create2Factory deployed at: ${address}`);
  console.log(`Explorer: https://explorer.arc.io/address/${address}`);

  // Sanity check: prediction round-trip for this deployer.
  const userSalt: string = ethers.id("arcsocialpay-v1");
  const counter = await ethers.getContractFactory("SimpleCounter");
  const tx = await counter.getDeployTransaction(0);
  if (!tx.data) {
    throw new Error("Missing SimpleCounter creation bytecode");
  }
  const predicted: string = await factory.computeAddress(
    deployer.address,
    userSalt,
    ethers.keccak256(tx.data),
  );
  console.log(`Sample prediction for deployer + salt "arcsocialpay-v1": ${predicted}`);
  console.log("Next: export FACTORY_ADDRESS=<above> for contracts/script/DeployCreate2.s.sol.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
