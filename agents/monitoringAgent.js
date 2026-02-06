
const { appendToLedger, getLedger } = require('../blockchain/ledger');
const { sha256 } = require('../utils/hash');
const { uploadJsonToPinata } = require('../utils/pinataClient');
const { callGemini } = require('../utils/geminiClient');
const { logPaymentToBlockchain } = require('../blockchain/web3Client');

function parsePredictionResponse(rawResponse) {
    if (typeof rawResponse !== 'string') {
        throw new Error('Prediction response is not a string');
    }

    const fencedMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const withoutFences = fencedMatch ? fencedMatch[1] : rawResponse;
    const jsonBodyMatch = withoutFences.match(/\{[\s\S]*\}/);
    const jsonCandidate = jsonBodyMatch ? jsonBodyMatch[0] : withoutFences;

    try {
        return JSON.parse(jsonCandidate);
    } catch (error) {
        throw new Error(`Unable to parse prediction response as JSON: ${error.message}`);
    }
}

async function logEmiPayment(loanId, paymentData, userId = null) {
    const { amount, paymentDate, emiNumber = 1 } = paymentData;
    const paymentId = sha256(`${loanId}-${amount}-${paymentDate}`);
    
    // Extract userId if not provided
    if (!userId) {
        userId = paymentData.phone || paymentData.accountNumber || paymentData.userId || 'unknown';
    }

    const prediction = await predictDefaultRisk(loanId);

    const paymentRecord = {
        agent: 'monitoringAgent',
        action: 'logEmiPayment',
        loanId,
        paymentId,
        amount,
        paymentDate,
        riskPrediction: prediction,
        timestamp: new Date().toISOString()
    };
    
    const cid = await uploadJsonToPinata(paymentRecord);

    appendToLedger('payment_ledger', { ...paymentRecord, cid });
    
    // Log to blockchain
    if (amount > 0) { // Only log real payments (not mock payments)
        try {
            await logPaymentToBlockchain({
                loanId,
                userId,
                emiNumber,
                amount,
                principalPaid: amount * 0.7, // Approximate breakdown
                interestPaid: amount * 0.3,
                status: 'paid',
                receiptHash: cid
            });
        } catch (error) {
            console.error('Failed to log EMI payment to blockchain:', error.message);
            // Continue even if blockchain logging fails
        }
    }

    return { 
        paymentStatus: 'logged', 
        paymentId,
        paymentCid: cid,
        riskPrediction: prediction
    };
}

async function predictDefaultRisk(loanId) {
    const paymentHistory = getLedger('payment_ledger');
    const paymentsForLoan = paymentHistory.filter(p => p.data.loanId === loanId).map(p => p.data);

    const prompt = `Given the following payment history for a loan, predict the default risk ('low', 'medium', 'high'). History: ${JSON.stringify(paymentsForLoan)}. If there are fewer than 3 payments, risk is 'low' and message is 'Monitoring started.'. If payments are consistent, risk is 'low' and message is 'Payments are consistent.'. Respond with a JSON object containing "risk" and "message" keys.`;

    try {
        const predictionString = await callGemini(prompt);
        return parsePredictionResponse(predictionString);
    } catch (err) {
        console.warn('Prediction parsing failed, defaulting to low risk:', err.message);
        return { risk: 'low', message: 'Monitoring started.' };
    }
}


module.exports = { logEmiPayment };
