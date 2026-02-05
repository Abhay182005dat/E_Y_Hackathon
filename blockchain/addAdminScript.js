/**
 * Add backend address as admin to all deployed contracts
 * Run this with the OWNER's private key (the wallet that deployed the contracts)
 */
const { Web3 } = require('web3');
const readline = require('readline');

const SEPOLIA_RPC = 'https://sepolia.infura.io/v3/fbf97e5aba4c41dbb230e5d9b75d0724';
const BACKEND_ADDRESS = '0x37700500a14540ba973d98fe76bdb1c7ac6327a4';

const CONTRACTS = {
    AccessControl: '0x6601A2b212b8C2fd0C819C84A766E4cefCEDA046',
    LoanCore: '0x388E0C479E401C539Cd9E5da136A9C36b44bE92C',
    CreditRegistry: '0x80C57ddB563a39C3d31F828713d635D46e52C042',
    PaymentLedger: '0x1F314776239DC813b8080ffCD8F6E59321477aE8'
};

// Minimal ABI - just the functions we need
const ABI = [
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "a", "type": "address"}],
        "name": "isAdmin",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "a", "type": "address"}],
        "name": "addAdmin",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "", "type": "address"}],
        "name": "admins",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    }
];

async function promptForPrivateKey() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('\n🔑 Enter OWNER private key (with 0x prefix): ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function addAdminToContract(web3, contractAddress, contractName, ownerAccount) {
    console.log(`\n📝 Processing ${contractName}...`);
    
    const contract = new web3.eth.Contract(ABI, contractAddress);
    
    try {
        // Check current owner
        const owner = await contract.methods.owner().call();
        console.log(`   Owner: ${owner}`);
        console.log(`   Your wallet: ${ownerAccount.address}`);
        
        if (owner.toLowerCase() !== ownerAccount.address.toLowerCase()) {
            console.log(`   ❌ ERROR: You are not the owner of this contract!`);
            console.log(`   Only the owner (${owner}) can add admins.`);
            return false;
        }
        
        // Check if already admin
        const isAlreadyAdmin = await contract.methods.admins(BACKEND_ADDRESS).call();
        if (isAlreadyAdmin) {
            console.log(`   ✅ Backend is already admin - skipping`);
            return true;
        }
        
        // Get gas price and nonce
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(ownerAccount.address, 'pending');
        
        // Add admin
        console.log(`   📤 Sending addAdmin transaction...`);
        const tx = await contract.methods.addAdmin(BACKEND_ADDRESS).send({
            from: ownerAccount.address,
            gas: 100000,
            gasPrice: gasPrice,
            nonce: nonce
        });
        
        console.log(`   ✅ Success! Tx: ${tx.transactionHash}`);
        console.log(`   🔗 https://sepolia.etherscan.io/tx/${tx.transactionHash}`);
        return true;
        
    } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        if (error.message.includes('Not owner')) {
            console.log(`   💡 Only the contract owner can add admins`);
        }
        return false;
    }
}

async function main() {
    console.log('\n🔧 BLOCKCHAIN ADMIN SETUP SCRIPT\n');
    console.log(`Backend address to add as admin: ${BACKEND_ADDRESS}\n`);
    console.log('⚠️  IMPORTANT: You need the OWNER\'s private key (wallet that deployed the contracts)\n');
    
    // Prompt for owner private key
    const ownerPrivateKey = await promptForPrivateKey();
    
    if (!ownerPrivateKey || ownerPrivateKey === '') {
        console.error('\n❌ No private key provided. Exiting.');
        process.exit(1);
    }
    
    // Validate private key format
    if (!ownerPrivateKey.startsWith('0x') || ownerPrivateKey.length !== 66) {
        console.error('\n❌ Invalid private key format. Must be 0x followed by 64 hex characters.');
        process.exit(1);
    }
    
    // Initialize Web3
    const web3 = new Web3(SEPOLIA_RPC);
    
    try {
        const ownerAccount = web3.eth.accounts.privateKeyToAccount(ownerPrivateKey);
        web3.eth.accounts.wallet.add(ownerAccount);
        
        console.log(`\n✅ Owner wallet loaded: ${ownerAccount.address}`);
        
        // Check balance
        const balance = await web3.eth.getBalance(ownerAccount.address);
        const balanceEth = web3.utils.fromWei(balance, 'ether');
        console.log(`💰 Balance: ${balanceEth} ETH`);
        
        if (parseFloat(balanceEth) < 0.001) {
            console.warn('⚠️  Warning: Low balance. You may need more ETH for gas fees.');
        }
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Add admin to all contracts
        let successCount = 0;
        for (const [name, address] of Object.entries(CONTRACTS)) {
            const success = await addAdminToContract(web3, address, name, ownerAccount);
            if (success) successCount++;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between txs
        }
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`\n✅ Completed: ${successCount}/${Object.keys(CONTRACTS).length} contracts updated`);
        
        if (successCount === Object.keys(CONTRACTS).length) {
            console.log('\n🎉 SUCCESS! Backend is now admin on all contracts.');
            console.log('\n📋 Next steps:');
            console.log('   1. Run: node blockchain/checkAdmin.js (to verify)');
            console.log('   2. Run: npm start (to test the application)');
        } else {
            console.log('\n⚠️  Some contracts failed. Check errors above.');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.message.includes('invalid') && error.message.includes('private key')) {
            console.log('💡 Make sure the private key is from the wallet that deployed the contracts');
        }
        process.exit(1);
    }
}

main().catch(console.error);
