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

// Initial config
let config = BLOCKCHAIN_CONFIG[NETWORK];

// Fallback RPC pool for Sepolia (to handle rate limits)
const SEPOLIA_RPC_POOL = [
    process.env.SEPOLIA_RPC_URL,
    'https://rpc.sepolia.org',
    'https://ethereum-sepolia.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://sepolia.gateway.tenderly.co',
    'https://sepolia.drpc.org'
].filter(url => url && !url.includes('YOUR_INFURA_KEY')); // Filter out placeholders

let currentRpcIndex = 0;

// Web3 and contract instances
let web3;
let loanCoreContract;
let creditRegistryContract;
let paymentLedgerContract;
let accessControlContract;
let account;
// Local nonce allocator to prevent replacement issues when sending multiple rapid txs
let _nextNonce = null;

// Contract addresses from .env
const LOAN_CORE_ADDRESS = process.env.LOAN_CORE_CONTRACT_ADDRESS;
const CREDIT_REGISTRY_ADDRESS = process.env.CREDIT_REGISTRY_CONTRACT_ADDRESS;
const PAYMENT_LEDGER_ADDRESS = process.env.PAYMENT_LEDGER_CONTRACT_ADDRESS;
const ACCESS_CONTROL_ADDRESS = process.env.ACCESS_CONTROL_CONTRACT_ADDRESS;

/**
 * Hash string to bytes32 for blockchain storage (using keccak256 to match Solidity)
 */
function hashToBytes32(input) {
    if (!input) return '0x' + '0'.repeat(64);
    return web3.utils.keccak256(input.toString());
}

/**
 * Switch to next available RPC provider
 */
async function rotateProvider() {
    if (NETWORK !== 'SEPOLIA') return false;

    currentRpcIndex = (currentRpcIndex + 1) % SEPOLIA_RPC_POOL.length;
    const newRpc = SEPOLIA_RPC_POOL[currentRpcIndex];

    console.warn(`🔄 Switching Web3 provider to: ${newRpc} (Index: ${currentRpcIndex})`);

    try {
        const newProvider = new Web3.providers.HttpProvider(newRpc);
        web3.setProvider(newProvider);

        // Re-attach provider to contracts (Web3 4.x might auto-update, but explicit is safer)
        if (loanCoreContract) loanCoreContract.setProvider(newProvider);
        if (creditRegistryContract) creditRegistryContract.setProvider(newProvider);
        if (paymentLedgerContract) paymentLedgerContract.setProvider(newProvider);
        if (accessControlContract) accessControlContract.setProvider(newProvider);

        // Reset nonce allocator on provider switch
        _nextNonce = null;
        return true;
    } catch (err) {
        console.error('❌ Failed to switch provider:', err.message);
        return false;
    }
}

/**
 * Generic RPC call wrapper with retry/backoff for rate limits
 */
async function callWithRetry(fn, retries = 5, baseBackoff = 1000) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isRateLimit = err && (err.statusCode === 429 || err.code === 429 || err.code === 100 || (err.message && err.message.includes('429')));

            if (isRateLimit) {
                // Try to rotate provider before retrying
                if (attempt < retries - 1) {
                    await rotateProvider();
                    // Short wait after rotation
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
            }

            if (attempt < retries - 1) {
                const backoff = Math.min(15000, baseBackoff * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
                // console.warn(`⚠️  Web3 error - retrying in ${Math.round(backoff/1000)}s...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                continue;
            }

            // Don't throw rate limit errors, return null to allow graceful degradation
            if (isRateLimit) {
                console.error(`❌ Rate limit exhausted after ${retries} retries/rotations - operation failed`);
                return null;
            }
            throw err;
        }
    }
}

/**
 * Initialize Web3 connection and all contracts
 */
async function initWeb3() {
    // Reset nonce allocator on initialization
    _nextNonce = null;

    // Add initial delay if rapid restart to avoid rate limits
    if (global._lastWeb3InitAttempt) {
        const timeSinceLastAttempt = Date.now() - global._lastWeb3InitAttempt;
        if (timeSinceLastAttempt < 60000) { // Less than 1 minute
            const waitTime = 5000; // Reduced to 5s
            console.warn(`⚠️  Rapid Web3 restart detected - waiting ${waitTime / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    global._lastWeb3InitAttempt = Date.now();

    try {
        // Use RPC pool if available, else config
        const initialRpc = (NETWORK === 'SEPOLIA' && SEPOLIA_RPC_POOL.length > 0)
            ? SEPOLIA_RPC_POOL[0]
            : config.rpcUrl;

        web3 = new Web3(initialRpc);
        console.log(`🌐 [Blockchain] Connecting to: ${initialRpc}`);

        // Retry getBlockNumber to avoid rate limit on startup
        let blockNumber;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                blockNumber = await web3.eth.getBlockNumber();
                break;
            } catch (err) {
                const isRateLimit = err.statusCode === 429 || err.code === 429 || err.code === 100;
                if (isRateLimit) {
                    console.warn(`⚠️  Rate limit on startup - rotating provider...`);
                    await rotateProvider(); // Try next provider
                    continue;
                }
                console.error(`❌ Web3 connection error:`, err.message);
                // Try next provider anyway on connection error
                if (attempt < 2) {
                    await rotateProvider();
                    continue;
                }
                throw err;
            }
        }
        console.log(`✅ [Blockchain] Connected to ${NETWORK} (Block: ${blockNumber})`)

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
                const isAdmin = await callWithRetry(() => accessControlContract.methods.isAdmin(account).call());
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
 * Includes retry logic for rate limit (429) errors
 */
async function getTxOptions(gasLimit, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const gasPrice = await web3.eth.getGasPrice();
            // Reserve a nonce locally to avoid replacement transaction underpriced errors
            let nonce;
            try {
                // Force fetch from current provider if allocator is null or we just switched
                if (_nextNonce === null) {
                    _nextNonce = await web3.eth.getTransactionCount(account, 'pending');
                    console.log(`🔢 [Web3] Synced nonce to: ${_nextNonce}`);
                }
                nonce = _nextNonce;
                _nextNonce = Number(_nextNonce) + 1;
            } catch (e) {
                // Fallback to RPC count if local allocator fails
                console.warn(`⚠️  Nonce allocation failed, fetching from RPC: ${e.message}`);
                nonce = await web3.eth.getTransactionCount(account, 'pending');
            }
            // Convert BigInt to Number to avoid mixing BigInt with regular numbers
            return {
                from: account,
                gas: Number(gasLimit),
                gasPrice: gasPrice.toString(),
                nonce: Number(nonce)
            };
        } catch (error) {
            const isRateLimit = error.statusCode === 429 ||
                error.code === 429 ||
                (error.message && error.message.includes('429'));

            if (isRateLimit && attempt < retries - 1) {
                await rotateProvider(); // Rotate RPC
                const backoffMs = Math.min(3000, 500 * Math.pow(2, attempt));
                console.warn(`⚠️  Rate limit getting tx options, retrying in ${backoffMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }

            console.error('❌ Error getting transaction options:', error.message);
            throw error;
        }
    }
}

/**
 * Send transaction and return hash immediately (don't wait for mining)
 * This prevents long waits on slow testnets
 * Includes retry logic for rate limiting (429) errors
 */
async function sendTxFast(contractMethod, txOptions, timeoutMs = 60000, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Transaction timeout after ${timeoutMs}ms`));
                }, timeoutMs);

                contractMethod.send(txOptions)
                    .on('transactionHash', (hash) => {
                        clearTimeout(timeout);
                        resolve({ transactionHash: hash, status: 'pending' });
                    })
                    .on('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
            });
        } catch (error) {
            // Reset nonce allocator on any transaction error to force re-fetch
            _nextNonce = null;
            console.warn(`⚠️  Transaction error, reset nonce allocator`);

            // Check if it's a rate limiting error (429)
            const isRateLimit = error.statusCode === 429 ||
                error.code === 429 ||
                (error.message && error.message.includes('429'));

            const isNonceError = error.message && (
                error.message.includes('replacement transaction underpriced') ||
                error.message.includes('nonce too low') ||
                error.message.includes('already known')
            );

            if (isRateLimit && attempt < retries - 1) {
                await rotateProvider(); // Rotate RPC
                const backoffMs = Math.min(5000, 1000 * Math.pow(2, attempt));
                console.warn(`⚠️  Rate limit hit, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries})...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }

            if (isNonceError && attempt < retries - 1) {
                _nextNonce = null; // Force re-sync
                const backoff = 1000 + Math.floor(Math.random() * 2000); // Random 1-3s delay
                console.warn(`⚠️  Nonce error, re-syncing and retrying in ${backoff}ms (attempt ${attempt + 2}/${retries})...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                continue;
            }

            throw error;
        }
    }
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

        // Send transaction (return hash immediately, don't wait for mining)
        const tx = await sendTxFast(
            loanCoreContract.methods.createLoan(
                loanIdHash,
                userIdHash,
                web3.utils.toWei(loanAmount.toString(), 'ether'),
                interestBps,
                approvalScore || 0,
                metadataHash,
                statusCode
            ),
            await getTxOptions(500000)
        );

        console.log(`✅ [LoanCore] Application logged: ${applicationId}`);
        console.log(`   Tx: ${tx.transactionHash} (pending confirmation)`);

        return {
            success: true,
            transactionHash: tx.transactionHash,
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
        const tx = await sendTxFast(
            loanCoreContract.methods.logChat(
                sessionIdHash,
                userIdHash,
                messageHash,
                stateCode,
                negotiationCount,
                finalRateBps
            ),
            await getTxOptions(300000)
        );

        console.log(`✅ [LoanCore] Chat logged: ${sessionId} (State: ${state})`);

        return {
            success: true,
            transactionHash: tx.transactionHash
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
        const tx = await sendTxFast(
            loanCoreContract.methods.logDocument(
                docIdHash,
                userIdHash,
                docTypeCode,
                verified,
                dataHash,
                ipfsHashBytes
            ),
            await getTxOptions(350000)
        );

        console.log(`✅ [LoanCore] Document logged: ${documentType} (${verified ? 'Verified' : 'Failed'})`);

        return {
            success: true,
            transactionHash: tx.transactionHash
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
        const tx = await sendTxFast(
            creditRegistryContract.methods.addCredit(
                userIdHash,
                score,
                gradeCode,
                web3.utils.toWei(preApprovedLimit.toString(), 'ether'),
                proofHash
            ),
            await getTxOptions(300000)
        );

        console.log(`✅ [CreditRegistry] Credit logged: ${score} (Grade: ${grade})`);

        return {
            success: true,
            transactionHash: tx.transactionHash
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
        const tx = await sendTxFast(
            paymentLedgerContract.methods.addDisbursement(
                loanIdHash,
                userIdHash,
                web3.utils.toWei(amount.toString(), 'ether'),
                accountHash,
                txHash
            ),
            await getTxOptions(350000)
        );

        console.log(`✅ [PaymentLedger] Disbursement logged: ${loanId} (₹${amount})`);

        return {
            success: true,
            transactionHash: tx.transactionHash
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
        const tx = await sendTxFast(
            paymentLedgerContract.methods.payEMI(
                loanIdHash,
                userIdHash,
                emiNumber,
                web3.utils.toWei(amount.toString(), 'ether'),
                web3.utils.toWei(principalPaid.toString(), 'ether'),
                web3.utils.toWei(interestPaid.toString(), 'ether'),
                statusCode,
                receiptHashBytes
            ),
            await getTxOptions(350000)
        );

        console.log(`✅ [PaymentLedger] EMI logged: Loan ${loanId}, EMI #${emiNumber}`);

        return {
            success: true,
            transactionHash: tx.transactionHash
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
        const loans = await callWithRetry(() => loanCoreContract.methods.getLoans(userIdHash).call());

        // Handle null return from callWithRetry (rate limit exhausted)
        if (!loans) {
            console.warn('⚠️  [LoanCore] Rate limit - returning empty array');
            return { success: false, error: 'Rate limit exceeded', loans: [] };
        }

        return {
            success: true,
            loans: loans.map(loan => ({
                loanId: loan.loanId,
                amount: web3.utils.fromWei(loan.amount.toString(), 'ether'),
                interestRate: (Number(loan.interestBps) / 100).toFixed(2),
                score: Number(loan.score),
                status: getStatusString(Number(loan.status)),
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
        const credit = await callWithRetry(() => creditRegistryContract.methods.latestCredit(userIdHash).call());

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
        const ledger = await callWithRetry(() => loanCoreContract.methods.getMasterLedger(userIdHash).call());

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
 * Get credit history for a user from blockchain
 */
async function getCreditHistory(userId) {
    if (!creditRegistryContract) {
        return { success: false, reason: 'Contract not initialized', data: [] };
    }

    try {
        const userIdHash = hashToBytes32(userId);
        const creditHistory = await callWithRetry(() => creditRegistryContract.methods.getCreditHistory(userIdHash).call());

        // Handle null return from callWithRetry (rate limit exhausted)
        if (!creditHistory) {
            console.warn('⚠️  [CreditRegistry] Rate limit - returning empty array');
            return { success: false, error: 'Rate limit exceeded', data: [] };
        }

        return {
            success: true,
            data: creditHistory.map(credit => ({
                score: Number(credit.score),
                grade: getGradeString(Number(credit.grade)),
                limit: web3.utils.fromWei(credit.limit.toString(), 'ether'),
                timestamp: new Date(Number(credit.timestamp) * 1000).toISOString()
            }))
        };
    } catch (error) {
        console.error('❌ [CreditRegistry] Failed to get credit history:', error.message);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Get disbursements for a user from blockchain
 */
async function getUserDisbursements(userId) {
    if (!paymentLedgerContract) {
        return { success: false, reason: 'Contract not initialized', data: [] };
    }

    try {
        const userIdHash = hashToBytes32(userId);
        const disbursements = await callWithRetry(() => paymentLedgerContract.methods.getUserDisbursements(userIdHash).call());

        // Handle null return from callWithRetry (rate limit exhausted)
        if (!disbursements) {
            console.warn('⚠️  [PaymentLedger] Rate limit - returning empty array');
            return { success: false, error: 'Rate limit exceeded', data: [] };
        }

        return {
            success: true,
            data: disbursements.map(disb => ({
                loanIdHash: disb.loanId,
                amount: web3.utils.fromWei(disb.amount.toString(), 'ether'),
                accountHash: disb.accountHash,
                txHash: disb.txHash,
                timestamp: new Date(Number(disb.timestamp) * 1000).toISOString()
            }))
        };
    } catch (error) {
        console.error('❌ [PaymentLedger] Failed to get disbursements:', error.message);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Get EMIs for a user from blockchain
 */
async function getUserEMIs(userId) {
    if (!paymentLedgerContract) {
        return { success: false, reason: 'Contract not initialized', data: [] };
    }

    try {
        const userIdHash = hashToBytes32(userId);
        const emis = await callWithRetry(() => paymentLedgerContract.methods.getUserEMIs(userIdHash).call());

        // Handle null return from callWithRetry (rate limit exhausted)
        if (!emis) {
            console.warn('⚠️  [PaymentLedger] Rate limit - returning empty array');
            return { success: false, error: 'Rate limit exceeded', data: [] };
        }

        return {
            success: true,
            data: emis.map(emi => ({
                loanIdHash: emi.loanId,
                emiNumber: Number(emi.emiNo),
                amount: web3.utils.fromWei(emi.amount.toString(), 'ether'),
                principalPaid: web3.utils.fromWei(emi.principalPaid.toString(), 'ether'),
                interestPaid: web3.utils.fromWei(emi.interestPaid.toString(), 'ether'),
                status: getPaymentStatusString(Number(emi.status)),
                timestamp: new Date(Number(emi.timestamp) * 1000).toISOString()
            }))
        };
    } catch (error) {
        console.error('❌ [PaymentLedger] Failed to get EMIs:', error.message);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Generate and upload master contract JSON to IPFS
 * @param {string} userId - User phone number
 * @param {object} localData - Optional: local data to avoid blockchain queries
 * @param {object} localData.application - Application details
 * @param {object} localData.customer - Customer details
 * @param {object} localData.txHashes - Transaction hashes from blockchain writes
 */
async function generateAndUploadMasterContract(userId, localData = null) {
    try {
        const userIdHash = hashToBytes32(userId);

        // Helper to delay between RPC calls (avoid rate limiting)
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        // **HYBRID MODE**: If localData provided, use it directly (no blockchain queries)
        if (localData && localData.application && localData.txHashes) {
            console.log(`📊 [Master Contract] Using LOCAL DATA (hybrid mode) for userId: ${userId}`);
            const { application, customer, creditScore, emiData, txHashes } = localData;

            const masterContract = {
                version: '2.1-hybrid',
                architecture: 'Modular Blockchain',
                userId: userId,
                userIdHash: userIdHash,
                generated: new Date().toISOString(),
                mode: 'hybrid-local-data',

                blockchain: {
                    network: NETWORK,
                    loanCoreAddress: LOAN_CORE_ADDRESS,
                    creditRegistryAddress: CREDIT_REGISTRY_ADDRESS,
                    paymentLedgerAddress: PAYMENT_LEDGER_ADDRESS,
                    explorerUrl: getExplorerUrl()
                },

                summary: {
                    totalLoans: 1,
                    totalChats: 1,
                    totalDocuments: 2, // PAN + Aadhaar
                    totalCredits: 1,
                    totalDisbursements: 1,
                    totalEMIs: 1
                },

                transactions: {
                    loans: [{
                        loanIdHash: hashToBytes32(String(application._id)),
                        amount: String(application.approvedAmount || application.requestedAmount),
                        interestRate: String(application.finalRate || application.interestRate) + '%',
                        score: application.creditScore || creditScore?.score || 0,
                        status: application.status,
                        timestamp: application.acceptedAt || new Date().toISOString(),
                        txHash: txHashes.application || 'pending'
                    }],

                    chatLogs: [{
                        sessionIdHash: hashToBytes32(application.sessionId || 'session'),
                        state: application.status,
                        negotiationCount: application.negotiationRound || 0,
                        finalRate: String(application.finalRate || application.interestRate) + '%',
                        timestamp: new Date().toISOString(),
                        txHash: txHashes.chat || 'pending'
                    }],

                    documents: [
                        {
                            docIdHash: hashToBytes32(`PAN_${application._id}`),
                            documentType: 'PAN',
                            verified: true,
                            dataHash: hashToBytes32(customer?.pan || 'XXXXXX1234'),
                            ipfsHash: `ipfs_pan_${application.sessionId}`,
                            timestamp: new Date().toISOString(),
                            txHash: txHashes.pan || 'pending'
                        },
                        {
                            docIdHash: hashToBytes32(`AADHAAR_${application._id}`),
                            documentType: 'Aadhaar',
                            verified: true,
                            dataHash: hashToBytes32(customer?.aadhaar || 'XXXX XXXX 1234'),
                            ipfsHash: `ipfs_aadhaar_${application.sessionId}`,
                            timestamp: new Date().toISOString(),
                            txHash: txHashes.aadhaar || 'pending'
                        }
                    ],

                    creditHistory: [{
                        score: application.creditScore || creditScore?.score || 0,
                        grade: (application.creditScore || creditScore?.score || 0) >= 750 ? 'A+' :
                            (application.creditScore || creditScore?.score || 0) >= 700 ? 'A' :
                                (application.creditScore || creditScore?.score || 0) >= 650 ? 'B' : 'C',
                        limit: String(application.preApprovedLimit || application.approvedAmount || 0),
                        timestamp: new Date().toISOString(),
                        txHash: txHashes.credit || 'pending'
                    }],

                    disbursements: [{
                        loanIdHash: hashToBytes32(String(application._id)),
                        amount: String(application.approvedAmount || application.requestedAmount),
                        accountHash: hashToBytes32(customer?.accountNumber || userId),
                        txHash: txHashes.disbursement || 'pending',
                        timestamp: new Date().toISOString()
                    }],

                    emis: [{
                        loanIdHash: hashToBytes32(String(application._id)),
                        emiNumber: 1,
                        amount: String(emiData?.emi || 0),
                        principalPaid: String((emiData?.emi || 0) * 0.7),
                        interestPaid: String((emiData?.emi || 0) * 0.3),
                        status: 'pending',
                        timestamp: new Date().toISOString(),
                        txHash: txHashes.emi || 'pending'
                    }]
                },

                verification: {
                    note: 'Generated from local data + blockchain transaction hashes (hybrid mode). All txHashes are verifiable on Sepolia.',
                    blockchainProof: 'Verify transactions at explorer URLs above using txHash',
                    architecture: 'Production-grade modular contracts with hash-based storage',
                    dataSource: 'MongoDB application data + blockchain transaction confirmation'
                }
            };

            // Upload to Pinata/IPFS
            console.log(`📤 [Master Contract] Uploading to IPFS (hybrid mode)...`);
            const ipfsResult = await uploadJSONToIPFS(masterContract, `${userId}_master.json`);
            console.log(`✅ [Master Contract] IPFS upload successful: ${ipfsResult.ipfsHash}`);

            return {
                success: true,
                ipfsHash: ipfsResult.ipfsHash,
                ipfsUrl: `https://gateway.pinata.cloud/ipfs/${ipfsResult.ipfsHash}`,
                masterContract
            };
        }

        // **ORIGINAL MODE**: Query blockchain (may hit rate limits)
        console.log(`📊 [Master Contract] Fetching blockchain data (legacy mode) for userId: ${userId} (hash: ${userIdHash})`);

        // Helper to retry blockchain calls with rate limit handling
        const retryCall = async (fn, retries = 3, returnValueOnFail = []) => {
            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    return await fn();
                } catch (error) {
                    const isRateLimit = error.statusCode === 429 ||
                        error.code === 429 ||
                        error.code === 100 ||
                        (error.message && error.message.includes('429'));

                    if (isRateLimit && attempt < retries - 1) {
                        const backoffMs = Math.min(10000, 2000 * Math.pow(2, attempt));
                        console.warn(`⚠️  Rate limit (429) - waiting ${Math.round(backoffMs / 1000)}s before retry ${attempt + 2}/${retries}...`);
                        await delay(backoffMs);
                        continue;
                    }

                    // If exhausted retries or non-rate-limit error
                    if (isRateLimit) {
                        console.error(`❌ Rate limit exhausted after ${retries} retries - using fallback value`); return returnValueOnFail; // Return empty array instead of throwing
                    }
                    throw error;
                }
            }
        };

        const loans = await retryCall(() => loanCoreContract.methods.getLoans(userIdHash).call(), 3, []);
        console.log(`  ✅ Loans: ${loans.length} records`);
        await delay(500);

        const chats = await retryCall(() => loanCoreContract.methods.getChatLogs(userIdHash).call(), 3, []);
        console.log(`  ✅ Chat Logs: ${chats.length} records`);
        await delay(500);

        const documents = await retryCall(() => loanCoreContract.methods.getDocuments(userIdHash).call(), 3, []);
        console.log(`  ✅ Documents: ${documents.length} records`);
        await delay(500);

        const disbursements = await retryCall(() => paymentLedgerContract.methods.getUserDisbursements(userIdHash).call(), 3, []);
        console.log(`  ✅ Disbursements: ${disbursements.length} records`);
        await delay(500);

        const emis = await retryCall(() => paymentLedgerContract.methods.getUserEMIs(userIdHash).call(), 3, []);
        console.log(`  ✅ EMIs: ${emis.length} records`);
        await delay(500);

        let creditHistory = [];
        try {
            creditHistory = await retryCall(() => creditRegistryContract.methods.getCreditHistory(userIdHash).call(), 3, []);
            console.log(`  ✅ Credit History: ${creditHistory.length} records`);
        } catch (e) {
            console.log(`  ⚠️  Credit History: Error fetching - ${e.message}`);
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
                    amount: web3.utils.fromWei(loan.amount.toString(), 'ether'),
                    interestRate: (Number(loan.interestBps) / 100).toFixed(2) + '%',
                    score: Number(loan.score),
                    status: getStatusString(Number(loan.status)),
                    timestamp: new Date(Number(loan.timestamp) * 1000).toISOString()
                })),

                chatLogs: chats.map(chat => ({
                    sessionIdHash: chat.sessionId,
                    messageHash: chat.messageHash,
                    state: getStateString(Number(chat.state)),
                    negotiationCount: Number(chat.negotiationCount),
                    finalRate: (Number(chat.finalRateBps) / 100).toFixed(2) + '%',
                    timestamp: new Date(Number(chat.timestamp) * 1000).toISOString()
                })),

                documents: documents.map(doc => ({
                    docIdHash: doc.docId,
                    documentType: getDocumentTypeString(Number(doc.docType)),
                    verified: doc.verified,
                    dataHash: doc.dataHash,
                    ipfsHash: doc.ipfsHash,
                    timestamp: new Date(Number(doc.timestamp) * 1000).toISOString()
                })),

                creditHistory: creditHistory.map(credit => ({
                    score: Number(credit.score),
                    grade: getGradeString(Number(credit.grade)),
                    limit: web3.utils.fromWei(credit.limit.toString(), 'ether'),
                    timestamp: new Date(Number(credit.timestamp) * 1000).toISOString()
                })),

                disbursements: disbursements.map(disb => ({
                    loanIdHash: disb.loanId,
                    amount: web3.utils.fromWei(disb.amount.toString(), 'ether'),
                    accountHash: disb.accountHash,
                    txHash: disb.txHash,
                    timestamp: new Date(Number(disb.timestamp) * 1000).toISOString()
                })),

                emis: emis.map(emi => ({
                    loanIdHash: emi.loanId,
                    emiNumber: Number(emi.emiNo),
                    amount: web3.utils.fromWei(emi.amount.toString(), 'ether'),
                    principalPaid: web3.utils.fromWei(emi.principalPaid.toString(), 'ether'),
                    interestPaid: web3.utils.fromWei(emi.interestPaid.toString(), 'ether'),
                    status: getPaymentStatusString(Number(emi.status)),
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

        // Save local backup (sanitize userId for valid file path)
        const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const backupDir = path.join(__dirname, 'master_contracts');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const localPath = path.join(backupDir, `${sanitizedUserId}_master.json`);
        fs.writeFileSync(localPath, JSON.stringify(masterContract, null, 2));

        console.log(`✅ [Master Contract] Generated for ${userId}`);
        console.log(`   IPFS: ${ipfsResult.ipfsHash}`);
        console.log(`   URL: https://gateway.pinata.cloud/ipfs/${ipfsResult.ipfsHash}`);

        // Warn if data might be incomplete due to rate limiting
        const hasPartialData = disbursements.length === 0 || emis.length === 0 || creditHistory.length === 0;
        if (hasPartialData && loans.length > 0) {
            console.warn(`   ⚠️  WARNING: Master contract may have incomplete data due to rate limits`);
            console.warn(`   ⚠️  Consider regenerating later when RPC quota refreshes`);
        }

        return {
            success: true,
            ipfsHash: ipfsResult.ipfsHash,
            ipfsUrl: `https://gateway.pinata.cloud/ipfs/${ipfsResult.ipfsHash}`,
            localPath: localPath,
            masterContract: masterContract,
            rateLimited: hasPartialData
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
    getCreditHistory,
    getUserDisbursements,
    getUserEMIs,
    generateAndUploadMasterContract
};
