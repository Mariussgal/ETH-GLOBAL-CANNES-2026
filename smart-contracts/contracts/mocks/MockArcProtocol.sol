// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice CCTP V2 TokenMessenger — interface confirmée sur testnet.arcscan.app
/// selector: 0x8e0250ee | amount en ×10^18 (USDC natif Arc, 18 décimales)
interface ITokenMessengerV2 {
    function depositForBurn(
        uint256 amount,                // ×10^18 — natif Arc
        uint32  destinationDomain,
        bytes32 mintRecipient,
        address burnToken,             // 0x3600... USDC ERC20 Arc
        bytes32 destinationCaller,     // bytes32(0) = open relay
        uint256 maxFee,                // 0 = pas de cap
        uint32  minFinalityThreshold   // 1000 = fast finality
    ) external payable returns (uint64 nonce);
}

/// @title MockArcProtocol
/// @notice Simule un protocole sur Arc qui génère des fees en USDC natif
///         et les bridge vers le Router YSM sur Sepolia via Circle CCTP V2.
///
///         Sur Arc, USDC natif = 18 décimales.
///         Utiliser generateFeesManualUsdc(5) pour bridger 5 USDC.
contract MockArcProtocol {

    ITokenMessengerV2 public immutable tokenMessenger;
    address public immutable owner;

    /// @notice YSM Router sur Sepolia (destination des fees)
    bytes32 public immutable sepoliaRouter;

    /// @notice CCTP domain ID pour Ethereum Sepolia
    uint32 public constant SEPOLIA_DOMAIN = 0;

    /// @notice Precompile ERC20 de l'USDC natif sur Arc testnet
    address public constant USDC_ERC20 = 0x3600000000000000000000000000000000000000;

    /// @notice Plafond absolu : 5 USDC (18 décimales)
    uint256 public constant MAX_TOTAL_FEES = 5 * 1e18;

    uint256 public totalFeesGenerated;
    uint256 public feeCount;
    uint256 public lastFeeTimestamp;

    event FeesGenerated(string chainLabel, string protocol, uint256 amount, uint256 timestamp);

    error NotOwner();
    error CapReached();
    error InsufficientBalance();
    error BridgeFailed();

    constructor(address _tokenMessenger) {
        tokenMessenger   = ITokenMessengerV2(_tokenMessenger);
        owner            = msg.sender;
        lastFeeTimestamp = block.timestamp;
        sepoliaRouter    = bytes32(uint256(uint160(0x02E75407376e5FBEd0e507E8265d92CeE9279fDC)));
    }

    /// @notice Accepte l'USDC natif envoyé au contrat
    receive() external payable {}
    fallback() external payable {}

    /// @notice Raccourci lisible — usdcUnits en USDC entiers
    ///         Ex: generateFeesManualUsdc(5) = bridge de 5 USDC
    function generateFeesManualUsdc(uint256 usdcUnits) external {
        if (msg.sender != owner) revert NotOwner();
        _bridgeFees(usdcUnits * 1e18);
    }

    /// @notice Appel direct en natif 18 décimales
    ///         Ex: generateFeesManual(5000000000000000000) = bridge de 5 USDC
    function generateFeesManual(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _bridgeFees(amount);
    }

    function _bridgeFees(uint256 amount) internal {
        if (totalFeesGenerated + amount > MAX_TOTAL_FEES) revert CapReached();
        if (address(this).balance < amount) revert InsufficientBalance();

        totalFeesGenerated += amount;
        feeCount           += 1;
        lastFeeTimestamp    = block.timestamp;

        // CCTP V2 : amount ET {value} en 18 décimales (natif Arc, confirmé ×10^18)
        try tokenMessenger.depositForBurn{value: amount}(
            amount,
            SEPOLIA_DOMAIN,
            sepoliaRouter,
            USDC_ERC20,
            bytes32(0),
            0,
            1000
        ) {
            emit FeesGenerated("Arc", "YSM", amount, block.timestamp);
        } catch {
            totalFeesGenerated -= amount;
            feeCount           -= 1;
            revert BridgeFailed();
        }
    }

    /// @notice Solde USDC natif du contrat (18 décimales)
    function usdcBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Solde affiché en USDC entiers lisibles
    function usdcBalanceReadable() external view returns (uint256) {
        return address(this).balance / 1e18;
    }

    function capReached() external view returns (bool) {
        return totalFeesGenerated >= MAX_TOTAL_FEES;
    }
}
