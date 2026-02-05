// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AccessControl.sol";

/**
 * @title PaymentLedger
 * @dev Track loan disbursements and EMI payments
 * @notice Immutable payment records
 */
contract PaymentLedger is AccessControl {

    struct Disbursement {
        bytes32 loanId;           // keccak256(loanId)
        bytes32 userId;           // keccak256(phoneNumber)
        uint256 amount;           // Disbursed amount
        bytes32 accountHash;      // Hash of recipient account
        bytes32 txHash;           // Transaction reference hash
        uint256 timestamp;
    }

    struct EMI {
        bytes32 loanId;           // keccak256(loanId)
        bytes32 userId;           // keccak256(phoneNumber)
        uint256 emiNo;            // EMI number (1, 2, 3...)
        uint256 amount;           // Total EMI amount
        uint256 principalPaid;    // Principal component
        uint256 interestPaid;     // Interest component
        uint8 status;             // 0=pending, 1=paid, 2=overdue, 3=failed
        bytes32 receiptHash;      // Payment receipt hash
        uint256 timestamp;
    }

    // Storage mappings
    mapping(bytes32 => Disbursement[]) public loanDisbursements;
    mapping(bytes32 => EMI[]) public loanEMIs;
    mapping(bytes32 => Disbursement[]) public userDisbursements;
    mapping(bytes32 => EMI[]) public userEMIs;

    // Global counters
    uint256 public totalDisbursements;
    uint256 public totalEMIs;
    uint256 public totalDisbursedAmount;
    uint256 public totalPaidAmount;

    // Events
    event Disbursed(bytes32 indexed loanId, bytes32 indexed userId, uint256 amount, uint256 timestamp);
    event EMIPaid(bytes32 indexed loanId, bytes32 indexed userId, uint256 emiNo, uint256 amount, uint256 timestamp);
    event EMIStatusUpdated(bytes32 indexed loanId, uint256 emiNo, uint8 oldStatus, uint8 newStatus, uint256 timestamp);

    /**
     * @dev Log a loan disbursement
     * @param loanId Hashed loan ID
     * @param userId Hashed user phone number
     * @param amount Disbursed amount
     * @param accountHash Hash of recipient bank account
     * @param txHash Transaction reference hash
     */
    function addDisbursement(
        bytes32 loanId,
        bytes32 userId,
        uint256 amount,
        bytes32 accountHash,
        bytes32 txHash
    ) external onlyAdmin {
        require(loanId != bytes32(0), "Invalid loanId");
        require(userId != bytes32(0), "Invalid userId");
        require(amount > 0, "Amount must be > 0");

        Disbursement memory disb = Disbursement({
            loanId: loanId,
            userId: userId,
            amount: amount,
            accountHash: accountHash,
            txHash: txHash,
            timestamp: block.timestamp
        });

        loanDisbursements[loanId].push(disb);
        userDisbursements[userId].push(disb);
        
        totalDisbursements++;
        totalDisbursedAmount += amount;

        emit Disbursed(loanId, userId, amount, block.timestamp);
    }

    /**
     * @dev Log an EMI payment
     * @param loanId Hashed loan ID
     * @param userId Hashed user phone number
     * @param emiNo EMI number
     * @param amount Total EMI amount
     * @param principalPaid Principal component
     * @param interestPaid Interest component
     * @param status Payment status
     * @param receiptHash Payment receipt hash
     */
    function payEMI(
        bytes32 loanId,
        bytes32 userId,
        uint256 emiNo,
        uint256 amount,
        uint256 principalPaid,
        uint256 interestPaid,
        uint8 status,
        bytes32 receiptHash
    ) external onlyAdmin {
        require(loanId != bytes32(0), "Invalid loanId");
        require(userId != bytes32(0), "Invalid userId");
        require(amount > 0, "Amount must be > 0");
        require(emiNo > 0, "EMI number must be > 0");
        require(status <= 3, "Invalid status");

        EMI memory emi = EMI({
            loanId: loanId,
            userId: userId,
            emiNo: emiNo,
            amount: amount,
            principalPaid: principalPaid,
            interestPaid: interestPaid,
            status: status,
            receiptHash: receiptHash,
            timestamp: block.timestamp
        });

        loanEMIs[loanId].push(emi);
        userEMIs[userId].push(emi);
        
        totalEMIs++;
        if (status == 1) { // Only count paid EMIs
            totalPaidAmount += amount;
        }

        emit EMIPaid(loanId, userId, emiNo, amount, block.timestamp);
    }

    /**
     * @dev Update EMI status (e.g., mark as overdue)
     * @param loanId Hashed loan ID
     * @param emiIndex Index in loan's EMI array
     * @param newStatus New status code
     */
    function updateEMIStatus(
        bytes32 loanId,
        uint256 emiIndex,
        uint8 newStatus
    ) external onlyAdmin {
        require(emiIndex < loanEMIs[loanId].length, "Invalid index");
        require(newStatus <= 3, "Invalid status");

        uint8 oldStatus = loanEMIs[loanId][emiIndex].status;
        loanEMIs[loanId][emiIndex].status = newStatus;

        emit EMIStatusUpdated(loanId, loanEMIs[loanId][emiIndex].emiNo, oldStatus, newStatus, block.timestamp);
    }

    /**
     * @dev Get all disbursements for a loan
     * @param loanId Hashed loan ID
     */
    function getLoanDisbursements(bytes32 loanId) external view returns (Disbursement[] memory) {
        return loanDisbursements[loanId];
    }

    /**
     * @dev Get all EMIs for a loan
     * @param loanId Hashed loan ID
     */
    function getLoanEMIs(bytes32 loanId) external view returns (EMI[] memory) {
        return loanEMIs[loanId];
    }

    /**
     * @dev Get all disbursements for a user
     * @param userId Hashed user phone number
     */
    function getUserDisbursements(bytes32 userId) external view returns (Disbursement[] memory) {
        return userDisbursements[userId];
    }

    /**
     * @dev Get all EMIs for a user
     * @param userId Hashed user phone number
     */
    function getUserEMIs(bytes32 userId) external view returns (EMI[] memory) {
        return userEMIs[userId];
    }

    /**
     * @dev Get specific disbursement
     * @param loanId Hashed loan ID
     * @param index Disbursement index
     */
    function getDisbursement(bytes32 loanId, uint256 index) external view returns (Disbursement memory) {
        require(index < loanDisbursements[loanId].length, "Invalid index");
        return loanDisbursements[loanId][index];
    }

    /**
     * @dev Get specific EMI
     * @param loanId Hashed loan ID
     * @param index EMI index
     */
    function getEMI(bytes32 loanId, uint256 index) external view returns (EMI memory) {
        require(index < loanEMIs[loanId].length, "Invalid index");
        return loanEMIs[loanId][index];
    }

    /**
     * @dev Get payment statistics for a loan
     * @param loanId Hashed loan ID
     */
    function getLoanPaymentStats(bytes32 loanId) external view returns (
        uint256 disbursementCount,
        uint256 emiCount,
        uint256 paidCount,
        uint256 overdueCount
    ) {
        disbursementCount = loanDisbursements[loanId].length;
        emiCount = loanEMIs[loanId].length;
        
        for (uint256 i = 0; i < loanEMIs[loanId].length; i++) {
            if (loanEMIs[loanId][i].status == 1) paidCount++;
            if (loanEMIs[loanId][i].status == 2) overdueCount++;
        }
    }

    /**
     * @dev Get global contract statistics
     */
    function getGlobalStats() external view returns (
        uint256 disbursements,
        uint256 emis,
        uint256 disbursedAmount,
        uint256 paidAmount
    ) {
        return (
            totalDisbursements,
            totalEMIs,
            totalDisbursedAmount,
            totalPaidAmount
        );
    }
}
