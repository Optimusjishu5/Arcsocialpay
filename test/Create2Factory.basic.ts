import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract, ContractFactory, Signer, TransactionResponse } from "ethers";

/**
 * Basic Create2Factory behaviour: prediction matches deployment, salts isolate
 * deployments, and the namespacing helper matches the documented formula.
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

async function setup(): Promise<{ factory: Factory; Counter: ContractFactory; owner: string }> {
  const owner = (await ethers.getSigners())[0];
  if (!owner) {
    throw new Error("No signers on this network");
  }
  const FactoryContract = await ethers.getContractFactory("Create2Factory");
  const deployed = await FactoryContract.deploy();
  await deployed.waitForDeployment();
  const Counter = await ethers.getContractFactory("SimpleCounter");
  return { factory: deployed as unknown as Factory, Counter, owner: owner.address };
}

async function creationCode(Counter: ContractFactory, arg = 42): Promise<string> {
  const tx = await Counter.getDeployTransaction(arg);
  if (!tx.data) {
    throw new Error("Missing creation bytecode");
  }
  return tx.data;
}

describe("Create2Factory — basic deploy & prediction", function () {
  it("deploys where computeAddress predicts (return value, event, and live contract)", async function () {
    const { factory, Counter, owner } = await setup();
    const userSalt = ethers.id("basic-v1");
    const code = await creationCode(Counter, 42);
    const bytecodeHash = ethers.keccak256(code);

    const namespaced = await factory.computeNamespacedSalt(owner, userSalt);
    const predicted = await factory.computeAddress(owner, userSalt, bytecodeHash);

    // Return-value path: staticCall must agree with the view prediction.
    expect(await factory.deploy.staticCall(userSalt, code)).to.equal(predicted);

    await expect(factory.deploy(userSalt, code))
      .to.emit(factory, "Deployed")
      .withArgs(predicted, namespaced);

    // The deployed contract is alive and constructed with the right args.
    const counter = Counter.attach(predicted);
    expect(await counter.getFunction("value")()).to.equal(42n);
  });

  it("reverts when the same caller reuses salt + bytecode (address taken)", async function () {
    const { factory, Counter } = await setup();
    const userSalt = ethers.id("basic-reuse");
    const code = await creationCode(Counter, 1);

    await factory.deploy(userSalt, code);
    // Second deploy targets an occupied address -> CREATE2 fails.
    await expect(factory.deploy(userSalt, code)).to.be.reverted;
  });

  it("different user salts give different addresses", async function () {
    const { factory, Counter, owner } = await setup();
    const code = await creationCode(Counter, 7);
    const bytecodeHash = ethers.keccak256(code);

    const a = await factory.computeAddress(owner, ethers.id("salt-A"), bytecodeHash);
    const b = await factory.computeAddress(owner, ethers.id("salt-B"), bytecodeHash);
    expect(a).to.not.equal(b);

    await factory.deploy(ethers.id("salt-A"), code);
    await factory.deploy(ethers.id("salt-B"), code);
    expect(await Counter.attach(a).getFunction("value")()).to.equal(7n);
    expect(await Counter.attach(b).getFunction("value")()).to.equal(7n);
  });

  it("computeNamespacedSalt equals keccak256(abi.encode(deployer, userSalt))", async function () {
    const { factory, owner } = await setup();
    const userSalt = ethers.id("formula-check");
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [owner, userSalt]),
    );
    expect(await factory.computeNamespacedSalt(owner, userSalt)).to.equal(expected);
  });
});
