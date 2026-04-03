
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IVault {
    function depositFees(uint256 amount) external;
}

contract Router {
    using SafeERC20 for IERC20;

    IERC20 public immutable feeToken;

    address public immutable vault;

    address public immutable treasury;

    uint256 public immutable vaultBps;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    event FeesReceived(
        uint256 totalAmount,
        uint256 vaultAmount,
        uint256 treasuryAmount,
        uint256 timestamp
    );

    error InvalidVaultBps(uint256 bps);
    error ZeroAddress();
    error ZeroAmount();

    constructor(
        address _feeToken,
        address _vault,
        address _treasury,
        uint256 _vaultBps
    ) {
        if (_feeToken == address(0) || _vault == address(0) || _treasury == address(0))
            revert ZeroAddress();
        
        if (_vaultBps < 100 || _vaultBps > 5_000)
            revert InvalidVaultBps(_vaultBps);

        feeToken = IERC20(_feeToken);
        vault = _vault;
        treasury = _treasury;
        vaultBps = _vaultBps;
    }

    function splitFees(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        feeToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 vaultAmount = (amount * vaultBps) / BPS_DENOMINATOR;
        uint256 treasuryAmount = amount - vaultAmount;

        if (vaultAmount > 0) {
            feeToken.approve(vault, vaultAmount);
            IVault(vault).depositFees(vaultAmount);
        }
        if (treasuryAmount > 0) {
            feeToken.safeTransfer(treasury, treasuryAmount);
        }

        emit FeesReceived(amount, vaultAmount, treasuryAmount, block.timestamp);
    }

    function flushBalance() external {
        uint256 balance = feeToken.balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();

        uint256 vaultAmount = (balance * vaultBps) / BPS_DENOMINATOR;
        uint256 treasuryAmount = balance - vaultAmount;

        if (vaultAmount > 0) {
            feeToken.approve(vault, vaultAmount);
            IVault(vault).depositFees(vaultAmount);
        }        if (treasuryAmount > 0) feeToken.safeTransfer(treasury, treasuryAmount);

        emit FeesReceived(balance, vaultAmount, treasuryAmount, block.timestamp);
    }

    string public chainSource = "Ethereum";

    event ArcFeesReceived(
        uint256 amount,
        string  sourceChain,
        uint256 timestamp
    );

    function receiveFromArc(
        uint256 amount,
        string calldata sourceChain
    ) external {
        if (amount == 0) revert ZeroAmount();

        feeToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 vaultAmount    = (amount * vaultBps) / BPS_DENOMINATOR;
        uint256 treasuryAmount = amount - vaultAmount;

        if (vaultAmount > 0) {
            feeToken.approve(vault, vaultAmount);
            IVault(vault).depositFees(vaultAmount);
        }
        if (treasuryAmount > 0) {
            feeToken.safeTransfer(treasury, treasuryAmount);
        }

        emit ArcFeesReceived(amount, sourceChain, block.timestamp);
        emit FeesReceived(amount, vaultAmount, treasuryAmount, block.timestamp);
    }

    function setChainSource(string calldata _chainSource) external {
        chainSource = _chainSource;
    }

    function config() external view returns (
        address _feeToken,
        address _vault,
        address _treasury,
        uint256 _vaultBps,
        uint256 _treasuryBps
    ) {
        return (
            address(feeToken),
            vault,
            treasury,
            vaultBps,
            BPS_DENOMINATOR - vaultBps
        );
    }
}