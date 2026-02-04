
const { appendToLedger } = require('../blockchain/ledger');
const { sha256 } = require('../utils/hash');
const { uploadJsonToPinata } = require('../utils/pinataClient');

async function generateSanctionLetter(sessionId, approvalDetails, finalOffer) {
    if (approvalDetails.approvalStatus !== 'approved') {
        throw new Error("Cannot generate documents for a non-approved loan.");
    }

    const loanId = sha256(`loan-${sessionId}-${Date.now()}`);
    
    const sanctionData = {
        loanId,
        sessionId,
        borrowerId: "user-mock-id", // Should be from user data
        ...finalOffer,
        sanctionDate: new Date().toISOString()
    };

    // Simulate digital signature
    const digitalSignature = sha256(JSON.stringify(sanctionData) + "securePrivateKey");

    const sanctionLetter = {
        ...sanctionData,
        digitalSignature
    };

    const cid = await uploadJsonToPinata(sanctionLetter);

    // Log hash and agent IDs to the loan ledger for traceability
    appendToLedger('loan_ledger', {
        agentIds: [
            'masterAgent', 
            'dataAgent', 
            'verificationAgent', 
            'creditAgent', 
            'underwritingAgent',
            'approvalAgent',
            'documentAgent'
        ],
        action: 'generateSanctionLetter',
        sessionId,
        sanctionCid: cid
    });

    return { loanId, sanctionCid: cid };
}

module.exports = { generateSanctionLetter };
