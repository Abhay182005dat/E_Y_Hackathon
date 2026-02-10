const { callGemini } = require('../utils/geminiClient');

/**
 * Intent Detection Agent
 * Uses LLM to intelligently classify user intent
 * Replaces hardcoded keyword matching with GenAI-powered classification
 */
async function detectIntent(userMessage, sessionState, customerName) {
    const systemPrompt = `You are a banking chatbot intent classifier. Analyze the customer's message and determine their intent.
You are helping a loan customer in their journey. Current session state: ${sessionState}

Classify with intelligence - not just keyword matching. Consider context and natural language.`;

    const userPrompt = `Customer: ${customerName}
Session State: ${sessionState}
Customer Message: "${userMessage}"

Classify the intent. Respond with ONLY valid JSON (no markdown):
{
  "intent": "string (primary intent)",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation",
  "relatedIntents": ["array", "of", "related", "intents"],
  "contextFlags": {
    "isNegotiation": boolean,
    "isConfirmation": boolean,
    "isAmountChange": boolean,
    "isOffTopic": boolean,
    "requiresAction": boolean
  }
}

Possible intents:
- "accept_offer" (customer agrees to terms)
- "negotiate_rate" (customer wants to change interest rate)
- "change_amount" (customer wants to change loan amount)
- "query_terms" (customer wants to understand terms)
- "clarification" (customer asking clarifying questions)
- "frustration" (customer expressing frustration)
- "greeting" (customer greeting or general conversation)
- "submit_application" (customer ready to submit)
- "off_topic" (not related to loan)
- "unknown" (can't classify)

Be smart about context. For example:
- "okay" in negotiation context = asking about the offer, not acceptance
- "reduce to 7.5%" = negotiation intent, even without explicit "reduce" keyword
- "that's good" in offer state = might be acceptance
- "can i change the amount" = change_amount intent`;

    try {
        const responseText = await callGemini(userPrompt, systemPrompt);
        
        let classification;
        try {
            classification = JSON.parse(responseText);
        } catch (parseError) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                classification = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Invalid response from intent classifier');
            }
        }

        return {
            success: true,
            intent: classification.intent,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            relatedIntents: classification.relatedIntents || [],
            contextFlags: classification.contextFlags || {},
            raw: classification
        };

    } catch (error) {
        console.error('[IntentDetectionAgent] Error:', error.message);
        
        // Fallback: Simple keyword-based fallback
        return generateFallbackIntent(userMessage, sessionState);
    }
}

/**
 * Fallback intent detection if LLM fails
 */
function generateFallbackIntent(message, sessionState) {
    const lower = message.toLowerCase();
    
    let intent = 'unknown';
    let confidence = 'low';

    if (lower.includes('yes') || lower.includes('accept') || lower.includes('proceed') || lower.includes('go ahead')) {
        intent = 'accept_offer';
    } else if (lower.includes('reduce') || lower.includes('lower') || lower.includes('negotiate')) {
        intent = 'negotiate_rate';
    } else if (lower.includes('change') && (lower.includes('amount') || lower.includes('loan'))) {
        intent = 'change_amount';
    } else if (lower.includes('what') || lower.includes('how') || lower.includes('explain')) {
        intent = 'query_terms';
    } else if (lower.includes('off') || lower.includes('weather') || lower.includes('sports')) {
        intent = 'off_topic';
    }

    return {
        success: true,
        intent,
        confidence,
        reasoning: 'Fallback keyword-based classification (LLM unavailable)',
        relatedIntents: [],
        contextFlags: {
            isNegotiation: intent === 'negotiate_rate',
            isConfirmation: intent === 'accept_offer',
            isAmountChange: intent === 'change_amount',
            isOffTopic: intent === 'off_topic',
            requiresAction: intent !== 'unknown' && intent !== 'off_topic'
        }
    };
}

module.exports = { detectIntent };
