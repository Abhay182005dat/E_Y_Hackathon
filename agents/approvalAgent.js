
const { appendToLedger } = require('../blockchain/ledger');
const { sha256 } = require('../utils/hash');
const { uploadJsonToPinata } = require('../utils/pinataClient');

async function executeApproval(sessionId, kycStatus, creditCheck, finalOffer) {
    // Rule Enforcement
    const reason = kycStatus !== 'verified' ? 'KYC not verified'
                 : !creditCheck.riskAcceptable ? 'Credit risk too high'
                 : finalOffer.userResponse !== 'accepted' ? 'Loan offer not accepted by user'
                 : null;

    const approvalStatus = reason ? 'rejected' : 'approved';

    const approvalData = {
        sessionId,
        approvalStatus,
        reason,
        finalOffer: approvalStatus === 'approved' ? finalOffer : null,
        approvedAt: new Date().toISOString()
    };
    
    const cid = await uploadJsonToPinata(approvalData);

    appendToLedger('approval_ledger', {
        agent: 'approvalAgent',
        action: 'executeApproval',
        sessionId,
        approvalCid: cid
    });

    if (approvalStatus === 'rejected') {
        return { approvalStatus, reason };
    }

    return { approvalStatus, approvalCid: cid };
}

module.exports = { executeApproval };
