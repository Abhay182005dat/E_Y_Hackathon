
const { appendToLedger } = require('../blockchain/ledger');
const { sha256 } = require('../utils/hash');
const { uploadJsonToPinata } = require('../utils/pinataClient');

function generateEmiSchedule(loanAmount, interestRate, term) {
    const monthlyRate = interestRate / 12 / 100;
    const emi = (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
    const schedule = [];
    let balance = loanAmount;
    for (let i = 0; i < term; i++) {
        const interest = balance * monthlyRate;
        const principal = emi - interest;
        balance -= principal;
        schedule.push({
            month: i + 1,
            emi: emi.toFixed(2),
            principal: principal.toFixed(2),
            interest: interest.toFixed(2),
            balance: balance.toFixed(2)
        });
    }
    return { schedule, monthlyEmi: emi.toFixed(2) };
}

async function disburseFunds(sessionId, loanId, sanctionLetter) {
    const { loanAmount, interestRate, term } = sanctionLetter;
    
    const transactionId = sha256(`disburse-${loanId}-${Date.now()}`);
    const { schedule, monthlyEmi } = generateEmiSchedule(loanAmount, interestRate, term);

    const disbursementRecord = {
        agent: 'disbursementAgent',
        action: 'disburseFunds',
        sessionId,
        loanId,
        transactionId,
        amount: loanAmount,
        monthlyEmi,
        emiSchedule: schedule,
        timestamp: new Date().toISOString()
    };

    const cid = await uploadJsonToPinata(disbursementRecord);

    appendToLedger('disbursement_ledger', {
        agent: 'disbursementAgent',
        sessionId,
        loanId,
        transactionId,
        cid,
        timestamp: new Date().toISOString()
    });

    return { 
        disbursementStatus: 'completed', 
        transactionId,
        monthlyEmi,
        disbursementCid: cid
    };
}

module.exports = { disburseFunds };
