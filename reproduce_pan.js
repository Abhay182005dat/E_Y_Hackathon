const path = require('path');
const fs = require('fs');
const { parsePAN } = require('./utils/ocr');

async function test() {
    try {
        const file = path.join(__dirname, 'uploads', '1771531122375_1769605945473_pan_test_.jpeg');
        if (fs.existsSync(file)) {
            console.log('Testing PAN...');
            const res = await parsePAN(file);
            console.log(JSON.stringify(res, null, 2));
        } else {
            console.log('File not found');
        }
    } catch (err) {
        console.error(err);
    }
}
test();
