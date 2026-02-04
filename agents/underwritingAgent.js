
const policies = require('../rag/policies.json');
const { appendToLedger } = require('../blockchain/ledger');
const { callGemini } = require('../utils/geminiClient');
const { uploadJsonToPinata } = require('../utils/pinataClient');

function parsePricingResponse(rawResponse) {
    if (typeof rawResponse !== 'string') {
        throw new Error('Pricing response is not a string');
    }

    const fencedMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const withoutFences = fencedMatch ? fencedMatch[1] : rawResponse;
    const jsonBodyMatch = withoutFences.match(/\{[\s\S]*\}/);
    const jsonCandidate = jsonBodyMatch ? jsonBodyMatch[0] : withoutFences;

    try {
        return JSON.parse(jsonCandidate);
    } catch (error) {
        throw new Error(`Unable to parse pricing response as JSON: ${error.message}`);
    }
}

async function evaluateRiskAndPrice(sessionId, userData, creditData) {
    const { loanAmount } = userData;
    const { cibilScore, riskDecision } = creditData;

    if (riskDecision === 'high') {
        const decision = { eligibility: false, reason: "High risk profile" };
        const cid = await uploadJsonToPinata({ sessionId, decision });
        appendToLedger('underwriting_ledger', { agent: 'underwritingAgent', action: 'evaluateRiskAndPrice', sessionId, decision: 'ineligible', cid });
        return decision;
    }

    const policy = policies.loanPolicies.find(p => 
        cibilScore >= p.minCreditScore && loanAmount <= p.maxLoanAmount
    );

    if (!policy) {
        const decision = { eligibility: false, reason: "Loan amount or credit score does not meet policy requirements." };
        const cid = await uploadJsonToPinata({ sessionId, decision });
        appendToLedger('underwriting_ledger', { agent: 'underwritingAgent', action: 'evaluateRiskAndPrice', sessionId, decision: 'ineligible', cid });
        return decision;
    }

    const prompt = `An applicant with CIBIL score ${cibilScore} and risk decision '${riskDecision}' is applying for a loan of ${loanAmount}. The applicable policy is ${JSON.stringify(policy)}. Based on this, determine the interest rate. For 'low' risk, use the minimum rate from interestRateRange. For 'medium' risk, use the average of min and max from interestRateRange. Respond with a JSON object with an "interestRate" key. For example: {"interestRate": 8.5}`;
    
    const pricingResultString = await callGemini(prompt);
    const { interestRate } = parsePricingResponse(pricingResultString);

    if (interestRate === undefined || interestRate === null || Number.isNaN(Number(interestRate))) {
        throw new Error('Pricing response missing a valid interestRate');
    }

    const offer = {
        sessionId,
        loanAmount,
        interestRate: parseFloat(Number(interestRate).toFixed(2)),
        term: 36 // months, could be part of policy
    };

    const underwritingDecision = {
        agent: 'underwritingAgent',
        action: 'evaluateRiskAndPrice',
        sessionId,
        decision: 'eligible',
        offer
    };
    
    const cid = await uploadJsonToPinata(underwritingDecision);

    appendToLedger('underwriting_ledger', { ...underwritingDecision, cid });
    
    return { eligibility: true, offer };
}

module.exports = { evaluateRiskAndPrice };
