// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AccessControl.sol";

/**
 * @title CreditRegistry
 * @dev Credit score and history management
 * @notice Tracks credit scores over time
 */
contract CreditRegistry is AccessControl {

    struct Credit {
        bytes32 userId;           // keccak256(phoneNumber)
        uint16 score;             // Credit score (300-900)
        uint8 grade;              // 0=A+, 1=A, 2=B, 3=C, 4=D
        uint256 limit;            // Pre-approved limit
        bytes32 proofHash;        // Hash of credit report/calculation
        uint256 timestamp;
    }

    mapping(bytes32 => Credit[]) public creditHistory;
    uint256 public totalCreditChecks;

    event CreditAdded(bytes32 indexed userId, uint16 score, uint8 grade, uint256 limit, uint256 timestamp);
    event CreditUpdated(bytes32 indexed userId, uint16 oldScore, uint16 newScore, uint256 timestamp);

    /**
     * @dev Add a new credit score entry
     * @param userId Hashed user phone number
     * @param score Credit score (300-900)
     * @param grade Credit grade (0=A+, 1=A, 2=B, 3=C, 4=D)
     * @param limit Pre-approved loan limit
     * @param proofHash Hash of credit calculation proof
     */
    function addCredit(
        bytes32 userId,
        uint16 score,
        uint8 grade,
        uint256 limit,
        bytes32 proofHash
    ) external onlyAdmin {
        require(userId != bytes32(0), "Invalid userId");
        require(score >= 300 && score <= 900, "Invalid score range");
        require(grade <= 4, "Invalid grade");

        creditHistory[userId].push(
            Credit({
                userId: userId,
                score: score,
                grade: grade,
                limit: limit,
                proofHash: proofHash,
                timestamp: block.timestamp
            })
        );

        totalCreditChecks++;

        emit CreditAdded(userId, score, grade, limit, block.timestamp);
    }

    /**
     * @dev Update the latest credit score
     * @param userId Hashed user phone number
     * @param newScore New credit score
     * @param newGrade New grade
     * @param newLimit New pre-approved limit
     * @param proofHash Hash of updated calculation
     */
    function updateLatestCredit(
        bytes32 userId,
        uint16 newScore,
        uint8 newGrade,
        uint256 newLimit,
        bytes32 proofHash
    ) external onlyAdmin {
        require(creditHistory[userId].length > 0, "No credit history");
        require(newScore >= 300 && newScore <= 900, "Invalid score range");
        require(newGrade <= 4, "Invalid grade");

        uint256 lastIndex = creditHistory[userId].length - 1;
        uint16 oldScore = creditHistory[userId][lastIndex].score;

        creditHistory[userId][lastIndex].score = newScore;
        creditHistory[userId][lastIndex].grade = newGrade;
        creditHistory[userId][lastIndex].limit = newLimit;
        creditHistory[userId][lastIndex].proofHash = proofHash;

        emit CreditUpdated(userId, oldScore, newScore, block.timestamp);
    }

    /**
     * @dev Get latest credit score for a user
     * @param userId Hashed user phone number
     */
    function latestCredit(bytes32 userId) external view returns (Credit memory) {
        uint256 length = creditHistory[userId].length;
        require(length > 0, "No credit history");
        return creditHistory[userId][length - 1];
    }

    /**
     * @dev Get full credit history for a user
     * @param userId Hashed user phone number
     */
    function getCreditHistory(bytes32 userId) external view returns (Credit[] memory) {
        return creditHistory[userId];
    }

    /**
     * @dev Get credit score at specific index
     * @param userId Hashed user phone number
     * @param index History index
     */
    function getCreditAtIndex(bytes32 userId, uint256 index) external view returns (Credit memory) {
        require(index < creditHistory[userId].length, "Invalid index");
        return creditHistory[userId][index];
    }

    /**
     * @dev Get number of credit checks for a user
     * @param userId Hashed user phone number
     */
    function getCreditCount(bytes32 userId) external view returns (uint256) {
        return creditHistory[userId].length;
    }

    /**
     * @dev Check if user has credit history
     * @param userId Hashed user phone number
     */
    function hasCredit(bytes32 userId) external view returns (bool) {
        return creditHistory[userId].length > 0;
    }

    /**
     * @dev Get grade as string (for convenience)
     * @param gradeCode Grade code (0-4)
     */
    function getGradeString(uint8 gradeCode) external pure returns (string memory) {
        if (gradeCode == 0) return "A+";
        if (gradeCode == 1) return "A";
        if (gradeCode == 2) return "B";
        if (gradeCode == 3) return "C";
        if (gradeCode == 4) return "D";
        return "Unknown";
    }
}
