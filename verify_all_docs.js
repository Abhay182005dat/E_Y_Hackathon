const path = require('path');
const fs = require('fs');
const { parseAadhaar, parsePAN, parseBankStatement, parseSalarySlip } = require('./utils/ocr');

async function testAll() {
    try {
        const uploadDir = path.join(__dirname, 'uploads');

        // Define latest files based on logs/listing
        const files = {
            aadhaar: '1771529480280_1769605945464_hemanth_adaar_compressed.pdf',
            pan: '1771529480283_1769605945473_pan_test_.jpeg',
            bank: '1771529480287_1769605945480_bank_statement.pdf',
            salary: '1771529480291_1769605945484_salary.pdf'
        };

        console.log('--- Verifying All Documents ---');

        if (fs.existsSync(path.join(uploadDir, files.pan))) {
            console.log('\nTesting PAN...');
            const res = await parsePAN(path.join(uploadDir, files.pan));
            console.log('PAN Result:', JSON.stringify(res, null, 2));
        } else {
            console.log('PAN file not found');
        }

        if (fs.existsSync(path.join(uploadDir, files.aadhaar))) {
            console.log('\nTesting Aadhaar...');
            const res = await parseAadhaar(path.join(uploadDir, files.aadhaar));
            console.log('Aadhaar Result:', {
                aadhaar: res.aadhaar,
                name: res.name,
                address: res.address,
                dob: res.dateOfBirth,
                gender: res.gender
            });
            console.log('Raw Text Preview:', res.rawText.substring(0, 200).replace(/\n/g, ' '));
        } else {
            console.log('Aadhaar file not found');
        }

        if (fs.existsSync(path.join(uploadDir, files.bank))) {
            console.log('\nTesting Bank Statement...');
            const res = await parseBankStatement(path.join(uploadDir, files.bank));
            console.log('Bank Result:', JSON.stringify(res, null, 2));
            console.log('Raw Text Preview:', res.rawText.substring(0, 200).replace(/\n/g, ' '));
        } else {
            console.log('Bank file not found');
        }

        if (fs.existsSync(path.join(uploadDir, files.salary))) {
            console.log('\nTesting Salary Slip...');
            const res = await parseSalarySlip(path.join(uploadDir, files.salary));
            console.log('Salary Result:', {
                employeeName: res.employeeName,
                netSalary: res.netSalary
            });
        } else {
            console.log('Salary file not found');
        }

    } catch (err) {
        console.error('Test Failed:', err);
    }
}

testAll();
