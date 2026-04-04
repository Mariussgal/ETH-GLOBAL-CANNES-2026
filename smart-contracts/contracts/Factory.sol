// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Router.sol";
import "./Vault.sol";
import "./YSTToken.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";


import "./interfaces/IENS.sol";

interface INameWrapper {
    function setSubnodeRecord(
        bytes32 parentNode,
        string calldata label,
        address owner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32);
}

interface IPublicResolver {
    function setAddr(bytes32 node, address addr) external;
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract Factory is IReceiver, ERC1155Holder {

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

    /// @notice `capitalRaised` / `projectedRevenue` sont en plus petites unités USDC (6 dec).
    ///         Le YST (`ERC20` OZ) utilise 18 dec : on scale pour que la supply « humaine »
    ///         suive la valeur faciale (ex. ~33M USDC faciaux → ~33M YST affichés).
    uint256 public constant YST_USDC_TO_WEI = 1e12;

    IENSRegistry public constant ENS_REGISTRY =
        IENSRegistry(0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e);
    IENSReverseRegistrar public constant ENS_REVERSE =
        IENSReverseRegistrar(0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6);

    // ─── ENS NameWrapper + Resolver Sepolia ──────────────────────────────────────
    INameWrapper public constant NAME_WRAPPER =
        INameWrapper(0x0635513f179D50A207757E05759CbD106d7dFcE8);
IPublicResolver public constant PUBLIC_RESOLVER =
    IPublicResolver(0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5);

    /// @notice namehash de "ysm.eth" — parent node pour les subdomains YSM
    bytes32 public constant YSM_NODE =
    0x345c84a6a96a31462a60497a193e69782f691558ad44b05f42eb18b3973f82b9;

    address public creForwarder = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    address public primarySale;

    IERC20  public immutable usdc;
    address public immutable owner;

    mapping(bytes32 => bytes32) public workflowToStream;
    mapping(bytes32 => PendingStream) public pendingStreams;
    mapping(bytes32 => StreamRecord) public streams;

    bytes32[] public streamKeys;
    address[] public allVaults;
    mapping(bytes32 => bytes32) public streamKeyToSubnode;

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
    event ENSSubdomainCreated(string label, bytes32 indexed node, address vault);

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

    function setPrimarySale(address _primarySale) external onlyOwner {
        primarySale = _primarySale;
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
    bytes calldata /* metadata */,
    bytes calldata report
) external onlyCREForwarder {
    (uint8 workflowType, bytes32 streamKey, bytes memory payload) = abi.decode(
        report, (uint8, bytes32, bytes)
    );

    PendingStream storage pending = pendingStreams[streamKey];
    if (pending.emitter == address(0)) return;

    if (workflowType == 2) {
        uint256 gateResult = abi.decode(payload, (uint256));
        if (gateResult == 0) {
            emit GateRejected(streamKey, "Insufficient protocol revenue");
            emit GateValidated(streamKey, false);
            return;
        }
        pending.gateValidated = true;
        emit GateValidated(streamKey, true);

    } else if (workflowType == 1) {
        uint256 discountBps = abi.decode(payload, (uint256));
        if (discountBps < MIN_DISCOUNT_BPS) discountBps = MIN_DISCOUNT_BPS;
        if (discountBps > MAX_DISCOUNT_BPS) discountBps = MAX_DISCOUNT_BPS;
        pending.discountBps      = discountBps;
        pending.discountReceived = true;
        emit DiscountCalculated(streamKey, discountBps);
        _deployStream(streamKey);
    }
}


function submitWorkflowResult(
    bytes32 streamKey,
    uint8 workflowType,
    uint256 value
) external onlyOwner {
    PendingStream storage pending = pendingStreams[streamKey];
    if (pending.emitter == address(0)) return;

    if (workflowType == 2) {
        if (value == 0) {
            emit GateRejected(streamKey, "Insufficient protocol revenue");
            emit GateValidated(streamKey, false);
            return;
        }
        pending.gateValidated = true;
        emit GateValidated(streamKey, true);

    } else if (workflowType == 1) {
        if (value < MIN_DISCOUNT_BPS) value = MIN_DISCOUNT_BPS;
        if (value > MAX_DISCOUNT_BPS) value = MAX_DISCOUNT_BPS;
        pending.discountBps      = value;
        pending.discountReceived = true;
        emit DiscountCalculated(streamKey, value);
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

        // Strict 1:1 Parity: totalYST is exactly the capital raised.
        // The discountBps is kept as a risk/yield parameter for the metadata, not a supply multiplier.
        uint256 totalYST = pending.capitalRaised * 1e12; // scale USDC 6 dec → YST 18 dec

        Vault vault = new Vault(address(usdc), address(this));

        // Nom du token = slug de déploiement (identique à `protocolSlug` passé à createStreamDirect)
        YSTToken token = new YSTToken(pending.protocolSlug, "YST", address(vault), address(this));

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
        vault.initStream(address(token), pending.emitter, params);

        token.mint(pending.emitter, totalYST);

        // Approve PrimarySale automatiquement si enregistré
        if (primarySale != address(0)) {
            token.approveForPrimarySale(pending.emitter, primarySale, totalYST);
        }

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

        // ── ENS Subdomain creation ────────────────────────────────────────────────
        // Crée protocolSlug.ysm.eth pointant vers le vault
        try NAME_WRAPPER.setSubnodeRecord(
            YSM_NODE,
            pending.protocolSlug,
            address(this),           // Factory = owner du subdomain
            address(PUBLIC_RESOLVER),
            0,                       // TTL
            0,                       // pas de fuses
            uint64(block.timestamp + 365 days * 10)  // expiry 10 ans
        ) returns (bytes32 subnode) {
            // Pointe le subdomain vers le vault
            try PUBLIC_RESOLVER.setAddr(subnode, address(vault)) {} catch {}
            emit ENSSubdomainCreated(pending.protocolSlug, subnode, address(vault));
            streamKeyToSubnode[streamKey] = subnode;
            
            // Stocke le subnode dans le vault pour le DEFAULTED write
            if (subnode != bytes32(0)) {
                try vault.setENSSubnode(subnode) {} catch {}
            }
        } catch {}
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

    function markDefaulted(bytes32 streamKey) external onlyOwner {
        bytes32 subnode = streamKeyToSubnode[streamKey];
        require(subnode != bytes32(0), "no subnode");
        PUBLIC_RESOLVER.setText(subnode, "ysm.status", "DEFAULTED");
    }

    function clearDefaulted(bytes32 streamKey) external onlyOwner {
        bytes32 subnode = streamKeyToSubnode[streamKey];
        require(subnode != bytes32(0), "no subnode");
        PUBLIC_RESOLVER.setText(subnode, "ysm.status", "");
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