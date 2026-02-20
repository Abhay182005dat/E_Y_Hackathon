const path = require('path');
const fs = require('fs');
const { parseAadhaar } = require('./utils/ocr');

async function test() {
    try {
        const file = path.join(__dirname, 'uploads', '1771531122370_1769605945464_hemanth_adaar_compressed.pdf');
        if (fs.existsSync(file)) {
            console.log('Testing Aadhaar...');
            const res = await parseAadhaar(file);
            console.log(JSON.stringify(res, null, 2));
        } else {
            console.log('File not found');
        }
    } catch (err) {
        console.error(err);
    }
}
test();
