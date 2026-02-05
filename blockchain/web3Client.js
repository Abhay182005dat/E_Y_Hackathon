const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { uploadJSONToIPFS } = require('../utils/pinataClient');

// Web3 Configuration
const BLOCKCHAIN_CONFIG = {
    LOCAL: {
        rpcUrl: 'http://127.0.0.1:7545',
        chainId: 1337
    },
    SEPOLIA: {
        rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
        chainId: 11155111
    },
    MUMBAI: {
        rpcUrl: process.env.MUMBAI_RPC_URL || 'https://rpc-mumbai.maticvigil.com',
        chainId: 80001
    }
};

const NETWORK = process.env.BLOCKCHAIN_NETWORK || 'SEPOLIA';
const config = BLOCKCHAIN_CONFIG[NETWORK];

// Web3 and contract instances
let web3;
let loanCoreContract;
let creditRegistryContract;
let paymentLedgerContract;
let accessControlContract;
let account;

// Contract addresses from .env
const LOAN_CORE_ADDRESS = process.env.LOAN_CORE_CONTRACT_ADDRESS;
const CREDIT_REGISTRY_ADDRESS = process.env.CREDIT_REGISTRY_CONTRACT_ADDRESS;
const PAYMENT_LEDGER_ADDRESS = process.env.PAYMENT_LEDGER_CONTRACT_ADDRESS;
const ACCESS_CONTROL_ADDRESS = process.env.ACCESS_CONTROL_CONTRACT_ADDRESS;

/**
 * Hash string to bytes32 for blockchain storage
 */
function hashToBytes32(input) {
    if (!input) return '0x' + '0'.repeat(64);
    return '0x' + crypto.createHash('sha256').update(input.toString()).digest('hex');
}

/**
 * Initialize Web3 connection and all contracts
 */
async function initWeb3() {
    try {
        web3 = new Web3(config.rpcUrl);
        
        const blockNumber = await web3.eth.getBlockNumber();
        console.log(`✅ [Blockchain] Connected to ${NETWORK} (Block: ${blockNumber})`);
        
        // Set up account from private key
        if (process.env.BLOCKCHAIN_PRIVATE_KEY) {
            const acc = web3.eth.accounts.privateKeyToAccount(process.env.BLOCKCHAIN_PRIVATE_KEY);
            web3.eth.accounts.wallet.add(acc);
            account = acc.address;
            console.log(`✅ [Blockchain] Account loaded: ${account}`);
        } else {
            console.warn('⚠️  [Blockchain] No BLOCKCHAIN_PRIVATE_KEY found');
        }
        
        // Load all contract instances
        loadContracts();

        // Verify backend account is an admin (writes will revert if not)
        if (accessControlContract && account) {
            try {
                const isAdmin = await accessControlContract.methods.isAdmin(account).call();
                if (!isAdmin) {
                    console.warn(`⚠️  [Blockchain] Account ${account} is not admin. Writes will revert. Add via AccessControl.addAdmin(${account})`);
                } else {
                    console.log(`✅ [Blockchain] Account ${account} is admin.`);
                }
            } catch (e) {
                console.warn('⚠️  [Blockchain] Failed to verify admin status:', e.message);
            }
        }
        
        return true;
    } catch (error) {
        console.error('❌ [Blockchain] Failed to initialize Web3:', error.message);
        return false;
    }
}

/**
 * Load all contract ABIs and create instances
 */
function loadContracts() {
    try {
        // Load ABIs
        const loanCoreABI = loadABI('LoanCore.abi.json');
        const creditRegistryABI = loadABI('CreditRegistry.abi.json');
        const paymentLedgerABI = loadABI('PaymentLedger.abi.json');
        const accessControlABI = loadABI('AccessControl.abi.json');
        
        // Create contract instances
        if (loanCoreABI && LOAN_CORE_ADDRESS) {
            loanCoreContract = new web3.eth.Contract(loanCoreABI, LOAN_CORE_ADDRESS);
            console.log(`✅ [LoanCore] Contract loaded at ${LOAN_CORE_ADDRESS}`);
        }
        
        if (creditRegistryABI && CREDIT_REGISTRY_ADDRESS) {
            creditRegistryContract = new web3.eth.Contract(creditRegistryABI, CREDIT_REGISTRY_ADDRESS);
            console.log(`✅ [CreditRegistry] Contract loaded at ${CREDIT_REGISTRY_ADDRESS}`);
        }
        
        if (paymentLedgerABI && PAYMENT_LEDGER_ADDRESS) {
            paymentLedgerContract = new web3.eth.Contract(paymentLedgerABI, PAYMENT_LEDGER_ADDRESS);
            console.log(`✅ [PaymentLedger] Contract loaded at ${PAYMENT_LEDGER_ADDRESS}`);
        }
        
        if (accessControlABI && ACCESS_CONTROL_ADDRESS) {
            accessControlContract = new web3.eth.Contract(accessControlABI, ACCESS_CONTROL_ADDRESS);
            console.log(`✅ [AccessControl] Contract loaded at ${ACCESS_CONTROL_ADDRESS}`);
        }
    } catch (error) {
        console.error('❌ [Blockchain] Failed to load contracts:', error.message);
    }
}

/**
 * Load contract ABI from file
 */
function loadABI(filename) {
    try {
        const abiPath = path.join(__dirname, 'contracts', filename);
        if (fs.existsSync(abiPath)) {
            return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        } else {
            console.warn(`⚠️  [Blockchain] ABI not found: ${filename}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ [Blockchain] Failed to load ABI ${filename}:`, error.message);
        return null;
    }
}

/**
 * Build transaction options with gasPrice and pending nonce to avoid replacement issues
 */
async function getTxOptions(gasLimit) {
    const gasPrice = await web3.eth.getGasPrice();
    const nonce = await web3.eth.getTransactionCount(account, 'pending');
    // Convert BigInt to Number to avoid mixing BigInt with regular numbers
    return { 
        from: account, 
        gas: Number(gasLimit), 
        gasPrice: gasPrice.toString(), 
        nonce: Number(nonce) 
    };
}

/**
 * Log loan application to LoanCore contract
 */
async function logApplicationToBlockchain(applicationData) {
    if (!loanCoreContract || !account) {
        console.warn('⚠️  [LoanCore] Contract not available. Skipping.');
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const {
            applicationId,
            userId,
            customerName,
            loanAmount,
            interestRate,
            approvalScore,
            status,
            documentHash
        } = applicationData;
        
        // Hash sensitive data
        const loanIdHash = hashToBytes32(applicationId);
        const userIdHash = hashToBytes32(userId);
        const metadataHash = hashToBytes32(JSON.stringify({
            customerName,
            documentHash,
            timestamp: Date.now()
        }));
        
        // Convert status to numeric code
        const statusCode = getStatusCode(status);
        
        // Convert interest rate to basis points (11.75% = 1175)
        const interestBps = Math.round(parseFloat(interestRate) * 100);
        
        // Send transaction
        const tx = await loanCoreContract.methods.createLoan(
            loanIdHash,
            userIdHash,
            web3.utils.toWei(loanAmount.toString(), 'ether'), // Convert to wei
            interestBps,
            approvalScore || 0,
            metadataHash,
            statusCode
        ).send(await getTxOptions(500000));
        
        console.log(`✅ [LoanCore] Application logged: ${applicationId}`);
        console.log(`   Tx: ${tx.transactionHash}`);
        
        return {
            success: true,
            transactionHash: tx.transactionHash,
            blockNumber: tx.blockNumber,
            loanIdHash,
            userIdHash
        };
    } catch (error) {
        console.error('❌ [LoanCore] Failed to log application:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Log chat interaction to LoanCore contract
 */
async function logChatToBlockchain(chatData) {
    if (!loanCoreContract || !account) {
        console.warn('⚠️  [LoanCore] Contract not available. Skipping.');
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const {
            sessionId,
            userId,
            message,
            state,
            negotiationCount = 0,
            finalRate = 0
        } = chatData;
        
        // Hash data
        const sessionIdHash = hashToBytes32(sessionId);
        const userIdHash = hashToBytes32(userId);
        const messageHash = hashToBytes32(message);
        
        // Convert state to numeric code
        const stateCode = getStateCode(state);
        
        // Convert rate to basis points
        const finalRateBps = Math.round(parseFloat(finalRate) * 100);
        
        // Send transaction
        const tx = await loanCoreContract.methods.logChat(
            sessionIdHash,
            userIdHash,
            messageHash,
            stateCode,
            negotiationCount,
            finalRateBps
        ).send(await getTxOptions(300000));
        
        console.log(`✅ [LoanCore] Chat logged: ${sessionId} (State: ${state})`);
        
        return {
            success: true,
            transactionHash: tx.transactionHash,
            blockNumber: tx.blockNumber
        };
    } catch (error) {
        console.error('❌ [LoanCore] Failed to log chat:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Log document verification to LoanCore contract
 */
async function logDocumentToBlockchain(documentData) {
    if (!loanCoreContract || !account) {
        console.warn('⚠️  [LoanCore] Contract not available. Skipping.');
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const {
            documentId,
            userId,
            documentType,
            verified,
            extractedData,
            ipfsHash
        } = documentData;
        
        // Hash data
        const docIdHash = hashToBytes32(documentId);
        const userIdHash = hashToBytes32(userId);
        const dataHash = hashToBytes32(JSON.stringify(extractedData));
        const ipfsHashBytes = hashToBytes32(ipfsHash);
        
        // Convert document type to code
        const docTypeCode = getDocumentTypeCode(documentType);
        
        // Send transaction
        const tx = await loanCoreContract.methods.logDocument(
            docIdHash,
            userIdHash,
            docTypeCode,
            verified,
            dataHash,
            ipfsHashBytes
        ).send(await getTxOptions(350000));
        
        console.log(`✅ [LoanCore] Document logged: ${documentType} (${verified ? 'Verified' : 'Failed'})`);
        
        return {
            success: true,
            transactionHash: tx.transactionHash,
            blockNumber: tx.blockNumber
        };
    } catch (error) {
        console.error('❌ [LoanCore] Failed to log document:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Log credit score to CreditRegistry contract
 */
async function logCreditScoreToBlockchain(creditData) {
    if (!creditRegistryContract || !account) {
        console.warn('⚠️  [CreditRegistry] Contract not available. Skipping.');
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const {
            userId,
            score,
            grade,
            preApprovedLimit
        } = creditData;
        
        // Hash user ID
        const userIdHash = hashToBytes32(userId);
        
        // Create proof hash
        const proofHash = hashToBytes32(JSON.stringify({
            score,
            grade,
            timestamp: Date.now()
        }));
        
        // Convert grade to code
        const gradeCode = getGradeCode(grade);
        
        // Send transaction
        const tx = await creditRegistryContract.methods.addCredit(
            userIdHash,
            score,
            gradeCode,
            web3.utils.toWei(preApprovedLimit.toString(), 'ether'),
            proofHash
        ).send(await getTxOptions(300000));
        
        console.log(`✅ [CreditRegistry] Credit logged: ${score} (Grade: ${grade})`);
        
        return {
            success: true,
            transactionHash: tx.transactionHash,
            blockNumber: tx.blockNumber
        };
    } catch (error) {
        console.error('❌ [CreditRegistry] Failed to log credit:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Log loan disbursement to PaymentLedger contract
 */
async function logDisbursementToBlockchain(disbursementData) {
    if (!paymentLedgerContract || !account) {
        console.warn('⚠️  [PaymentLedger] Contract not available. Skipping.');
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const {
            loanId,
            userId,
            amount,
            recipientAccount,
            transactionId
        } = disbursementData;
        
        // Hash data
        const loanIdHash = hashToBytes32(loanId);
        const userIdHash = hashToBytes32(userId);
        const accountHash = hashToBytes32(recipientAccount);
        const txHash = hashToBytes32(transactionId);
        
        // Send transaction
        const tx = await paymentLedgerContract.methods.addDisbursement(
            loanIdHash,
            userIdHash,
            web3.utils.toWei(amount.toString(), 'ether'),
            accountHash,
            txHash
        ).send(await getTxOptions(350000));
        
        console.log(`✅ [PaymentLedger] Disbursement logged: ${loanId} (₹${amount})`);
        
        return {
            success: true,
            transactionHash: tx.transactionHash,
            blockNumber: tx.blockNumber
        };
    } catch (error) {
        console.error('❌ [PaymentLedger] Failed to log disbursement:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Log EMI payment to PaymentLedger contract
 */
async function logPaymentToBlockchain(paymentData) {
    if (!paymentLedgerContract || !account) {
        console.warn('⚠️  [PaymentLedger] Contract not available. Skipping.');
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const {
            loanId,
            userId,
            emiNumber,
            amount,
            principalPaid,
            interestPaid,
            status,
            receiptHash
        } = paymentData;
        
        // Hash data
        const loanIdHash = hashToBytes32(loanId);
        const userIdHash = hashToBytes32(userId);
        const receiptHashBytes = hashToBytes32(receiptHash);
        
        // Convert status
        const statusCode = getPaymentStatusCode(status);
        
        // Send transaction
        const tx = await paymentLedgerContract.methods.payEMI(
            loanIdHash,
            userIdHash,
            emiNumber,
            web3.utils.toWei(amount.toString(), 'ether'),
            web3.utils.toWei(principalPaid.toString(), 'ether'),
            web3.utils.toWei(interestPaid.toString(), 'ether'),
            statusCode,
            receiptHashBytes
        ).send(await getTxOptions(350000));
        
        console.log(`✅ [PaymentLedger] EMI logged: Loan ${loanId}, EMI #${emiNumber}`);
        
        return {
            success: true,
            transactionHash: tx.transactionHash,
            blockNumber: tx.blockNumber
        };
    } catch (error) {
        console.error('❌ [PaymentLedger] Failed to log payment:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get all loans for a user from blockchain
 */
async function getUserLoans(userId) {
    if (!loanCoreContract) {
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const userIdHash = hashToBytes32(userId);
        const loans = await loanCoreContract.methods.getLoans(userIdHash).call();
        
        return {
            success: true,
            loans: loans.map(loan => ({
                loanId: loan.loanId,
                amount: web3.utils.fromWei(loan.amount, 'ether'),
                interestRate: (loan.interestBps / 100).toFixed(2),
                score: loan.score,
                status: getStatusString(loan.status),
                timestamp: new Date(Number(loan.timestamp) * 1000).toISOString()
            }))
        };
    } catch (error) {
        console.error('❌ [LoanCore] Failed to get user loans:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get latest credit score for a user
 */
async function getLatestCreditScore(userId) {
    if (!creditRegistryContract) {
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const userIdHash = hashToBytes32(userId);
        const credit = await creditRegistryContract.methods.latestCredit(userIdHash).call();
        
        return {
            success: true,
            credit: {
                score: Number(credit.score),
                grade: getGradeString(credit.grade),
                limit: web3.utils.fromWei(credit.limit, 'ether'),
                timestamp: new Date(Number(credit.timestamp) * 1000).toISOString()
            }
        };
    } catch (error) {
        console.error('❌ [CreditRegistry] Failed to get credit:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get master ledger for a user (all transaction IDs)
 */
async function getMasterLedger(userId) {
    if (!loanCoreContract) {
        return { success: false, reason: 'Contract not initialized' };
    }
    
    try {
        const userIdHash = hashToBytes32(userId);
        const ledger = await loanCoreContract.methods.getMasterLedger(userIdHash).call();
        
        return {
            success: true,
            ledger: ledger
        };
    } catch (error) {
        console.error('❌ [LoanCore] Failed to get master ledger:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Generate and upload master contract JSON to IPFS
 */
async function generateAndUploadMasterContract(userId) {
    try {
        const userIdHash = hashToBytes32(userId);
        
        // Fetch all blockchain data
        const loans = await loanCoreContract.methods.getLoans(userIdHash).call();
        const chats = await loanCoreContract.methods.getChatLogs(userIdHash).call();
        const documents = await loanCoreContract.methods.getDocuments(userIdHash).call();
        const disbursements = await paymentLedgerContract.methods.getUserDisbursements(userIdHash).call();
        const emis = await paymentLedgerContract.methods.getUserEMIs(userIdHash).call();
        
        let creditHistory = [];
        try {
            creditHistory = await creditRegistryContract.methods.getCreditHistory(userIdHash).call();
        } catch (e) {
            // User may not have credit history yet
        }
        
        // Build master contract JSON
        const masterContract = {
            version: '2.0',
            architecture: 'Modular Blockchain',
            userId: userId,
            userIdHash: userIdHash,
            generated: new Date().toISOString(),
            
            blockchain: {
                network: NETWORK,
                loanCoreAddress: LOAN_CORE_ADDRESS,
                creditRegistryAddress: CREDIT_REGISTRY_ADDRESS,
                paymentLedgerAddress: PAYMENT_LEDGER_ADDRESS,
                explorerUrl: getExplorerUrl()
            },
            
            summary: {
                totalLoans: loans.length,
                totalChats: chats.length,
                totalDocuments: documents.length,
                totalCredits: creditHistory.length,
                totalDisbursements: disbursements.length,
                totalEMIs: emis.length
            },
            
            transactions: {
                loans: loans.map(loan => ({
                    loanIdHash: loan.loanId,
                    amount: web3.utils.fromWei(loan.amount, 'ether'),
                    interestRate: (loan.interestBps / 100).toFixed(2) + '%',
                    score: Number(loan.score),
                    status: getStatusString(loan.status),
                    timestamp: new Date(Number(loan.timestamp) * 1000).toISOString()
                })),
                
                chatLogs: chats.map(chat => ({
                    sessionIdHash: chat.sessionId,
                    messageHash: chat.messageHash,
                    state: getStateString(chat.state),
                    negotiationCount: Number(chat.negotiationCount),
                    finalRate: (chat.finalRateBps / 100).toFixed(2) + '%',
                    timestamp: new Date(Number(chat.timestamp) * 1000).toISOString()
                })),
                
                documents: documents.map(doc => ({
                    docIdHash: doc.docId,
                    documentType: getDocumentTypeString(doc.docType),
                    verified: doc.verified,
                    dataHash: doc.dataHash,
                    ipfsHash: doc.ipfsHash,
                    timestamp: new Date(Number(doc.timestamp) * 1000).toISOString()
                })),
                
                creditHistory: creditHistory.map(credit => ({
                    score: Number(credit.score),
                    grade: getGradeString(credit.grade),
                    limit: web3.utils.fromWei(credit.limit, 'ether'),
                    timestamp: new Date(Number(credit.timestamp) * 1000).toISOString()
                })),
                
                disbursements: disbursements.map(disb => ({
                    loanIdHash: disb.loanId,
                    amount: web3.utils.fromWei(disb.amount, 'ether'),
                    accountHash: disb.accountHash,
                    txHash: disb.txHash,
                    timestamp: new Date(Number(disb.timestamp) * 1000).toISOString()
                })),
                
                emis: emis.map(emi => ({
                    loanIdHash: emi.loanId,
                    emiNumber: Number(emi.emiNo),
                    amount: web3.utils.fromWei(emi.amount, 'ether'),
                    principalPaid: web3.utils.fromWei(emi.principalPaid, 'ether'),
                    interestPaid: web3.utils.fromWei(emi.interestPaid, 'ether'),
                    status: getPaymentStatusString(emi.status),
                    timestamp: new Date(Number(emi.timestamp) * 1000).toISOString()
                }))
            },
            
            verification: {
                note: 'All hashes use keccak256. Full data stored off-chain (MongoDB + IPFS)',
                blockchainProof: 'Verify on-chain at explorer URLs above',
                architecture: 'Production-grade modular contracts with hash-based storage'
            }
        };
        
        // Upload to IPFS
        const ipfsResult = await uploadJSONToIPFS(
            masterContract,
            `mastercontract_${userId}.json`
        );
        
        // Save local backup
        const backupDir = path.join(__dirname, 'master_contracts');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const localPath = path.join(backupDir, `${userId.replace(/\+/g, '')}_master.json`);
        fs.writeFileSync(localPath, JSON.stringify(masterContract, null, 2));
        
        console.log(`✅ [Master Contract] Generated for ${userId}`);
        console.log(`   IPFS: ${ipfsResult.IpfsHash}`);
        console.log(`   URL: https://gateway.pinata.cloud/ipfs/${ipfsResult.IpfsHash}`);
        
        return {
            success: true,
            ipfsHash: ipfsResult.IpfsHash,
            ipfsUrl: `https://gateway.pinata.cloud/ipfs/${ipfsResult.IpfsHash}`,
            localPath: localPath,
            masterContract: masterContract
        };
    } catch (error) {
        console.error('❌ [Master Contract] Failed to generate:', error.message);
        return { success: false, error: error.message };
    }
}

// ==================== Helper Functions ====================

function getStatusCode(status) {
    const codes = { pending: 0, offered: 1, negotiating: 2, accepted: 3, approved: 4, rejected: 5, disbursed: 6 };
    return codes[status] || 0;
}

function getStatusString(code) {
    const statuses = ['pending', 'offered', 'negotiating', 'accepted', 'approved', 'rejected', 'disbursed'];
    return statuses[code] || 'unknown';
}

function getStateCode(state) {
    const codes = { intro: 0, offered: 1, negotiating: 2, accepted: 3 };
    return codes[state] || 0;
}

function getStateString(code) {
    const states = ['intro', 'offered', 'negotiating', 'accepted'];
    return states[code] || 'unknown';
}

function getDocumentTypeCode(type) {
    const codes = { aadhaar: 0, pan: 1, bankStatement: 2, salarySlip: 3 };
    return codes[type] || 0;
}

function getDocumentTypeString(code) {
    const types = ['aadhaar', 'pan', 'bankStatement', 'salarySlip'];
    return types[code] || 'unknown';
}

function getGradeCode(grade) {
    const codes = { 'A+': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
    return codes[grade] || 4;
}

function getGradeString(code) {
    const grades = ['A+', 'A', 'B', 'C', 'D'];
    return grades[code] || 'Unknown';
}

function getPaymentStatusCode(status) {
    const codes = { pending: 0, paid: 1, overdue: 2, failed: 3 };
    return codes[status] || 0;
}

function getPaymentStatusString(code) {
    const statuses = ['pending', 'paid', 'overdue', 'failed'];
    return statuses[code] || 'unknown';
}

function getExplorerUrl() {
    if (NETWORK === 'SEPOLIA') {
        return `https://sepolia.etherscan.io/address/${LOAN_CORE_ADDRESS}`;
    } else if (NETWORK === 'MUMBAI') {
        return `https://mumbai.polygonscan.com/address/${LOAN_CORE_ADDRESS}`;
    }
    return 'N/A (Local network)';
}

// Export functions
module.exports = {
    initWeb3,
    hashToBytes32,
    logApplicationToBlockchain,
    logChatToBlockchain,
    logDocumentToBlockchain,
    logCreditScoreToBlockchain,
    logDisbursementToBlockchain,
    logPaymentToBlockchain,
    getUserLoans,
    getLatestCreditScore,
    getMasterLedger,
    generateAndUploadMasterContract
};
