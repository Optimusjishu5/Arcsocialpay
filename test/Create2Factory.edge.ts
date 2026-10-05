import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract, ContractFactory, TransactionResponse } from "ethers";

/**
 * Edge cases: empty bytecode, constructor-arg binding, native value forwarding,
 * large-but-valid initcode, and oversized initcode past the EIP-3860 limit.
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
  computeAddress(deployer: string, userSalt: string, bytecodeHash: string): Promise<string>;
  deploy: DeployFn;
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

async function creationCode(Counter: ContractFactory, arg: number): Promise<string> {
  const tx = await Counter.getDeployTransaction(arg);
  if (!tx.data) {
    throw new Error("Missing creation bytecode");
  }
  return tx.data;
}

describe("Create2Factory — edge cases", function () {
  it("reverts on empty (zero-length) bytecode", async function () {
    const { factory } = await setup();
    // OpenZeppelin's Create2 library reverts Create2EmptyBytecode.
    await expect(factory.deploy(ethers.id("empty-bytecode"), "0x")).to.be.reverted;
  });

  it("binds constructor args: same userSalt, different args -> different addresses", async function () {
    const { factory, Counter, owner } = await setup();
    const userSalt = ethers.id("args-binding");
    const codeA = await creationCode(Counter, 1);
    const codeB = await creationCode(Counter, 2);

    const addrA = await factory.computeAddress(owner, userSalt, ethers.keccak256(codeA));
    const addrB = await factory.computeAddress(owner, userSalt, ethers.keccak256(codeB));
    expect(addrA).to.not.equal(addrB);

    // Same caller + same userSalt but different bytecode targets a different
    // CREATE2 address (address also commits to keccak256(bytecode)), so both
    // deploys succeed without colliding.
    await factory.deploy(userSalt, codeA);
    await factory.deploy(userSalt, codeB);
    expect(await Counter.attach(addrA).getFunction("value")()).to.equal(1n);
    expect(await Counter.attach(addrB).getFunction("value")()).to.equal(2n);
  });

  it("forwards msg.value into the new contract and retains nothing", async function () {
    const { factory, Counter, owner } = await setup();
    const userSalt = ethers.id("payable-drop");
    const code = await creationCode(Counter, 77);
    const predicted = await factory.computeAddress(owner, userSalt, ethers.keccak256(code));

    await factory.deploy(userSalt, code, { value: 1000n });

    const counter = Counter.attach(predicted);
    expect(await counter.getFunction("value")()).to.equal(77n);
    expect(await counter.getFunction("funded")()).to.equal(1000n);
    // Factory never holds funds: value is forwarded 1:1 at CREATE2 time.
    expect(await ethers.provider.getBalance(await factory.getAddress())).to.equal(0n);
  });

  it("deploys large but valid initcode (~20KB)", async function () {
    const { factory, Counter, owner } = await setup();
    const userSalt = ethers.id("large-valid");
    const base = await creationCode(Counter, 0);
    // Pad to ~20KB. Trailing bytes shift constructor-arg decoding, so only
    // address agreement (not the stored value) is asserted here.
    const targetBytes = 20 * 1024;
    const baseBytes = (base.length - 2) / 2;
    const padded = base + "00".repeat(Math.max(0, targetBytes - baseBytes));
    expect((padded.length - 2) / 2).to.be.greaterThanOrEqual(targetBytes);

    const predicted = await factory.computeAddress(owner, userSalt, ethers.keccak256(padded));
    expect(await factory.deploy.staticCall(userSalt, padded)).to.equal(predicted);
    await factory.deploy(userSalt, padded);
    expect(await ethers.provider.getCode(predicted)).to.not.equal("0x");
  });

  it("reverts on oversized initcode past the EIP-3860 limit (~60KB > 49152 bytes)", async function () {
    const { factory, Counter } = await setup();
    const base = await creationCode(Counter, 0);
    const targetBytes = 60 * 1024;
    const baseBytes = (base.length - 2) / 2;
    const padded = base + "00".repeat(Math.max(0, targetBytes - baseBytes));
    // Explicit gas limit: estimation itself may fail for undeployable initcode.
    await expect(factory.deploy(ethers.id("oversized"), padded, { gasLimit: 10_000_000 })).to.be
      .reverted;
  });
});
