
const { appendToLedger } = require('../blockchain/ledger');
const { sha256 } = require('../utils/hash');
const { callGemini } = require('../utils/geminiClient');
const { uploadJsonToPinata } = require('../utils/pinataClient');
const { logDocumentToBlockchain } = require('../blockchain/web3Client');

function parseKycResponse(rawResponse) {
    if (typeof rawResponse !== 'string') {
        throw new Error('KYC response is not a string');
    }

    const fencedMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const withoutFences = fencedMatch ? fencedMatch[1] : rawResponse;
    const jsonBodyMatch = withoutFences.match(/\{[\s\S]*\}/);
    const jsonCandidate = jsonBodyMatch ? jsonBodyMatch[0] : withoutFences;

    try {
        return JSON.parse(jsonCandidate);
    } catch (error) {
        throw new Error(`Unable to parse KYC response as JSON: ${error.message}`);
    }
}

async function verifyKYC(sessionId, kycDocuments, userId = null) {
    const { pan, aadhaar } = kycDocuments;
    
    // Extract userId if not provided
    if (!userId) {
        userId = kycDocuments.phone || kycDocuments.accountNumber || kycDocuments.userId || 'unknown';
    }

    if (!pan || !aadhaar) {
        throw new Error("PAN and Aadhaar documents are required for KYC.");
    }

    const prompt = `Please verify the following KYC documents. PAN: "${pan}", Aadhaar: "${aadhaar}". A valid PAN has the format [A-Z]{5}[0-9]{4}[A-Z]{1}. A valid Aadhaar has 12 digits. Respond with a JSON object containing a "kycStatus" key which can be "verified" or "rejected", and a "reason" key explaining why. If both are valid, the status is "verified".`;

    const kycResultString = await callGemini(prompt);
    const kycResult = parseKycResponse(kycResultString);
    const { kycStatus, reason } = kycResult;

    if (!kycStatus) {
        throw new Error('KYC response missing kycStatus');
    }

    const kycDocumentHash = sha256(JSON.stringify(kycDocuments));

    const verificationRecord = {
        agent: 'verificationAgent',
        action: 'verifyKYC',
        sessionId,
        kycDocumentHash,
        kycStatus,
        reason: reason || 'No reason provided',
        timestamp: new Date().toISOString()
    };

    const cid = await uploadJsonToPinata(verificationRecord);

    appendToLedger('identity_ledger', { ...verificationRecord, cid });
    
    // Log documents to blockchain
    try {
        // Log PAN document
        await logDocumentToBlockchain({
            documentId: `PAN_${sessionId}_${Date.now()}`,
            userId,
            documentType: 'pan',
            verified: kycStatus === 'verified',
            extractedData: { pan },
            ipfsHash: cid
        });
        
        // Log Aadhaar document
        await logDocumentToBlockchain({
            documentId: `AADHAAR_${sessionId}_${Date.now()}`,
            userId,
            documentType: 'aadhaar',
            verified: kycStatus === 'verified',
            extractedData: { aadhaar },
            ipfsHash: cid
        });
    } catch (error) {
        console.error('Failed to log KYC documents to blockchain:', error.message);
        // Continue even if blockchain logging fails
    }

    return { kycStatus, reason: reason || 'KYC rejected without a detailed reason' };
}

module.exports = { verifyKYC };
