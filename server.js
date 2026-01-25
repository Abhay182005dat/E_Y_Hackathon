require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

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
const { sendOTP, verifyLoginOTP, loginAdmin, getUserById, createAdmin, getAllUsers, authMiddleware, adminMiddleware, maskAadhaar, maskPAN } = require('./utils/auth');

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests' }
});
app.use('/api/', limiter);

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));
const port = process.env.PORT || 3001;

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

// 1. Send OTP (User Login Step 1)
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        const { name, accountNumber, phone } = req.body;
        const result = await sendOTP({ name, accountNumber, phone });
        res.json({ ok: true, message: 'OTP sent to your phone', devOtp: result.devOtp }); // devOtp for demo
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

// Chat endpoint - uses Ollama for AI responses
const { callGemini } = require('./utils/geminiClient');

// Simple in-memory session store for conversation history
const chatSessions = new Map();

app.post('/api/chat', async (req, res) => {
    try {
        const { message, customerData, creditScore, sessionId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'message required' });
        }

        // Generate session ID if not provided
        const sid = sessionId || `session_${Date.now()}`;

        // Get or create session
        if (!chatSessions.has(sid)) {
            chatSessions.set(sid, {
                history: [],
                state: 'intro', // intro -> offered -> negotiating -> accepted
                negotiationCount: 0,
                finalRate: null
            });
        }
        const session = chatSessions.get(sid);

        // Extract correct values from the data structure
        const name = customerData?.name || 'Customer';
        const salary = parseInt(customerData?.monthlySalary) || 50000;
        const requestedAmount = parseInt(customerData?.loanAmount) || 500000;
        const score = creditScore?.creditScore?.score || creditScore?.score || 720;
        const preApprovedLimit = creditScore?.preApprovedLimit?.limit || 500000;
        const baseRate = creditScore?.preApprovedLimit?.interestRate || 12;
        const currentRate = session.finalRate || baseRate;

        // Add user message to history
        session.history.push({ role: 'user', content: message });

        // State machine logic - produces consistent responses
        let response;
        const lower = message.toLowerCase();

        if (session.state === 'accepted') {
            response = `Your loan application is already submitted! 🎉\n\n🔢 Reference ID: LOAN-${sid.slice(-8)}\n📋 Status: Under Review\n\nPlease wait for admin approval.`;
        } else if (lower.includes('yes') || lower.includes('accept') || lower.includes('proceed') || lower.includes('go ahead') || lower.includes('ok')) {
            if (session.state === 'negotiating' || session.state === 'offered') {
                session.state = 'accepted';
                session.finalRate = session.finalRate || currentRate;
                response = `✅ Congratulations ${name}! Your loan is approved!\n\n🔢 Reference ID: LOAN-${sid.slice(-8)}\n💰 Amount: ₹${preApprovedLimit.toLocaleString()}\n📈 Final Interest Rate: ${session.finalRate}%\n📋 Status: Submitted for Disbursement\n\nYou'll receive SMS confirmation shortly.`;
            } else {
                session.state = 'offered';
                response = `Hello ${name}! 👋\n\n📊 Credit Score: ${score}\n💰 Pre-Approved: ₹${preApprovedLimit.toLocaleString()}\n📈 Interest Rate: ${currentRate}%\n\nWould you like to accept this offer or negotiate?`;
            }
        } else if (lower.includes('negotiate') || lower.includes('reduce') || lower.includes('lower') || lower.includes('rate') || lower.includes('less')) {
            if (session.negotiationCount >= 2) {
                response = `I've already offered the best rate I can, ${name}.\n\n📉 Final Rate: ${session.finalRate || (baseRate - 0.5)}%\n\nThis is our lowest possible rate. Would you like to accept?`;
            } else {
                session.state = 'negotiating';
                session.negotiationCount++;
                const reduction = 0.25 * session.negotiationCount;
                session.finalRate = (baseRate - reduction).toFixed(1);
                response = `I can offer a ${reduction}% reduction, ${name}!\n\n📉 New Rate: ${session.finalRate}%\n💰 Loan: ₹${preApprovedLimit.toLocaleString()}\n\nWould you like to accept this offer?`;
            }
        } else if (lower.includes('increase') || lower.includes('more') || lower.includes('higher') || lower.includes('1000000') || lower.includes('10 lakh')) {
            response = `I understand you want more, ${name}.\n\nHowever, based on your approval score (${score}%) and salary (₹${salary.toLocaleString()}), your maximum is ₹${preApprovedLimit.toLocaleString()}.\n\nThis follows RBI's FOIR guidelines. Would you like to proceed with this amount?`;
        } else if (session.state === 'intro' || lower.includes('loan') || lower.includes('apply') || lower.includes('need') || lower.includes('hi') || lower.includes('hello')) {
            session.state = 'offered';
            response = `Hello ${name}! 👋 Based on your verified documents:\n\n📊 Approval Score: ${score}%\n💰 Pre-Approved Limit: ₹${preApprovedLimit.toLocaleString()}\n📈 Interest Rate: ${currentRate}%\n💵 Monthly Salary: ₹${salary.toLocaleString()}\n\nWould you like to accept this offer or negotiate the interest rate?`;
        } else {
            response = `Hi ${name}! Your current offer:\n\n💰 Amount: ₹${preApprovedLimit.toLocaleString()}\n📈 Rate: ${currentRate}%\n\nSay "accept" to proceed or "negotiate" for better rates.`;
        }

        // If accepted, store the application with EMI schedule
        if (session.state === 'accepted' && !session.applicationStored) {
            const finalRate = parseFloat(session.finalRate || baseRate);
            const emiData = generateEMISchedule(preApprovedLimit, finalRate, 36);

            const app = {
                id: `LOAN-${sid.slice(-8)}`,
                customerName: name,
                phone: customerData?.phone || 'N/A',
                email: customerData?.email || 'N/A',
                accountNumber: customerData?.accountNumber || 'N/A',
                amount: preApprovedLimit,
                tenure: 36,
                interestRate: finalRate,
                approvalScore: score,
                monthlySalary: salary,
                status: 'pending',
                submittedAt: new Date().toISOString(),
                documents: { aadhaar: true, pan: true, bankStatement: true, salarySlip: true },
                emi: emiData.emi,
                nextEmiDate: emiData.schedule[0]?.dueDate,
                emiSchedule: emiData.schedule
            };
            applications.push(app);
            session.applicationStored = true;
            console.log(`✅ [Application] Stored: ${app.id} for ${name} | EMI: ₹${emiData.emi}`);
        }

        // Add bot response to history
        session.history.push({ role: 'bot', content: response });

        // Keep only last 10 messages
        if (session.history.length > 10) {
            session.history = session.history.slice(-10);
        }

        console.log(`[Chat] ${name} | State: ${session.state} | Negotiation: ${session.negotiationCount}`);

        res.json({ ok: true, response, sessionId: sid, state: session.state });
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== APPLICATIONS STORAGE ====================

const applications = [];

// GET user's applications
app.get('/api/user/applications', authMiddleware, (req, res) => {
    // Filter applications where phone or accountNumber matches logged-in user
    const userApps = applications.filter(a =>
        a.phone === req.user.phone ||
        a.accountNumber === req.user.accountNumber
    );
    res.json({ ok: true, applications: userApps });
});

// GET all applications (for admin)
app.get('/api/applications', authMiddleware, adminMiddleware, (req, res) => {
    res.json({ ok: true, applications });
});

// Update application status (approve/reject)
app.put('/api/applications/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const app = applications.find(a => a.id === id);
    if (!app) {
        return res.status(404).json({ error: 'Application not found' });
    }

    if (!['pending', 'approved', 'rejected', 'disbursed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    app.status = status;
    app.updatedAt = new Date().toISOString();

    console.log(`✅ [Admin] Application ${id} status changed to: ${status}`);
    res.json({ ok: true, application: app });
});


app.listen(port, () => {
    console.log(`🚀 Server listening at http://localhost:${port}`);
    console.log(`📊 Health: http://localhost:${port}/health`);
});

