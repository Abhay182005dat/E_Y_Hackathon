const {
    initWeb3,
    getUserLoans,
    getCreditHistory,
    getUserDisbursements,
    getUserEMIs
} = require('./web3Client');

const TEST_USER_ID = '+918690243735';

async function testDataRetrieval() {
    console.log('🔍 Testing blockchain data retrieval...\n');
    
    try {
        // Initialize Web3 first
        console.log('🔗 Initializing Web3...');
        await initWeb3();
        console.log('✅ Web3 initialized\n');
        
        console.log('🏦 Fetching loans...');
        const loans = await getUserLoans(TEST_USER_ID);
        console.log(`✅ Loans: ${loans.loans ? loans.loans.length : 0} records`);
        console.log(JSON.stringify(loans, null, 2));
        console.log('\n');
        
        console.log('📊 Fetching credit history...');
        const creditHistory = await getCreditHistory(TEST_USER_ID);
        console.log(`✅ Credit History: ${creditHistory.data ? creditHistory.data.length : 0} records`);
        console.log(JSON.stringify(creditHistory, null, 2));
        console.log('\n');
        
        console.log('💰 Fetching disbursements...');
        const disbursements = await getUserDisbursements(TEST_USER_ID);
        console.log(`✅ Disbursements: ${disbursements.data ? disbursements.data.length : 0} records`);
        console.log(JSON.stringify(disbursements, null, 2));
        console.log('\n');
        
        console.log('📅 Fetching EMIs...');
        const emis = await getUserEMIs(TEST_USER_ID);
        console.log(`✅ EMIs: ${emis.data ? emis.data.length : 0} records`);
        console.log(JSON.stringify(emis, null, 2));
        console.log('\n');
        
        console.log('✅ All data retrieval tests completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during data retrieval:', error);
        process.exit(1);
    }
}

testDataRetrieval();
