// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal deployment target used by Hardhat tests (and local manual
/// verification) to exercise Create2Factory with constructor args and payable
/// construction. Compiled by both Forge and Hardhat; not part of the app.
contract SimpleCounter {
    uint256 public value;
    uint256 public immutable funded;

    /// @param initialValue Stored value after deployment.
    /// @dev Payable so tests can verify `msg.value` forwarding through the factory.
    constructor(uint256 initialValue) payable {
        value = initialValue;
        funded = msg.value;
    }

    function increment() external {
        unchecked {
            ++value;
        }
    }
}
