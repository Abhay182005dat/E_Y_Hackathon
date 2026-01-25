
const { appendToLedger } = require('../blockchain/ledger');
const { uploadJsonToPinata } = require('../utils/pinataClient');

async function collectUserData(sessionId, userData) {
    const { income, employmentType, loanAmount, city, consent } = userData;
    
    if (!consent || !consent.kyc || !consent.creditCheck) {
        throw new Error("User consent for KYC and credit check is required.");
    }

    // Log consent to IPFS and ledger
    const consentData = {
        agent: 'dataAgent',
        action: 'collectUserData',
        sessionId,
        consent,
        timestamp: new Date().toISOString()
    };
    const consentCid = await uploadJsonToPinata(consentData);
    appendToLedger('consent_ledger', { ...consentData, cid: consentCid });

    // Log captured data to IPFS and ledger
    const capturedData = { income, employmentType, loanAmount, city };
    const capturedDataInteraction = {
        agent: 'dataAgent',
        action: 'captureData',
        sessionId,
        capturedData
    };
    const interactionCid = await uploadJsonToPinata(capturedDataInteraction);
    appendToLedger('interaction_ledger', { ...capturedDataInteraction, cid: interactionCid });

    return { dataCollected: true, consentGiven: true, consentCid, interactionCid };
}

module.exports = { collectUserData };
