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

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'bfsi_secure_jwt_secret_2026';
const JWT_EXPIRES = '7d';
const SALT_ROUNDS = 12;

// In-memory user storage (replace with database in production)
const users = new Map();
// In-memory OTP storage: phone -> { otp, expires, tempData }
const otpStore = new Map();

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

async function sendOTP({ name, accountNumber, phone }) {
    if (!name || !accountNumber || !phone) {
        throw new Error('Name, Account Number, and Phone are required');
    }

    // Generate OTP
    const otp = generateOTP();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store OTP
    otpStore.set(phone, {
        otp,
        expires,
        userData: { name, accountNumber, phone, role: 'user' }
    });

    // 1. Log to Console (Always for Debugging/Fallback)
    console.log(`\n🔐 [SECURE AUTH] OTP for ${phone} (Acc: ${accountNumber}): ${otp}\n`);

    // 2. Send Real SMS if Twilio is configured
    if (client && twilioPhone) {
        try {
            await client.messages.create({
                body: `Your BFSI Secure Login OTP is: ${otp}. Do not share this with anyone.`,
                from: twilioPhone,
                to: phone // Ensure phone has country code e.g., +91...
            });
            console.log(`✅ [Twilio] SMS sent to ${phone}`);
            return { message: 'OTP sent via SMS', devOtp: otp };
        } catch (error) {
            console.error('❌ [Twilio] Failed to send SMS:', error.message);
            // Fallback: Return success but rely on console/devOtp (so user isn't blocked)
            return { message: 'SMS failed, using Dev Mode', devOtp: otp };
        }
    } else {
        console.warn('⚠️ [Twilio] Credentials missing. Using Dev Mode.');
        return { message: 'Dev Mode: OTP in Console', devOtp: otp };
    }
}

async function verifyLoginOTP({ phone, otp, accountNumber }) {
    const stored = otpStore.get(phone);

    if (!stored) {
        throw new Error('OTP expired or not requested');
    }

    if (Date.now() > stored.expires) {
        otpStore.delete(phone);
        throw new Error('OTP expired');
    }

    if (stored.otp !== otp) {
        throw new Error('Invalid OTP');
    }

    if (stored.userData.accountNumber !== accountNumber) {
        throw new Error('Account number mismatch');
    }

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

    // Constants
    JWT_SECRET
};
