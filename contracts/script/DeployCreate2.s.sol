// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "../../lib/forge-std/src/Script.sol";
import {Create2Factory} from "./Create2Factory.sol";

/// @notice Deploys a target contract through `Create2Factory` at a deterministic address,
/// predicting the address BEFORE broadcasting and asserting the actual deployment matches.
///
/// @dev The factory namespaces salts per caller as keccak256(abi.encode(caller, userSalt)),
/// so the salt used for prediction here MUST be namespaced with the account that will
/// broadcast (this script's `msg.sender`). A frontrunner reusing your `CREATE2_SALT`
/// lands on a different address and can neither steal nor block your deployment.
/// NOTE: the forge-std import above is intentionally relative (instead of the
/// `forge-std/` remapping) so this file also compiles under Hardhat, which does not
/// read `remappings.txt`. It resolves to the exact same file under `forge build`.
///
/// Env vars:
///   FACTORY_ADDRESS    - address of an already-deployed Create2Factory (deploy it first via
///                        Mode 1's `deploy_contract` tool; no new tooling needed for the factory itself)
///   CREATE2_SALT        - bytes32 USER salt, e.g. `cast keccak "my-app-v1"` or any 0x-prefixed 32-byte value.
///                         Namespaced with the broadcaster inside `run`, so this value alone
///                         never collides across callers.
///   CREATION_CODE       - 0x-prefixed creation bytecode of the target contract, ABI-encoded with
///                         constructor args already appended (i.e. `type(Target).creationCode`
///                         concatenated with `abi.encode(ctorArgs...)` — build this off-chain, e.g.
///                         with `cast abi-encode` + `forge inspect Target bytecode`, or inline it in a
///                         thin wrapper script that constructs `abi.encodePacked(type(Target).creationCode, abi.encode(...))`)
///   DEPLOY_VALUE        - optional wei amount to forward to the target's constructor (default 0)
///   EXPECTED_CHAIN_ID   - optional chain-id guard (default 5042002, Arc Testnet).
///                         Set to your local chain id (e.g. 31337) for rehearsal runs.
///
/// `CREATE2_SALT` is read via `vm.envBytes32` directly. If you'd rather derive the salt from a
/// human-readable string, read it with `vm.envString("CREATE2_SALT_STRING")` and hash it yourself
/// (`keccak256(bytes(saltString))`) before use — either approach is fine, this script takes the
/// direct bytes32 env var because it avoids an extra hashing step for callers that already have
/// a well-formed salt.
contract DeployCreate2 is Script {
    /// @notice Arc Testnet chain id. Override per-run via the EXPECTED_CHAIN_ID env var.
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;

    function run() external returns (address deployedAddress) {
        address factory = vm.envAddress("FACTORY_ADDRESS");
        bytes32 userSalt = vm.envBytes32("CREATE2_SALT");
        bytes memory creationCode = vm.envBytes("CREATION_CODE");
        uint256 deployValue = vm.envOr("DEPLOY_VALUE", uint256(0));
        uint256 expectedChainId = vm.envOr("EXPECTED_CHAIN_ID", ARC_TESTNET_CHAIN_ID);
        require(block.chainid == expectedChainId, "DeployCreate2: unexpected chain id");

        // The factory namespaces salts to msg.sender, i.e. the account broadcasting this script.
        bytes32 namespacedSalt = Create2Factory(factory).computeNamespacedSalt(msg.sender, userSalt);

        bytes32 bytecodeHash = keccak256(creationCode);
        address predicted = vm.computeCreate2Address(namespacedSalt, bytecodeHash, factory);

        vm.startBroadcast();
        deployedAddress = Create2Factory(factory).deploy{value: deployValue}(userSalt, creationCode);
        vm.stopBroadcast();

        require(deployedAddress == predicted, "DeployCreate2: actual address did not match prediction");
    }
}
