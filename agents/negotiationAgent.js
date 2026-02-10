const { callGemini } = require('../utils/geminiClient');
const { uploadJsonToPinata } = require('../utils/pinataClient');
const { appendToLedger } = require('../blockchain/ledger');

/**
 * Intelligent Negotiation Agent
 * 100% GenAI-driven negotiation logic
 * No hardcoded rules - all decisions made by LLM
 */
async function handleNegotiation(sessionId, currentContext) {
    const {
        customerName,
        creditScore,
        requestedAmount,
        preApprovedLimit,
        baseRate,
        adjustedRate,
        currentRate,
        negotiationCount,
        negotiationHistory = [],
        userRequest // What customer asked for
    } = currentContext;

    // Build dynamic negotiation context from history
    const negotiationSummary = buildNegotiationSummary(negotiationHistory);
    const creditProfile = analyzeCreditProfile(creditScore, requestedAmount, preApprovedLimit);

    // Build GenAI prompt that lets the LLM handle ALL logic
    const systemPrompt = buildNegotiationSystemPrompt(creditScore, baseRate);
    const userPrompt = buildNegotiationPrompt(
        customerName,
        creditProfile,
        {
            baseRate,
            adjustedRate,
            currentRate,
            negotiationCount,
            preApprovedLimit,
            requestedAmount
        },
        negotiationSummary,
        userRequest
    );

    try {
        console.log(`[NegotiationAgent] Processing request for ${customerName} (Credit: ${creditScore}, Round: ${negotiationCount})`);
        console.log(`[NegotiationAgent] Customer request: "${userRequest}"`);

        // Call Gemini with system + user prompt for full flexibility
        const responseText = await callGemini(userPrompt, systemPrompt);
        
        // Parse the JSON response from LLM
        let decision;
        try {
            decision = JSON.parse(responseText);
        } catch (parseError) {
            // Try to extract JSON from the response if it's wrapped
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                decision = JSON.parse(jsonMatch[0]);
            } else {
                console.error('[NegotiationAgent] Failed to parse LLM response:', responseText.substring(0, 200));
                throw new Error(`Invalid JSON response from LLM`);
            }
        }

        // Validate the response has required fields
        validateDecisionStructure(decision);

        // Log to blockchain for audit trail
        const negotiationRecord = {
            agent: 'negotiationAgent',
            action: 'handleNegotiation',
            sessionId,
            customerName,
            creditScore,
            currentRate,
            decision: decision.recommendation,
            newRate: decision.newRate,
            reasoning: decision.reasoning,
            negotiationRound: negotiationCount + 1,
            timestamp: new Date().toISOString()
        };

        const cid = await uploadJsonToPinata(negotiationRecord);
        appendToLedger('interaction_ledger', { ...negotiationRecord, cid });

        console.log(`[NegotiationAgent] ✅ Decision: ${decision.recommendation} | New Rate: ${decision.newRate || 'N/A'} | CID: ${cid}`);

        return {
            success: true,
            canNegotiate: decision.canNegotiate,
            recommendation: decision.recommendation,
            newRate: decision.newRate,
            reasoning: decision.reasoning,
            message: decision.message,
            confidence: decision.confidence || 'high',
            cid
        };

    } catch (error) {
        console.error('[NegotiationAgent] Error:', error.message);
        
        // Even in error, ask LLM what to do rather than hardcoded fallback
        try {
            return await generateAgenticFallback(
                customerName,
                currentRate,
                creditScore,
                negotiationCount,
                error.message
            );
        } catch (fallbackError) {
            return generateMinimalResponse(customerName, currentRate);
        }
    }
}

/**
 * If LLM call fails, ask LLM how to handle the fallback agentic-style
 */
async function generateAgenticFallback(customerName, currentRate, creditScore, round, errorMsg) {
    const fallbackPrompt = `A negotiation request failed: ${errorMsg}

Customer: ${customerName} (Credit: ${creditScore})
Current Rate: ${currentRate}%
Negotiation Round: ${round + 1}

Given this situation, what should we do? Respond with JSON:
{
  "recommendation": "accept|reduce|final_offer|decline",
  "newRate": number or null,
  "reasoning": "why this decision",
  "message": "what to tell customer"
}

Decide based on: Is this customer worth keeping? Have we been too flexible? What's fair for round ${round + 1}?`;

    try {
        const response = await callGemini(fallbackPrompt);
        const decision = JSON.parse(response.match(/\{[\s\S]*\}/)[0]);
        
        return {
            success: true,
            recommendation: decision.recommendation,
            newRate: decision.newRate,
            reasoning: decision.reasoning || 'Agentic fallback decision',
            message: decision.message,
            confidence: 'medium',
            cid: null
        };
    } catch (e) {
        console.error('[NegotiationAgent] Fallback also failed:', e.message);
        throw e;
    }
}

/**
 * Minimal fallback response
 */
function generateMinimalResponse(customerName, currentRate) {
    return {
        success: true,
        recommendation: 'final_offer',
        newRate: null,
        reasoning: 'System encountered issues. Presenting current rate as final offer.',
        message: `${customerName}, let me confirm the current terms. Your interest rate is ${currentRate}%. Would you like to proceed with this offer?`,
        confidence: 'low',
        cid: null
    };
}

/**
 * Build system prompt for the LLM based on credit profile
 */
function buildNegotiationSystemPrompt(creditScore, baseRate) {
    return `You are an intelligent loan pricing officer. Make every decision based on:
1. Customer credit quality (score: ${creditScore})
2. Risk assessment and profitability
3. Market competitiveness
4. Company's business rules encoded in your reasoning
5. NOT hardcoded formulas, but intelligent reasoning

Your job: Help the customer get a fair rate while protecting the bank's interests.
Base rate: ${baseRate}%

You must think like a real pricing officer, not follow rigid rules.`;
}

/**
 * Build the main user prompt with all context
 */
function buildNegotiationPrompt(customerName, creditProfile, rateInfo, history, userRequest) {
    return `
## New Negotiation Request

**Customer:** ${customerName}
**Credit Profile:** ${creditProfile}

## Current Rates
- Bank Base Rate: ${rateInfo.baseRate}%
- Initial Adjusted Rate (with bonuses): ${rateInfo.adjustedRate.toFixed(2)}%
- Currently Offered Rate: ${rateInfo.currentRate.toFixed(2)}%
- This is negotiation round ${rateInfo.negotiationCount + 1}

## Context
${history}
Loan Amount: ₹${rateInfo.requestedAmount.toLocaleString()}
Approved Limit: ₹${rateInfo.preApprovedLimit.toLocaleString()}

## Customer's Latest Request
"${userRequest}"

## Your Task (Respond ONLY with valid JSON, no markdown)

Analyze the negotiation context and make a smart business decision. Consider:
- Is further reduction justified by their credit score?
- Have we already been generous?
- What's the right balance between keeping the customer and profitability?
- Is this a stalling tactic or genuine concern?

Respond with:
{
  "canNegotiate": boolean,
  "recommendation": "reduce" | "final_offer" | "decline" | "accept",
  "newRate": number or null (required if "reduce"),
  "reasoning": "2-3 sentences explaining your decision and business logic",
  "message": "What to tell customer (2-3 sentences, present offer clearly, ask for confirmation)",
  "confidence": "high" | "medium" | "low"
}

Requirements for message:
- If reducing: "I can offer you X.XX% interest"
- If final offer: "This is our best rate at X.XX%"
- If declining: Explain clearly why
- NEVER say "approved" - always ask "Would you accept this?"
- Be warm but professional`;
}

/**
 * Analyze credit profile dynamically based on score
 */
function analyzeCreditProfile(score, amount, limit) {
    const utilization = (amount / limit) * 100;
    let profile = `Score: ${score}/900 (`;
    
    if (score >= 800) profile += 'Excellent, low risk) ';
    else if (score >= 750) profile += 'Good, acceptable risk) ';
    else if (score >= 700) profile += 'Fair, moderate risk) ';
    else profile += 'Below average, higher risk) ';
    
    profile += `| Utilization: ${utilization.toFixed(0)}% (`;
    if (utilization <= 30) profile += 'Low, flexible)';
    else if (utilization <= 60) profile += 'Moderate, reasonable)';
    else profile += 'High, limited flexibility)';
    
    return profile;
}

/**
 * Build negotiation history summary from previous rounds
 */
function buildNegotiationSummary(history) {
    if (history.length === 0) {
        return 'This is the first negotiation request from this customer.';
    }

    const rounds = history.map((h, i) => {
        const reduction = (h.fromRate - h.toRate).toFixed(2);
        return `Round ${i + 1}: ${h.fromRate.toFixed(2)}% → ${h.toRate.toFixed(2)}% (Reduction: ${reduction}%, Reason: ${h.reason})`;
    });

    return `Previous Negotiation History:\n${rounds.join('\n')}`;
}

/**
 * Validate LLM response structure
 */
function validateDecisionStructure(decision) {
    const required = ['canNegotiate', 'recommendation', 'reasoning', 'message'];
    const missing = required.filter(field => !(field in decision));
    
    if (missing.length > 0) {
        throw new Error(`Response missing required fields: ${missing.join(', ')}`);
    }

    if (!['reduce', 'final_offer', 'decline', 'accept'].includes(decision.recommendation)) {
        throw new Error(`Invalid recommendation: ${decision.recommendation}`);
    }

    if (decision.recommendation === 'reduce' && typeof decision.newRate !== 'number') {
        throw new Error('Recommendation "reduce" requires newRate field');
    }
}

module.exports = { handleNegotiation };
