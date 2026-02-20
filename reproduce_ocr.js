const path = require('path');
const fs = require('fs');
const { parseAadhaar, parsePAN, parseBankStatement, parseSalarySlip } = require('./utils/ocr');

async function test() {
    try {
        const uploadsDir = path.join(__dirname, 'uploads');

        // Define test files
        const files = {
            aadhaar: '1771531122370_1769605945464_hemanth_adaar_compressed.pdf',
            pan: '1771531122375_1769605945473_pan_test_.jpeg',
            bank: '1771531122380_1769605945480_bank_statement.pdf',
            salary: '1771531122386_1769605945484_salary.pdf'
        };

        console.log('--- STARTING OCR TESTS ---');

        // Test Aadhaar
        if (fs.existsSync(path.join(uploadsDir, files.aadhaar))) {
            console.log('\nTesting Aadhaar...');
            const res = await parseAadhaar(path.join(uploadsDir, files.aadhaar));
            console.log('Aadhaar Result:', JSON.stringify(res, null, 2));
        } else {
            console.log('\nAadhaar file not found:', files.aadhaar);
        }

        // Test PAN
        if (fs.existsSync(path.join(uploadsDir, files.pan))) {
            console.log('\nTesting PAN...');
            const res = await parsePAN(path.join(uploadsDir, files.pan));
            console.log('PAN Result:', JSON.stringify(res, null, 2));
        } else {
            console.log('\nPAN file not found:', files.pan);
        }

        // Test Bank Statement
        if (fs.existsSync(path.join(uploadsDir, files.bank))) {
            console.log('\nTesting Bank Statement...');
            const res = await parseBankStatement(path.join(uploadsDir, files.bank));
            console.log('Bank Result:', JSON.stringify(res, null, 2));
        }

        // Test Salary Slip
        if (fs.existsSync(path.join(uploadsDir, files.salary))) {
            console.log('\nTesting Salary Slip...');
            const res = await parseSalarySlip(path.join(uploadsDir, files.salary));
            console.log('Salary Result:', JSON.stringify(res, null, 2));
        }

    } catch (err) {
        console.error('Test Failed:', err);
    }
}

test();
