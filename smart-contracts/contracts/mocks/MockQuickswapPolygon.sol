// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockQuickswapPolygon {
    using SafeERC20 for IERC20;

    IERC20  public immutable usdc;
    address public splitter;
    address public immutable owner;

    string  public constant CHAIN_LABEL = "Polygon";
    string  public constant PROTOCOL    = "QuickswapV3";

    uint256 public constant FEE_AMOUNT   = 249 * 1e6;  
    uint256 public constant FEE_INTERVAL = 10 minutes;

    uint256 public lastFeeTimestamp;
    uint256 public totalFeesGenerated;
    uint256 public feeCount;

    event FeesGenerated(
        string  chainLabel,
        string  protocol,
        uint256 amount,
        uint256 timestamp
    );

    error TooEarly(uint256 nextAllowed);
    error NotOwner();
    error InsufficientBalance();

    constructor(address _usdc, address _splitter) {
        usdc             = IERC20(_usdc);
        splitter         = _splitter;
        owner            = msg.sender;
        lastFeeTimestamp = block.timestamp;
    }

    function setSplitter(address _newSplitter) external {
        if (msg.sender != owner) revert NotOwner();
        splitter = _newSplitter;
    }

    function generateFees() external {
        if (block.timestamp < lastFeeTimestamp + FEE_INTERVAL)
            revert TooEarly(lastFeeTimestamp + FEE_INTERVAL);
        _sendFees(FEE_AMOUNT);
    }

    function generateFeesManual(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _sendFees(amount);
    }

    function fastForward(uint256 cycles) external {
        if (msg.sender != owner) revert NotOwner();
        for (uint256 i = 0; i < cycles; i++) {
            _sendFees(FEE_AMOUNT);
        }
    }

    function _sendFees(uint256 amount) internal {
        if (usdc.balanceOf(address(this)) < amount)
            revert InsufficientBalance();

        lastFeeTimestamp   = block.timestamp;
        totalFeesGenerated += amount;
        feeCount           += 1;

        usdc.approve(splitter, amount);
        (bool success, ) = splitter.call(
            abi.encodeWithSignature("splitFees(uint256)", amount)
        );
        require(success, "splitFees failed");

        emit FeesGenerated(CHAIN_LABEL, PROTOCOL, amount, block.timestamp);
    }

    function canGenerateFees() external view returns (bool) {
        return block.timestamp >= lastFeeTimestamp + FEE_INTERVAL;
    }

    function usdcBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}