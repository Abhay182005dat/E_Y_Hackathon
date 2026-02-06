
const { appendToLedger } = require('../blockchain/ledger');
const policies = require('../rag/policies.json');
const { callGemini } = require('../utils/geminiClient');
const { uploadJsonToPinata } = require('../utils/pinataClient');
const { sha256 } = require('../utils/hash');
const { logCreditScoreToBlockchain } = require('../blockchain/web3Client');

function parseRiskResponse(rawResponse) {
    if (typeof rawResponse !== 'string') {
        throw new Error('Risk response is not a string');
    }

    const fencedMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const withoutFences = fencedMatch ? fencedMatch[1] : rawResponse;
    const jsonBodyMatch = withoutFences.match(/\{[\s\S]*\}/);
    const jsonCandidate = jsonBodyMatch ? jsonBodyMatch[0] : withoutFences;

    try {
        return JSON.parse(jsonCandidate);
    } catch (error) {
        throw new Error(`Unable to parse risk response as JSON: ${error.message}`);
    }
}

async function analyzeCredit(sessionId, userData, userId = null) {
    const { cibilScore } = userData;

    if (typeof cibilScore !== 'number') {
        throw new Error("CIBIL score is required for credit analysis.");
    }
    
    // Extract userId if not provided
    if (!userId) {
        userId = userData.phone || userData.accountNumber || userData.userId || 'unknown';
    }

    const policy = policies.loanPolicies.find(p => cibilScore >= p.minCreditScore);

    const prompt = `Analyze the credit risk for a user with CIBIL score ${cibilScore}. The applicable policy is: ${JSON.stringify(policy)}. Based on this, is the risk 'low', 'medium', or 'high'? A score above 750 is low risk. If no policy is found, it is high risk. Respond with a JSON object with a "riskDecision" key. For example: {"riskDecision": "low"}`;

    const riskDecisionString = await callGemini(prompt);
    const { riskDecision } = parseRiskResponse(riskDecisionString);

    if (!riskDecision) {
        throw new Error('Credit risk response missing riskDecision');
    }

    const riskReason = riskDecision === 'high'
        ? `Risk decision '${riskDecision}' for CIBIL ${cibilScore}${policy ? ` under policy ${policy.policyId}` : ' with no matching policy'}`
        : undefined;

    const creditData = {
        sessionId,
        cibilScore,
        riskDecision,
        riskReason,
        policyId: policy ? policy.policyId : null
    };

    const cid = await uploadJsonToPinata(creditData);

    appendToLedger('credit_ledger', {
        agent: 'creditAgent',
        action: 'analyzeCredit',
        decisionHash: sha256(JSON.stringify(creditData)),
        cid,
        timestamp: new Date().toISOString()
    });
    
    // Log to blockchain
    try {
        const grade = cibilScore >= 750 ? 'A+' : cibilScore >= 700 ? 'A' : cibilScore >= 650 ? 'B' : cibilScore >= 600 ? 'C' : 'D';
        const preApprovedLimit = cibilScore >= 750 ? 1000000 : cibilScore >= 700 ? 500000 : cibilScore >= 650 ? 300000 : 100000;
        
        await logCreditScoreToBlockchain({
            userId,
            score: cibilScore,
            grade,
            preApprovedLimit
        });
    } catch (error) {
        console.error('Failed to log credit to blockchain:', error.message);
        // Continue even if blockchain logging fails
    }

    return { 
        riskAcceptable: riskDecision !== 'high',
        creditData,
        reason: riskReason
    };
}

module.exports = { analyzeCredit };
