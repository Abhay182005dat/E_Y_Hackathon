
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

/**
 * Upload JSON data to IPFS via Pinata with custom filename
 * @param {Object} jsonData - JSON object to upload
 * @param {String} fileName - Custom filename for the JSON file
 * @returns {Object} - IPFS hash and Pinata URL
 */
async function uploadJSONToIPFS(jsonData, fileName = 'data.json') {
    try {
        const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
        
        const data = {
            pinataContent: jsonData,
            pinataMetadata: {
                name: fileName,
                keyvalues: {
                    type: 'master-contract',
                    timestamp: new Date().toISOString()
                }
            }
        };
        
        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pinataJwt}`
            },
            timeout: 30000
        });
        
        const ipfsHash = response.data.IpfsHash;
        const pinataUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
        
        console.log(`✅ JSON uploaded to IPFS: ${ipfsHash}`);
        
        return {
            success: true,
            ipfsHash,
            pinataUrl,
            fileName
        };
    } catch (error) {
        console.error('❌ Failed to upload JSON to Pinata:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = { uploadJsonToPinata, uploadJSONToIPFS };
