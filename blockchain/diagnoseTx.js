/**
 * Deep diagnostic: Try to send an actual transaction and see what fails
 */
const { Web3 } = require('web3');
require('dotenv').config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY;
const LOAN_CORE_ADDRESS = process.env.LOAN_CORE_CONTRACT_ADDRESS;

// Full LoanCore ABI for logChat
const LOAN_CORE_ABI = require('./contracts/LoanCore.abi.json');

async function testTransaction() {
    console.log('\n🔬 TRANSACTION DIAGNOSTIC\n');
    
    const web3 = new Web3(SEPOLIA_RPC);
    const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
    web3.eth.accounts.wallet.add(account);
    
    console.log(`Wallet: ${account.address}`);
    console.log(`LoanCore: ${LOAN_CORE_ADDRESS}\n`);
    
    const contract = new web3.eth.Contract(LOAN_CORE_ABI, LOAN_CORE_ADDRESS);
    
    // Check admin status
    console.log('1️⃣ Checking admin status...');
    try {
        const isAdmin = await contract.methods.admins(account.address).call();
        console.log(`   admins[${account.address}] = ${isAdmin}`);
        
        if (!isAdmin) {
            console.log('   ❌ Not admin! This is the problem.');
            return;
        }
    } catch (error) {
        console.log(`   ⚠️  Error checking admin: ${error.message}`);
    }
    
    // Try to call logChat with test data
    console.log('\n2️⃣ Testing logChat transaction...');
    
    const testData = {
        sessionId: web3.utils.keccak256('test_session_' + Date.now()),
        userId: web3.utils.keccak256('+919876543210'),
        messageHash: web3.utils.keccak256('test message'),
        state: 1, // offered
        negotiationCount: 0,
        finalRateBps: 0
    };
    
    console.log('   Test data:', {
        sessionId: testData.sessionId.substring(0, 10) + '...',
        userId: testData.userId.substring(0, 10) + '...',
        state: testData.state,
        negotiationCount: testData.negotiationCount,
        finalRateBps: testData.finalRateBps
    });
    
    // First, try to estimate gas
    console.log('\n3️⃣ Estimating gas...');
    try {
        const gasEstimate = await contract.methods.logChat(
            testData.sessionId,
            testData.userId,
            testData.messageHash,
            testData.state,
            testData.negotiationCount,
            testData.finalRateBps
        ).estimateGas({ from: account.address });
        
        console.log(`   ✅ Gas estimate: ${gasEstimate}`);
        
        // Try to send the transaction
        console.log('\n4️⃣ Sending transaction...');
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(account.address, 'pending');
        
        console.log(`   Gas price: ${web3.utils.fromWei(gasPrice.toString(), 'gwei')} Gwei`);
        console.log(`   Nonce: ${nonce}`);
        
        const tx = await contract.methods.logChat(
            testData.sessionId,
            testData.userId,
            testData.messageHash,
            testData.state,
            testData.negotiationCount,
            testData.finalRateBps
        ).send({
            from: account.address,
            gas: Math.floor(Number(gasEstimate) * 1.5), // 50% buffer
            gasPrice: gasPrice.toString(),
            nonce: Number(nonce)
        });
        
        console.log(`\n✅ SUCCESS!`);
        console.log(`   Tx Hash: ${tx.transactionHash}`);
        console.log(`   Block: ${tx.blockNumber}`);
        console.log(`   Gas Used: ${tx.gasUsed}`);
        console.log(`   🔗 https://sepolia.etherscan.io/tx/${tx.transactionHash}`);
        
    } catch (error) {
        console.log(`\n❌ TRANSACTION FAILED`);
        console.log(`   Error: ${error.message}`);
        
        if (error.message.includes('revert')) {
            console.log('\n   🔍 Transaction reverted. Possible causes:');
            console.log('      • require() statement failed in contract');
            console.log('      • Wrong contract deployed at this address');
            console.log('      • Contract not verified/ABI mismatch');
        }
        
        // Try to get the revert reason
        if (error.data) {
            console.log(`\n   Raw error data: ${error.data}`);
        }
        
        // Check if contract exists at address
        console.log('\n5️⃣ Verifying contract exists...');
        const code = await web3.eth.getCode(LOAN_CORE_ADDRESS);
        if (code === '0x' || code === '0x0') {
            console.log('   ❌ NO CONTRACT at this address!');
            console.log('   💡 You need to deploy LoanCore.sol to this address');
        } else {
            console.log(`   ✅ Contract code exists (${code.length} bytes)`);
            console.log('   💡 Contract exists but may have different code than expected');
            console.log('   💡 Verify contract source on Etherscan or redeploy');
        }
    }
}

testTransaction().catch(console.error);
