// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PrimarySale is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    error ZeroAmount();

    constructor(IERC20 _usdc) {
        usdc = _usdc;
    }

    function buy(address yst, address emitter, uint256 amountUsdc) external nonReentrant {
        if (amountUsdc == 0) revert ZeroAmount();
        uint8 d = IERC20Metadata(yst).decimals();
        uint256 ystOut = (amountUsdc * 10 ** uint256(d)) / 1_000_000;

        usdc.safeTransferFrom(msg.sender, address(this), amountUsdc);
        IERC20(yst).safeTransferFrom(emitter, msg.sender, ystOut);
        usdc.safeTransfer(emitter, amountUsdc);
    }
}
