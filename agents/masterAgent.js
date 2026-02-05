
const { appendToLedger } = require('../blockchain/ledger');
const { sha256 } = require('../utils/hash');
const { callGemini } = require('../utils/geminiClient');
const { uploadJsonToPinata } = require('../utils/pinataClient');

function parseJsonResponse(rawResponse, label) {
    if (typeof rawResponse !== 'string') {
        throw new Error(`${label} response is not a string`);
    }

    const fencedMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const withoutFences = fencedMatch ? fencedMatch[1] : rawResponse;
    const jsonBodyMatch = withoutFences.match(/\{[\s\S]*\}/);
    const jsonCandidate = jsonBodyMatch ? jsonBodyMatch[0] : withoutFences;

    try {
        return JSON.parse(jsonCandidate);
    } catch (error) {
        throw new Error(`Unable to parse ${label} response as JSON: ${error.message}`);
    }
}

async function detectLoanIntent(query, existingSessionId) {
    const prompt = `You are a banking loan assistant. Analyze if this query is related to LOANS, BANKING, CREDIT, or FINANCIAL services.

Query: "${query}"

Respond with EXACTLY ONE word:
- "loanApplication" if asking to apply for a loan, borrow money, or get financing
- "loanStatus" if asking about existing loan status, payments, EMI
- "generalInquiry" if asking general questions about loan terms, eligibility, interest rates
- "offtopic" if the query is completely unrelated to banking/loans (like: weather, sports, jokes, cooking, etc.)

Respond with ONLY ONE WORD. No explanation.`;
    const intentResult = await callGemini(prompt);
    const intent = intentResult.trim().toLowerCase().replace(/[^a-z]/g, '');
    const sessionId = existingSessionId || sha256(query + Date.now());

    // Validate intent is one of the expected values
    const validIntents = ['loanapplication', 'loanstatus', 'generalinquiry', 'offtopic'];
    const finalIntent = validIntents.includes(intent) ? intent : 'offtopic';

    const interaction = {
        agent: 'masterAgent',
        action: 'detectLoanIntent',
        sessionId,
        query,
        intent: finalIntent,
        rawResponse: intentResult
    };

    const cid = await uploadJsonToPinata(interaction);
    appendToLedger('interaction_ledger', { ...interaction, cid });

    return { intent: finalIntent, sessionId };
}

async function presentAndNegotiateOffer(sessionId, offer) {
    const prompt = `You are simulating the customer's response to a personal-loan offer in a sales chat. Offer: ${JSON.stringify(offer)}.
Return STRICT JSON ONLY with keys: userResponse (accepted|rejected|negotiate), reason (string), and if negotiate then requestedChanges (object) with optional interestRateDelta or tenureMonths.
Keep it realistic: customers may negotiate slightly; reject if terms feel unsuitable.`;
    const negotiationResult = await callGemini(prompt);
    const negotiatedOffer = parseJsonResponse(negotiationResult, 'negotiation');

    const interaction = {
        agent: 'masterAgent',
        action: 'presentAndNegotiateOffer',
        sessionId,
        offer: negotiatedOffer
    };
    
    const cid = await uploadJsonToPinata(interaction);
    appendToLedger('interaction_ledger', { ...interaction, cid });

    if(negotiatedOffer.userResponse === 'accepted'){
        const offerForLedger = { sessionId, offer: negotiatedOffer, status: 'locked' };
        const offerCid = await uploadJsonToPinata(offerForLedger);
        appendToLedger('loan_offer_ledger', { ...offerForLedger, cid: offerCid });
    }
    return negotiatedOffer;
}

module.exports = { 
    detectLoanIntent,
    presentAndNegotiateOffer
};
