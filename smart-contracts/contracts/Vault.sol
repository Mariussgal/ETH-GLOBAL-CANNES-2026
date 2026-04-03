
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./interfaces/IENS.sol";

contract Vault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct StreamParams {
        uint256 totalYST;          
        uint256 streamBps;         
        uint256 discountBps;       
        uint256 startTime;         
        uint256 endTime;           
        uint256 capitalRaised;     
        bool active;               
    }

    IERC20 public immutable usdc;
    address public immutable factory;

    StreamParams public stream;

    address public ystToken;

    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public userRewardPerTokenPaid;

    mapping(address => uint256) public rewards;

    uint256 public totalFeesReceived;

    uint256 public totalClaimed;

    uint256 public collateralBalance;

    uint256 public lastFeeTimestamp;

    uint256 public constant SLASH_DELAY = 30 days;

    bool public collateralSlashed;

    address public emitterAddress;

    IENSRegistry  public constant ENS_REGISTRY =
        IENSRegistry(0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e);
    IENSReverseRegistrar public constant ENS_REVERSE =
        IENSReverseRegistrar(0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6);

    event StreamInitialized(
        uint256 totalYST,
        uint256 capitalRaised,
        uint256 discountBps,
        uint256 endTime
    );
    event FeesDeposited(uint256 amount, uint256 newRewardPerToken, uint256 timestamp);
    event RewardsClaimed(address indexed user, uint256 amount);
    event CollateralDeposited(uint256 amount);
    event CollateralSlashed(uint256 amount, uint256 timestamp);
    event SettlementExecuted(uint256 timestamp);

    error NotFactory();
    error NotYSTToken();
    error AlreadyInitialized();
    error StreamNotActive();
    error StreamExpired();
    error NoRewardsToClaim();
    error CollateralAlreadySlashed();
    error SlashDelayNotReached();
    error ZeroAmount();

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier onlyYSTToken() {
        if (msg.sender != ystToken) revert NotYSTToken();
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(address _usdc, address _factory) {
        usdc = IERC20(_usdc);
        factory = _factory;
    }

    function initStream(
        address _ystToken,
        StreamParams calldata params
    ) external onlyFactory {
        if (stream.active) revert AlreadyInitialized();

        ystToken = _ystToken;
        stream = params;
        stream.active = true;
        emitterAddress = msg.sender;
        lastFeeTimestamp = block.timestamp;

        emit StreamInitialized(
            params.totalYST,
            params.capitalRaised,
            params.discountBps,
            params.endTime
        );
    }

    function depositFees(uint256 amount) external updateReward(address(0)) {
        if (!stream.active) revert StreamNotActive();
        if (amount == 0) revert ZeroAmount();

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        totalFeesReceived += amount;
        lastFeeTimestamp = block.timestamp;

        uint256 supply = stream.totalYST;
        if (supply > 0) {
            
            rewardPerTokenStored += (amount * 1e18) / supply;
        }

        emit FeesDeposited(amount, rewardPerTokenStored, block.timestamp);
    }

    function depositCollateral(uint256 amount) external onlyFactory {
        // désactivé pour le hackathon
    }

    function slashCollateral() external {
        // désactivé pour le hackathon
    }

    function _writeENSDefault(address emitter) external {
        require(msg.sender == address(this), "internal only");
        bytes32 reverseNode = ENS_REVERSE.node(emitter);
        address resolverAddr = ENS_REGISTRY.resolver(reverseNode);
        if (resolverAddr == address(0)) return;
        IENSResolver(resolverAddr).setText(reverseNode, "ysm.status", "DEFAULTED");
    }

    function claimRewards(
        address account,
        uint256 balance
    ) external nonReentrant onlyYSTToken updateReward(account) returns (uint256) {
        uint256 reward = rewards[account];
        if (reward == 0) revert NoRewardsToClaim();

        uint256 claimFee = (reward * 50) / 10_000; 
        uint256 netReward = reward - claimFee;

        rewards[account] = 0;
        totalClaimed += netReward;

        uint256 supply = stream.totalYST;
        if (supply > balance && claimFee > 0) {
            rewardPerTokenStored += (claimFee * 1e18) / supply;
        }

        usdc.safeTransfer(account, netReward);

        emit RewardsClaimed(account, netReward);
        return netReward;
    }

    function checkpoint(
        address from,
        address to,
        uint256 fromBalance,
        uint256 toBalance
    ) external onlyYSTToken {
        uint256 _rewardPerToken = rewardPerToken();
        rewardPerTokenStored = _rewardPerToken;

        if (from != address(0)) {
            rewards[from] = _earned(from, fromBalance, _rewardPerToken);
            userRewardPerTokenPaid[from] = _rewardPerToken;
        }
        if (to != address(0)) {
            rewards[to] = _earned(to, toBalance, _rewardPerToken);
            userRewardPerTokenPaid[to] = _rewardPerToken;
        }
    }

    function executeSettlement() external {
        emit SettlementExecuted(block.timestamp);
    }

    function rewardPerToken() public view returns (uint256) {
        return rewardPerTokenStored;
    }

    function earned(address account) public view returns (uint256) {
        return _earned(
            account,
            IERC20(ystToken).balanceOf(account),
            rewardPerToken()
        );
    }

    function _earned(
        address account,
        uint256 balance,
        uint256 _rewardPerToken
    ) internal view returns (uint256) {
        return rewards[account] + (
            balance * (_rewardPerToken - userRewardPerTokenPaid[account])
        ) / 1e18;
    }

    function priceFloor() external view returns (uint256) {
        uint256 supply = stream.totalYST;
        if (supply == 0) return 0;
        uint256 vaultUsdc = usdc.balanceOf(address(this)) - collateralBalance;
        return (vaultUsdc * 1e18) / supply;
    }

    function streamInfo() external view returns (
        StreamParams memory params,
        uint256 _totalFeesReceived,
        uint256 _totalClaimed,
        uint256 _collateralBalance,
        uint256 _lastFeeTimestamp,
        uint256 _priceFloor,
        bool _collateralSlashed
    ) {
        return (
            stream,
            totalFeesReceived,
            totalClaimed,
            collateralBalance,
            lastFeeTimestamp,
            this.priceFloor(),
            collateralSlashed
        );
    }
}