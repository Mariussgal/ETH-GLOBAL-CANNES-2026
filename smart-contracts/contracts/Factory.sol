// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Router.sol";
import "./Vault.sol";
import "./YSTToken.sol";

import "./interfaces/IENS.sol";

interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract Factory is IReceiver {

    using SafeERC20 for IERC20;

    struct PendingStream {
        address emitter;
        string  protocolSlug;
        uint256 streamBps;
        uint256 durationDays;
        uint256 capitalRaised;
        uint256 collateralAmount;
        bool    gateValidated;
        bool    discountReceived;
        uint256 discountBps;
        bool    executed;
    }

    struct StreamRecord {
        address splitter;
        address vault;
        address ystToken;
        address emitter;
        string  protocolSlug;
        uint256 createdAt;
        bool    active;
    }

    uint256 public constant BPS_DENOMINATOR  = 10_000;
    uint256 public constant COLLATERAL_BPS   = 1_000;
    uint256 public constant MIN_DISCOUNT_BPS = 1_000;
    uint256 public constant MAX_DISCOUNT_BPS = 5_000;

    IENSRegistry public constant ENS_REGISTRY =
        IENSRegistry(0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e);
    IENSReverseRegistrar public constant ENS_REVERSE =
        IENSReverseRegistrar(0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6);

    address public creForwarder = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    IERC20  public immutable usdc;
    address public immutable owner;

    mapping(bytes32 => bytes32) public workflowToStream;
    mapping(bytes32 => PendingStream) public pendingStreams;
    mapping(bytes32 => StreamRecord) public streams;

    bytes32[] public streamKeys;
    address[] public allVaults;

    event StreamRequested(bytes32 indexed streamKey, address indexed emitter, string protocolSlug);
    event GateValidated(bytes32 indexed streamKey, bool passed);
    event DiscountCalculated(bytes32 indexed streamKey, uint256 discountBps);
    event StreamCreated(
        bytes32 indexed streamKey,
        address splitter,
        address vault,
        address ystToken,
        uint256 capitalRaised,
        uint256 discountBps
    );
    event GateRejected(bytes32 indexed streamKey, string reason);

    error NotOwner();
    error NotCREForwarder();
    error StreamAlreadyExists();
    error InvalidBps();
    error ZeroAmount();
    error NoENSName();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyCREForwarder() {
        if (msg.sender != creForwarder) revert NotCREForwarder();
        _;
    }

    constructor(address _usdc) {
        usdc  = IERC20(_usdc);
        owner = msg.sender;
    }

    function setCREForwarder(address _forwarder) external onlyOwner {
        creForwarder = _forwarder;
    }

    function registerWorkflow(bytes32 workflowId, bytes32 streamKey) external onlyOwner {
        workflowToStream[workflowId] = streamKey;
    }

    function requestStream(
        string calldata protocolSlug,
        uint256 streamBps,
        uint256 durationDays,
        uint256 capitalRaised
    ) external returns (bytes32 streamKey) {
        
        bytes32 reverseNode  = ENS_REVERSE.node(msg.sender);
        address resolverAddr = ENS_REGISTRY.resolver(reverseNode);
        if (resolverAddr == address(0)) revert NoENSName();
        string memory ensName = IENSResolver(resolverAddr).name(reverseNode);
        if (bytes(ensName).length == 0) revert NoENSName();

        if (streamBps < 100 || streamBps > 5_000) revert InvalidBps();
        if (capitalRaised == 0) revert ZeroAmount();

        streamKey = keccak256(abi.encodePacked(protocolSlug, msg.sender));
        if (streams[streamKey].active) revert StreamAlreadyExists();

        pendingStreams[streamKey] = PendingStream({
            emitter:          msg.sender,
            protocolSlug:     protocolSlug,
            streamBps:        streamBps,
            durationDays:     durationDays,
            capitalRaised:    capitalRaised,
            collateralAmount: 0,
            gateValidated:    false,
            discountReceived: false,
            discountBps:      0,
            executed:         false
        });

        emit StreamRequested(streamKey, msg.sender, protocolSlug);
    }

 function onReport(
    bytes calldata metadata,
    bytes calldata report
) external onlyCREForwarder {
    bytes32 workflowId;
    assembly {
        workflowId := calldataload(metadata.offset)
    }

    bytes32 streamKey = workflowToStream[workflowId];
    PendingStream storage pending = pendingStreams[streamKey];
    if (pending.emitter == address(0)) return;

    uint256 value = abi.decode(report, (uint256));

    if (!pending.gateValidated) {
        if (value == 0) {
            emit GateRejected(streamKey, "Insufficient protocol revenue");
            emit GateValidated(streamKey, false);
            _refundCollateral(streamKey);
            return;
        }
        pending.gateValidated = true;
        emit GateValidated(streamKey, true);

    } else if (!pending.discountReceived) {
        uint256 discountBps = value;
        if (discountBps < MIN_DISCOUNT_BPS) discountBps = MIN_DISCOUNT_BPS;
        if (discountBps > MAX_DISCOUNT_BPS) discountBps = MAX_DISCOUNT_BPS;

        pending.discountBps      = discountBps;
        pending.discountReceived = true;

        emit DiscountCalculated(streamKey, discountBps);
        _deployStream(streamKey);
    }
}


    function createStreamDirect(
        string calldata protocolSlug,
        uint256 streamBps,
        uint256 durationDays,
        uint256 capitalRaised,
        uint256 discountBps
    ) external returns (bytes32 streamKey) {
        // Gate ENS
        bytes32 reverseNode  = ENS_REVERSE.node(msg.sender);
        address resolverAddr = ENS_REGISTRY.resolver(reverseNode);
        if (resolverAddr == address(0)) revert NoENSName();
        string memory ensName = IENSResolver(resolverAddr).name(reverseNode);
        if (bytes(ensName).length == 0) revert NoENSName();

        if (streamBps < 100 || streamBps > 5_000) revert InvalidBps();
        if (capitalRaised == 0) revert ZeroAmount();
        if (discountBps < MIN_DISCOUNT_BPS) discountBps = MIN_DISCOUNT_BPS;
        if (discountBps > MAX_DISCOUNT_BPS) discountBps = MAX_DISCOUNT_BPS;

        streamKey = keccak256(abi.encodePacked(protocolSlug, msg.sender));
        if (streams[streamKey].active) revert StreamAlreadyExists();

        pendingStreams[streamKey] = PendingStream({
            emitter:          msg.sender,
            protocolSlug:     protocolSlug,
            streamBps:        streamBps,
            durationDays:     durationDays,
            capitalRaised:    capitalRaised,
            collateralAmount: 0,
            gateValidated:    true,
            discountReceived: true,
            discountBps:      discountBps,
            executed:         false
        });

        _deployStream(streamKey);
        emit StreamRequested(streamKey, msg.sender, protocolSlug);
    }

    function _deployStream(bytes32 streamKey) internal {
        PendingStream storage pending = pendingStreams[streamKey];
        if (pending.executed) return;
        pending.executed = true;

        uint256 projectedRevenue = pending.capitalRaised * BPS_DENOMINATOR
            / (BPS_DENOMINATOR - pending.discountBps);
        uint256 totalYST = projectedRevenue;

        Vault vault = new Vault(address(usdc), address(this));

        string memory tokenName = string(abi.encodePacked("YST-", pending.protocolSlug));
        YSTToken token = new YSTToken(tokenName, "YST", address(vault), address(this));

        Router splitter = new Router(
            address(usdc),
            address(vault),
            pending.emitter,
            pending.streamBps
        );

        Vault.StreamParams memory params = Vault.StreamParams({
            totalYST:      totalYST,
            streamBps:     pending.streamBps,
            discountBps:   pending.discountBps,
            startTime:     block.timestamp,
            endTime:       block.timestamp + (pending.durationDays * 1 days),
            capitalRaised: pending.capitalRaised,
            active:        true
        });
        vault.initStream(address(token), params);

        token.mint(pending.emitter, totalYST);

        streams[streamKey] = StreamRecord({
            splitter:     address(splitter),
            vault:        address(vault),
            ystToken:     address(token),
            emitter:      pending.emitter,
            protocolSlug: pending.protocolSlug,
            createdAt:    block.timestamp,
            active:       true
        });

        streamKeys.push(streamKey);
        allVaults.push(address(vault));

        emit StreamCreated(
            streamKey,
            address(splitter),
            address(vault),
            address(token),
            pending.capitalRaised,
            pending.discountBps
        );
    }

    function _refundCollateral(bytes32 streamKey) internal {
        // collatéral désactivé pour le hackathon
    }

    function getStream(bytes32 streamKey) external view returns (StreamRecord memory) {
        return streams[streamKey];
    }

    function getAllStreamKeys() external view returns (bytes32[] memory) {
        return streamKeys;
    }

    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    function hasENSName(address addr) external view returns (bool) {
        bytes32 reverseNode  = ENS_REVERSE.node(addr);
        address resolverAddr = ENS_REGISTRY.resolver(reverseNode);
        if (resolverAddr == address(0)) return false;
        string memory ensName = IENSResolver(resolverAddr).name(reverseNode);
        return bytes(ensName).length > 0;
    }
}