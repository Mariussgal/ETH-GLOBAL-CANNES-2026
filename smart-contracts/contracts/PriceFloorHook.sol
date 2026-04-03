// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVaultPriceFloor {
    function priceFloor() external view returns (uint256);
}

contract PriceFloorHook {

    // ─── Events ───────────────────────────────────────────────────────────────

    event PriceFloorUpdated(
        address indexed vault,
        uint256 priceFloor,
        uint256 timestamp
    );

    event SwapExecuted(
        address indexed pool,
        address indexed vault,
        uint256 priceFloor,
        bool    zeroForOne,
        uint256 timestamp
    );

    // ─── State ────────────────────────────────────────────────────────────────

    address public immutable owner;

    /// @notice pool address → vault address
    mapping(address => address) public poolToVault;

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error VaultNotRegistered();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────


    function registerPool(address pool, address vault) external {
        if (msg.sender != owner) revert NotOwner();
        poolToVault[pool] = vault;
        emit PriceFloorUpdated(
            vault,
            IVaultPriceFloor(vault).priceFloor(),
            block.timestamp
        );
    }

    // ─── Hook callback (appelé par Uniswap v4 PoolManager) ───────────────────

 
    function afterSwap(
        address pool,
        bool    zeroForOne,
        uint256 /* amountSpecified */
    ) external {
        address vault = poolToVault[pool];
        if (vault == address(0)) revert VaultNotRegistered();

        uint256 floor = IVaultPriceFloor(vault).priceFloor();

        emit PriceFloorUpdated(vault, floor, block.timestamp);
        emit SwapExecuted(pool, vault, floor, zeroForOne, block.timestamp);
    }


    function getPriceFloor(address vault) external view returns (uint256) {
        return IVaultPriceFloor(vault).priceFloor();
    }


    function emitPriceFloor(address vault) external {
        uint256 floor = IVaultPriceFloor(vault).priceFloor();
        emit PriceFloorUpdated(vault, floor, block.timestamp);
    }
}