// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

/// @title Create2Factory
/// @notice Minimal, reusable CREATE2 factory that deploys arbitrary bytecode at
/// deterministic addresses. Caller-chosen salts are namespaced per caller to
/// prevent salt squatting / frontrunning.
/// @dev The CREATE2 address is keccak256(0xff ++ factory ++ namespacedSalt ++ keccak256(bytecode))[12:],
/// where namespacedSalt = keccak256(abi.encode(caller, userSalt)). Two different
/// callers using the same `userSalt` therefore land on different addresses, so a
/// frontrunner watching the mempool can neither steal nor grief another caller's
/// deployment. The factory never retains funds: `msg.value` is forwarded 1:1 into
/// the new contract's constructor.
/// @custom:security Only the namespaced salt is used for CREATE2. Always predict
/// addresses with {computeAddress} using the SAME deployer account that will call
/// {deploy}; predicting with any other address yields a different (wrong) address.
contract Create2Factory {
    /// @notice Emitted on every successful deployment.
    /// @param deployedAddress Address of the newly deployed contract.
    /// @param salt The namespaced salt actually used for CREATE2
    /// (keccak256(abi.encode(caller, userSalt))), NOT the raw `userSalt`.
    event Deployed(address indexed deployedAddress, bytes32 indexed salt);

    /// @notice Namespaces a caller-chosen salt to a specific deployer account.
    /// @dev Uses abi.encode (not abi.encodePacked) so the (address, bytes32)
    /// tuple encoding is unambiguous. Pure so off-chain tooling and scripts can
    /// reproduce the exact salt without a node call.
    /// @param deployer Account that will call `deploy` (its `msg.sender`).
    /// @param userSalt Caller-chosen salt (e.g. keccak256("my-app-v1")).
    /// @return namespacedSalt The salt passed to CREATE2.
    function computeNamespacedSalt(address deployer, bytes32 userSalt)
        public
        pure
        returns (bytes32 namespacedSalt)
    {
        return keccak256(abi.encode(deployer, userSalt));
    }

    /// @notice Deploys `bytecode` via CREATE2 on behalf of `msg.sender`.
    /// @dev Payable so constructors needing an initial native balance can be funded
    /// atomically; the full `msg.value` is forwarded and nothing stays in the factory
    /// (no receive/fallback, no withdrawal path needed). Reverts via OpenZeppelin's
    /// Create2 library on empty bytecode, on insufficient balance for `msg.value`,
    /// or when the address is already taken (same caller + same `userSalt` + same
    /// `bytecode` deployed twice).
    /// @param userSalt Caller-chosen salt; namespaced with `msg.sender` before use.
    /// @param bytecode Creation bytecode with constructor args already appended.
    /// @return deployedAddress Address of the newly deployed contract.
    function deploy(bytes32 userSalt, bytes memory bytecode) external payable returns (address deployedAddress) {
        bytes32 namespacedSalt = computeNamespacedSalt(msg.sender, userSalt);
        deployedAddress = Create2.deploy(msg.value, namespacedSalt, bytecode);
        emit Deployed(deployedAddress, namespacedSalt);
    }

    /// @notice Predicts the address `deploy` would produce for a caller + salt + bytecode.
    /// @dev Must be called with the SAME `deployer` (future `msg.sender`) that will call
    /// `deploy`, otherwise the prediction does not match. Uses the factory as the CREATE2
    /// deployer, exactly as `deploy` does.
    /// @param deployer Account that will call `deploy`.
    /// @param userSalt Caller-chosen salt passed to `deploy`.
    /// @param bytecodeHash keccak256 of the creation bytecode passed to `deploy`.
    /// @return predictedAddress Address `deploy` will create.
    function computeAddress(address deployer, bytes32 userSalt, bytes32 bytecodeHash)
        external
        view
        returns (address predictedAddress)
    {
        return Create2.computeAddress(computeNamespacedSalt(deployer, userSalt), bytecodeHash);
    }
}
