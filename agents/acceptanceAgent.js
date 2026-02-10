const { callGemini } = require('../utils/geminiClient');
const { uploadJsonToPinata } = require('../utils/pinataClient');
const { appendToLedger } = require('../blockchain/ledger');

/**
 * Acceptance Agent
 * Uses LLM to validate and process application acceptance
 * Handles the complex logic of confirming acceptance with customer context
 */
async function handleAcceptance(sessionId, customerContext) {
    const {
        customerName,
        sessionState,
        currentRate,
        requestedAmount,
        approvedAmount,
        preApprovedLimit,
        creditScore,
        negotiationHistory = []
    } = customerContext;

    const systemPrompt = `You are a loan acceptance validator. Confirm that the customer action constitutes a valid acceptance of the loan offer.
Be strict about confirmation - only accept if the customer clearly intends to accept, not if they're just being polite.`;

    const negotiationContext = negotiationHistory.length > 0
        ? `Previous negotiations:\n${negotiationHistory.map(n => 
            `${n.fromRate.toFixed(2)}% → ${n.toRate.toFixed(2)}`
          ).join(', ')}`
        : 'No prior negotiation history';

    const userPrompt = `
## Acceptance Validation

**Customer:** ${customerName}
**Session State:** ${sessionState}
**Credit Score:** ${creditScore}

## Terms Being Accepted
- Interest Rate: ${currentRate}%
- Requested Amount: ₹${requestedAmount.toLocaleString()}
- Approved Amount: ₹${approvedAmount.toLocaleString()}
- Pre-Approved Limit: ₹${preApprovedLimit.toLocaleString()}

## Negotiation History
${negotiationContext}

Is this a valid acceptance? Consider:
- Has the customer explicitly agreed?
- Are there any lingering concerns in the message?
- Have all negotiation rounds been closed?
- Is the session state appropriate for acceptance?

Respond with JSON:
{
  "isValidAcceptance": boolean,
  "confidence": "high" | "medium" | "low",
  "reasoning": "why or why not",
  "nextAction": "accept" | "clarify" | "continue_negotiation" | "escalate",
  "message": "guidance for the response to customer"
}`;

    try {
        const response = await callGemini(userPrompt, systemPrompt);
        
        let decision;
        try {
            decision = JSON.parse(response);
        } catch (parseError) {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                decision = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Invalid acceptance validation response');
            }
        }

        // Log acceptance decision
        const acceptanceRecord = {
            agent: 'acceptanceAgent',
            action: 'validateAcceptance',
            sessionId,
            customerName,
            decision: decision.isValidAcceptance,
            nextAction: decision.nextAction,
            confidence: decision.confidence,
            timestamp: new Date().toISOString()
        };

        const cid = await uploadJsonToPinata(acceptanceRecord);
        appendToLedger('interaction_ledger', { ...acceptanceRecord, cid });

        return {
            success: true,
            isValidAcceptance: decision.isValidAcceptance,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
            nextAction: decision.nextAction,
            message: decision.message,
            cid
        };

    } catch (error) {
        console.error('[AcceptanceAgent] Error:', error.message);
        
        // Fallback: strict validation - require very clear confirmation
        return {
            success: false,
            isValidAcceptance: false,
            confidence: 'low',
            reasoning: 'System unable to validate acceptance. Requesting explicit confirmation.',
            nextAction: 'clarify',
            message: `${customerName}, could you please confirm: Do you accept the loan offer at ${currentRate}% interest for ₹${approvedAmount.toLocaleString()}?`,
            cid: null
        };
    }
}

module.exports = { handleAcceptance };
