// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ArcSocialPay
 * @notice On-chain payments layer for the Arc SocialPay app on Arc Mainnet.
 *
 * @dev What this contract is for (and what it is NOT for):
 *  - It moves USDC between users with on-chain attribution the app needs
 *    today: tips bound to a post id, and payments carrying a memo/note.
 *    Plain ERC-20 transfers cannot record either, which is why this contract
 *    exists alongside direct transfers (direct transfers keep working).
 *  - It holds NO funds: every call pulls USDC via `transferFrom` (caller must
 *    `approve` first) and forwards it to the recipient in the same call.
 *  - Social data (posts, likes, comments, follows, profiles, chat text) stays
 *    off-chain in Turso/localStorage: storing it on-chain would cost gas per
 *    keystroke, cannot be edited/deleted, and does not scale. Events below are
 *    the only on-chain record, for indexing.
 *
 * Network: Arc Mainnet (chain id 5042).
 * USDC (ERC-20, 6 decimals): 0x3600000000000000000000000000000000000000
 * Gas token on Arc is also USDC (18-decimal native view) — this contract only
 * ever touches the 6-decimal ERC-20 interface. Never mix the two decimals.
 *
 * Security properties:
 *  - Pull payments only (no custody, nothing to drain).
 *  - Reentrancy mutex on all state-changing external flows.
 *  - Safe ERC-20 transfer that also works with tokens returning no boolean.
 *  - Pausable by owner (halts new tips/payments, never freezes user funds
 *    because the contract holds none).
 *  - Two-step ownership transfer (no accidental lockout to a typo address).
 *  - Rescue functions for tokens/native gas stranded by user error.
 *  - No delegatecall, no selfdestruct, no upgradeability, no fees.
 */
interface IUSDCToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner_, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract ArcSocialPay {
    /// @notice Deployed USDC contract (ERC-20, 6 decimals on Arc Mainnet).
    IUSDCToken public immutable usdc;

    /// @notice Current admin. Only admin can pause/unpause and rescue funds.
    address public owner;

    /// @notice Pending admin for the two-step transfer. Zero when none pending.
    address public pendingOwner;

    /// @notice When true, `tip` and `pay` revert. Read-only helpers keep working.
    bool public paused;

    /// @notice Contract version for frontend compatibility checks.
    string public constant VERSION = "1.0.0";

    /// @notice Maximum memo/note size in bytes (app notes cap at 100 chars).
    uint256 public constant MAX_MEMO_BYTES = 280;

    /// @notice Maximum post-id size in bytes (app ids are short uuids).
    uint256 public constant MAX_POST_ID_BYTES = 128;

    /// @dev Reentrancy mutex.
    bool private locked;

    /**
     * @notice Emitted for every tip: who tipped which post, for how much.
     * @param sender    Payer (msg.sender of the `tip` call).
     * @param recipient Post author receiving the USDC.
     * @param amount    USDC amount in 6-decimal base units.
     * @param postId    Off-chain post id being tipped (empty if none given).
     */
    event Tip(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        string postId
    );

    /**
     * @notice Emitted for every memo payment (Pay view sends, in-chat pays).
     * @param sender    Payer (msg.sender of the `pay` call).
     * @param recipient Receiver of the USDC.
     * @param amount    USDC amount in 6-decimal base units.
     * @param memo      Optional note (e.g. the Pay view note, max 100 chars).
     */
    event Payment(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        string memo
    );

    /// @notice Emitted when ownership moves to a new admin.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when a new admin is proposed (accept via acceptOwnership).
    event OwnershipProposed(address indexed currentOwner, address indexed proposedOwner);

    /// @notice Emitted on pause/unpause.
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    /// @notice Emitted when stranded tokens/gas are rescued by the admin.
    event Rescued(address indexed token, address indexed to, uint256 amount);

    /**
     * @param usdcAddress Arc Mainnet USDC ERC-20:
     *  0x3600000000000000000000000000000000000000
     */
    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "USDC_ZERO_ADDRESS");
        require(usdcAddress.code.length > 0, "USDC_NOT_A_CONTRACT");
        usdc = IUSDCToken(usdcAddress);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "REENTRANT");
        locked = true;
        _;
        locked = false;
    }

    // ── Core payments ────────────────────────────────────────────────────────

    /**
     * @notice Tip a post author in USDC.
     * @dev Caller must `approve` this contract for `amount` first.
     * @param recipient Post author receiving the USDC.
     * @param amount    6-decimal USDC base units. Must be > 0.
     * @param postId    Off-chain post id (e.g. from the social feed).
     */
    function tip(address recipient, uint256 amount, string calldata postId)
        external
        whenNotPaused
        nonReentrant
    {
        require(recipient != address(0), "RECIPIENT_ZERO");
        require(recipient != address(this), "RECIPIENT_SELF_CONTRACT");
        require(recipient != address(usdc), "RECIPIENT_USDC_CONTRACT");
        require(recipient != msg.sender, "RECIPIENT_SELF");
        require(amount > 0, "AMOUNT_ZERO");
        require(bytes(postId).length <= MAX_POST_ID_BYTES, "POST_ID_TOO_LONG");

        _safeTransferFrom(msg.sender, recipient, amount);
        emit Tip(msg.sender, recipient, amount, postId);
    }

    /**
     * @notice Send USDC with an optional memo note.
     * @dev Caller must `approve` this contract for `amount` first. Used by the
     *  Pay view (note field) and in-chat payments (empty memo allowed).
     * @param recipient Receiver of the USDC.
     * @param amount    6-decimal USDC base units. Must be > 0.
     * @param memo      Optional note, capped at MAX_MEMO_BYTES bytes.
     */
    function pay(address recipient, uint256 amount, string calldata memo)
        external
        whenNotPaused
        nonReentrant
    {
        require(recipient != address(0), "RECIPIENT_ZERO");
        require(recipient != address(this), "RECIPIENT_SELF_CONTRACT");
        require(recipient != address(usdc), "RECIPIENT_USDC_CONTRACT");
        require(recipient != msg.sender, "RECIPIENT_SELF");
        require(amount > 0, "AMOUNT_ZERO");
        require(bytes(memo).length <= MAX_MEMO_BYTES, "MEMO_TOO_LONG");

        _safeTransferFrom(msg.sender, recipient, amount);
        emit Payment(msg.sender, recipient, amount, memo);
    }

    // ── Read helpers (for pre-flight checks in the UI) ───────────────────────

    /// @notice USDC allowance the caller granted this contract.
    function myAllowance(address account) external view returns (uint256) {
        return usdc.allowance(account, address(this));
    }

    /// @notice Whether `account` can cover `amount` via this contract right now.
    function canPay(address account, uint256 amount) external view returns (bool) {
        if (paused || amount == 0) return false;
        if (usdc.balanceOf(account) < amount) return false;
        if (usdc.allowance(account, address(this)) < amount) return false;
        return true;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    /// @notice Halt new tips/payments. Callable only by owner.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Resume tips/payments. Callable only by owner.
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Propose a new admin. Takes effect only after `acceptOwnership`.
     * @param newOwner Proposed admin. Must not be zero or this contract.
     */
    function proposeOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "OWNER_ZERO");
        require(newOwner != address(this), "OWNER_SELF_CONTRACT");
        require(newOwner != owner, "OWNER_UNCHANGED");
        pendingOwner = newOwner;
        emit OwnershipProposed(owner, newOwner);
    }

    /// @notice Accept a pending admin transfer. Callable only by pendingOwner.
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "NOT_PENDING_OWNER");
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    /// @notice Cancel a pending admin transfer. Callable only by owner.
    function cancelOwnershipTransfer() external onlyOwner {
        pendingOwner = address(0);
        emit OwnershipTransferred(owner, owner);
    }

    // ── Rescue (user-error recovery, owner only) ─────────────────────────────

    /**
     * @notice Recover ERC-20 tokens mistakenly sent to this contract.
     * @dev The contract never holds user funds by design (it forwards
     *  everything), so any balance here is stranded by accident.
     */
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(0), "TOKEN_ZERO");
        require(to != address(0), "RECIPIENT_ZERO");
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IUSDCToken.transfer.selector, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "RESCUE_FAILED");
        emit Rescued(token, to, amount);
    }

    /**
     * @notice Recover native gas (USDC 18-dec view on Arc) sent here by mistake.
     */
    function rescueNative(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "RECIPIENT_ZERO");
        uint256 amount = address(this).balance;
        require(amount > 0, "NOTHING_TO_RESCUE");
        (bool success, ) = to.call{value: amount}("");
        require(success, "RESCUE_FAILED");
        emit Rescued(address(0), to, amount);
    }

    // ── Internals ────────────────────────────────────────────────────────────

    /**
     * @dev transferFrom that also accepts tokens returning no boolean
     *  (non-standard ERC-20 implementations). Reverts otherwise.
     */
    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(usdc).call(
            abi.encodeWithSelector(IUSDCToken.transferFrom.selector, from, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "USDC_TRANSFER_FAILED");
    }

    /// @dev Reject plain native transfers so gas is never locked silently.
    receive() external payable {
        revert("DIRECT_TRANSFERS_DISABLED");
    }
}
