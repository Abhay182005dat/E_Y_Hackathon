// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AccessControl.sol";

/**
 * @title LoanCore
 * @dev Core loan application and tracking contract
 * @notice Stores loan hashes, uses IPFS for metadata
 */
contract LoanCore is AccessControl {

    struct Loan {
        bytes32 loanId;           // keccak256(applicationId)
        bytes32 userId;           // keccak256(phoneNumber)
        uint256 amount;           // Loan amount in wei (or smallest unit)
        uint16 interestBps;       // Interest rate in basis points (1175 = 11.75%)
        uint32 score;             // Approval score (0-1000)
        bytes32 metadataHash;     // IPFS hash of loan details (CIDv1)
        uint8 status;             // 0=pending,1=offered,2=negotiating,3=accepted,4=approved,5=rejected,6=disbursed
        uint256 timestamp;        // Block timestamp
    }

    struct ChatLog {
        bytes32 sessionId;        // keccak256(sessionId)
        bytes32 userId;           // keccak256(phoneNumber)
        bytes32 messageHash;      // keccak256(message content)
        uint8 state;              // 0=intro,1=offered,2=negotiating,3=accepted
        uint16 negotiationCount;  // Number of negotiations
        uint16 finalRateBps;      // Final negotiated rate (basis points)
        uint256 timestamp;
    }

    struct Document {
        bytes32 docId;            // keccak256(documentId)
        bytes32 userId;           // keccak256(phoneNumber)
        uint8 docType;            // 0=aadhaar,1=pan,2=bank,3=salary
        bool verified;            // Verification status
        bytes32 dataHash;         // Hash of extracted data
        bytes32 ipfsHash;         // IPFS CID
        uint256 timestamp;
    }

    // Storage mappings
    mapping(bytes32 => Loan[]) public userLoans;
    mapping(bytes32 => ChatLog[]) public userChatLogs;
    mapping(bytes32 => Document[]) public userDocuments;
    mapping(bytes32 => bytes32[]) public userMasterLedger; // All transaction IDs

    // Global counters
    uint256 public totalLoans;
    uint256 public totalChats;
    uint256 public totalDocuments;

    // Events
    event LoanCreated(bytes32 indexed userId, bytes32 indexed loanId, uint256 amount, uint256 timestamp);
    event LoanStatusUpdated(bytes32 indexed loanId, uint8 newStatus, uint256 timestamp);
    event ChatLogged(bytes32 indexed userId, bytes32 sessionId, uint8 state, uint256 timestamp);
    event DocumentVerified(bytes32 indexed userId, bytes32 docId, uint8 docType, bool verified, uint256 timestamp);

    /**
     * @dev Create a new loan application
     * @param loanId Hashed loan application ID
     * @param userId Hashed user phone number
     * @param amount Loan amount
     * @param interestBps Interest rate in basis points
     * @param score Approval score
     * @param metadataHash IPFS hash of full loan details
     * @param status Initial status
     */
    function createLoan(
        bytes32 loanId,
        bytes32 userId,
        uint256 amount,
        uint16 interestBps,
        uint32 score,
        bytes32 metadataHash,
        uint8 status
    ) external onlyAdmin {
        require(loanId != bytes32(0), "Invalid loanId");
        require(userId != bytes32(0), "Invalid userId");

        userLoans[userId].push(
            Loan({
                loanId: loanId,
                userId: userId,
                amount: amount,
                interestBps: interestBps,
                score: score,
                metadataHash: metadataHash,
                status: status,
                timestamp: block.timestamp
            })
        );

        userMasterLedger[userId].push(loanId);
        totalLoans++;

        emit LoanCreated(userId, loanId, amount, block.timestamp);
    }

    /**
     * @dev Update loan status
     * @param userId Hashed user phone number
     * @param loanIndex Index in user's loan array
     * @param newStatus New status code
     */
    function updateLoanStatus(
        bytes32 userId,
        uint256 loanIndex,
        uint8 newStatus
    ) external onlyAdmin {
        require(loanIndex < userLoans[userId].length, "Invalid index");
        
        userLoans[userId][loanIndex].status = newStatus;
        
        emit LoanStatusUpdated(userLoans[userId][loanIndex].loanId, newStatus, block.timestamp);
    }

    /**
     * @dev Log a chat interaction
     * @param sessionId Hashed session ID
     * @param userId Hashed user phone number
     * @param messageHash Hash of message content
     * @param state Current conversation state
     * @param negotiationCount Number of negotiations
     * @param finalRateBps Final negotiated rate
     */
    function logChat(
        bytes32 sessionId,
        bytes32 userId,
        bytes32 messageHash,
        uint8 state,
        uint16 negotiationCount,
        uint16 finalRateBps
    ) external onlyAdmin {
        require(sessionId != bytes32(0), "Invalid sessionId");
        require(userId != bytes32(0), "Invalid userId");

        userChatLogs[userId].push(
            ChatLog({
                sessionId: sessionId,
                userId: userId,
                messageHash: messageHash,
                state: state,
                negotiationCount: negotiationCount,
                finalRateBps: finalRateBps,
                timestamp: block.timestamp
            })
        );

        userMasterLedger[userId].push(sessionId);
        totalChats++;

        emit ChatLogged(userId, sessionId, state, block.timestamp);
    }

    /**
     * @dev Log document verification
     * @param docId Hashed document ID
     * @param userId Hashed user phone number
     * @param docType Document type code
     * @param verified Verification result
     * @param dataHash Hash of extracted data
     * @param ipfsHash IPFS CID of document
     */
    function logDocument(
        bytes32 docId,
        bytes32 userId,
        uint8 docType,
        bool verified,
        bytes32 dataHash,
        bytes32 ipfsHash
    ) external onlyAdmin {
        require(docId != bytes32(0), "Invalid docId");
        require(userId != bytes32(0), "Invalid userId");

        userDocuments[userId].push(
            Document({
                docId: docId,
                userId: userId,
                docType: docType,
                verified: verified,
                dataHash: dataHash,
                ipfsHash: ipfsHash,
                timestamp: block.timestamp
            })
        );

        userMasterLedger[userId].push(docId);
        totalDocuments++;

        emit DocumentVerified(userId, docId, docType, verified, block.timestamp);
    }

    /**
     * @dev Get all loans for a user
     * @param userId Hashed user phone number
     */
    function getLoans(bytes32 userId) external view returns (Loan[] memory) {
        return userLoans[userId];
    }

    /**
     * @dev Get specific loan by index
     * @param userId Hashed user phone number
     * @param index Loan index
     */
    function getLoan(bytes32 userId, uint256 index) external view returns (Loan memory) {
        require(index < userLoans[userId].length, "Invalid index");
        return userLoans[userId][index];
    }

    /**
     * @dev Get all chat logs for a user
     * @param userId Hashed user phone number
     */
    function getChatLogs(bytes32 userId) external view returns (ChatLog[] memory) {
        return userChatLogs[userId];
    }

    /**
     * @dev Get all documents for a user
     * @param userId Hashed user phone number
     */
    function getDocuments(bytes32 userId) external view returns (Document[] memory) {
        return userDocuments[userId];
    }

    /**
     * @dev Get master ledger (all transaction IDs) for a user
     * @param userId Hashed user phone number
     */
    function getMasterLedger(bytes32 userId) external view returns (bytes32[] memory) {
        return userMasterLedger[userId];
    }

    /**
     * @dev Get transaction counts for a user
     * @param userId Hashed user phone number
     */
    function getUserStats(bytes32 userId) external view returns (
        uint256 loans,
        uint256 chats,
        uint256 documents
    ) {
        return (
            userLoans[userId].length,
            userChatLogs[userId].length,
            userDocuments[userId].length
        );
    }

    /**
     * @dev Get global contract statistics
     */
    function getGlobalStats() external view returns (
        uint256 loans,
        uint256 chats,
        uint256 documents
    ) {
        return (totalLoans, totalChats, totalDocuments);
    }
}
