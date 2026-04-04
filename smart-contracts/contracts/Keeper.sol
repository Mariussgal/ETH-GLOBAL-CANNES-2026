
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

interface IVault {
    function executeSettlement() external;
    function lastFeeTimestamp() external view returns (uint256);
    function stream() external view returns (
        uint256 totalYST,
        uint256 streamBps,
        uint256 discountBps,
        uint256 startTime,
        uint256 endTime,
        uint256 capitalRaised,
        bool active
    );
}

interface IFactory {
    function getAllVaults() external view returns (address[] memory);
}

contract Keeper is AutomationCompatibleInterface {

    IFactory public immutable factory;
    address public immutable owner;
    address public creForwarder;

    uint256 public settlementInterval;

    event SettlementTriggered(address indexed vault, uint256 timestamp);
    event IntervalUpdated(uint256 newInterval);
    event SettlementTriggeredByCRE(uint256 timestamp);

    error NotOwner();
    error NotCREForwarder();

    modifier onlyCREForwarder() {
        if (msg.sender != creForwarder) revert NotCREForwarder();
        _;
    }

    constructor(address _factory, uint256 _settlementInterval) {
        factory            = IFactory(_factory);
        owner              = msg.sender;
        settlementInterval = _settlementInterval;
        creForwarder       = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    }

    /**
     * @notice Appelé par CRE Workflow #3 (trigger temporel).
     * Déclenche performUpkeep() directement.
     */
    function onReport(
        bytes calldata /* metadata */,
        bytes calldata /* report */
    ) external onlyCREForwarder {
        // Récupère tous les vaults à settler
        (, bytes memory performData) = this.checkUpkeep("");
        if (performData.length > 0) {
            this.performUpkeep(performData);
        }
        emit SettlementTriggeredByCRE(block.timestamp);
    }

    /**
     * @notice Met à jour le CRE Forwarder autorisé
     */
    function setCREForwarder(address _forwarder) external {
        if (msg.sender != owner) revert NotOwner();
        creForwarder = _forwarder;
    }

    function setSettlementInterval(uint256 _interval) external {
        if (msg.sender != owner) revert NotOwner();
        settlementInterval = _interval;
        emit IntervalUpdated(_interval);
    }

    function checkUpkeep(
        bytes calldata 
    ) external view override returns (
        bool upkeepNeeded,
        bytes memory performData
    ) {
        address[] memory vaults     = factory.getAllVaults();
        address[] memory toSettle   = new address[](vaults.length);
        uint256 count               = 0;

        for (uint256 i = 0; i < vaults.length; i++) {
            if (_needsSettlement(vaults[i])) {
                toSettle[count] = vaults[i];
                count++;
            }
        }

        if (count == 0) return (false, bytes(""));

        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = toSettle[i];
        }

        return (true, abi.encode(result));
    }

    function performUpkeep(bytes calldata performData) external override {
        address[] memory vaults = abi.decode(performData, (address[]));

        for (uint256 i = 0; i < vaults.length; i++) {
            if (_needsSettlement(vaults[i])) {
                IVault(vaults[i]).executeSettlement();
                emit SettlementTriggered(vaults[i], block.timestamp);
            }
        }
    }

    function _needsSettlement(address vault) internal view returns (bool) {
        try IVault(vault).lastFeeTimestamp() returns (uint256 last) {
            
            (, , , , uint256 endTime, , bool active) = IVault(vault).stream();
            if (!active) return false;
            if (block.timestamp > endTime) return false;
            return block.timestamp >= last + settlementInterval;
        } catch {
            return false;
        }
    }

    function getPendingVaults() external view returns (address[] memory) {
        address[] memory vaults   = factory.getAllVaults();
        address[] memory pending  = new address[](vaults.length);
        uint256 count             = 0;

        for (uint256 i = 0; i < vaults.length; i++) {
            if (_needsSettlement(vaults[i])) {
                pending[count] = vaults[i];
                count++;
            }
        }

        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = pending[i];
        }
        return result;
    }
}