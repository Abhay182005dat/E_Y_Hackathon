/**
 * Fetch and analyze the actual bytecode deployed at contract addresses
 */
const { Web3 } = require('web3');
require('dotenv').config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;

const CONTRACTS = {
    AccessControl: process.env.ACCESS_CONTROL_CONTRACT_ADDRESS,
    LoanCore: process.env.LOAN_CORE_CONTRACT_ADDRESS,
    CreditRegistry: process.env.CREDIT_REGISTRY_CONTRACT_ADDRESS,
    PaymentLedger: process.env.PAYMENT_LEDGER_CONTRACT_ADDRESS
};

async function analyzeContracts() {
    console.log('\n🔍 DEPLOYED CONTRACT ANALYSIS\n');
    
    const web3 = new Web3(SEPOLIA_RPC);
    
    for (const [name, address] of Object.entries(CONTRACTS)) {
        console.log(`📝 ${name} (${address})`);
        
        try {
            const code = await web3.eth.getCode(address);
            
            if (code === '0x' || code === '0x0') {
                console.log('   ❌ NO CONTRACT deployed at this address!\n');
                continue;
            }
            
            console.log(`   ✅ Contract exists: ${code.length} bytes`);
            console.log(`   🔗 Etherscan: https://sepolia.etherscan.io/address/${address}`);
            
            // Check if verified on Etherscan
            console.log(`   💡 Check if verified on Etherscan to get the ABI`);
            console.log(`   💡 If not verified, you need to redeploy with current source\n`);
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('\n📋 DIAGNOSIS:');
    console.log('   The contracts exist but the ABIs in blockchain/contracts/');
    console.log('   do NOT match what is deployed at these addresses.');
    console.log('\n🔧 SOLUTIONS:\n');
    console.log('   Option 1 (QUICKEST): REDEPLOY contracts');
    console.log('   ────────────────────────────────────────');
    console.log('   1. Open Remix IDE: https://remix.ethereum.org/');
    console.log('   2. Copy these files to Remix:');
    console.log('      • blockchain/contracts/AccessControl.sol');
    console.log('      • blockchain/contracts/LoanCore.sol');
    console.log('      • blockchain/contracts/CreditRegistry.sol');
    console.log('      • blockchain/contracts/PaymentLedger.sol');
    console.log('   3. Compile with Solidity 0.8.19+');
    console.log('   4. Deploy in order:');
    console.log('      a. AccessControl (copy address)');
    console.log('      b. LoanCore (copy address)');
    console.log('      c. CreditRegistry (copy address)');
    console.log('      d. PaymentLedger (copy address)');
    console.log('   5. Update .env with NEW addresses');
    console.log('   6. For each contract: call addAdmin(backend_address)');
    console.log('   7. npm start\n');
    console.log('   Option 2: Get ABI from Etherscan');
    console.log('   ────────────────────────────────────────');
    console.log('   • Visit Etherscan links above');
    console.log('   • If "Contract" tab shows source code → copy ABI');
    console.log('   • Replace files in blockchain/contracts/*.abi.json');
    console.log('   • This only works if contracts are verified\n');
}

analyzeContracts().catch(console.error);
