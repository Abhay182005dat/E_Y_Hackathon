// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title LoanLedger
 * @dev Immutable loan application ledger on Ethereum blockchain
 * Deploy this contract using Remix IDE and connect via MetaMask
 */
contract LoanLedger {
    
    // Struct definitions for different transaction types
    struct LoanApplication {
        string applicationId;
        string userId;
        string customerName;
        uint256 loanAmount;
        uint256 interestRate; // Basis points (e.g., 1175 = 11.75%)
        uint256 approvalScore;
        string status; // pending, offered, negotiating, accepted, approved, rejected, disbursed
        uint256 timestamp;
        string documentHash; // IPFS hash of supporting documents
    }
    
    struct ChatInteraction {
        string sessionId;
        string userId;
        string messageHash; // Hash of message content (for privacy)
        string state; // intro, offered, negotiating, accepted
        uint256 negotiationCount;
        uint256 finalRate;
        uint256 timestamp;
    }
    
    struct DocumentVerification {
        string documentId;
        string userId;
        string documentType; // aadhaar, pan, bankStatement, salarySlip
        bool verified;
        string dataHash; // Hash of extracted data
        uint256 timestamp;
    }
    
    struct CreditScore {
        string userId;
        uint256 score; // 300-900
        string grade; // A+, A, B, C, D
        uint256 preApprovedLimit;
        uint256 timestamp;
    }
    
    struct Disbursement {
        string loanId;
        string userId;
        uint256 amount;
        string recipientAccount;
        string transactionId;
        uint256 timestamp;
    }
    
    struct EMIPayment {
        string loanId;
        string userId;
        uint256 emiNumber;
        uint256 amount;
        uint256 principalPaid;
        uint256 interestPaid;
        string paymentStatus; // paid, pending, overdue
        uint256 timestamp;
    }
    
    // Storage mappings
    mapping(string => LoanApplication[]) public userApplications;
    mapping(string => ChatInteraction[]) public userChatHistory;
    mapping(string => DocumentVerification[]) public userDocuments;
    mapping(string => CreditScore[]) public userCreditHistory;
    mapping(string => Disbursement[]) public userDisbursements;
    mapping(string => EMIPayment[]) public userPayments;
    
    // Master ledger - combines all transaction hashes for a user
    mapping(string => string[]) public userMasterLedger;
    
    // Transaction counters
    uint256 public totalApplications;
    uint256 public totalChatInteractions;
    uint256 public totalDocuments;
    uint256 public totalCreditChecks;
    uint256 public totalDisbursements;
    uint256 public totalPayments;
    
    // Events for off-chain monitoring
    event ApplicationLogged(string indexed userId, string applicationId, uint256 timestamp);
    event ChatInteractionLogged(string indexed userId, string sessionId, uint256 timestamp);
    event DocumentVerified(string indexed userId, string documentType, uint256 timestamp);
    event CreditScoreCalculated(string indexed userId, uint256 score, uint256 timestamp);
    event LoanDisbursed(string indexed userId, string loanId, uint256 amount, uint256 timestamp);
    event EMIPaid(string indexed userId, string loanId, uint256 emiNumber, uint256 timestamp);
    
    // Admin addresses (for access control)
    mapping(address => bool) public admins;
    address public owner;
    
    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
    }
    
    modifier onlyAdmin() {
        require(admins[msg.sender], "Only admins can call this function");
        _;
    }
    
    function addAdmin(address _admin) external {
        require(msg.sender == owner, "Only owner can add admins");
        admins[_admin] = true;
    }
    
    // Log loan application
    function logApplication(
        string memory _applicationId,
        string memory _userId,
        string memory _customerName,
        uint256 _loanAmount,
        uint256 _interestRate,
        uint256 _approvalScore,
        string memory _status,
        string memory _documentHash
    ) external onlyAdmin {
        LoanApplication memory app = LoanApplication({
            applicationId: _applicationId,
            userId: _userId,
            customerName: _customerName,
            loanAmount: _loanAmount,
            interestRate: _interestRate,
            approvalScore: _approvalScore,
            status: _status,
            timestamp: block.timestamp,
            documentHash: _documentHash
        });
        
        userApplications[_userId].push(app);
        userMasterLedger[_userId].push(_applicationId);
        totalApplications++;
        
        emit ApplicationLogged(_userId, _applicationId, block.timestamp);
    }
    
    // Log chat interaction
    function logChatInteraction(
        string memory _sessionId,
        string memory _userId,
        string memory _messageHash,
        string memory _state,
        uint256 _negotiationCount,
        uint256 _finalRate
    ) external onlyAdmin {
        ChatInteraction memory chat = ChatInteraction({
            sessionId: _sessionId,
            userId: _userId,
            messageHash: _messageHash,
            state: _state,
            negotiationCount: _negotiationCount,
            finalRate: _finalRate,
            timestamp: block.timestamp
        });
        
        userChatHistory[_userId].push(chat);
        userMasterLedger[_userId].push(_sessionId);
        totalChatInteractions++;
        
        emit ChatInteractionLogged(_userId, _sessionId, block.timestamp);
    }
    
    // Log document verification
    function logDocumentVerification(
        string memory _documentId,
        string memory _userId,
        string memory _documentType,
        bool _verified,
        string memory _dataHash
    ) external onlyAdmin {
        DocumentVerification memory doc = DocumentVerification({
            documentId: _documentId,
            userId: _userId,
            documentType: _documentType,
            verified: _verified,
            dataHash: _dataHash,
            timestamp: block.timestamp
        });
        
        userDocuments[_userId].push(doc);
        userMasterLedger[_userId].push(_documentId);
        totalDocuments++;
        
        emit DocumentVerified(_userId, _documentType, block.timestamp);
    }
    
    // Log credit score
    function logCreditScore(
        string memory _userId,
        uint256 _score,
        string memory _grade,
        uint256 _preApprovedLimit
    ) external onlyAdmin {
        CreditScore memory credit = CreditScore({
            userId: _userId,
            score: _score,
            grade: _grade,
            preApprovedLimit: _preApprovedLimit,
            timestamp: block.timestamp
        });
        
        userCreditHistory[_userId].push(credit);
        totalCreditChecks++;
        
        emit CreditScoreCalculated(_userId, _score, block.timestamp);
    }
    
    // Log disbursement
    function logDisbursement(
        string memory _loanId,
        string memory _userId,
        uint256 _amount,
        string memory _recipientAccount,
        string memory _transactionId
    ) external onlyAdmin {
        Disbursement memory disb = Disbursement({
            loanId: _loanId,
            userId: _userId,
            amount: _amount,
            recipientAccount: _recipientAccount,
            transactionId: _transactionId,
            timestamp: block.timestamp
        });
        
        userDisbursements[_userId].push(disb);
        userMasterLedger[_userId].push(_loanId);
        totalDisbursements++;
        
        emit LoanDisbursed(_userId, _loanId, _amount, block.timestamp);
    }
    
    // Log EMI payment
    function logEMIPayment(
        string memory _loanId,
        string memory _userId,
        uint256 _emiNumber,
        uint256 _amount,
        uint256 _principalPaid,
        uint256 _interestPaid,
        string memory _paymentStatus
    ) external onlyAdmin {
        EMIPayment memory payment = EMIPayment({
            loanId: _loanId,
            userId: _userId,
            emiNumber: _emiNumber,
            amount: _amount,
            principalPaid: _principalPaid,
            interestPaid: _interestPaid,
            paymentStatus: _paymentStatus,
            timestamp: block.timestamp
        });
        
        userPayments[_userId].push(payment);
        totalPayments++;
        
        emit EMIPaid(_userId, _loanId, _emiNumber, block.timestamp);
    }
    
    // Get user's complete transaction history count
    function getUserTransactionCount(string memory _userId) external view returns (
        uint256 applications,
        uint256 chats,
        uint256 documents,
        uint256 creditChecks,
        uint256 disbursements,
        uint256 payments
    ) {
        return (
            userApplications[_userId].length,
            userChatHistory[_userId].length,
            userDocuments[_userId].length,
            userCreditHistory[_userId].length,
            userDisbursements[_userId].length,
            userPayments[_userId].length
        );
    }
    
    // Get master ledger entries for a user
    function getUserMasterLedger(string memory _userId) external view returns (string[] memory) {
        return userMasterLedger[_userId];
    }
    
    // Get specific application details
    function getUserApplication(string memory _userId, uint256 _index) external view returns (LoanApplication memory) {
        require(_index < userApplications[_userId].length, "Index out of bounds");
        return userApplications[_userId][_index];
    }
    
    // Get specific chat interaction
    function getUserChatInteraction(string memory _userId, uint256 _index) external view returns (ChatInteraction memory) {
        require(_index < userChatHistory[_userId].length, "Index out of bounds");
        return userChatHistory[_userId][_index];
    }
    
    // Get latest credit score
    function getLatestCreditScore(string memory _userId) external view returns (CreditScore memory) {
        require(userCreditHistory[_userId].length > 0, "No credit history found");
        return userCreditHistory[_userId][userCreditHistory[_userId].length - 1];
    }
    
    // Get all disbursements for a user
    function getUserDisbursements(string memory _userId) external view returns (Disbursement[] memory) {
        return userDisbursements[_userId];
    }
    
    // Get all payments for a user
    function getUserPayments(string memory _userId) external view returns (EMIPayment[] memory) {
        return userPayments[_userId];
    }
    
    // Get contract statistics
    function getContractStats() external view returns (
        uint256 apps,
        uint256 chats,
        uint256 docs,
        uint256 credits,
        uint256 disbs,
        uint256 pays
    ) {
        return (
            totalApplications,
            totalChatInteractions,
            totalDocuments,
            totalCreditChecks,
            totalDisbursements,
            totalPayments
        );
    }
}
