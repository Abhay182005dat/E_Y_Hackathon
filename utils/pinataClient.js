
const axios = require('axios');
require('dotenv').config();

const pinataJwt = process.env.PINATA_JWT;
const pinataApiUrl = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

async function uploadJsonToPinata(jsonData) {
    if (!pinataJwt) {
        throw new Error('PINATA_JWT is not set in the environment variables.');
    }

    try {
        const response = await axios.post(pinataApiUrl, jsonData, {
            headers: {
                'Authorization': `Bearer ${pinataJwt}`
            },
            timeout: 30000 // 30 second timeout
        });
        return response.data.IpfsHash;
    } catch (error) {
        console.error('Error uploading to Pinata:', error);
        throw new Error('Failed to upload JSON to Pinata.');
    }
}

module.exports = { uploadJsonToPinata };
