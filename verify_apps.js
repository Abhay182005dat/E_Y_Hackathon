const path = require('path');
const fs = require('fs');
const { parseAadhaar, parseBankStatement } = require('./utils/ocr');

async function testTargeted() {
    try {
        const uploadDir = path.join(__dirname, 'uploads');
        // Use the files that were failing
        const aadhaarFile = '1771529480280_1769605945464_hemanth_adaar_compressed.pdf';
        const bankFile = '1771529480287_1769605945480_bank_statement.pdf';

        if (fs.existsSync(path.join(uploadDir, aadhaarFile))) {
            console.log('\n--- Testing Aadhaar ---');
            const res = await parseAadhaar(path.join(uploadDir, aadhaarFile));
            console.log('Aadhaar Extracted Name:', res.name);
            console.log('Aadhaar Extracted No:', res.aadhaar);
        } else {
            console.log('Aadhaar file missing');
        }

        if (fs.existsSync(path.join(uploadDir, bankFile))) {
            console.log('\n--- Testing Bank Statement ---');
            const res = await parseBankStatement(path.join(uploadDir, bankFile));
            console.log('Bank Extracted Account:', res.accountNumber);
            console.log('Bank Extracted Holder:', res.accountHolderName);
            console.log('Bank Extracted Salary:', res.estimatedMonthlySalary);
        } else {
            console.log('Bank file missing');
        }

    } catch (err) {
        console.error('Test Failed:', err);
    }
}

testTargeted();
