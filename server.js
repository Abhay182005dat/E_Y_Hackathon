require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Database & Scalability Utils
const { connectDB, getDB } = require('./server/db');
const { publishEvent, getQueueStats } = require('./server/utils/eventQueue');
const { updateWithVersion, updateWithRetry } = require('./server/utils/optimisticLock');
const { withLock } = require('./server/utils/mongoLock');

// Blockchain Utils (Ethereum Web3)
const {
    initWeb3,
    logApplicationToBlockchain,
    logChatToBlockchain,
    logDocumentToBlockchain,
    logCreditScoreToBlockchain,
    getUserMasterLedger,
    getUserCompleteHistory,
    getBlockchainStats,
    generateAndUploadMasterContract,
    getMasterContract
} = require('./blockchain/web3Client');

// Redis for Chat Streaming
const {
    connectRedis,
    setChatSession,
    getChatSession,
    addChatMessage,
    getChatHistory,
    publishChatEvent,
    incrementChatMetric,
    trackActiveSession,
    getActiveSessionCount
} = require('./server/utils/redisClient');

// Agents
const { detectLoanIntent, presentAndNegotiateOffer } = require('./agents/masterAgent');
const { collectUserData } = require('./agents/dataAgent');
const { verifyKYC } = require('./agents/verificationAgent');
const { analyzeCredit } = require('./agents/creditAgent');
const { evaluateRiskAndPrice } = require('./agents/underwritingAgent');
const { executeApproval } = require('./agents/approvalAgent');
const { generateSanctionLetter } = require('./agents/documentAgent');
const { disburseFunds } = require('./agents/disbursementAgent');
const { logEmiPayment } = require('./agents/monitoringAgent');

// Utils
const { parseAadhaar, parsePAN, parseBankStatement, parseSalarySlip, performFraudCheck } = require('./utils/ocr');
const { calculateApprovalScore, calculatePreApprovedLimit, calculateEMI, generateEMISchedule, getInterestRate } = require('./utils/creditScore');
const { sendOTP, verifyLoginOTP, loginAdmin, getUserById, createAdmin, getAllUsers, authMiddleware, adminMiddleware, maskAadhaar, maskPAN, getOTPFromHash } = require('./utils/auth');

const app = express();
const port = process.env.PORT || 3001;

// ==================== SCALABILITY SETUP ====================
// This enables 1000+ concurrent admins through:
// 1. MongoDB-backed sessions (stateless server instances)
// 2. Connection pooling (50 max connections per instance)
// 3. Distributed locks for critical sections
// 4. Event-driven async processing

// Initialize MongoDB, Redis, and Blockchain connections
let dbInitialized = false;
let redisInitialized = false;
let blockchainInitialized = false;
(async () => {
    try {
        await connectDB();
        dbInitialized = true;
        console.log('✅ MongoDB: Scalability features initialized');
        
        // Initialize Redis for chat streaming
        try {
            await connectRedis();
            redisInitialized = true;
            console.log('✅ Redis: Chat streaming enabled');
        } catch (redisErr) {
            console.warn('⚠️ Redis not available. Chat will use fallback mode:', redisErr.message);
            // Continue without Redis - system still works
        }
        
        // Initialize Blockchain (Ethereum Web3)
        try {
            blockchainInitialized = await initWeb3();
            if (blockchainInitialized) {
                console.log('✅ Blockchain: Ethereum ledger connected (immutable audit trail enabled)');
            }
        } catch (blockchainErr) {
            console.warn('⚠️ Blockchain not available. Audit trail will use JSON fallback:', blockchainErr.message);
            // Continue without blockchain - system still works
        }
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB:', err.message);
        process.exit(1);
    }
})();

// Session middleware (MongoDB-backed for horizontal scaling)
app.use(session({
    secret: process.env.JWT_SECRET || 'ey-techathon-session-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        dbName: process.env.MONGO_DB_NAME || 'eyhackathon',
        collectionName: 'sessions',
        ttl: 7 * 24 * 60 * 60, // 7 days
        autoRemove: 'native',
        touchAfter: 24 * 3600 // Lazy session update (once per 24h)
    }),
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'lax'
    },
    name: 'bfsi.sid' // Custom session cookie name
}));

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiting (per IP)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

// Stricter rate limit for admin operations
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500, // Higher limit for admins
    message: { error: 'Too many admin requests' }
});
app.use('/api/admin/', adminLimiter);

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.static('frontend'));

// File upload config
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
    }),
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ==================== AUTH ENDPOINTS ====================

// OTP reveal endpoint (for development - paste hash to get OTP)
app.post('/api/otp/reveal', async (req, res) => {
    try {
        const { hash } = req.body;
        
        if (!hash) {
            return res.status(400).json({ error: 'Hash required' });
        }
        
        const otpData = getOTPFromHash(hash);
        
        if (!otpData) {
            return res.status(404).json({ error: 'Invalid or expired hash' });
        }
        
        res.json({
            ok: true,
            otp: otpData.otp,
            phone: otpData.phone,
            name: otpData.name,
            accountNumber: otpData.accountNumber,
            expires: otpData.expires
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. Send OTP (User Login Step 1)
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        const { name, accountNumber, phone } = req.body;
        const result = await sendOTP({ name, accountNumber, phone });
        res.json({ ok: true, message: result.message, otpHash: result.otpHash }); // Return hash instead of OTP
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 2. Verify OTP & Login (User Login Step 2)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, otp, accountNumber } = req.body;
        const { token, user } = await verifyLoginOTP({ phone, otp, accountNumber });
        res.json({ ok: true, token, user });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// 3. Admin Login (Email/Password)
app.post('/api/auth/admin-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { token, user } = await loginAdmin(email, password);
        res.json({ ok: true, token, user });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// 4. Get Current User
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ ok: true, user: req.user });
});

// The entire loan application flow
app.post('/loan', async (req, res) => {
    const cids = [];
    try {
        // PHASE 1: Customer Entry & Intent Detection
        const { message, userData } = req.body;
        const { intent, sessionId } = await detectLoanIntent(message);
        // CIDs from this phase are logged internally by the agent

        if (intent !== 'loanApplication') {
            return res.status(400).json({ status: 'rejected', reason: 'Invalid intent' });
        }

        // PHASE 2: Data Collection & Consent
        const { consentCid, interactionCid } = await collectUserData(sessionId, userData);
        cids.push({ step: 'consent', cid: consentCid }, { step: 'dataCollection', cid: interactionCid });

        // PHASE 3: KYC & Identity Verification
        const { kycStatus, reason: kycReason } = await verifyKYC(sessionId, userData.kycDocuments);
        if (kycStatus !== 'verified') {
            return res.status(200).json({ status: 'rejected', reason: kycReason || 'KYC failed', cids });
        }

        // PHASE 4: Credit Score & Financial Risk Analysis
        const creditCheck = await analyzeCredit(sessionId, userData);
        cids.push({ step: 'creditAnalysis', cid: creditCheck.creditData.cid });
        if (!creditCheck.riskAcceptable) {
            return res.status(200).json({ status: 'rejected', reason: creditCheck.reason || 'Credit risk not acceptable', cids });
        }

        // PHASE 4 (cont.): Underwriting
        const underwriting = await evaluateRiskAndPrice(sessionId, userData, creditCheck.creditData);
        cids.push({ step: 'underwriting', cid: underwriting.cid });
        if (!underwriting.eligibility) {
            return res.status(200).json({ status: 'rejected', reason: underwriting.reason, cids });
        }

        // PHASE 5: Loan Offer Generation & Negotiation
        const finalOffer = await presentAndNegotiateOffer(sessionId, underwriting.offer);
        // CIDs logged internally
        if (finalOffer.userResponse !== 'accepted') {
            return res.status(200).json({ status: 'rejected', reason: 'User rejected the offer', cids });
        }

        // PHASE 6: Loan Approval
        const approvalDetails = await executeApproval(sessionId, kycStatus, creditCheck, finalOffer);
        cids.push({ step: 'approval', cid: approvalDetails.approvalCid });
        if (approvalDetails.approvalStatus !== 'approved') {
            return res.status(200).json({ status: 'rejected', reason: approvalDetails.reason, cids });
        }

        // PHASE 7: Sanction Letter Generation
        const { loanId, sanctionCid } = await generateSanctionLetter(sessionId, approvalDetails, finalOffer);
        cids.push({ step: 'sanction', cid: sanctionCid });

        // PHASE 8: Disbursement
        const { disbursementCid } = await disburseFunds(sessionId, loanId, finalOffer);
        cids.push({ step: 'disbursement', cid: disbursementCid });

        // PHASE 9: Log first (mock) EMI payment for monitoring startup
        const { paymentCid } = await logEmiPayment(loanId, { amount: 0, paymentDate: new Date().toISOString() });
        cids.push({ step: 'monitoring', cid: paymentCid });

        res.status(200).json({
            status: 'approved',
            loanId,
            cids
        });

    } catch (error) {
        console.error("Loan processing failed:", error);
        res.status(500).json({ status: 'error', message: error.message, cids });
    }
});

// Endpoint for post-loan monitoring
app.post('/payment', async (req, res) => {
    try {
        const { loanId, paymentData } = req.body;
        const result = await logEmiPayment(loanId, paymentData);
        res.status(200).json(result);
    } catch (error) {
        console.error("Payment logging failed:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ==================== NEW API ENDPOINTS ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

// Document verification with OCR
app.post('/api/verify-docs', upload.fields([
    { name: 'aadhaar', maxCount: 1 },
    { name: 'pan', maxCount: 1 },
    { name: 'bankStatement', maxCount: 1 },
    { name: 'salarySlip', maxCount: 1 }
]), async (req, res) => {
    try {
        const files = req.files || {};
        const results = {};

        // Parse each document
        if (files.aadhaar?.[0]) {
            results.aadhaar = await parseAadhaar(files.aadhaar[0].path);
        }
        if (files.pan?.[0]) {
            results.pan = await parsePAN(files.pan[0].path);
        }
        if (files.bankStatement?.[0]) {
            results.bankStatement = await parseBankStatement(files.bankStatement[0].path);
        }
        if (files.salarySlip?.[0]) {
            results.salarySlip = await parseSalarySlip(files.salarySlip[0].path);
        }

        // Perform fraud check
        const fraudCheck = performFraudCheck(results);
        
        // Log documents to blockchain (async, non-blocking)
        if (blockchainInitialized && req.user) {
            const userId = req.user.phone || req.user._id?.toString();
            Object.entries(results).forEach(async ([docType, docData]) => {
                if (docData) {
                    await logDocumentToBlockchain({
                        documentId: `DOC_${Date.now()}_${docType}`,
                        userId,
                        documentType: docType,
                        verified: !fraudCheck.flagged,
                        dataHash: require('crypto').createHash('sha256').update(JSON.stringify(docData)).digest('hex')
                    });
                }
            });
        }

        res.json({
            ok: true,
            documents: results,
            fraudCheck
        });
    } catch (err) {
        console.error('Document verification error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Approval Score calculation
app.post('/api/calculate-score', async (req, res) => {
    try {
        const { customerData, documents = {} } = req.body;

        if (!customerData) {
            return res.status(400).json({ error: 'customerData required' });
        }

        const loanAmount = parseInt(customerData.loanAmount) || 500000;
        const score = calculateApprovalScore(customerData, documents, loanAmount);
        const limit = calculatePreApprovedLimit(
            score.score,
            customerData.monthlySalary || 50000,
            customerData.existingEMI || 0
        );
        
        // Log credit score to blockchain (async)
        if (blockchainInitialized && req.user) {
            const userId = req.user.phone || req.user._id?.toString();
            logCreditScoreToBlockchain({
                userId,
                score: score.score,
                grade: score.grade,
                preApprovedLimit: limit.limit
            }).catch(err => console.error('Blockchain logging error:', err));
        }

        res.json({
            ok: true,
            approvalScore: score,
            preApprovedLimit: limit
        });
    } catch (err) {
        console.error('Approval score error:', err);
        res.status(500).json({ error: err.message });
    }
});

// EMI calculator
app.post('/api/calculate-emi', (req, res) => {
    try {
        const { amount, rate, tenure } = req.body;

        if (!amount || !rate || !tenure) {
            return res.status(400).json({ error: 'amount, rate, tenure required' });
        }

        const emi = calculateEMI(amount, rate, tenure);
        const totalPayment = emi * tenure;
        const totalInterest = totalPayment - amount;

        res.json({
            ok: true,
            emi,
            totalPayment,
            totalInterest,
            interestRate: rate,
            tenure
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Chat endpoint - uses Redis Streams for real-time messaging
const { callGemini } = require('./utils/geminiClient');

app.post('/api/chat', async (req, res) => {
    try {
        const { message, customerData, creditScore, sessionId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'message required' });
        }

        // Generate session ID if not provided
        const sid = sessionId || `session_${Date.now()}`;

        // Get or create session from Redis
        let session = redisInitialized ? await getChatSession(sid) : null;
        
        if (!session) {
            session = {
                state: 'intro', // intro -> offered -> negotiating -> accepted
                negotiationCount: 0,
                finalRate: null,
                createdAt: new Date().toISOString()
            };
            if (redisInitialized) {
                await setChatSession(sid, session, 86400); // 24 hour TTL
                await trackActiveSession(sid, 300); // 5 min activity tracking
            }
            console.log(`[Chat] New session created: ${sid}`);
        } else {
            // Session restored - extend TTL
            if (redisInitialized) {
                await setChatSession(sid, session, 86400); // Refresh 24h TTL
                await trackActiveSession(sid, 300);
            }
            console.log(`[Chat] Session restored: ${sid} | State: ${session.state} | Negotiation: ${session.negotiationCount}`);
        }

        // Extract correct values from the data structure
        const name = customerData?.name || 'Customer';
        const salary = parseInt(customerData?.monthlySalary) || 50000;
        const requestedAmount = parseInt(customerData?.loanAmount) || 500000;
        const score = creditScore?.creditScore?.score || creditScore?.score || 720;
        const preApprovedLimit = creditScore?.preApprovedLimit?.limit || 500000;
        const baseRate = creditScore?.preApprovedLimit?.interestRate || 12;
        
        // Calculate better interest rate if requesting less than max
        const loanUtilization = (requestedAmount / preApprovedLimit) * 100;
        let adjustedRate = baseRate;
        if (loanUtilization <= 50) {
            adjustedRate = baseRate - 2; // 2% discount for using 50% or less
        } else if (loanUtilization <= 75) {
            adjustedRate = baseRate - 1; // 1% discount for using 75% or less
        }
        
        const currentRate = session.finalRate || adjustedRate;
        const finalAmount = requestedAmount <= preApprovedLimit ? requestedAmount : preApprovedLimit;

        // Add user message to history and publish to stream
        if (redisInitialized) {
            await addChatMessage(sid, { role: 'user', content: message });
            await publishChatEvent(sid, 'user_message', { message, customerData });
            await incrementChatMetric('total_messages');
        }

        // Check if message is loan-related (simple keyword check for performance)
        const loanKeywords = ['loan', 'borrow', 'credit', 'emi', 'interest', 'rate', 'money', 'finance', 'apply', 'approve', 'amount', 'eligible', 'tenure', 'payment', 'negotiate', 'accept', 'reject', 'disbursement', 'sanction', 'principal', 'repayment', 'advance', 'funding', 'capital', 'installment', 'debt', 'mortgage', 'collateral', 'limit', 'balance', 'due', 'overdue', 'refinance', 'prepayment', 'foreclosure', 'processing fee', 'documentation', 'salary', 'income', 'kyc', 'verification', 'document', 'approval', 'status', 'application', 'yes', 'no', 'ok', 'proceed'];
        const lower = message.toLowerCase().trim();
        const isLoanRelated = loanKeywords.some(keyword => lower.includes(keyword)) || 
                     (session.state === 'intro' && lower.length <= 10); // Only allow short greetings in intro state
        
        if (!isLoanRelated) {
            // Reject off-topic queries
            const response = "I'm here to help with loan applications only! 😊\n\nI can assist you with:\n💰 Loan eligibility & applications\n📊 Interest rates & offers\n💵 EMI calculations\n📝 Document verification\n\nPlease ask about loans, or say 'accept' to proceed with your current offer.";
            
            if (redisInitialized) {
                await addChatMessage(sid, { role: 'bot', content: response });
                await publishChatEvent(sid, 'bot_response', { response, state: 'off_topic' });
            }
            
            console.log(`[Chat] ${name} | Off-topic message rejected: "${message}"`);
            return res.json({ ok: true, response, sessionId: sid, state: session.state, warning: 'off_topic' });
        }

        // State machine logic - produces consistent responses
        let response;

        if (session.state === 'accepted') {
            response = `Your loan application is already submitted! 🎉\n\n🔢 Reference ID: LOAN-${sid.slice(-8)}\n📋 Status: Under Review\n\nPlease wait for admin approval.`;
        } else if (lower.includes('yes') || lower.includes('accept') || lower.includes('proceed') || lower.includes('go ahead') || lower.includes('ok')) {
            if (session.state === 'negotiating' || session.state === 'offered') {
                session.state = 'accepted';
                session.finalRate = session.finalRate || currentRate;
                session.finalAmount = finalAmount;
                
                const statusMessage = requestedAmount <= preApprovedLimit 
                    ? '✅ Approved' 
                    : `⚠️ Adjusted to maximum limit`;
                
                response = `✅ Congratulations ${name}! Your loan is approved!\n\n🔢 Reference ID: LOAN-${sid.slice(-8)}\n💰 Applied Amount: ₹${requestedAmount.toLocaleString()}\n💵 Approved Amount: ₹${finalAmount.toLocaleString()}\n📊 Maximum Limit: ₹${preApprovedLimit.toLocaleString()}\n📈 Final Interest Rate: ${session.finalRate}%\n📋 Status: ${statusMessage}\n\n${requestedAmount < preApprovedLimit ? '🎉 Great choice! You got a better rate for borrowing less!' : ''}\n\nYou'll receive SMS confirmation shortly.`;
            } else {
                session.state = 'offered';
                response = `Hello ${name}! 👋\n\n📊 Credit Score: ${score}\n💰 Pre-Approved: ₹${preApprovedLimit.toLocaleString()}\n📈 Interest Rate: ${currentRate}%\n\nWould you like to accept this offer or negotiate?`;
            }
        } else if (lower.includes('negotiate') || lower.includes('reduce') || lower.includes('lower') || lower.includes('rate') || lower.includes('less')) {
            if (session.negotiationCount >= 2) {
                response = `I've already offered the best rate I can, ${name}.\n\n📉 Final Rate: ${session.finalRate || (adjustedRate - 0.5)}%\n\nThis is our lowest possible rate. Would you like to accept?`;
            } else {
                session.state = 'negotiating';
                session.negotiationCount++;
                const reduction = 0.25 * session.negotiationCount;
                session.finalRate = (adjustedRate - reduction).toFixed(1);
                response = `I can offer a ${reduction}% reduction, ${name}!\n\n📉 New Rate: ${session.finalRate}%\n💰 Applied Amount: ₹${requestedAmount.toLocaleString()}\n📊 Maximum Available: ₹${preApprovedLimit.toLocaleString()}\n\n${requestedAmount < preApprovedLimit ? '✨ You already have a better rate for borrowing less!' : ''}\n\nWould you like to accept this offer?`;
            }
        } else if (session.state === 'intro' || lower.includes('loan') || lower.includes('apply') || lower.includes('need') || lower.includes('hi') || lower.includes('hello')) {
            session.state = 'offered';
            
            const rateBonus = requestedAmount < preApprovedLimit 
                ? `\n🎁 Special Offer: ${(baseRate - adjustedRate).toFixed(1)}% lower rate for borrowing ₹${requestedAmount.toLocaleString()} (${loanUtilization.toFixed(0)}% of your limit)!` 
                : '';
            
            response = `Hello ${name}! 👋 Based on your verified documents:\n\n📊 Approval Score: ${score/10}%\n💰 Applied Amount: ₹${requestedAmount.toLocaleString()}\n📊 Maximum Available: ₹${preApprovedLimit.toLocaleString()}\n📈 Interest Rate: ${adjustedRate.toFixed(1)}% ${rateBonus}\n💵 Monthly Salary: ₹${salary.toLocaleString()}\n\n${requestedAmount <= preApprovedLimit ? '✅ Great news! Your requested amount is within your limit!' : '⚠️ Note: Your request exceeds the limit, we can approve up to ₹' + preApprovedLimit.toLocaleString()}\n\nWould you like to accept this offer or negotiate the interest rate?`;
        } else {
            response = `Hi ${name}! Your current offer:\n\n💰 Applied: ₹${requestedAmount.toLocaleString()}\n📊 Maximum: ₹${preApprovedLimit.toLocaleString()}\n📈 Rate: ${currentRate}%\n\nSay "accept" to proceed or "negotiate" for better rates.`;
        }

        // If accepted, store the application with EMI schedule
        if (session.state === 'accepted' && !session.applicationStored) {
            const finalRate = parseFloat(session.finalRate || adjustedRate);
            const approvedAmount = session.finalAmount || finalAmount;
            const emiData = generateEMISchedule(approvedAmount, finalRate, 36);

            const app = {
                _id: `LOAN-${sid.slice(-8)}`,
                customerName: name,
                phone: customerData?.phone || 'N/A',
                email: customerData?.email || 'N/A',
                accountNumber: customerData?.accountNumber || 'N/A',
                requestedAmount: requestedAmount,
                amount: approvedAmount,
                maxLimit: preApprovedLimit,
                tenure: 36,
                interestRate: finalRate,
                approvalScore: score,
                monthlySalary: salary,
                status: 'pending',
                submittedAt: new Date().toISOString(),
                documents: { aadhaar: true, pan: true, bankStatement: true, salarySlip: true },
                emi: emiData.emi,
                nextEmiDate: emiData.schedule[0]?.dueDate,
                emiSchedule: emiData.schedule,
                version: 1
            };
            
            // Store in MongoDB
            const db = getDB();
            await db.collection('applications').insertOne(app);
            
            // Log application to blockchain (immutable record)
            if (blockchainInitialized) {
                logApplicationToBlockchain({
                    applicationId: app._id,
                    userId: customerData?.phone || customerData?.accountNumber,
                    customerName: name,
                    loanAmount: approvedAmount,
                    interestRate: finalRate,
                    approvalScore: score,
                    status: 'accepted',
                    documentHash: ''
                }).catch(err => console.error('Blockchain logging error:', err));
                
                // Generate master contract JSON and upload to IPFS/Pinata
                setTimeout(async () => {
                    const userId = customerData?.phone || customerData?.accountNumber;
                    console.log(`📄 Generating master contract for ${userId}...`);
                    const masterResult = await generateAndUploadMasterContract(userId);
                    if (masterResult.success) {
                        console.log(`✅ Master contract uploaded to IPFS: ${masterResult.ipfsHash}`);
                        console.log(`   📂 View at: ${masterResult.ipfsUrl}`);
                        
                        // Update application with IPFS link
                        await db.collection('applications').updateOne(
                            { _id: app._id },
                            { 
                                $set: { 
                                    masterContractIPFS: masterResult.ipfsHash,
                                    masterContractUrl: masterResult.ipfsUrl 
                                } 
                            }
                        );
                    }
                }, 2000); // Wait 2 seconds for blockchain confirmation
            }
            
            session.applicationStored = true;
            console.log(`✅ [Application] Stored: ${app._id} for ${name} | Requested: ₹${requestedAmount} | Approved: ₹${approvedAmount} | EMI: ₹${emiData.emi}`);
        }

        // Add bot response to history and publish to stream
        if (redisInitialized) {
            await addChatMessage(sid, { role: 'bot', content: response });
            await publishChatEvent(sid, 'bot_response', { response, state: session.state });
            await setChatSession(sid, session, 86400); // Update session state
            await incrementChatMetric('total_messages');
            await trackActiveSession(sid, 300);
        }
        
        // Log chat interaction to blockchain (immutable audit trail)
        if (blockchainInitialized) {
            const userId = customerData?.phone || customerData?.accountNumber || 'unknown';
            const messageHash = require('crypto').createHash('sha256').update(message + response).digest('hex');
            
            logChatToBlockchain({
                sessionId: sid,
                userId,
                messageHash,
                state: session.state,
                negotiationCount: session.negotiationCount,
                finalRate: session.finalRate || 0
            }).catch(err => console.error('Blockchain logging error:', err));
        }

        console.log(`[Chat] ${name} | State: ${session.state} | Negotiation: ${session.negotiationCount}`);

        res.json({ ok: true, response, sessionId: sid, state: session.state });
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== CHAT HISTORY ENDPOINTS ====================

// Get chat history for a session
app.get('/api/chat/history/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { limit = 50 } = req.query;
        
        if (!redisInitialized) {
            return res.status(503).json({ error: 'Chat history not available' });
        }
        
        const history = await getChatHistory(sessionId, parseInt(limit));
        const session = await getChatSession(sessionId);
        
        res.json({
            ok: true,
            sessionId,
            history,
            state: session?.state || 'unknown',
            messageCount: history.length
        });
    } catch (err) {
        console.error('Error fetching chat history:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get complete session state with messages (for persistence)
app.post('/api/chat/restore', async (req, res) => {
    try {
        const { sessionId, customerData } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId required' });
        }
        
        // Get session from Redis
        const session = redisInitialized ? await getChatSession(sessionId) : null;
        const history = redisInitialized ? await getChatHistory(sessionId, 100) : [];
        
        if (!session) {
            // No existing session, create new one
            return res.json({
                ok: true,
                sessionId,
                restored: false,
                session: null,
                messages: []
            });
        }
        
        // Extend TTL since user is back
        if (redisInitialized) {
            await setChatSession(sessionId, session, 86400); // Refresh 24h TTL
            await trackActiveSession(sessionId, 300);
        }
        
        console.log(`[Session Restore] ${sessionId} | State: ${session.state} | Messages: ${history.length}`);
        
        res.json({
            ok: true,
            sessionId,
            restored: true,
            session,
            messages: history,
            message: `Welcome back! Continuing from where you left off...`
        });
    } catch (err) {
        console.error('Error restoring session:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get chat analytics (admin)
app.get('/api/admin/chat-stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!redisInitialized) {
            return res.status(503).json({ error: 'Chat stats not available' });
        }
        
        const totalMessages = await getChatMetric('total_messages');
        const activeSessions = await getActiveSessionCount();
        
        res.json({
            ok: true,
            stats: {
                totalMessages,
                activeSessions,
                timestamp: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('Error fetching chat stats:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== APPLICATIONS STORAGE (MONGODB) ====================
// Supports 1000+ concurrent admins with optimistic locking

// GET user's applications
app.get('/api/user/applications', authMiddleware, async (req, res) => {
    try {
        const db = getDB();
        const applications = await db.collection('applications')
            .find({
                $or: [
                    { phone: req.user.phone },
                    { accountNumber: req.user.accountNumber },
                    { userId: req.user._id?.toString() }
                ]
            })
            .sort({ submittedAt: -1 })
            .toArray();
        
        res.json({ ok: true, applications });
    } catch (err) {
        console.error('Error fetching user applications:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET all applications (for admin) - with pagination and filtering
app.get('/api/applications', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const db = getDB();
        const { status, page = 1, limit = 50, search } = req.query;
        
        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { customerName: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { id: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [applications, total] = await Promise.all([
            db.collection('applications')
                .find(filter)
                .sort({ submittedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .toArray(),
            db.collection('applications').countDocuments(filter)
        ]);

        // Map _id to id for frontend compatibility
        const applicationsWithId = applications.map(app => ({
            ...app,
            id: app._id
        }));

        res.json({
            ok: true,
            applications: applicationsWithId,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('Error fetching applications:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update application status with OPTIMISTIC LOCKING (prevents concurrent update conflicts)
app.put('/api/applications/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, version, notes } = req.body;

        console.log(`[Update] Attempting to update application: ${id} -> ${status}`);

        if (!['pending', 'approved', 'rejected', 'disbursed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const db = getDB();
        
        // First check if document exists
        const exists = await db.collection('applications').findOne({ _id: id });
        if (!exists) {
            console.error(`[Update] Application not found: ${id}`);
            return res.status(404).json({ error: `Application ${id} not found` });
        }
        
        // Use optimistic locking with retry
        const result = await updateWithRetry(
            db,
            'applications',
            id,
            async (current) => ({
                status,
                updatedAt: new Date(),
                updatedBy: req.user.email,
                adminNotes: notes || current.adminNotes
            }),
            3 // max 3 retries
        );

        if (!result.success) {
            if (result.conflict) {
                return res.status(409).json({
                    error: 'Conflict: Another admin modified this application. Please refresh.',
                    currentVersion: result.currentVersion
                });
            }
            return res.status(400).json({ error: result.error });
        }

        // Publish event for background processing (notifications, ledger, etc.)
        await publishEvent(db, 'application:status_changed', {
            applicationId: id,
            oldStatus: result.document.status,
            newStatus: status,
            adminEmail: req.user.email,
            timestamp: new Date()
        });

        console.log(`✅ [Admin:${req.user.email}] Application ${id}: ${status} (v${result.newVersion})`);
        res.json({ ok: true, application: result.document });

    } catch (err) {
        console.error('Error updating application:', err);
        res.status(500).json({ error: err.message });
    }
});

// Batch update applications (for bulk admin actions with distributed locking)
app.post('/api/applications/batch-update', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { applicationIds, status, notes } = req.body;

        if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
            return res.status(400).json({ error: 'applicationIds array required' });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status for batch update' });
        }

        const db = getDB();
        const results = { success: [], failed: [] };

        // Process each application with distributed lock to prevent conflicts
        for (const appId of applicationIds) {
            try {
                await withLock(db, `application:${appId}`, async () => {
                    const result = await updateWithRetry(db, 'applications', appId, async () => ({
                        status,
                        updatedAt: new Date(),
                        updatedBy: req.user.email,
                        adminNotes: notes
                    }));

                    if (result.success) {
                        results.success.push(appId);
                        await publishEvent(db, 'application:status_changed', {
                            applicationId: appId,
                            newStatus: status,
                            adminEmail: req.user.email,
                            batchUpdate: true
                        });
                    } else {
                        results.failed.push({ id: appId, error: result.error });
                    }
                }, 5000);
            } catch (err) {
                results.failed.push({ id: appId, error: err.message });
            }
        }

        console.log(`✅ [Batch:${req.user.email}] Updated ${results.success.length}/${applicationIds.length}`);
        res.json({ ok: true, results });

    } catch (err) {
        console.error('Batch update error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get event queue statistics (admin monitoring)
app.get('/api/admin/queue-stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const db = getDB();
        const stats = await getQueueStats(db);
        res.json({ ok: true, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health check with DB status
app.get('/health', async (req, res) => {
    try {
        const db = getDB();
        await db.admin().ping();
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            database: 'connected'
        });
    } catch (err) {
        res.status(503).json({
            status: 'unhealthy',
            error: err.message
        });
    }
});

// ==================== BLOCKCHAIN API ENDPOINTS ====================

// Get user's master ledger (all blockchain transactions)
app.get('/api/blockchain/user/:userId/ledger', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Check authorization (user can only view their own ledger, admins can view any)
        const requestUserId = req.user.phone || req.user._id?.toString();
        if (requestUserId !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        if (!blockchainInitialized) {
            return res.status(503).json({ error: 'Blockchain not available' });
        }
        
        const ledger = await getUserMasterLedger(userId);
        res.json({ ok: true, ...ledger });
    } catch (err) {
        console.error('Error fetching blockchain ledger:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get user's complete blockchain history
app.get('/api/blockchain/user/:userId/history', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Check authorization
        const requestUserId = req.user.phone || req.user._id?.toString();
        if (requestUserId !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        if (!blockchainInitialized) {
            return res.status(503).json({ error: 'Blockchain not available' });
        }
        
        const history = await getUserCompleteHistory(userId);
        res.json({ ok: true, ...history });
    } catch (err) {
        console.error('Error fetching blockchain history:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get blockchain contract statistics (admin only)
app.get('/api/blockchain/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!blockchainInitialized) {
            return res.status(503).json({ error: 'Blockchain not available' });
        }
        
        const stats = await getBlockchainStats();
        res.json({ ok: true, ...stats });
    } catch (err) {
        console.error('Error fetching blockchain stats:', err);
        res.status(500).json({ error: err.message });
    }
});

// Generate master contract JSON and upload to IPFS
app.post('/api/blockchain/user/:userId/master-contract', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { regenerate = false } = req.body;
        
        // Check authorization
        const requestUserId = req.user.phone || req.user._id?.toString();
        if (requestUserId !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        if (!blockchainInitialized) {
            return res.status(503).json({ error: 'Blockchain not available' });
        }
        
        const result = regenerate 
            ? await generateAndUploadMasterContract(userId)
            : await getMasterContract(userId);
        
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }
        
        res.json({
            ok: true,
            masterContract: result.masterContract,
            ipfsHash: result.ipfsHash,
            ipfsUrl: result.ipfsUrl,
            localPath: result.localPath,
            source: result.source || 'generated',
            message: 'Master contract generated and uploaded to IPFS/Pinata'
        });
    } catch (err) {
        console.error('Error generating master contract:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get master contract (cached or generate new)
app.get('/api/blockchain/user/:userId/master-contract', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Check authorization
        const requestUserId = req.user.phone || req.user._id?.toString();
        if (requestUserId !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        if (!blockchainInitialized) {
            return res.status(503).json({ error: 'Blockchain not available' });
        }
        
        const result = await getMasterContract(userId);
        
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }
        
        res.json({
            ok: true,
            masterContract: result.masterContract,
            ipfsHash: result.ipfsHash,
            ipfsUrl: result.ipfsUrl,
            source: result.source || 'cache'
        });
    } catch (err) {
        console.error('Error fetching master contract:', err);
        res.status(500).json({ error: err.message });
    }
});

// Readiness check (for Kubernetes)
app.get('/ready', async (req, res) => {
    if (dbInitialized) {
        res.status(200).json({
            ready: true,
            services: {
                mongodb: true,
                redis: redisInitialized,
                blockchain: blockchainInitialized
            }
        });
    } else {
        res.status(503).json({ ready: false });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server listening at http://localhost:${port}`);
    console.log(`📊 Health: http://localhost:${port}/health`);
    console.log(`🔄 Ready: http://localhost:${port}/ready`);
    console.log(`⚡ Scalability: Optimistic locking + Event queue enabled`);
    console.log(`💬 Chat: ${redisInitialized ? 'Redis Streams enabled' : 'Fallback mode (no Redis)'}`);
    console.log(`🔗 Blockchain: ${blockchainInitialized ? 'Ethereum ledger active (immutable audit)' : 'JSON fallback mode'}`);
});

