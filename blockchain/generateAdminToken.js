/**
 * Generate Admin JWT Token for Testing
 * 
 * Creates a JWT token for the default admin account (admin@bfsi.com)
 * that can be used in automated tests to call authenticated endpoints.
 */

const jwt = require('jsonwebtoken');
const path = require('path');

// Load project .env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'bfsi_secure_jwt_secret_2026';

// Default admin payload (matches utils/auth.js initDefaultAdmin)
const adminPayload = {
    id: 'admin_001',
    email: 'admin@bfsi.com',
    accountNumber: 'admin@bfsi.com',
    name: 'System Admin',
    role: 'admin'
};

// Generate token that expires in 7 days
const token = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '7d' });

console.log('\n' + '='.repeat(70));
console.log('🔑 ADMIN JWT TOKEN GENERATED');
console.log('='.repeat(70));
console.log('\nToken:');
console.log(token);
console.log('\n📋 Use in Authorization header:');
console.log(`Authorization: Bearer ${token}`);
console.log('\n✅ Valid for: 7 days');
console.log('👤 User: admin@bfsi.com (System Admin)');
console.log('🔐 Role: admin');
console.log('='.repeat(70) + '\n');

// Export for programmatic use
module.exports = token;
