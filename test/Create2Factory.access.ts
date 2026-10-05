import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract, ContractFactory, Signer, TransactionResponse } from "ethers";

/**
 * Access / frontrunning posture of Create2Factory.
 *
 * The factory is intentionally permissionless (no owner, no allowlist); safety
 * comes from namespacing every salt to msg.sender:
 *   namespacedSalt = keccak256(abi.encode(caller, userSalt))
 * These tests prove an attacker watching the mempool can neither steal nor grief
 * a victim's deployment by copying their userSalt.
 */

interface DeployFn {
  (
    userSalt: string,
    bytecode: string,
    overrides?: { value?: bigint; gasLimit?: number },
  ): Promise<TransactionResponse>;
  staticCall(
    userSalt: string,
    bytecode: string,
    overrides?: { value?: bigint },
  ): Promise<string>;
}

interface Factory extends BaseContract {
  computeNamespacedSalt(deployer: string, userSalt: string): Promise<string>;
  computeAddress(deployer: string, userSalt: string, bytecodeHash: string): Promise<string>;
  deploy: DeployFn;
  connect(signer: Signer): Factory;
}

async function setup(): Promise<{
  factory: Factory;
  Counter: ContractFactory;
  victim: string;
  attacker: string;
  attackerSigner: Signer;
}> {
  const signers = await ethers.getSigners();
  const victimSigner = signers[0];
  const attackerSigner = signers[1];
  if (!victimSigner || !attackerSigner) {
    throw new Error("Need at least two signers on this network");
  }
  const FactoryContract = await ethers.getContractFactory("Create2Factory");
  const deployed = await FactoryContract.deploy();
  await deployed.waitForDeployment();
  const Counter = await ethers.getContractFactory("SimpleCounter");
  return {
    factory: deployed as unknown as Factory,
    Counter,
    victim: victimSigner.address,
    attacker: attackerSigner.address,
    attackerSigner,
  };
}

async function creationCode(Counter: ContractFactory, arg: number): Promise<string> {
  const tx = await Counter.getDeployTransaction(arg);
  if (!tx.data) {
    throw new Error("Missing creation bytecode");
  }
  return tx.data;
}

describe("Create2Factory — access & frontrun resistance", function () {
  it("is permissionless: any account can deploy with its own salt", async function () {
    const { factory, attacker, attackerSigner } = await setup();
    const Counter = await ethers.getContractFactory("SimpleCounter");
    const userSalt = ethers.id("attacker-own-drop");
    const code = await creationCode(Counter, 9);
    const predicted = await factory.computeAddress(attacker, userSalt, ethers.keccak256(code));
    await expect(factory.connect(attackerSigner).deploy(userSalt, code))
      .to.emit(factory, "Deployed")
      .withArgs(predicted, await factory.computeNamespacedSalt(attacker, userSalt));
  });

  it("frontrunner copying userSalt + bytecode gets a DIFFERENT address (no steal)", async function () {
    const { factory, Counter, victim, attackerSigner } = await setup();
    const userSalt = ethers.id("victim-drop");
    const code = await creationCode(Counter, 11);
    const bytecodeHash = ethers.keccak256(code);

    // Attacker frontruns with the exact same userSalt and bytecode.
    const attackerDeploys = factory.connect(attackerSigner);
    const attackerAddr = await attackerDeploys.deploy.staticCall(userSalt, code);
    await attackerDeploys.deploy(userSalt, code);

    // Victim prediction is bound to the victim address, not the attacker's.
    const victimPredicted = await factory.computeAddress(victim, userSalt, bytecodeHash);
    expect(victimPredicted).to.not.equal(attackerAddr);

    // Victim deployment still succeeds at the predicted address.
    await expect(factory.deploy(userSalt, code))
      .to.emit(factory, "Deployed")
      .withArgs(victimPredicted, await factory.computeNamespacedSalt(victim, userSalt));
    expect(await Counter.attach(victimPredicted).getFunction("value")()).to.equal(11n);
  });

  it("griefing with same userSalt but different bytecode cannot block the victim", async function () {
    const { factory, Counter, victim, attackerSigner } = await setup();
    const userSalt = ethers.id("grief-salt");
    const victimCode = await creationCode(Counter, 21);
    const griefCode = await creationCode(Counter, 99);

    // Attacker occupies *their own* namespaced slot with different bytecode.
    await factory.connect(attackerSigner).deploy(userSalt, griefCode);

    // Victim slot is independent -> deploys fine at the predicted address.
    const predicted = await factory.computeAddress(victim, userSalt, ethers.keccak256(victimCode));
    await expect(factory.deploy(userSalt, victimCode))
      .to.emit(factory, "Deployed")
      .withArgs(predicted, await factory.computeNamespacedSalt(victim, userSalt));
    expect(await Counter.attach(predicted).getFunction("value")()).to.equal(21n);
  });

  it("prediction is bound to the deployer: wrong deployer predicts a different address", async function () {
    const { factory, Counter, victim, attacker } = await setup();
    const userSalt = ethers.id("binding-check");
    const hash = ethers.keccak256(await creationCode(Counter, 5));
    const forVictim = await factory.computeAddress(victim, userSalt, hash);
    const forAttacker = await factory.computeAddress(attacker, userSalt, hash);
    expect(forVictim).to.not.equal(forAttacker);
  });
});
