// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IENSReverseRegistrar {
    function node(address addr) external pure returns (bytes32);
}

interface IENSResolver {
    function name(bytes32 node) external view returns (string memory);
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

interface IENSRegistry {
    function resolver(bytes32 node) external view returns (address);
}
