/**
 * Interactive ABI updater - paste ABIs from Remix
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONTRACTS = ['AccessControl', 'LoanCore', 'CreditRegistry', 'PaymentLedger'];

async function promptForABI(contractName) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 ${contractName}.sol`);
        console.log(`${'='.repeat(60)}`);
        console.log('\n📋 Steps to get ABI from Remix:');
        console.log('   1. Compile the contract in Remix');
        console.log('   2. Click "Compilation Details" button');
        console.log('   3. Copy the entire ABI JSON (click copy icon)');
        console.log('   4. Paste below (press Enter, then Ctrl+D when done)\n');
        console.log('Paste ABI (multi-line, then Ctrl+D):');
        
        let abiText = '';
        rl.on('line', (line) => {
            abiText += line + '\n';
        });
        
        rl.on('close', () => {
            resolve(abiText.trim());
        });
    });
}

async function main() {
    console.log('\n🔧 ABI UPDATE UTILITY\n');
    console.log('This will guide you through updating ABIs for all contracts.\n');
    
    for (const contractName of CONTRACTS) {
        const abiText = await promptForABI(contractName);
        
        if (!abiText || abiText === '') {
            console.log(`\n⏭️  Skipping ${contractName} (no input)\n`);
            continue;
        }
        
        // Validate JSON
        try {
            const abiJson = JSON.parse(abiText);
            
            if (!Array.isArray(abiJson)) {
                console.log(`\n❌ Invalid ABI: Must be a JSON array`);
                console.log(`   Skipping ${contractName}\n`);
                continue;
            }
            
            // Save to file
            const filePath = path.join(__dirname, 'contracts', `${contractName}.abi.json`);
            fs.writeFileSync(filePath, JSON.stringify(abiJson, null, 2));
            
            console.log(`\n✅ Saved: ${filePath}`);
            console.log(`   Functions: ${abiJson.filter(i => i.type === 'function').length}`);
            console.log(`   Events: ${abiJson.filter(i => i.type === 'event').length}\n`);
            
        } catch (error) {
            console.log(`\n❌ Error parsing JSON: ${error.message}`);
            console.log(`   Skipping ${contractName}\n`);
        }
    }
    
    console.log('\n✅ ABI update complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Restart server: npm start');
    console.log('   2. Test transaction: node blockchain/diagnoseTx.js\n');
}

main().catch(console.error);
