// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AccessControl
 * @dev Base contract for role-based access control
 * @notice Deploy this contract FIRST before other contracts
 */
contract AccessControl {
    address public owner;
    mapping(address => bool) public admins;

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
        emit AdminAdded(msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAdmin() {
        require(admins[msg.sender], "Not admin");
        _;
    }

    /**
     * @dev Add a new admin (owner only)
     * @param a Address to grant admin rights
     */
    function addAdmin(address a) external onlyOwner {
        require(a != address(0), "Invalid address");
        require(!admins[a], "Already admin");
        admins[a] = true;
        emit AdminAdded(a);
    }

    /**
     * @dev Remove an admin (owner only)
     * @param a Address to revoke admin rights
     */
    function removeAdmin(address a) external onlyOwner {
        require(admins[a], "Not admin");
        require(a != owner, "Cannot remove owner");
        admins[a] = false;
        emit AdminRemoved(a);
    }

    /**
     * @dev Transfer ownership (owner only)
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        address oldOwner = owner;
        owner = newOwner;
        admins[newOwner] = true;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @dev Check if address is admin
     * @param a Address to check
     */
    function isAdmin(address a) external view returns (bool) {
        return admins[a];
    }
}
