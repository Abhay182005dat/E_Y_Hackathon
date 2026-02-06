const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'eyhackathon';

async function checkTransactions() {
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');
        
        const db = client.db(DB_NAME);
        
        // List all collections
        const collections = await db.listCollections().toArray();
        console.log(`📂 Collections in '${DB_NAME}' database:`);
        collections.forEach(coll => {
            console.log(`  - ${coll.name}`);
        });
        console.log('');
        
        // Get all applications (no filter)
        const allApps = await db.collection('applications')
            .find({})
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();
        
        console.log(`📋 Total applications in database: ${allApps.length}\n`);
        
        if (allApps.length > 0) {
            console.log('Latest 10 applications:');
            allApps.forEach((app, index) => {
                console.log(`[${index + 1}] Loan: ${app._id}`);
                console.log(`    Phone: ${app.phone || 'N/A'}`);
                console.log(`    Status: ${app.status}`);
                console.log(`    Amount: ₹${app.loanAmount || 'N/A'}`);
                console.log(`    Created: ${app.createdAt || 'N/A'}`);
                console.log('');
            });
        }
        
        // Now check for the specific user
        const applications = await db.collection('applications')
            .find({ phone: '+918690243735' })
            .sort({ createdAt: -1 })
            .limit(5)
            .toArray();
        
        console.log(`\n📋 Found ${applications.length} applications for +918690243735:\n`);
        
        applications.forEach((app, index) => {
            console.log(`[${index + 1}] Loan: ${app._id}`);
            console.log(`    Status: ${app.status}`);
            console.log(`    Amount: ₹${app.loanAmount}`);
            console.log(`    Created: ${app.createdAt}`);
            console.log(`    Master Contract IPFS: ${app.masterContractIPFS || 'N/A'}`);
            console.log(`    Blockchain Transactions:`);
            
            // Check for any blockchain-related fields
            const blockchainFields = Object.keys(app).filter(k => 
                k.includes('blockchain') || k.includes('transaction') || k.includes('hash')
            );
            
            if (blockchainFields.length > 0) {
                blockchainFields.forEach(field => {
                    console.log(`      ${field}: ${app[field]}`);
                });
            } else {
                console.log(`      ⚠️  No blockchain transaction hashes stored`);
            }
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
    }
}

checkTransactions();
