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
    logDisbursementToBlockchain,
    logPaymentToBlockchain,
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

// Agents (kept for direct use in /payment endpoint)
const { detectLoanIntent, presentAndNegotiateOffer } = require('./agents/masterAgent');
const { collectUserData } = require('./agents/dataAgent');
const { verifyKYC } = require('./agents/verificationAgent');
const { analyzeCredit } = require('./agents/creditAgent');
const { evaluateRiskAndPrice } = require('./agents/underwritingAgent');
const { executeApproval } = require('./agents/approvalAgent');
const { generateSanctionLetter } = require('./agents/documentAgent');
const { disburseFunds } = require('./agents/disbursementAgent');
const { logEmiPayment } = require('./agents/monitoringAgent');
const { handleNegotiation } = require('./agents/negotiationAgent');
const { detectIntent } = require('./agents/intentDetectionAgent');
const { handleAcceptance } = require('./agents/acceptanceAgent');

// LangGraph Orchestration & Conversational AI
const { runLoanGraph } = require('./orchestration/agentGraph');
const { generateChatResponse, generateOffTopicResponse } = require('./conversational/responseGenerator');

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
const publicUploadDir = path.join(__dirname, 'uploads', 'public');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(publicUploadDir)) fs.mkdirSync(publicUploadDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            // Live photos go to public folder (accessible via URL for admin)
            // Other docs stay private
            if (file.fieldname === 'livePhoto') {
                cb(null, publicUploadDir);
            } else {
                cb(null, uploadDir);
            }
        },
        filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
    }),
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Serve public uploads (live photos only) - sensitive docs remain private
// Add CORS headers specifically for uploads to allow admin page to load images
app.use('/uploads/public', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(publicUploadDir));

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
    console.log('🔥🔥🔥 [Server.js] /api/auth/send-otp endpoint HIT 🔥🔥🔥');
    try {
        const { name, accountNumber, phone } = req.body;
        console.log(`[Server.js] About to call sendOTP with: name=${name}, accountNumber=${accountNumber}, phone=${phone}`);
        const result = await sendOTP({ name, accountNumber, phone });
        console.log(`[Server.js] sendOTP returned:`, result);
        res.json({ ok: true, message: result.message, otpHash: result.otpHash }); // Return hash instead of OTP
    } catch (err) {
        console.error(`[Server.js] ERROR in send-otp:`, err);
        res.status(400).json({ error: err.message });
    }
});

// 2. Verify OTP & Login (User Login Step 2)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, otp, accountNumber } = req.body;
        console.log(`[Auth] Login attempt: phone=${phone}, accountNumber=${accountNumber}`);
        const { token, user } = await verifyLoginOTP({ phone, otp, accountNumber });
        console.log(`✅ [Auth] Login successful: userId=${user._id || user.phone}, email=${user.email}`);
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
    try {
        const { message, userData } = req.body;
        const userId = userData.phone || userData.accountNumber || userData.userId || 'unknown';

        // ─── Run LangGraph orchestration ───
        const finalState = await runLoanGraph({ message, userData });

        // Check if the graph ended with a rejection
        if (finalState.status === 'rejected' || !finalState.loanId) {
            return res.status(200).json({
                status: 'rejected',
                reason: finalState.rejectionReason || finalState.error || 'Application not approved',
                cids: finalState.cids || []
            });
        }

        // ─── Post-graph: Blockchain master contract (unchanged) ───
        if (blockchainInitialized) {
            try {
                await logApplicationToBlockchain({
                    applicationId: finalState.loanId,
                    userId: userId,
                    customerName: userData.name || 'Customer',
                    loanAmount: finalState.negotiatedOffer?.loanAmount || userData.loanAmount,
                    interestRate: finalState.negotiatedOffer?.interestRate,
                    approvalScore: finalState.creditData?.cibilScore,
                    status: 'accepted',
                    documentHash: finalState.sanctionCid
                });

                await logChatToBlockchain({
                    sessionId: finalState.sessionId,
                    userId,
                    message: 'Loan accepted via LangGraph',
                    state: 'accepted',
                    negotiationCount: 0,
                    finalRate: finalState.negotiatedOffer?.interestRate
                });
            } catch (error) {
                console.error('Blockchain logging error:', error.message);
            }

            // Generate master contract after blockchain confirmations
            setTimeout(async () => {
                try {
                    console.log(`📄 Generating master contract for ${userId}...`);
                    const masterResult = await generateAndUploadMasterContract(userId);
                    if (masterResult.success) {
                        console.log(`✅ Master contract uploaded to IPFS: ${masterResult.ipfsHash}`);
                        console.log(`   📂 View at: ${masterResult.ipfsUrl}`);
                    }
                } catch (error) {
                    console.error('Master contract generation error:', error.message);
                }
            }, 3000);
        }

        res.status(200).json({
            status: 'approved',
            loanId: finalState.loanId,
            cids: finalState.cids || []
        });

    } catch (error) {
        console.error('Loan processing failed:', error);
        res.status(500).json({ status: 'error', message: error.message, cids: [] });
    }
});

// Endpoint for post-loan monitoring
app.post('/payment', async (req, res) => {
    try {
        const { loanId, paymentData } = req.body;
        const userId = paymentData.phone || paymentData.accountNumber || paymentData.userId || (req.user ? (req.user.phone || req.user._id?.toString()) : 'unknown');
        const result = await logEmiPayment(loanId, paymentData, userId);
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
    { name: 'salarySlip', maxCount: 1 },
    { name: 'livePhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        const files = req.files || {};
        const results = {};

        // Parse each document
        if (files.aadhaar?.[0]) {
            results.aadhaar = await parseAadhaar(files.aadhaar[0].path);
            console.log(`\n${'='.repeat(70)}`);
            console.log(`📄 AADHAAR EXTRACTION RESULT`);
            console.log(`${'='.repeat(70)}`);
            console.log(`File: ${files.aadhaar[0].originalname}`);
            console.log(`\n🔤 RAW OCR TEXT OUTPUT:`);
            console.log(`${'-'.repeat(70)}`);
            console.log(results.aadhaar.rawText || 'No text extracted');
            console.log(`${'-'.repeat(70)}`);
            console.log(`\n📊 PARSED DATA:`);
            console.log(`Aadhaar Number: ${results.aadhaar.aadhaar || 'Not found'}`);
            console.log(`Name: ${results.aadhaar.name || 'Not found'}`);
            console.log(`Address: ${results.aadhaar.address || 'Not found'}`);
            console.log(`DOB: ${results.aadhaar.dateOfBirth || 'Not found'}`);
            console.log(`Confidence: ${(results.aadhaar.confidence * 100).toFixed(0)}%`);
            console.log(`${'='.repeat(70)}\n`);
        }
        if (files.pan?.[0]) {
            results.pan = await parsePAN(files.pan[0].path);
            console.log(`\n${'='.repeat(70)}`);
            console.log(`📄 PAN EXTRACTION RESULT`);
            console.log(`${'='.repeat(70)}`);
            console.log(`File: ${files.pan[0].originalname}`);
            console.log(`\n🔤 RAW OCR TEXT OUTPUT:`);
            console.log(`${'-'.repeat(70)}`);
            console.log(results.pan.rawText || 'No text extracted');
            console.log(`${'-'.repeat(70)}`);
            console.log(`\n📊 PARSED DATA:`);
            console.log(`PAN Number: ${results.pan.pan || 'Not found'}`);
            console.log(`Name: ${results.pan.name || 'Not found'}`);
            console.log(`Valid Format: ${results.pan.isValidFormat ? 'YES ✅' : 'NO ❌'}`);
            console.log(`Confidence: ${(results.pan.confidence * 100).toFixed(0)}%`);
            console.log(`${'='.repeat(70)}\n`);
        }
        if (files.bankStatement?.[0]) {
            results.bankStatement = await parseBankStatement(files.bankStatement[0].path);
            console.log(`\n${'='.repeat(70)}`);
            console.log(`📄 BANK STATEMENT EXTRACTION RESULT`);
            console.log(`${'='.repeat(70)}`);
            console.log(`File: ${files.bankStatement[0].originalname}`);
            console.log(`\n🔤 RAW OCR TEXT OUTPUT:`);
            console.log(`${'-'.repeat(70)}`);
            console.log(results.bankStatement.rawText || 'No text extracted');
            console.log(`${'-'.repeat(70)}`);
            console.log(`\n📊 PARSED DATA:`);
            console.log(`Account Number: ${results.bankStatement.accountNumber || 'Not found'}`);
            console.log(`Account Holder: ${results.bankStatement.accountHolderName || 'Not found'}`);
            console.log(`Bank: ${results.bankStatement.bankName || 'Not found'}`);
            console.log(`IFSC: ${results.bankStatement.ifscCode || 'Not found'}`);
            console.log(`Estimated Salary: ₹${results.bankStatement.estimatedMonthlySalary || 'N/A'}`);
            console.log(`Confidence: ${(results.bankStatement.confidence * 100).toFixed(0)}%`);
            console.log(`${'='.repeat(70)}\n`);
        }
        if (files.salarySlip?.[0]) {
            results.salarySlip = await parseSalarySlip(files.salarySlip[0].path);
            console.log(`\n${'='.repeat(70)}`);
            console.log(`📄 SALARY SLIP EXTRACTION RESULT`);
            console.log(`${'='.repeat(70)}`);
            console.log(`File: ${files.salarySlip[0].originalname}`);
            console.log(`\n🔤 RAW OCR TEXT OUTPUT:`);
            console.log(`${'-'.repeat(70)}`);
            console.log(results.salarySlip.rawText || 'No text extracted');
            console.log(`${'-'.repeat(70)}`);
            console.log(`\n📊 PARSED DATA:`);
            console.log(`Employee Name: ${results.salarySlip.employeeName || 'Not found'}`);
            console.log(`Basic Salary: ₹${results.salarySlip.basicSalary || 'N/A'}`);
            console.log(`Gross Salary: ₹${results.salarySlip.grossSalary || 'N/A'}`);
            console.log(`Net Salary: ₹${results.salarySlip.netSalary || 'N/A'}`);
            console.log(`Confidence: ${(results.salarySlip.confidence * 100).toFixed(0)}%`);
            console.log(`${'='.repeat(70)}\n`);
        }

        // ==================== COMPLETE OCR EXTRACTION SUMMARY ====================
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📋 COMPLETE OCR EXTRACTION SUMMARY`);
        console.log(`${'='.repeat(80)}`);

        if (results.aadhaar) {
            console.log(`\n🆔 AADHAAR CARD:`);
            console.log(`   Number: ${results.aadhaar.aadhaar || 'Not found'}`);
            console.log(`   Name: ${results.aadhaar.name || 'Not found'}`);
            console.log(`   Address: ${results.aadhaar.address || 'Not found'}`);
            console.log(`   DOB: ${results.aadhaar.dateOfBirth || 'Not found'}`);
            console.log(`   Gender: ${results.aadhaar.gender || 'Not found'}`);
            console.log(`   Confidence: ${(results.aadhaar.confidence * 100).toFixed(0)}%`);
        }

        if (results.pan) {
            console.log(`\n💳 PAN CARD:`);
            console.log(`   PAN Number: ${results.pan.pan || 'Not found'}`);
            console.log(`   Name: ${results.pan.name || 'Not found'}`);
            console.log(`   Father's Name: ${results.pan.fatherName || 'Not found'}`);
            console.log(`   DOB: ${results.pan.dateOfBirth || 'Not found'}`);
            console.log(`   Valid Format: ${results.pan.isValidFormat ? 'YES ✅' : 'NO ❌'}`);
            console.log(`   Confidence: ${(results.pan.confidence * 100).toFixed(0)}%`);
        }

        if (results.bankStatement) {
            console.log(`\n🏦 BANK STATEMENT:`);
            console.log(`   Account Number: ${results.bankStatement.accountNumber || 'Not found'}`);
            console.log(`   Account Holder: ${results.bankStatement.accountHolderName || 'Not found'}`);
            console.log(`   Bank Name: ${results.bankStatement.bankName || 'Not found'}`);
            console.log(`   IFSC Code: ${results.bankStatement.ifscCode || 'Not found'}`);
            console.log(`   Estimated Monthly Salary: ₹${results.bankStatement.estimatedMonthlySalary || 'N/A'}`);
            console.log(`   Confidence: ${(results.bankStatement.confidence * 100).toFixed(0)}%`);
        }

        if (results.salarySlip) {
            console.log(`\n💰 SALARY SLIP:`);
            console.log(`   Employee Name: ${results.salarySlip.employeeName || 'Not found'}`);
            console.log(`   Basic Salary: ₹${results.salarySlip.basicSalary || 'N/A'}`);
            console.log(`   Gross Salary: ₹${results.salarySlip.grossSalary || 'N/A'}`);
            console.log(`   Net Salary: ₹${results.salarySlip.netSalary || 'N/A'}`);
            console.log(`   Confidence: ${(results.salarySlip.confidence * 100).toFixed(0)}%`);
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 EXTRACTION STATISTICS:`);
        console.log(`   Total Documents Processed: ${Object.keys(results).length}`);
        console.log(`   Documents: ${Object.keys(results).join(', ')}`);
        const avgConfidence = Object.values(results).reduce((sum, doc) => sum + (doc.confidence || 0), 0) / Object.keys(results).length;
        console.log(`   Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
        console.log(`${'='.repeat(80)}\n`);

        // Perform fraud check with customer data for salary verification
        const fraudCheck = performFraudCheck(results, req.body.customerData);

        // Include live photo path if uploaded (goes to results.livePhoto for admin)
        if (files.livePhoto?.[0]) {
            results.livePhoto = `/uploads/public/${files.livePhoto[0].filename}`;
            console.log(`📸 Live photo saved: ${results.livePhoto}`);
        }

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

        console.log(`\n${'='.repeat(70)}`);
        console.log(`💰 APPROVAL SCORE CALCULATION`);
        console.log(`${'='.repeat(70)}`);
        console.log(`Customer: ${customerData.name || 'N/A'}`);
        console.log(`Phone: ${customerData.phone || 'N/A'}`);
        console.log(`Monthly Salary: ₹${customerData.monthlySalary || 50000}`);
        console.log(`Requested Loan: ₹${loanAmount}`);
        console.log(`Existing EMI: ₹${customerData.existingEMI || 0}`);
        console.log(`Documents Provided: ${Object.keys(documents).join(', ') || 'None'}`);

        const score = calculateApprovalScore(customerData, documents, loanAmount);
        const limit = calculatePreApprovedLimit(
            score.score,
            customerData.monthlySalary || 50000,
            customerData.existingEMI || 0
        );

        console.log(`\n📊 SCORE BREAKDOWN (from creditScore.js):`);
        console.log(`   Final Score: ${score.score}/900`);
        console.log(`   Grade: ${score.grade}`);
        console.log(`   Risk Level: ${score.riskLevel}`);
        console.log(`   Eligible for Loan: ${score.eligibleForLoan ? 'YES ✅' : 'NO ❌'}`);
        if (score.breakdown) {
            console.log(`\n   Component Scores:`);
            Object.entries(score.breakdown).forEach(([key, value]) => {
                console.log(`     - ${key}: ${value.score}/${value.maxScore} (weight: ${value.weight}%)`);
            });
        }
        console.log(`\n💳 PRE-APPROVED LIMIT:`);
        console.log(`   Max Loan: ₹${limit.limit.toLocaleString()}`);
        console.log(`   Interest Rate: ${limit.interestRate}%`);
        console.log(`   Max EMI: ₹${limit.maxEMI.toLocaleString()}`);
        console.log(`${'='.repeat(70)}\n`);

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
        const { message, customerData, creditScore, sessionId, documents } = req.body;

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
        const score = creditScore?.creditScore?.score || creditScore?.score || creditScore?.approvalScore?.score || 650; // Use 650 (min eligible) as fallback
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
            (session.state === 'intro' && lower.length <= 10) || // Allow short greetings in intro state
            ((session.state === 'offered' || session.state === 'negotiating') && /^\s*[\d,.\s]+\s*(lakh|lac|lakhs|lacs|l|k|thousand)?\s*$/i.test(lower)); // Allow plain numbers in active session

        if (!isLoanRelated) {
            // Reject off-topic queries with LLM-generated polite redirect
            const response = await generateOffTopicResponse(message, name);

            if (redisInitialized) {
                await addChatMessage(sid, { role: 'bot', content: response });
                await publishChatEvent(sid, 'bot_response', { response, state: 'off_topic' });
            }

            console.log(`[Chat] ${name} | Off-topic message rejected: "${message}"`);
            return res.json({ ok: true, response, sessionId: sid, state: session.state, warning: 'off_topic' });
        }

        // ─── AGENTIC INTENT-BASED ROUTING ───
        // Use LLM to detect intent instead of hardcoded keyword matching
        let response;
        let actionTaken = '';
        let updatedLoanAmount = null;

        // Get conversation history from Redis for context
        let conversationHistory = [];
        if (redisInitialized) {
            try {
                conversationHistory = await getChatHistory(sid, 6);
            } catch (e) { /* ignore */ }
        }

        // Always use intent detection (Agentic approach)
        let detectedIntent = null;
        try {
            console.log(`[Chat] Detecting intent for: "${message.substring(0, 100)}"`);
            detectedIntent = await detectIntent(message, session.state, name);
            console.log(`[Chat] Detected intent: ${detectedIntent.intent} (confidence: ${detectedIntent.confidence})`);
        } catch (error) {
            console.error('[Chat] Intent detection failed:', error.message);
            // Fallback: continue with safe default
            detectedIntent = { intent: 'unknown', confidence: 'low', contextFlags: { isOffTopic: false } };
        }

        // Route based on detected intent
        const intent = detectedIntent.intent;
        const flags = detectedIntent.contextFlags || {};

        if (session.state === 'accepted') {
            // Already accepted — inform the user
            actionTaken = `The customer's loan application has already been submitted. Reference ID: LOAN-${sid.slice(-8)}. Status: Under Review. Tell them to wait for admin approval.`;
        } else if (intent === 'negotiate_rate' || flags.isNegotiation) {
            // ⚠️ USE INTELLIGENT NEGOTIATION AGENT - GenAI-driven
            console.log(`[Chat] Processing negotiation request...`);
            const negotiationResult = await handleNegotiation(sid, {
                customerName: name,
                creditScore: score,
                requestedAmount,
                preApprovedLimit,
                baseRate,
                adjustedRate,
                currentRate: parseFloat(session.finalRate || adjustedRate),
                negotiationCount: session.negotiationCount || 0,
                negotiationHistory: session.negotiationHistory || [],
                userRequest: message
            });

            if (!negotiationResult.success) {
                actionTaken = `Negotiation request processed. ${negotiationResult.reasoning}`;
            } else {
                const recommendation = negotiationResult.recommendation;
                
                if (recommendation === 'final_offer' || recommendation === 'decline') {
                    session.state = 'finalOffer';
                    if (!session.negotiationHistory) session.negotiationHistory = [];
                    actionTaken = `FINAL OFFER ONLY - DO NOT SAY APPROVED. The bot has calculated a final negotiated rate and is presenting it. Next action: Customer must explicitly say YES to accept. Current offer details: New Interest Rate: ${negotiationResult.newRate}%. Agent reasoning: ${negotiationResult.reasoning}. Offer message to communicate: ${negotiationResult.message}`;
                } else if (recommendation === 'reduce') {
                    session.state = 'negotiating';
                    session.negotiationCount = (session.negotiationCount || 0) + 1;
                    const oldRate = session.finalRate || adjustedRate;
                    session.finalRate = negotiationResult.newRate.toFixed(2);
                    if (!session.negotiationHistory) session.negotiationHistory = [];
                    session.negotiationHistory.push({
                        fromRate: parseFloat(oldRate),
                        toRate: negotiationResult.newRate,
                        reason: negotiationResult.reasoning
                    });
                    actionTaken = `RATE REDUCTION OFFER - AWAITING CONFIRMATION. The interest rate has been reduced. Current state: ${session.state}. Do NOT say the application is approved. Tell the customer the new offer: Interest Rate: ${negotiationResult.newRate}% (reduced from ${oldRate}%). Then ask them to confirm: 'Would you like to accept this offer?' Agent reasoning: ${negotiationResult.reasoning}. Offer details: ${negotiationResult.message}`;
                } else {
                    actionTaken = `Negotiation processing result: ${negotiationResult.reasoning}. Offer to present: ${negotiationResult.message}`;
                }
            }
        } else if (intent === 'accept_offer' || flags.isConfirmation) {
            // ⚠️ USE INTELLIGENT ACCEPTANCE AGENT - GenAI-driven validation
            console.log(`[Chat] Processing acceptance...`);
            try {
                const acceptanceResult = await handleAcceptance(sid, {
                    customerName: name,
                    sessionState: session.state,
                    currentRate: parseFloat(session.finalRate || adjustedRate),
                    requestedAmount,
                    approvedAmount: finalAmount,
                    preApprovedLimit,
                    creditScore: score,
                    negotiationHistory: session.negotiationHistory || []
                });

                if (acceptanceResult.isValidAcceptance) {
                    console.log(`[Chat] ✅ Acceptance validated by agent`);
                    session.state = 'accepted';
                    session.finalRate = session.finalRate || currentRate;
                    session.finalAmount = finalAmount;
                    actionTaken = `The customer ACCEPTED the loan offer. Reference ID: LOAN-${sid.slice(-8)}. Applied Amount: ₹${requestedAmount.toLocaleString()}. Approved Amount: ₹${finalAmount.toLocaleString()}. Max Limit: ₹${preApprovedLimit.toLocaleString()}. Final Interest Rate: ${session.finalRate}%. Congratulate them warmly and summarize the approved details. Include reference ID and tell them they'll receive confirmation shortly.`;
                } else {
                    console.log(`[Chat] ⚠️ Acceptance not validated: ${acceptanceResult.reasoning}`);
                    actionTaken = acceptanceResult.message || `Thank you for your interest. Could you please clarify your confirmation?`;
                }
            } catch (error) {
                console.error('[Chat] Acceptance agent error:', error.message);
                // Fallback to strict validation
                if ((session.state === 'negotiating' || session.state === 'offered' || session.state === 'finalOffer') 
                    && (lower.includes('yes') || lower.includes('accept') || lower.includes('proceed') || lower.includes('go ahead'))) {
                    session.state = 'accepted';
                    session.finalRate = session.finalRate || currentRate;
                    session.finalAmount = finalAmount;
                    actionTaken = `The customer ACCEPTED the loan offer. Reference ID: LOAN-${sid.slice(-8)}. Applied Amount: ₹${requestedAmount.toLocaleString()}. Approved Amount: ₹${finalAmount.toLocaleString()}. Max Limit: ₹${preApprovedLimit.toLocaleString()}. Final Interest Rate: ${session.finalRate}%. Congratulate them warmly and summarize the approved details. Include reference ID and tell them they'll receive confirmation shortly.`;
                } else {
                    actionTaken = `Thank you for your response. Could you please confirm: Do you accept the loan offer at ${session.finalRate || adjustedRate}% interest for ₹${finalAmount.toLocaleString()}?`;
                }
            }
        } else if (intent === 'change_amount' || flags.isAmountChange) {
            // ⚠️ Amount change - parse with intelligent extraction
            console.log(`[Chat] Processing amount change request...`);
            const amountMatch = message.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(lakh|lac|thousand|lakhs|lacs)?\b/i);
            let newAmount = null;
            if (amountMatch) {
                let extractedNum = parseFloat(amountMatch[1].replace(/,/g, ''));
                const unitStr = (amountMatch[2] || '').toLowerCase();
                if (unitStr) {
                    if (unitStr.includes('lakh') || unitStr.includes('lac')) extractedNum *= 100000;
                    else if (unitStr.includes('thousand')) extractedNum *= 1000;
                }
                const shortUnitMatch = message.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*([lLkK])\b/);
                if (shortUnitMatch && !unitStr) {
                    extractedNum = parseFloat(shortUnitMatch[1].replace(/,/g, ''));
                    const shortUnit = shortUnitMatch[2].toLowerCase();
                    if (shortUnit === 'l') extractedNum *= 100000;
                    else if (shortUnit === 'k') extractedNum *= 1000;
                }
                newAmount = Math.round(extractedNum);
            }
            if (newAmount && newAmount > 0 && newAmount <= preApprovedLimit) {
                const newUtilization = (newAmount / preApprovedLimit) * 100;
                let newRate = baseRate;
                if (newUtilization <= 50) newRate = baseRate - 2;
                else if (newUtilization <= 75) newRate = baseRate - 1;
                session.finalRate = newRate;
                session.updatedLoanAmount = newAmount;
                updatedLoanAmount = newAmount;
                actionTaken = `Customer changed loan amount to ₹${newAmount.toLocaleString()}. New rate: ${newRate.toFixed(1)}%. Utilization: ${newUtilization.toFixed(0)}%. Max limit: ₹${preApprovedLimit.toLocaleString()}. Confirm the update and present the revised offer.`;
            } else if (newAmount && newAmount > preApprovedLimit) {
                actionTaken = `Customer requested ₹${newAmount.toLocaleString()} which EXCEEDS the pre-approved limit of ₹${preApprovedLimit.toLocaleString()}. Politely inform them and ask for a lower amount.`;
            } else {
                actionTaken = `Customer wants to change the loan amount but didn't specify a valid number. Ask them to provide the new amount. Their max limit is ₹${preApprovedLimit.toLocaleString()}.`;
            }
        } else if (intent === 'off_topic' || flags.isOffTopic) {
            // Off-topic query - reject politely
            console.log(`[Chat] Off-topic detected by intent classification`);
            response = await generateOffTopicResponse(message, name);
            if (redisInitialized) {
                await addChatMessage(sid, { role: 'bot', content: response });
                await publishChatEvent(sid, 'bot_response', { response, state: 'off_topic' });
            }
            return res.json({ ok: true, response, sessionId: sid, state: session.state, warning: 'off_topic' });
        } else if (intent === 'query_terms' || intent === 'clarification') {
            // Customer asking questions - let LLM answer
            console.log(`[Chat] Customer query/clarification detected`);
            actionTaken = `Customer is asking about loan terms or clarifying details. Answer their question clearly based on current offer: Rate ${session.finalRate || adjustedRate}%, Amount ₹${finalAmount.toLocaleString()}, Limit ₹${preApprovedLimit.toLocaleString()}.`;
        } else {
            // Unknown or greeting intent
            console.log(`[Chat] Default/greeting intent: ${intent}`);
            if (session.state === 'offered' || session.state === 'negotiating') {
                actionTaken = `Customer message doesn't fit standard patterns. Current state: ${session.state}. Remind them of the current offer: Interest Rate ${session.finalRate || adjustedRate}%, Amount ₹${finalAmount.toLocaleString()}. Ask if they want to accept or negotiate further.`;
            } else {
                actionTaken = `The customer just arrived or said a greeting. Present their loan offer: Credit Score ${score}, Pre-Approved Limit ₹${preApprovedLimit.toLocaleString()}, Interest Rate ${currentRate}%. Ask if they want to accept or negotiate.`;
            }
        }

        // Generate natural LLM response based on the action taken
        response = await generateChatResponse({
            userMessage: message,
            customerData: { name, monthlySalary: salary, loanAmount: requestedAmount, ...customerData },
            creditScore: { score, preApprovedLimit: { limit: preApprovedLimit, interestRate: baseRate } },
            sessionState: session,
            conversationHistory,
            actionTaken,
        });

        // ⚠️ CRITICAL: Save session state to Redis immediately after any state change
        // This ensures the negotiation/offer state is persisted for the next message
        if (redisInitialized) {
            await setChatSession(sid, session, 86400);
            await addChatMessage(sid, { role: 'bot', content: response });
            await publishChatEvent(sid, 'bot_response', { response, state: session.state });
        }

        // If we have an updated loan amount, return it to the frontend
        if (updatedLoanAmount) {
            return res.json({ ok: true, response, sessionId: sid, state: session.state, updatedLoanAmount });
        }

        // If accepted, store the application with EMI schedule
        // ⚠️ CRITICAL: Only proceed if state is explicitly 'accepted' - NOT 'negotiating' or 'offered'
        console.log(`[Chat] State check before storing: state='${session.state}', applicationStored=${session.applicationStored}`);
        
        if (session.state === 'accepted' && !session.applicationStored) {
            console.log(`[Chat] ✅ STORING APPLICATION - Customer has explicitly accepted at rate ${session.finalRate}%`);
            const finalRate = parseFloat(session.finalRate || adjustedRate);
            const approvedAmount = session.finalAmount || finalAmount;
            const emiData = generateEMISchedule(approvedAmount, finalRate, 36);

            const userId = customerData?.phone || customerData?.accountNumber || 'N/A';

            const app = {
                _id: `LOAN-${sid.slice(-8)}`,
                userId: userId,
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
                documents: {
                    aadhaar: documents?.aadhaar || null,
                    pan: documents?.pan || null,
                    bankStatement: documents?.bankStatement || null,
                    salarySlip: documents?.salarySlip || null,
                    livePhoto: documents?.livePhoto || null
                },
                emi: emiData.emi,
                nextEmiDate: emiData.schedule[0]?.dueDate,
                emiSchedule: emiData.schedule,
                version: 1
            };

            // Store in MongoDB
            const db = getDB();
            await db.collection('applications').insertOne(app);

            // Log to blockchain (immutable record)
            if (blockchainInitialized) {
                try {
                    console.log(`🔗 [Blockchain] Starting transaction logging for ${userId}...`);

                    // Helper to delay between transactions (avoid rate limiting)
                    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

                    // 1. Log application/loan
                    console.log(`  [1/6] Logging application...`);
                    const appResult = await logApplicationToBlockchain({
                        applicationId: app._id,
                        userId: userId,
                        customerName: name,
                        loanAmount: approvedAmount,
                        interestRate: finalRate,
                        approvalScore: score,
                        status: 'accepted',
                        documentHash: ''
                    });
                    console.log(`  [1/6] Application: ${appResult.success ? '✅' : '❌'} ${appResult.transactionHash || appResult.error || ''}`);
                    await delay(1500); // Wait 1.5s to avoid rate limiting

                    // 2. Log documents (KYC)
                    console.log(`  [2/6] Logging PAN document...`);
                    const panResult = await logDocumentToBlockchain({
                        documentId: `PAN_${sid}_${Date.now()}`,
                        userId: userId,
                        documentType: 'pan',
                        verified: true,
                        extractedData: { pan: customerData?.pan || 'XXXXXX1234' },
                        ipfsHash: `ipfs_pan_${sid}`
                    });
                    console.log(`  [2/6] PAN: ${panResult.success ? '✅' : '❌'} ${panResult.transactionHash || panResult.error || ''}`);
                    await delay(1500);

                    console.log(`  [3/6] Logging Aadhaar document...`);
                    const aadhaarResult = await logDocumentToBlockchain({
                        documentId: `AADHAAR_${sid}_${Date.now()}`,
                        userId: userId,
                        documentType: 'aadhaar',
                        verified: true,
                        extractedData: { aadhaar: customerData?.aadhaar || 'XXXX XXXX 1234' },
                        ipfsHash: `ipfs_aadhaar_${sid}`
                    });
                    await delay(1500);
                    console.log(`  [3/6] Aadhaar: ${aadhaarResult.success ? '✅' : '❌'} ${aadhaarResult.transactionHash || aadhaarResult.error || ''}`);

                    // 3. Log credit score
                    console.log(`  [4/6] Logging credit score...`);
                    const grade = score >= 750 ? 'A+' : score >= 700 ? 'A' : score >= 650 ? 'B' : score >= 600 ? 'C' : 'D';
                    const creditResult = await logCreditScoreToBlockchain({
                        userId: userId,
                        score: score,
                        grade: grade,
                        preApprovedLimit: preApprovedLimit
                    });
                    await delay(1500);
                    console.log(`  [4/6] Credit: ${creditResult.success ? '✅' : '❌'} ${creditResult.transactionHash || creditResult.error || ''}`);

                    // 4. Log disbursement
                    console.log(`  [5/6] Logging disbursement...`);
                    const disburseResult = await logDisbursementToBlockchain({
                        loanId: app._id,
                        userId: userId,
                        amount: approvedAmount,
                        recipientAccount: customerData?.accountNumber || userId,
                        transactionId: `TXN_${sid}_${Date.now()}`
                    });
                    await delay(1500);
                    console.log(`  [5/6] Disbursement: ${disburseResult.success ? '✅' : '❌'} ${disburseResult.transactionHash || disburseResult.error || ''}`);

                    // 5. Log first EMI (pending status)
                    console.log(`  [6/6] Logging first EMI...`);
                    const emiAmount = parseFloat(emiData.emi);
                    const emiResult = await logPaymentToBlockchain({
                        loanId: app._id,
                        userId: userId,
                        emiNumber: 1,
                        amount: emiAmount,
                        principalPaid: emiAmount * 0.7,
                        interestPaid: emiAmount * 0.3,
                        status: 'pending',
                        receiptHash: `emi_1_${app._id}`
                    });
                    console.log(`  [6/6] EMI: ${emiResult.success ? '✅' : '❌'} ${emiResult.transactionHash || emiResult.error || ''}`);
                    await delay(1500);

                    // 7. Log chat interaction
                    const chatResult = await logChatToBlockchain({
                        sessionId: sid,
                        userId: userId,
                        message: 'Loan accepted',
                        state: 'accepted',
                        negotiationCount: session.negotiationCount,
                        finalRate: finalRate
                    });
                    console.log(`  [+] Chat: ${chatResult.success ? '✅' : '❌'} ${chatResult.transactionHash || chatResult.error || ''}`);

                    console.log(`✅ All blockchain transactions completed for ${userId}`);

                    // **HYBRID MODE**: Generate master contract using LOCAL DATA + transaction hashes
                    // This avoids querying blockchain (which hits rate limits) - uses MongoDB data instead
                    console.log(`📄 [Hybrid] Generating master contract immediately using local data...`);
                    const localData = {
                        application: {
                            _id: app._id,
                            requestedAmount: requestedAmount,
                            approvedAmount: approvedAmount,
                            interestRate: adjustedRate,
                            finalRate: finalRate,
                            creditScore: score,
                            preApprovedLimit: preApprovedLimit,
                            status: 'accepted',
                            sessionId: sid,
                            acceptedAt: new Date().toISOString(),
                            negotiationRound: session.negotiationCount || 0
                        },
                        customer: {
                            name: name,
                            phone: userId,
                            pan: customerData?.pan || 'XXXXXX1234',
                            aadhaar: customerData?.aadhaar || 'XXXX XXXX 1234',
                            accountNumber: customerData?.accountNumber || userId
                        },
                        creditScore: {
                            score: score,
                            grade: grade
                        },
                        emiData: emiData,
                        txHashes: {
                            application: appResult.transactionHash || 'pending',
                            pan: panResult.transactionHash || 'pending',
                            aadhaar: aadhaarResult.transactionHash || 'pending',
                            credit: creditResult.transactionHash || 'pending',
                            disbursement: disburseResult.transactionHash || 'pending',
                            emi: emiResult.transactionHash || 'pending',
                            chat: chatResult.transactionHash || 'pending'
                        }
                    };

                    // Generate master contract using hybrid mode (local data + tx hashes)
                    const masterResult = await generateAndUploadMasterContract(userId, localData);
                    if (masterResult.success) {
                        console.log(`✅ Master contract (hybrid) uploaded to IPFS: ${masterResult.ipfsHash}`);
                        console.log(`   📂 View at: ${masterResult.ipfsUrl}`);

                        // Update application with IPFS link (non-blocking, best-effort)
                        try {
                            const updateResult = await db.collection('applications').updateOne(
                                {
                                    _id: app._id,
                                    status: 'accepted'
                                },
                                {
                                    $set: {
                                        masterContractIPFS: masterResult.ipfsHash,
                                        masterContractUrl: masterResult.ipfsUrl,
                                        blockchainTxHashes: localData.txHashes // Store tx hashes for future verification
                                    }
                                }
                            );

                            if (updateResult.modifiedCount === 0) {
                                console.log('ℹ️  IPFS link not updated (status changed or document modified). Attempting unguarded update...');
                                try {
                                    const forceUpdate = await db.collection('applications').updateOne(
                                        { _id: app._id },
                                        {
                                            $set: {
                                                masterContractIPFS: masterResult.ipfsHash,
                                                masterContractUrl: masterResult.ipfsUrl,
                                                blockchainTxHashes: localData.txHashes
                                            }
                                        }
                                    );
                                    if (forceUpdate.modifiedCount > 0) {
                                        console.log('✅ IPFS link + tx hashes force-updated successfully');
                                    } else {
                                        console.log('⚠️  Force update did not modify document (maybe identical values already present)');
                                    }
                                } catch (e) {
                                    console.error('⚠️  Failed force-updating IPFS link:', e.message);
                                }
                            } else {
                                console.log('✅ IPFS link + tx hashes updated successfully');
                            }
                        } catch (err) {
                            console.error('⚠️  Failed to update IPFS link:', err.message);
                        }
                    } else {
                        console.error('⚠️  Master contract generation failed:', masterResult.error);
                    }
                } catch (err) {
                    console.error('❌ Blockchain logging error:', err.message);
                    console.error('   Stack:', err.stack);
                }
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
        console.log('🔍 [API] /api/user/applications called');
        console.log('   req.user:', req.user);
        console.log('   Querying for:', { phone: req.user.phone, accountNumber: req.user.accountNumber });

        const applications = await db.collection('applications')
            .find({
                $or: [
                    { phone: req.user.phone },
                    { accountNumber: req.user.accountNumber },
                    { userId: req.user.phone },
                    { userId: req.user.accountNumber }
                ]
            })
            .sort({ submittedAt: -1 })
            .toArray();

        console.log('✅ [API] Found', applications.length, 'applications');
        if (applications.length > 0) {
            console.log('   First app:', { id: applications[0]._id, phone: applications[0].phone, userId: applications[0].userId });
        }

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

        // IDEMPOTENCY CHECK: If already in desired state, return success
        if (exists.status === status) {
            console.log(`[Update] Application ${id} already in status '${status}', skipping update`);
            return res.json({
                ok: true,
                message: `Application already ${status}`,
                application: exists
            });
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
            5 // max 5 retries with jitter
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

        let result;
        if (regenerate) {
            // Check if we have application data for hybrid mode
            const db = getDB();
            const application = await db.collection('applications')
                .findOne({ phone: userId }, { sort: { createdAt: -1 } });

            if (application && application.blockchainTxHashes) {
                console.log(`📄 [Regenerate] Using HYBRID mode for ${userId} (tx hashes found)`);
                // Reconstruct localData from application document for hybrid mode
                const localData = {
                    application: {
                        _id: application._id,
                        requestedAmount: application.requestedAmount,
                        approvedAmount: application.amount || application.approvedAmount,
                        interestRate: application.interestRate,
                        finalRate: application.finalRate || application.interestRate,
                        creditScore: application.approvalScore || application.creditScore,
                        preApprovedLimit: application.maxLimit,
                        status: application.status,
                        sessionId: application.sessionId || `session_${application._id}`,
                        acceptedAt: application.submittedAt,
                        negotiationRound: 0
                    },
                    customer: {
                        name: application.customerName,
                        phone: application.phone,
                        pan: application.documents?.pan || 'XXXXXX1234',
                        aadhaar: application.documents?.aadhaar || 'XXXX XXXX 1234',
                        accountNumber: application.accountNumber
                    },
                    creditScore: {
                        score: application.approvalScore || application.creditScore || 0,
                        grade: (application.approvalScore || 0) >= 750 ? 'A+' :
                            (application.approvalScore || 0) >= 700 ? 'A' :
                                (application.approvalScore || 0) >= 650 ? 'B' : 'C'
                    },
                    emiData: {
                        emi: application.emi,
                        tenure: application.tenure
                    },
                    txHashes: application.blockchainTxHashes
                };
                result = await generateAndUploadMasterContract(userId, localData);
            } else {
                console.log(`📄 [Regenerate] Using LEGACY mode for ${userId} (no tx hashes - querying blockchain)`);
                result = await generateAndUploadMasterContract(userId);
            }

            // Update application with new IPFS hash if successful
            if (result.success && application) {
                try {
                    await db.collection('applications').updateOne(
                        { _id: application._id },
                        {
                            $set: {
                                masterContractIPFS: result.ipfsHash,
                                masterContractUrl: result.ipfsUrl
                            }
                        }
                    );
                    console.log(`✅ [Regenerate] Updated application ${application._id} with new IPFS hash`);
                } catch (updateErr) {
                    console.error('⚠️  Failed to update application with new IPFS hash:', updateErr.message);
                }
            }
        } else {
            result = await getMasterContract(userId);
        }

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

// Global error handlers to prevent crashes from async operations
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('   Reason:', reason);
    // Don't exit - log and continue (especially for rate limit errors)
    if (reason && (reason.statusCode === 429 || reason.code === 429)) {
        console.error('   ⚠️  Rate limit error - will retry on next operation');
    }
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // For 429 errors, don't crash
    if (error.statusCode === 429 || error.code === 429) {
        console.error('   ⚠️  Rate limit error - continuing...');
        return;
    }
    // For other critical errors, exit gracefully
    console.error('   🔴 Critical error - server may be unstable');
});

app.listen(port, () => {
    console.log(`🚀 Server listening at http://localhost:${port}`);
    console.log(`📊 Health: http://localhost:${port}/health`);
    console.log(`🔄 Ready: http://localhost:${port}/ready`);
    console.log(`⚡ Scalability: Optimistic locking + Event queue enabled`);
    console.log(`💬 Chat: ${redisInitialized ? 'Redis Streams enabled' : 'Fallback mode (no Redis)'}`);
    console.log(`🔗 Blockchain: ${blockchainInitialized ? 'Ethereum ledger active (immutable audit)' : 'JSON fallback mode'}`);
});

