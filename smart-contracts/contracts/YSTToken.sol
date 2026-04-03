
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./Vault.sol";

contract YSTToken is ERC20 {

    Vault public immutable vault;

    address public immutable factory;

    error NotFactory();
    error NotVault();

    constructor(
        string memory name,
        string memory symbol,
        address _vault,
        address _factory
    ) ERC20(name, symbol) {
        vault = Vault(_vault);
        factory = _factory;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != factory) revert NotFactory();
        _mint(to, amount);
    }

    function claimRewards() external returns (uint256) {
        return vault.claimRewards(msg.sender, balanceOf(msg.sender));
    }

    function earned(address account) external view returns (uint256) {
        return vault.earned(account);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        
        vault.checkpoint(
            from,
            to,
            from != address(0) ? balanceOf(from) : 0,
            to   != address(0) ? balanceOf(to)   : 0
        );

        super._update(from, to, value);
    }
}