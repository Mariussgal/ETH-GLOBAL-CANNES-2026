// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Mock Base — frais USDC aléatoires, cooldown court, arrêt par `setFeesEnabled(false)`.
contract MockQuickswapBase {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public splitter;
    address public owner;

    string public constant CHAIN_LABEL = "Base";
    string public constant PROTOCOL = "QuickswapV3";

    /// @dev Cooldown minimum entre deux `generateFees` (secondes), ex. 5–10 pour démo fréquente.
    uint256 public minCooldown = 5;
    /// @dev Bornes montant (6 décimales USDC), ajustables par l’owner selon la trésorerie.
    uint256 public minFeeUsdc = 1 * 1e5; // 0.1 USDC
    uint256 public maxFeeUsdc = 25 * 1e6; // 25 USDC max par tick

    bool public feesEnabled = true;

    uint256 public lastFeeTimestamp;
    uint256 public totalFeesGenerated;
    uint256 public feeCount;

    event FeesGenerated(
        string chainLabel,
        string protocol,
        uint256 amount,
        uint256 timestamp
    );
    event FeesEnabledSet(bool enabled);
    event BoundsSet(uint256 minFee, uint256 maxFee);
    event MinCooldownSet(uint256 seconds_);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error TooEarly(uint256 nextAllowed);
    error NotOwner();
    error InsufficientBalance();
    error FeesDisabled();
    error ZeroAddress();

    constructor(address _usdc, address _splitter) {
        usdc = IERC20(_usdc);
        splitter = _splitter;
        owner = msg.sender;
        lastFeeTimestamp = block.timestamp;
    }

    /// @notice Permet au déployeur de passer le rôle owner au wallet utilisé pour le crank / API.
    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setSplitter(address _newSplitter) external {
        if (msg.sender != owner) revert NotOwner();
        splitter = _newSplitter;
    }

    /// @notice Coupe ou réactive la génération automatique (tout appelant).
    function setFeesEnabled(bool on) external {
        if (msg.sender != owner) revert NotOwner();
        feesEnabled = on;
        emit FeesEnabledSet(on);
    }

    function setFeeBounds(uint256 _min, uint256 _max) external {
        if (msg.sender != owner) revert NotOwner();
        require(_min > 0 && _max >= _min, "bounds");
        minFeeUsdc = _min;
        maxFeeUsdc = _max;
        emit BoundsSet(_min, _max);
    }

    function setMinCooldown(uint256 seconds_) external {
        if (msg.sender != owner) revert NotOwner();
        require(seconds_ <= 3600, "max 1h");
        minCooldown = seconds_;
        emit MinCooldownSet(seconds_);
    }

    /// @notice Montant pseudo-aléatoire entre min/max, cooldown `minCooldown`.
    function generateFees() external {
        if (!feesEnabled) revert FeesDisabled();
        if (block.timestamp < lastFeeTimestamp + minCooldown)
            revert TooEarly(lastFeeTimestamp + minCooldown);

        uint256 bal = usdc.balanceOf(address(this));
        uint256 span = maxFeeUsdc - minFeeUsdc + 1;
        uint256 rnd = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    feeCount,
                    address(this),
                    CHAIN_LABEL,
                    tx.gasprice
                )
            )
        );
        uint256 amount = minFeeUsdc + (rnd % span);
        if (amount > bal) {
            if (bal < minFeeUsdc) revert InsufficientBalance();
            amount = bal;
        }
        _sendFees(amount);
    }

    function generateFeesManual(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _sendFees(amount);
    }

    function fastForward(uint256 cycles) external {
        if (msg.sender != owner) revert NotOwner();
        for (uint256 i = 0; i < cycles; i++) {
            uint256 bal = usdc.balanceOf(address(this));
            if (bal < minFeeUsdc) break;
            uint256 span = maxFeeUsdc - minFeeUsdc + 1;
            uint256 rnd = uint256(keccak256(abi.encodePacked(block.timestamp, i, feeCount, address(this))));
            uint256 amount = minFeeUsdc + (rnd % span);
            if (amount > bal) amount = bal;
            _sendFees(amount);
        }
    }

    function _sendFees(uint256 amount) internal {
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientBalance();

        lastFeeTimestamp = block.timestamp;
        totalFeesGenerated += amount;
        feeCount += 1;

        usdc.approve(splitter, amount);
        (bool success, ) = splitter.call(abi.encodeWithSignature("splitFees(uint256)", amount));
        require(success, "splitFees failed");

        emit FeesGenerated(CHAIN_LABEL, PROTOCOL, amount, block.timestamp);
    }

    function canGenerateFees() external view returns (bool) {
        return feesEnabled && block.timestamp >= lastFeeTimestamp + minCooldown;
    }

    function usdcBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
