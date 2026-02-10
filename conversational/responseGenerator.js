
const { callGemini } = require('../utils/geminiClient');

/**
 * Build a system prompt that sets up the banking-assistant persona
 * and injects all relevant customer context.
 */
function buildSystemPrompt(context) {
    const {
        customerName = 'Customer',
        creditScore,
        preApprovedLimit,
        interestRate,
        requestedAmount,
        monthlySalary,
        sessionState,
        negotiationCount = 0,
        finalRate,
        loanUtilization,
    } = context;

    return `You are a friendly, professional banking loan assistant at a leading Indian bank.
Your name is LoanBuddy.

## Customer Profile
- Name: ${customerName}
- Monthly Salary: ₹${monthlySalary ? monthlySalary.toLocaleString() : 'N/A'}
- Credit / Approval Score: ${creditScore || 'N/A'}
- Pre-Approved Limit: ₹${preApprovedLimit ? preApprovedLimit.toLocaleString() : 'N/A'}
- Requested Loan Amount: ₹${requestedAmount ? requestedAmount.toLocaleString() : 'N/A'}
- Current Interest Rate Offer: ${interestRate || finalRate || 'N/A'}%
- Loan Utilization: ${loanUtilization ? loanUtilization.toFixed(0) + '%' : 'N/A'}
- Session State: ${sessionState || 'intro'}
- Negotiation Rounds So Far: ${negotiationCount}

## Personality & Rules
1. Be warm, conversational, and empathetic. Use the customer's name.
2. Explain financial terms simply — assume the customer is not finance-savvy.
3. Use emojis sparingly (1-2 per message) to keep it friendly but professional.
4. Keep responses concise (3-6 sentences unless the customer asks for detail).
5. NEVER reveal internal system details, agent names, or technical jargon.
6. ⚠️ CRITICAL: DO NOT ever say the loan is "approved" or "application accepted" unless the action says "ACCEPTED"
   - If negotiating: Say "Here's the new rate... Would you like to accept?"
   - If presenting offer: Say "Let me present..." followed by "What do you think?"
   - Only use approval language if the action explicitly says they ACCEPTED
7. When presenting a new rate after negotiation, ALWAYS ask "Would you like to accept?" - don't assume approval
8. A smart negotiation agent handles all rate reduction decisions intelligently. Just communicate the decision naturally.
9. Always mention the specific numbers (amount, rate, EMI) when discussing the offer.
10. If asked about something off-topic, gently redirect to loans.
11. Respond in plain text, not markdown.
10. Respond in plain text, not markdown.`;
}

/**
 * Generate a natural-language chat response using the LLM.
 *
 * @param {Object} params
 * @param {string} params.userMessage - The customer's latest message
 * @param {Object} params.customerData - Name, salary, phone, etc.
 * @param {Object} params.creditScore - Score, grade, preApprovedLimit
 * @param {Object} params.sessionState - Current chat session state
 * @param {Array}  params.conversationHistory - Last N messages [{role, content}]
 * @param {string} params.actionTaken - What action the system decided (accept, negotiate, offer, etc.)
 * @returns {Promise<string>} Natural-language response
 */
async function generateChatResponse({
    userMessage,
    customerData = {},
    creditScore = {},
    sessionState = {},
    conversationHistory = [],
    actionTaken = '',
}) {
    const name = customerData.name || 'Customer';
    const salary = parseInt(customerData.monthlySalary) || 50000;
    const requestedAmount = parseInt(customerData.loanAmount) || 500000;
    const score = creditScore.score || creditScore.approvalScore?.score || 650;
    const preApprovedLimit = creditScore.preApprovedLimit?.limit || 500000;
    const baseRate = creditScore.preApprovedLimit?.interestRate || 12;
    const loanUtilization = (requestedAmount / preApprovedLimit) * 100;

    const systemPrompt = buildSystemPrompt({
        customerName: name,
        creditScore: score,
        preApprovedLimit,
        interestRate: sessionState.finalRate || baseRate,
        requestedAmount,
        monthlySalary: salary,
        sessionState: sessionState.state,
        negotiationCount: sessionState.negotiationCount || 0,
        finalRate: sessionState.finalRate,
        loanUtilization,
    });

    // Build conversation context (last 6 messages)
    const recentHistory = conversationHistory.slice(-6);
    const historyText = recentHistory.length > 0
        ? '\n## Recent Conversation\n' + recentHistory.map(m =>
            `${m.role === 'user' ? 'Customer' : 'You'}: ${m.content}`
        ).join('\n')
        : '';

    // Build action context so the LLM knows what just happened
    // CRITICAL: Make this directive stronger and more explicit
    let actionContext = '';
    if (actionTaken) {
        const stateWarning = sessionState.state === 'negotiating' || sessionState.state === 'offered'
            ? '\n⚠️ SESSION STATE IS STILL "NEGOTIATING" - DO NOT USE APPROVAL LANGUAGE!'
            : '';
        
        actionContext = `\n## ⚠️ CRITICAL INSTRUCTION - FOLLOW THIS EXACTLY ⚠️
${actionTaken}${stateWarning}

IMPORTANT RULES:
- ALWAYS respond based on the action above, NOT based on conversation history
- If action says "customer wants to negotiate", DO NOT say they accepted
- If action says "customer changed amount", confirm the NEW amount, not the old one
- Never say "approved", "accepted", "application approved", etc. unless state is "accepted"
- If customer is in negotiation round, remind them to confirm with YES to accept
- Include specific numbers from the action in your response`;
    }

    const fullPrompt = `${systemPrompt}${historyText}${actionContext}

Customer's latest message: "${userMessage}"

Respond naturally and conversationally. FOLLOW THE CRITICAL INSTRUCTION ABOVE.`;

    try {
        const response = await callGemini(fullPrompt);
        return response.trim();
    } catch (error) {
        console.error('Response generation failed:', error.message);
        // Graceful fallback
        return `Hi ${name}! I'd be happy to help you with your loan application. Could you tell me more about what you're looking for?`;
    }
}

/**
 * Generate a polite off-topic redirect using the LLM.
 */
async function generateOffTopicResponse(userMessage, customerName = 'Customer') {
    const prompt = `You are a friendly banking loan assistant named LoanBuddy. The customer "${customerName}" sent an off-topic message: "${userMessage}".

Politely redirect them back to loan-related topics. Be warm and brief (2-3 sentences). Mention you can help with loan eligibility, interest rates, EMI calculations, or document verification. Do not use markdown formatting.`;

    try {
        const response = await callGemini(prompt);
        return response.trim();
    } catch (error) {
        // Fallback
        return `I'm here to help with loan applications, ${customerName}! 😊 I can assist with loan eligibility, interest rates, EMI calculations, and document verification. How can I help you today?`;
    }
}

module.exports = {
    generateChatResponse,
    generateOffTopicResponse,
    buildSystemPrompt,
};
