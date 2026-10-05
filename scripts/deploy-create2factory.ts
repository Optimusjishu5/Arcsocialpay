import { ethers, network } from "hardhat";
import type { BaseContract } from "ethers";

/**
 * Deploys Create2Factory.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-create2factory.ts                 # local hardhat network
 *   npx hardhat run scripts/deploy-create2factory.ts --network localhost
 *   npx hardhat run scripts/deploy-create2factory.ts --network arcTestnet
 *
 * Env (see .env.example):
 *   ARC_TESTNET_RPC       RPC URL for Arc Testnet (default https://rpc.testnet.arc.io)
 *   DEPLOYER_PRIVATE_KEY  0x-prefixed deployer key (required for arcTestnet)
 */

interface FactoryWithPrediction extends BaseContract {
  computeAddress(deployer: string, userSalt: string, bytecodeHash: string): Promise<string>;
}

async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (chainId=${net.chainId.toString()})`);

  const deployer = (await ethers.getSigners())[0];
  if (!deployer) {
    throw new Error(
      "No signer available. For arcTestnet set DEPLOYER_PRIVATE_KEY in .env; " +
        "for local runs use the in-process hardhat network or `npx hardhat node` + --network localhost.",
    );
  }
  console.log(`Deployer: ${deployer.address}`);

  const Factory = await ethers.getContractFactory("Create2Factory");
  const factory = (await Factory.deploy()) as unknown as FactoryWithPrediction;
  await factory.waitForDeployment();
  const address = await factory.getAddress();
  console.log(`Create2Factory deployed at: ${address}`);

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
