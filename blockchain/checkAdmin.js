/**
 * Quick diagnostic: Check if backend account is admin on deployed contracts
 */
const { Web3 } = require('web3');
require('dotenv').config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY';
const BACKEND_ADDRESS = '0x37700500a14540ba973d98fe76bdb1c7ac6327a4'; // From error logs

const CONTRACTS = {
    AccessControl: process.env.ACCESS_CONTROL_CONTRACT_ADDRESS,
    LoanCore: process.env.LOAN_CORE_CONTRACT_ADDRESS,
    CreditRegistry: process.env.CREDIT_REGISTRY_CONTRACT_ADDRESS,
    PaymentLedger: process.env.PAYMENT_LEDGER_CONTRACT_ADDRESS
};

const ACCESS_CONTROL_ABI = [
    {
        "inputs": [{"internalType": "address", "name": "a", "type": "address"}],
        "name": "isAdmin",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    }
];

async function checkAdminStatus() {
    console.log('\n🔍 BLOCKCHAIN ADMIN DIAGNOSTIC\n');
    console.log(`Backend Address: ${BACKEND_ADDRESS}\n`);
    
    const web3 = new Web3(SEPOLIA_RPC);
    
    // Check each contract
    for (const [name, address] of Object.entries(CONTRACTS)) {
        if (!address || address === 'YOUR_CONTRACT_ADDRESS') {
            console.log(`❌ ${name}: Not deployed (missing address in .env)`);
            continue;
        }
        
        try {
            const contract = new web3.eth.Contract(ACCESS_CONTROL_ABI, address);
            const isAdmin = await contract.methods.isAdmin(BACKEND_ADDRESS).call();
            const owner = await contract.methods.owner().call();
            
            if (isAdmin) {
                console.log(`✅ ${name} (${address})`);
                console.log(`   Backend IS admin`);
            } else {
                console.log(`❌ ${name} (${address})`);
                console.log(`   Backend is NOT admin`);
                console.log(`   Owner: ${owner}`);
                console.log(`   📋 Fix: Call addAdmin("${BACKEND_ADDRESS}") from owner account`);
                console.log(`   🔗 Etherscan: https://sepolia.etherscan.io/address/${address}#writeContract\n`);
            }
        } catch (error) {
            console.log(`⚠️  ${name} (${address})`);
            console.log(`   Error: ${error.message}\n`);
        }
    }
    
    console.log('\n📝 NEXT STEPS:\n');
    console.log('1. Connect MetaMask to Sepolia testnet');
    console.log('2. For EACH contract showing ❌ above:');
    console.log('   a. Open the Etherscan link');
    console.log('   b. Click "Write Contract" → "Connect to Web3"');
    console.log(`   c. Call addAdmin() with address: ${BACKEND_ADDRESS}`);
    console.log('   d. Confirm transaction in MetaMask');
    console.log('3. Re-run this script to verify\n');
}

checkAdminStatus().catch(console.error);
