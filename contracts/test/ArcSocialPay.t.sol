// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcSocialPay} from "../ArcSocialPay.sol";

/// @dev Minimal 6-decimal ERC-20 (reverts with strings on failure).
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
        totalSupply += amt;
    }

    function approve(address s, uint256 amt) external returns (bool) {
        allowance[msg.sender][s] = amt;
        return true;
    }

    function transfer(address to, uint256 amt) external virtual returns (bool) {
        require(balanceOf[msg.sender] >= amt, "BAL");
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    function transferFrom(address from, address to, uint256 amt) external virtual returns (bool) {
        require(allowance[from][msg.sender] >= amt, "ALLOW");
        require(balanceOf[from] >= amt, "BAL");
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

/// @dev Non-standard token: transfer/transferFrom return no data.
contract NoBoolToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public decimals = 6;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address s, uint256 amt) external {
        allowance[msg.sender][s] = amt;
    }

    function transfer(address to, uint256 amt) external {
        require(balanceOf[msg.sender] >= amt, "BAL");
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
    }

    function transferFrom(address from, address to, uint256 amt) external {
        require(allowance[from][msg.sender] >= amt, "ALLOW");
        require(balanceOf[from] >= amt, "BAL");
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
    }
}

/// @dev Returns false instead of reverting.
contract FalseToken is MockUSDC {
    function transferFrom(address, address, uint256) external pure override returns (bool) {
        return false;
    }

    function transfer(address, uint256) external pure override returns (bool) {
        return false;
    }
}

/// @dev Token that re-enters the pay contract from inside transferFrom / transfer.
contract ReentrantToken is MockUSDC {
    ArcSocialPay public target;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public reentryRevert;
    uint8 public mode; // 0 pay, 1 tip, 2 rescueERC20, 3 rescueNative

    function setTarget(ArcSocialPay t, uint8 m) external {
        target = t;
        mode = m;
    }

    function _reenter() internal {
        attempted = true;
        bytes memory cd;
        if (mode == 0) cd = abi.encodeCall(ArcSocialPay.pay, (address(0xBEEF), 1, ""));
        else if (mode == 1) cd = abi.encodeCall(ArcSocialPay.tip, (address(0xBEEF), 1, "p"));
        else if (mode == 2) cd = abi.encodeCall(ArcSocialPay.rescueERC20, (address(this), address(0xBEEF), 1));
        else cd = abi.encodeCall(ArcSocialPay.rescueNative, (payable(address(0xBEEF))));
        (bool ok, bytes memory ret) = address(target).call(cd);
        reentrySucceeded = ok;
        reentryRevert = ret;
    }

    function transferFrom(address from, address to, uint256 amt) external override returns (bool) {
        if (address(target) != address(0)) _reenter();
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    function transfer(address to, uint256 amt) external override returns (bool) {
        if (address(target) != address(0)) _reenter();
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

/// @dev Native receiver that rejects ETH.
contract RejectEth {}

contract ArcSocialPayTest is Test {
    event Tip(address indexed sender, address indexed recipient, uint256 amount, string postId);
    event Payment(address indexed sender, address indexed recipient, uint256 amount, string memo);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipProposed(address indexed currentOwner, address indexed proposedOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    ArcSocialPay internal c;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant START = 1_000e6;

    function setUp() public {
        usdc = new MockUSDC();
        vm.prank(owner);
        c = new ArcSocialPay(address(usdc));
        usdc.mint(alice, START);
        vm.prank(alice);
        usdc.approve(address(c), type(uint256).max);
    }

    function _str(uint256 n) internal pure returns (string memory) {
        return string(new bytes(n));
    }

    // ───────────────────────── Deployment ─────────────────────────

    function test_Deploy_SetsState() public view {
        assertEq(address(c.usdc()), address(usdc));
        assertEq(c.owner(), owner);
        assertEq(c.pendingOwner(), address(0));
        assertFalse(c.paused());
        assertEq(c.MAX_MEMO_BYTES(), 280);
        assertEq(c.MAX_POST_ID_BYTES(), 128);
    }

    function test_Deploy_EmitsOwnershipTransferred() public {
        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferred(address(0), address(this));
        new ArcSocialPay(address(usdc));
    }

    function test_RevertDeploy_ZeroUsdc() public {
        vm.expectRevert(bytes("USDC_ZERO_ADDRESS"));
        new ArcSocialPay(address(0));
    }

    function test_RevertDeploy_EOAUsdc() public {
        vm.expectRevert(bytes("USDC_NOT_A_CONTRACT"));
        new ArcSocialPay(alice);
    }

    // ───────────────────────── pay ─────────────────────────

    function test_Pay_MovesBalances() public {
        vm.prank(alice);
        c.pay(bob, 100e6, "lunch");
        assertEq(usdc.balanceOf(alice), START - 100e6);
        assertEq(usdc.balanceOf(bob), 100e6);
        assertEq(usdc.balanceOf(address(c)), 0);
    }

    function test_Pay_EmitsPayment() public {
        vm.expectEmit(true, true, false, true, address(c));
        emit Payment(alice, bob, 5e6, "thanks");
        vm.prank(alice);
        c.pay(bob, 5e6, "thanks");
    }

    function test_Pay_EmptyMemoAllowed() public {
        vm.expectEmit(true, true, false, true, address(c));
        emit Payment(alice, bob, 1, "");
        vm.prank(alice);
        c.pay(bob, 1, "");
    }

    function test_Pay_ConsumesAllowance() public {
        vm.prank(alice);
        usdc.approve(address(c), 10e6);
        vm.prank(alice);
        c.pay(bob, 4e6, "");
        assertEq(c.myAllowance(alice), 6e6);
    }

    function test_Pay_MemoAtLimitOk() public {
        string memory m = _str(280);
        vm.prank(alice);
        c.pay(bob, 1, m);
        assertEq(usdc.balanceOf(bob), 1);
    }

    function test_RevertPay_MemoTooLong() public {
        string memory m = _str(281);
        vm.prank(alice);
        vm.expectRevert(bytes("MEMO_TOO_LONG"));
        c.pay(bob, 1, m);
    }

    function test_RevertPay_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(bytes("AMOUNT_ZERO"));
        c.pay(bob, 0, "");
    }

    function test_RevertPay_ZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(bytes("RECIPIENT_ZERO"));
        c.pay(address(0), 1, "");
    }

    function test_RevertPay_SelfPayment() public {
        vm.prank(alice);
        vm.expectRevert(bytes("RECIPIENT_SELF"));
        c.pay(alice, 1, "");
    }

    function test_RevertPay_RecipientIsContract() public {
        vm.prank(alice);
        vm.expectRevert(bytes("RECIPIENT_SELF_CONTRACT"));
        c.pay(address(c), 1, "");
    }

    function test_RevertPay_RecipientIsUsdc() public {
        vm.prank(alice);
        vm.expectRevert(bytes("RECIPIENT_USDC_CONTRACT"));
        c.pay(address(usdc), 1, "");
    }

    function test_RevertPay_InsufficientAllowance() public {
        vm.prank(alice);
        usdc.approve(address(c), 1e6);
        vm.prank(alice);
        vm.expectRevert(bytes("USDC_TRANSFER_FAILED"));
        c.pay(bob, 2e6, "");
    }

    function test_RevertPay_InsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert(bytes("USDC_TRANSFER_FAILED"));
        c.pay(bob, START + 1, "");
    }

    function test_RevertPay_NoApproval() public {
        usdc.mint(carol, 10e6);
        vm.prank(carol);
        vm.expectRevert(bytes("USDC_TRANSFER_FAILED"));
        c.pay(bob, 1e6, "");
    }

    // ───────────────────────── tip ─────────────────────────

    function test_Tip_MovesBalances() public {
        vm.prank(alice);
        c.tip(bob, 7e6, "post-1");
        assertEq(usdc.balanceOf(alice), START - 7e6);
        assertEq(usdc.balanceOf(bob), 7e6);
        assertEq(usdc.balanceOf(address(c)), 0);
    }

    function test_Tip_EmitsTip() public {
        vm.expectEmit(true, true, false, true, address(c));
        emit Tip(alice, bob, 3e6, "post-abc");
        vm.prank(alice);
        c.tip(bob, 3e6, "post-abc");
    }

    function test_Tip_EmptyPostIdAllowed() public {
        vm.expectEmit(true, true, false, true, address(c));
        emit Tip(alice, bob, 1, "");
        vm.prank(alice);
        c.tip(bob, 1, "");
    }

    function test_Tip_PostIdAtLimitOk() public {
        string memory p = _str(128);
        vm.prank(alice);
        c.tip(bob, 1, p);
        assertEq(usdc.balanceOf(bob), 1);
    }

    function test_RevertTip_PostIdTooLong() public {
        string memory p = _str(129);
        vm.prank(alice);
        vm.expectRevert(bytes("POST_ID_TOO_LONG"));
        c.tip(bob, 1, p);
    }

    function test_RevertTip_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(bytes("AMOUNT_ZERO"));
        c.tip(bob, 0, "p");
    }

    function test_RevertTip_ZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(bytes("RECIPIENT_ZERO"));
        c.tip(address(0), 1, "p");
    }

    function test_RevertTip_SelfTip() public {
        vm.prank(alice);
        vm.expectRevert(bytes("RECIPIENT_SELF"));
        c.tip(alice, 1, "p");
    }

    function test_RevertTip_RecipientIsContract() public {
        vm.prank(alice);
        vm.expectRevert(bytes("RECIPIENT_SELF_CONTRACT"));
        c.tip(address(c), 1, "p");
    }

    function test_RevertTip_RecipientIsUsdc() public {
        vm.prank(alice);
        vm.expectRevert(bytes("RECIPIENT_USDC_CONTRACT"));
        c.tip(address(usdc), 1, "p");
    }

    function test_RevertTip_InsufficientAllowance() public {
        vm.prank(alice);
        usdc.approve(address(c), 0);
        vm.prank(alice);
        vm.expectRevert(bytes("USDC_TRANSFER_FAILED"));
        c.tip(bob, 1, "p");
    }

    function test_RevertTip_InsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert(bytes("USDC_TRANSFER_FAILED"));
        c.tip(bob, START + 1, "p");
    }

    // ───────────────────────── pause ─────────────────────────

    function test_Pause_EmitsAndSets() public {
        vm.expectEmit(true, false, false, false, address(c));
        emit Paused(owner);
        vm.prank(owner);
        c.pause();
        assertTrue(c.paused());
    }

    function test_Pause_BlocksPayAndTip() public {
        vm.prank(owner);
        c.pause();
        vm.startPrank(alice);
        vm.expectRevert(bytes("PAUSED"));
        c.pay(bob, 1, "");
        vm.expectRevert(bytes("PAUSED"));
        c.tip(bob, 1, "p");
        vm.stopPrank();
        assertEq(usdc.balanceOf(alice), START);
    }

    function test_Unpause_RestoresAndEmits() public {
        vm.startPrank(owner);
        c.pause();
        vm.expectEmit(true, false, false, false, address(c));
        emit Unpaused(owner);
        c.unpause();
        vm.stopPrank();
        assertFalse(c.paused());
        vm.prank(alice);
        c.pay(bob, 1, "");
        vm.prank(alice);
        c.tip(bob, 1, "p");
        assertEq(usdc.balanceOf(bob), 2);
    }

    function test_RevertPause_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_OWNER"));
        c.pause();
    }

    function test_RevertUnpause_NonOwner() public {
        vm.prank(owner);
        c.pause();
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_OWNER"));
        c.unpause();
        assertTrue(c.paused());
    }

    // ───────────────────────── views ─────────────────────────

    function test_MyAllowance() public view {
        assertEq(c.myAllowance(alice), type(uint256).max);
        assertEq(c.myAllowance(bob), 0);
    }

    function test_CanPay_True() public view {
        assertTrue(c.canPay(alice, START));
    }

    function test_CanPay_FalseCases() public {
        assertFalse(c.canPay(alice, 0), "zero amount");
        assertFalse(c.canPay(alice, START + 1), "balance");
        assertFalse(c.canPay(bob, 1), "no balance/allowance");
        usdc.mint(bob, 10);
        assertFalse(c.canPay(bob, 1), "no allowance");
        vm.prank(owner);
        c.pause();
        assertFalse(c.canPay(alice, 1), "paused");
    }

    // ───────────────────────── ownership ─────────────────────────

    function test_ProposeOwner_SetsPendingAndEmits() public {
        vm.expectEmit(true, true, false, false, address(c));
        emit OwnershipProposed(owner, bob);
        vm.prank(owner);
        c.proposeOwner(bob);
        assertEq(c.pendingOwner(), bob);
        assertEq(c.owner(), owner);
    }

    function test_AcceptOwnership_Transfers() public {
        vm.prank(owner);
        c.proposeOwner(bob);
        vm.expectEmit(true, true, false, false, address(c));
        emit OwnershipTransferred(owner, bob);
        vm.prank(bob);
        c.acceptOwnership();
        assertEq(c.owner(), bob);
        assertEq(c.pendingOwner(), address(0));
        // old owner lost privileges, new owner has them
        vm.prank(owner);
        vm.expectRevert(bytes("NOT_OWNER"));
        c.pause();
        vm.prank(bob);
        c.pause();
        assertTrue(c.paused());
    }

    function test_ProposeOwner_Overwrites() public {
        vm.startPrank(owner);
        c.proposeOwner(bob);
        c.proposeOwner(carol);
        vm.stopPrank();
        assertEq(c.pendingOwner(), carol);
        vm.prank(bob);
        vm.expectRevert(bytes("NOT_PENDING_OWNER"));
        c.acceptOwnership();
    }

    function test_CancelOwnershipTransfer() public {
        vm.startPrank(owner);
        c.proposeOwner(bob);
        c.cancelOwnershipTransfer();
        vm.stopPrank();
        assertEq(c.pendingOwner(), address(0));
        assertEq(c.owner(), owner);
        vm.prank(bob);
        vm.expectRevert(bytes("NOT_PENDING_OWNER"));
        c.acceptOwnership();
    }

    function test_RevertPropose_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_OWNER"));
        c.proposeOwner(bob);
    }

    function test_RevertPropose_Zero() public {
        vm.prank(owner);
        vm.expectRevert(bytes("OWNER_ZERO"));
        c.proposeOwner(address(0));
    }

    function test_RevertPropose_SelfContract() public {
        vm.prank(owner);
        vm.expectRevert(bytes("OWNER_SELF_CONTRACT"));
        c.proposeOwner(address(c));
    }

    function test_RevertPropose_Unchanged() public {
        vm.prank(owner);
        vm.expectRevert(bytes("OWNER_UNCHANGED"));
        c.proposeOwner(owner);
    }

    function test_RevertAccept_NotPending() public {
        vm.prank(owner);
        c.proposeOwner(bob);
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_PENDING_OWNER"));
        c.acceptOwnership();
    }

    function test_RevertAccept_NothingPending() public {
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_PENDING_OWNER"));
        c.acceptOwnership();
        // NOTE: msg.sender == address(0) with pendingOwner == 0 would pass the check, but
        // no real transaction can have a zero sender, so it is not tested as a revert.
    }

    function test_RevertCancel_NonOwner() public {
        vm.prank(owner);
        c.proposeOwner(bob);
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_OWNER"));
        c.cancelOwnershipTransfer();
        assertEq(c.pendingOwner(), bob);
    }

    // ───────────────────────── rescue ─────────────────────────

    function test_RescueERC20_Happy() public {
        usdc.mint(address(c), 50e6); // stranded
        vm.expectEmit(true, true, false, true, address(c));
        emit Rescued(address(usdc), carol, 50e6);
        vm.prank(owner);
        c.rescueERC20(address(usdc), carol, 50e6);
        assertEq(usdc.balanceOf(carol), 50e6);
        assertEq(usdc.balanceOf(address(c)), 0);
    }

    function test_RescueERC20_NoBoolToken() public {
        NoBoolToken t = new NoBoolToken();
        t.mint(address(c), 9);
        vm.prank(owner);
        c.rescueERC20(address(t), carol, 9);
        assertEq(t.balanceOf(carol), 9);
    }

    function test_RevertRescueERC20_NonOwner() public {
        usdc.mint(address(c), 1);
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_OWNER"));
        c.rescueERC20(address(usdc), alice, 1);
    }

    function test_RevertRescueERC20_ZeroToken() public {
        vm.prank(owner);
        vm.expectRevert(bytes("TOKEN_ZERO"));
        c.rescueERC20(address(0), carol, 1);
    }

    function test_RevertRescueERC20_ZeroTo() public {
        vm.prank(owner);
        vm.expectRevert(bytes("RECIPIENT_ZERO"));
        c.rescueERC20(address(usdc), address(0), 1);
    }

    function test_RevertRescueERC20_InsufficientBalance() public {
        vm.prank(owner);
        vm.expectRevert(bytes("RESCUE_FAILED"));
        c.rescueERC20(address(usdc), carol, 1);
    }

    function test_RevertRescueERC20_FalseReturn() public {
        FalseToken t = new FalseToken();
        vm.prank(owner);
        vm.expectRevert(bytes("RESCUE_FAILED"));
        c.rescueERC20(address(t), carol, 1);
    }

    function test_RescueNative_Happy() public {
        vm.deal(address(c), 3 ether);
        vm.expectEmit(true, true, false, true, address(c));
        emit Rescued(address(0), carol, 3 ether);
        vm.prank(owner);
        c.rescueNative(payable(carol));
        assertEq(carol.balance, 3 ether);
        assertEq(address(c).balance, 0);
    }

    function test_RevertRescueNative_NonOwner() public {
        vm.deal(address(c), 1 ether);
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_OWNER"));
        c.rescueNative(payable(alice));
    }

    function test_RevertRescueNative_ZeroTo() public {
        vm.deal(address(c), 1 ether);
        vm.prank(owner);
        vm.expectRevert(bytes("RECIPIENT_ZERO"));
        c.rescueNative(payable(address(0)));
    }

    function test_RevertRescueNative_Nothing() public {
        vm.prank(owner);
        vm.expectRevert(bytes("NOTHING_TO_RESCUE"));
        c.rescueNative(payable(carol));
    }

    function test_RevertRescueNative_RecipientRejects() public {
        vm.deal(address(c), 1 ether);
        address rej = address(new RejectEth());
        vm.prank(owner);
        vm.expectRevert(bytes("RESCUE_FAILED"));
        c.rescueNative(payable(rej));
        assertEq(address(c).balance, 1 ether);
    }

    function test_RevertReceive_DirectTransfer() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok, bytes memory ret) = address(c).call{value: 1}("");
        assertFalse(ok);
        assertEq(address(c).balance, 0);
        assertGt(ret.length, 0);
    }

    // ───────────────────────── token flavours ─────────────────────────

    function test_Pay_WorksWithNoBoolToken() public {
        NoBoolToken t = new NoBoolToken();
        ArcSocialPay c2 = new ArcSocialPay(address(t));
        t.mint(alice, 10);
        vm.startPrank(alice);
        t.approve(address(c2), 10);
        c2.pay(bob, 10, "x");
        vm.stopPrank();
        assertEq(t.balanceOf(bob), 10);
    }

    function test_RevertPay_TokenReturnsFalse() public {
        FalseToken t = new FalseToken();
        ArcSocialPay c2 = new ArcSocialPay(address(t));
        vm.prank(alice);
        vm.expectRevert(bytes("USDC_TRANSFER_FAILED"));
        c2.pay(bob, 1, "");
    }

    // ───────────────────────── reentrancy ─────────────────────────

    function _reentrancyFixture(uint8 mode) internal returns (ReentrantToken t, ArcSocialPay c2) {
        t = new ReentrantToken();
        vm.prank(owner);
        c2 = new ArcSocialPay(address(t));
        t.mint(alice, 100);
        t.mint(address(c2), 100);
        vm.deal(address(c2), 1 ether);
        vm.prank(alice);
        t.approve(address(c2), 100);
        t.setTarget(c2, mode);
    }

    function _assertBlocked(ReentrantToken t) internal view {
        assertTrue(t.attempted(), "token did not re-enter");
        assertFalse(t.reentrySucceeded(), "reentry succeeded");
        assertEq(
            keccak256(t.reentryRevert()),
            keccak256(abi.encodeWithSignature("Error(string)", "REENTRANT"))
        );
    }

    function test_Reentrancy_PayBlockedDuringPay() public {
        (ReentrantToken t, ArcSocialPay c2) = _reentrancyFixture(0);
        vm.prank(alice);
        c2.pay(bob, 10, "m");
        _assertBlocked(t);
        assertEq(t.balanceOf(bob), 10);
    }

    function test_Reentrancy_TipBlockedDuringPay() public {
        (ReentrantToken t, ArcSocialPay c2) = _reentrancyFixture(1);
        vm.prank(alice);
        c2.pay(bob, 10, "m");
        _assertBlocked(t);
    }

    function test_Reentrancy_PayBlockedDuringTip() public {
        (ReentrantToken t, ArcSocialPay c2) = _reentrancyFixture(0);
        vm.prank(alice);
        c2.tip(bob, 10, "p");
        _assertBlocked(t);
        assertEq(t.balanceOf(bob), 10);
    }

    function test_Reentrancy_PayBlockedDuringRescueERC20() public {
        (ReentrantToken t, ArcSocialPay c2) = _reentrancyFixture(0);
        vm.prank(owner);
        c2.rescueERC20(address(t), carol, 5);
        _assertBlocked(t);
        assertEq(t.balanceOf(carol), 5);
    }

    function test_Reentrancy_LockReleasedAfterCall() public {
        (ReentrantToken t, ArcSocialPay c2) = _reentrancyFixture(0);
        vm.prank(alice);
        c2.pay(bob, 10, "m");
        t.setTarget(ArcSocialPay(payable(address(0))), 0); // disable reentry
        vm.prank(alice);
        c2.pay(bob, 10, "m2"); // would revert REENTRANT if lock leaked
        assertEq(t.balanceOf(bob), 20);
    }

    // ───────────────────────── fuzz / invariant ─────────────────────────

    function testFuzz_Pay_ConservesFunds(address to, uint256 amt, string calldata memo) public {
        vm.assume(to != address(0) && to != alice && to != address(c) && to != address(usdc));
        amt = bound(amt, 1, START);
        vm.assume(bytes(memo).length <= 280);
        uint256 toBefore = usdc.balanceOf(to);
        vm.prank(alice);
        c.pay(to, amt, memo);
        assertEq(usdc.balanceOf(alice), START - amt);
        assertEq(usdc.balanceOf(to), toBefore + amt);
        assertEq(usdc.balanceOf(address(c)), 0);
    }

    function testFuzz_Tip_PostIdLimit(uint256 len) public {
        len = bound(len, 0, 400);
        string memory p = _str(len);
        vm.prank(alice);
        if (len > 128) vm.expectRevert(bytes("POST_ID_TOO_LONG"));
        c.tip(bob, 1, p);
    }

    function testFuzz_Pay_MemoLimit(uint256 len) public {
        len = bound(len, 0, 600);
        string memory m = _str(len);
        vm.prank(alice);
        if (len > 280) vm.expectRevert(bytes("MEMO_TOO_LONG"));
        c.pay(bob, 1, m);
    }
}

/// @dev Handler for the "contract never custodies USDC" invariant.
contract PayHandler is Test {
    ArcSocialPay public c;
    MockUSDC public usdc;
    address[3] internal actors;
    uint256 public totalMinted;

    constructor(ArcSocialPay _c, MockUSDC _u) {
        c = _c;
        usdc = _u;
        for (uint256 i; i < 3; i++) {
            actors[i] = address(uint160(0xA000 + i));
            _u.mint(actors[i], 1_000e6);
            totalMinted += 1_000e6;
            vm.prank(actors[i]);
            _u.approve(address(_c), type(uint256).max);
        }
    }

    function pay(uint256 from, uint256 to, uint256 amt) external {
        address f = actors[from % 3];
        address t = actors[to % 3];
        if (f == t) return;
        amt = bound(amt, 1, 100e6);
        vm.prank(f);
        try c.pay(t, amt, "") {} catch {}
    }

    function tip(uint256 from, uint256 to, uint256 amt) external {
        address f = actors[from % 3];
        address t = actors[to % 3];
        if (f == t) return;
        amt = bound(amt, 1, 100e6);
        vm.prank(f);
        try c.tip(t, amt, "p") {} catch {}
    }

    function sumActors() external view returns (uint256 s) {
        for (uint256 i; i < 3; i++) s += usdc.balanceOf(actors[i]);
    }
}

contract ArcSocialPayInvariantTest is Test {
    ArcSocialPay internal c;
    MockUSDC internal usdc;
    PayHandler internal h;

    function setUp() public {
        usdc = new MockUSDC();
        c = new ArcSocialPay(address(usdc));
        h = new PayHandler(c, usdc);
        targetContract(address(h));
    }

    function invariant_ContractHoldsNoUsdc() public view {
        assertEq(usdc.balanceOf(address(c)), 0);
    }

    function invariant_UsdcConserved() public view {
        assertEq(h.sumActors(), h.totalMinted());
    }
}
