"use strict";

/**
 * Authentication Module
 * - JWT token generation/verification
 * - Password hashing with bcrypt
 * - User storage (in-memory, can be upgraded to DB)
 * - Role-based access (user/admin)
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'bfsi_secure_jwt_secret_2026';
const JWT_EXPIRES = '7d';
const SALT_ROUNDS = 12;

// In-memory user storage (replace with database in production)
const users = new Map();
// In-memory OTP storage: phone -> { otp, expires, tempData }
const otpStore = new Map();
// Hash-to-OTP mapping for secure OTP retrieval
const otpHashStore = new Map();

// Create default admin on startup
const initDefaultAdmin = async () => {
    const adminEmail = 'admin@bfsi.com';
    if (!users.has(adminEmail)) {
        const hashedPassword = await bcrypt.hash('admin123', SALT_ROUNDS);
        users.set(adminEmail, {
            id: 'admin_001',
            email: adminEmail,
            password: hashedPassword,
            name: 'System Admin',
            role: 'admin',
            createdAt: new Date().toISOString()
        });
        console.log('✅ [Auth] Default admin created: admin@bfsi.com');
    }
};

// Initialize admin
initDefaultAdmin();

// ==================== OTP FUNCTIONS ====================

// Twilio Config
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const client = (accountSid && authToken) ? require('twilio')(accountSid, authToken) : null;

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateOTPHash(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

async function sendOTP({ name, accountNumber, phone }) {
    console.log('🔥🔥🔥 [Auth] sendOTP FUNCTION CALLED 🔥🔥🔥');
    if (!name || !accountNumber || !phone) {
        throw new Error('Name, Account Number, and Phone are required');
    }
    console.log(`ℹ️  [Auth] sendOTP called for phone=${phone} account=${accountNumber} name=${name}`);
    
    // Generate OTP
    const otp = generateOTP();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes
    
    // Generate SHA-256 hash
    const otpHash = generateOTPHash(otp);

    // Store OTP
    otpStore.set(phone, {
        otp,
        expires,
        userData: { name, accountNumber, phone, role: 'user' }
    });
    
    // Store hash-to-OTP mapping (for OTP page retrieval)
    otpHashStore.set(otpHash, {
        otp,
        phone,
        name,
        accountNumber,
        expires
    });

    // Always log HASH to console (not the actual OTP)
    console.log('\n' + '='.repeat(60));
    console.log('🔐 LOGIN OTP GENERATED');
    console.log('='.repeat(60));
    // Always log HASH to console (not the actual OTP)
    console.log('\n' + '='.repeat(60));
    console.log('🔐 LOGIN OTP GENERATED');
    console.log('='.repeat(60));
    console.log(`📱 Phone: ${phone}`);
    console.log(`👤 Name: ${name}`);
    console.log(`🏦 Account: ${accountNumber}`);
    console.log(`🔒 OTP Hash (SHA-256): ${otpHash}`);
    console.log(`⏰ Expires: ${new Date(expires).toLocaleTimeString()}`);
    console.log(`\n📄 Paste this hash at: /otp-page.html to reveal OTP`);
    console.log('='.repeat(60) + '\n');

    // Return hash instead of OTP
    console.log(`ℹ️  [Auth] sendOTP completed (otpHash=${otpHash}) for phone=${phone}`);
    return { message: 'OTP generated (paste hash at /otp-page.html)', otpHash };
}

async function verifyLoginOTP({ phone, otp, accountNumber }) {
    const stored = otpStore.get(phone);

    if (!stored) {
        console.warn(`⚠️  [Auth] verifyLoginOTP: no OTP found for phone=${phone}`);
        throw new Error('OTP expired or not requested');
    }

    if (Date.now() > stored.expires) {
        otpStore.delete(phone);
        console.warn(`⚠️  [Auth] verifyLoginOTP: OTP expired for phone=${phone}`);
        throw new Error('OTP expired');
    }

    if (stored.otp !== otp) {
        console.warn(`⚠️  [Auth] verifyLoginOTP: invalid OTP attempt for phone=${phone}`);
        throw new Error('Invalid OTP');
    }

    if (stored.userData.accountNumber !== accountNumber) {
        console.warn(`⚠️  [Auth] verifyLoginOTP: account number mismatch for phone=${phone} expected=${stored.userData.accountNumber} got=${accountNumber}`);
        throw new Error('Account number mismatch');
    }

    console.log(`ℹ️  [Auth] verifyLoginOTP: OTP verified for phone=${phone} account=${accountNumber}`);
    // OTP Verified - Create or Get User
    const existingUser = getUserByAccountNumber(accountNumber);
    let user;

    if (existingUser) {
        user = existingUser;
        // Update details if changed
        user.name = stored.userData.name;
        user.phone = stored.userData.phone;
    } else {
        // Register new user
        user = {
            id: `user_${Date.now()}`,
            accountNumber: stored.userData.accountNumber,
            name: stored.userData.name,
            phone: stored.userData.phone,
            role: 'user',
            createdAt: new Date().toISOString()
        };
        // Use Account Number as key for users map to ensure uniqueness per account
        users.set(accountNumber, user);
        console.log(`✅ [Auth] User validated & logged in: ${accountNumber}`);
    }

    // Clear OTP
    otpStore.delete(phone);

    // Generate Token
    const token = generateToken(user);
    const { ...safeUser } = user;

    return { token, user: safeUser };
}


// ==================== PASSWORD FUNCTIONS ====================

async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// ==================== TOKEN FUNCTIONS ====================

function generateToken(user) {
    const payload = {
        id: user.id,
        accountNumber: user.accountNumber || user.email, // Admin uses email
        name: user.name,
        phone: user.phone,
        role: user.role
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

// ==================== USER FUNCTIONS ====================

// Admin Login (Email/Pass)
async function loginAdmin(email, password) {
    const user = users.get(email.toLowerCase());

    if (!user || user.role !== 'admin') {
        throw new Error('Invalid credentials');
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
        throw new Error('Invalid credentials');
    }

    console.log(`✅ [Auth] Admin Login: ${email}`);

    const token = generateToken(user);
    const { password: _, ...safeUser } = user;

    return { token, user: safeUser };
}

function getUserById(id) {
    for (const user of users.values()) {
        if (user.id === id) {
            const { password: _, ...safeUser } = user;
            return safeUser;
        }
    }
    return null;
}

function getUserByEmail(email) {
    const user = users.get(email.toLowerCase());
    if (user) {
        const { password: _, ...safeUser } = user;
        return safeUser;
    }
    return null;
}

function getUserByAccountNumber(accNum) {
    return users.get(accNum);
}

// ==================== ADMIN FUNCTIONS ====================

async function createAdmin({ email, password, name }) {
    // Validate
    if (!email || !password || !name) {
        throw new Error('Email, password, and name are required');
    }

    if (users.has(email)) {
        throw new Error('Email already registered');
    }

    // Create admin
    const hashedPassword = await hashPassword(password);
    const admin = {
        id: `admin_${Date.now()}`,
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: 'admin',
        createdAt: new Date().toISOString()
    };

    users.set(email.toLowerCase(), admin);
    console.log(`✅ [Auth] Admin created: ${email}`);

    const { password: _, ...safeAdmin } = admin;
    return safeAdmin;
}

function getAllUsers() {
    const allUsers = [];
    for (const user of users.values()) {
        const { password: _, ...safeUser } = user;
        allUsers.push(safeUser);
    }
    return allUsers;
}

// ==================== MIDDLEWARE ====================

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
}

function adminMiddleware(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// ==================== DATA MASKING ====================

function maskAadhaar(aadhaar) {
    if (!aadhaar || aadhaar.length < 4) return '****';
    return 'XXXX-XXXX-' + aadhaar.slice(-4);
}

function maskPAN(pan) {
    if (!pan || pan.length < 4) return '****';
    return pan.slice(0, 5) + '****' + pan.slice(-1);
}

function maskPhone(phone) {
    if (!phone || phone.length < 4) return '****';
    return phone.slice(0, 3) + '****' + phone.slice(-3);
}

// ==================== EXPORTS ====================

module.exports = {
    // User functions (OTP based)
    sendOTP,
    verifyLoginOTP,
    getUserById,
    getUserByEmail,

    // Admin functions
    loginAdmin,
    createAdmin,
    getAllUsers,

    // Token functions
    generateToken,
    verifyToken,

    // Middleware
    authMiddleware,
    adminMiddleware,

    // Data masking
    maskAadhaar,
    maskPAN,
    maskPhone,

    // OTP hash retrieval
    getOTPFromHash: (hash) => {
        const data = otpHashStore.get(hash);
        if (!data) return null;
        if (Date.now() > data.expires) {
            otpHashStore.delete(hash);
            return null;
        }
        return data;
    },

    // Constants
    JWT_SECRET
};
