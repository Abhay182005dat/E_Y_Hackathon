const { Jimp } = require('jimp');

async function test() {
    try {
        console.log('Creating image...');
        const image = new Jimp({ width: 500, height: 500, color: 0xFF0000FF });

        console.log('Resizing with Jimp.AUTO:', Jimp.AUTO); // Check what Jimp.AUTO is
        try {
            // Reproduce the call from ocr.js: image.resize(1000, Jimp.AUTO)
            image.resize(1000, Jimp.AUTO);
            console.log('Resize Success');
        } catch (err) {
            console.error('Resize Failed:', err);
        }

        console.log('Trying resize with object syntax...');
        try {
            // Try object syntax if v1
            image.resize({ w: 1000 });
            console.log('Resize Object Syntax Success');
        } catch (err) {
            console.error('Resize Object Syntax Failed:', err);
        }
    } catch (err) {
        console.error('Setup failed:', err);
    }
}

test();
