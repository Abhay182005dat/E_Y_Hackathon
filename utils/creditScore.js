/**
 * Approval Score Calculator - Production-Level BFSI Algorithm
 * Score range: 300-900 (same as CIBIL credit score)
 * 
 * Formula:
 * ApprovalScore = 300 + (WeightedAverage × 600)
 * Where WeightedAverage = (IncomeStability × 25%) + (DebtToIncomeRatio × 25%) + 
 *                        (LoanFeasibility × 20%) + (BankingBehavior × 15%) + (EmploymentFactor × 15%)
 */

const MIN_SCORE = 300;
const MAX_SCORE = 900;
const SCORE_RANGE = MAX_SCORE - MIN_SCORE; // 600

/**
 * Calculate Approval Score based on real financial data
 * @param {Object} customerData - Customer profile (salary, employment, etc.)
 * @param {Object} documents - Parsed documents (bankStatement, salarySlip)
 * @param {number} requestedLoanAmount - Requested loan amount
 * @returns {Object} Approval score with breakdown
 */
function calculateApprovalScore(customerData, documents = {}, requestedLoanAmount = 0) {
    const breakdown = {};

    const salary = parseInt(customerData.monthlySalary) || 50000;
    const loanAmount = requestedLoanAmount || parseInt(customerData.loanAmount) || 500000;
    const employment = customerData.employmentType || 'salaried';
    const existingEMI = parseInt(customerData.existingEMI) || 0;

    // 1. Income Stability Score (25%)
    // Higher salary = more stable = higher score
    let incomeScore;
    if (salary >= 100000) incomeScore = 100;
    else if (salary >= 75000) incomeScore = 90;
    else if (salary >= 50000) incomeScore = 80;
    else if (salary >= 35000) incomeScore = 65;
    else if (salary >= 25000) incomeScore = 50;
    else incomeScore = Math.max(20, (salary / 25000) * 50);

    breakdown.incomeStability = { score: incomeScore, weight: 0.25, description: 'Based on monthly income' };

    // 2. Debt-to-Income Ratio (25%)
    // FOIR should be < 50% of income
    const tenure = 36; // 3 years
    const assumedRate = 12; // 12% p.a.
    const proposedEMI = calculateEMI(loanAmount, assumedRate, tenure);
    const totalEMI = proposedEMI + existingEMI;
    const dtiRatio = (totalEMI / salary) * 100;

    let dtiScore;
    if (dtiRatio <= 30) dtiScore = 100;
    else if (dtiRatio <= 40) dtiScore = 85;
    else if (dtiRatio <= 50) dtiScore = 70;
    else if (dtiRatio <= 60) dtiScore = 50;
    else if (dtiRatio <= 75) dtiScore = 30;
    else dtiScore = 10;

    breakdown.debtToIncome = { score: dtiScore, weight: 0.25, description: `EMI/Income: ${dtiRatio.toFixed(1)}%` };

    // 3. Loan Amount Feasibility (20%)
    // Compare requested amount vs max affordable (10x annual salary as benchmark)
    const maxAffordable = salary * 12 * 5; // 5 years of salary
    const feasibilityRatio = loanAmount / maxAffordable;

    let feasibilityScore;
    if (feasibilityRatio <= 0.3) feasibilityScore = 100;
    else if (feasibilityRatio <= 0.5) feasibilityScore = 85;
    else if (feasibilityRatio <= 0.7) feasibilityScore = 70;
    else if (feasibilityRatio <= 1.0) feasibilityScore = 50;
    else if (feasibilityRatio <= 1.5) feasibilityScore = 30;
    else feasibilityScore = 10;

    breakdown.loanFeasibility = { score: feasibilityScore, weight: 0.20, description: `Loan vs affordable ratio` };

    // 4. Banking Behavior (15%)
    // Based on bank statement analysis
    let bankingScore = 70; // Default if no statement

    if (documents.bankStatement) {
        const bs = documents.bankStatement;
        const avgBalance = bs.averageBalance || bs.closingBalance || 0;
        const minBalance = bs.minBalance || avgBalance;

        // Good banking behavior indicators
        if (avgBalance > salary * 2) bankingScore += 15;
        else if (avgBalance > salary) bankingScore += 10;

        if (minBalance > 10000) bankingScore += 10;
        if (bs.estimatedMonthlySalary && bs.estimatedMonthlySalary >= salary * 0.9) bankingScore += 5;

        bankingScore = Math.min(100, bankingScore);
    }

    breakdown.bankingBehavior = { score: bankingScore, weight: 0.15, description: 'Based on account activity' };

    // 5. Employment Factor (15%)
    let employmentScore;
    switch (employment.toLowerCase()) {
        case 'salaried':
        case 'government':
            employmentScore = 100;
            break;
        case 'self-employed':
        case 'business':
            employmentScore = 75;
            break;
        case 'freelancer':
        case 'contractor':
            employmentScore = 60;
            break;
        default:
            employmentScore = 50;
    }

    breakdown.employment = { score: employmentScore, weight: 0.15, description: employment };

    // Calculate final weighted average (0-100 internally)
    const weightedAverage =
        breakdown.incomeStability.score * breakdown.incomeStability.weight +
        breakdown.debtToIncome.score * breakdown.debtToIncome.weight +
        breakdown.loanFeasibility.score * breakdown.loanFeasibility.weight +
        breakdown.bankingBehavior.score * breakdown.bankingBehavior.weight +
        breakdown.employment.score * breakdown.employment.weight;

    // Map to 300-900 range
    const finalScore = Math.round(MIN_SCORE + (weightedAverage / 100) * SCORE_RANGE);

    return {
        score: finalScore,
        grade: getGrade(finalScore),
        riskLevel: getRiskLevel(finalScore),
        eligibleForLoan: finalScore >= 650,
        breakdown,
        recommendations: getRecommendations(breakdown)
    };
}

/**
 * Calculate pre-approved limit using FOIR (Fixed Obligation to Income Ratio)
 */
function calculatePreApprovedLimit(approvalScore, monthlySalary, existingEMI = 0) {
    const maxFOIR = 0.50; // 50% of income
    const availableForEMI = (monthlySalary * maxFOIR) - existingEMI;

    if (availableForEMI <= 0) {
        return { limit: 0, maxEMI: 0, reason: 'EMI exceeds 50% of income' };
    }

    // Interest rate based on approval score
    const interestRate = getInterestRate(approvalScore);
    const tenure = 36;
    const monthlyRate = interestRate / 12 / 100;

    // Reverse EMI calculation: P = EMI * [(1+r)^n - 1] / [r * (1+r)^n]
    const factor = (Math.pow(1 + monthlyRate, tenure) - 1) /
        (monthlyRate * Math.pow(1 + monthlyRate, tenure));
    let maxLoan = availableForEMI * factor;

    // Apply score multiplier (300-900 scale)
    const multiplier = approvalScore >= 750 ? 1.0 : approvalScore >= 700 ? 0.85 : approvalScore >= 650 ? 0.7 : 0.5;
    maxLoan = Math.round(maxLoan * multiplier / 10000) * 10000;

    return {
        limit: maxLoan,
        maxEMI: Math.round(availableForEMI),
        interestRate,
        tenure
    };
}

/**
 * Get interest rate by approval score (300-900 scale)
 */
function getInterestRate(score) {
    if (score >= 800) return 10.5;
    if (score >= 750) return 11.5;
    if (score >= 700) return 13.0;
    if (score >= 650) return 15.0;
    if (score >= 550) return 18.0;
    return 21.0;
}

function getGrade(score) {
    if (score >= 800) return 'A+';
    if (score >= 750) return 'A';
    if (score >= 700) return 'B+';
    if (score >= 650) return 'B';
    if (score >= 550) return 'C';
    return 'D';
}

function getRiskLevel(score) {
    if (score >= 750) return 'low';
    if (score >= 650) return 'medium';
    return 'high';
}

function getRecommendations(breakdown) {
    const recs = [];
    if (breakdown.incomeStability.score < 60) recs.push('Consider a higher income source');
    if (breakdown.debtToIncome.score < 60) recs.push('Reduce existing EMIs or request lower amount');
    if (breakdown.loanFeasibility.score < 50) recs.push('Request a smaller loan amount');
    if (breakdown.bankingBehavior.score < 60) recs.push('Maintain higher average balance');
    return recs;
}

/**
 * Calculate EMI
 */
function calculateEMI(principal, annualRate, tenureMonths) {
    const monthlyRate = annualRate / 12 / 100;
    const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
        (Math.pow(1 + monthlyRate, tenureMonths) - 1);
    return Math.round(emi);
}

/**
 * Generate EMI Schedule for approved loan
 */
function generateEMISchedule(loanAmount, interestRate, tenure, startDate = new Date()) {
    const emi = calculateEMI(loanAmount, interestRate, tenure);
    const schedule = [];

    let balance = loanAmount;
    const monthlyRate = interestRate / 12 / 100;

    for (let i = 1; i <= tenure; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        dueDate.setDate(5); // EMI due on 5th of each month

        const interest = Math.round(balance * monthlyRate);
        const principal = emi - interest;
        balance = Math.max(0, balance - principal);

        schedule.push({
            installmentNo: i,
            dueDate: dueDate.toISOString().split('T')[0],
            emi,
            principal,
            interest,
            balance: Math.round(balance),
            status: 'pending'
        });
    }

    return {
        emi,
        totalPayment: emi * tenure,
        totalInterest: (emi * tenure) - loanAmount,
        schedule
    };
}

// Keep old function name for backward compatibility
function calculateCreditScore(customerData, documents, externalLoans) {
    return calculateApprovalScore(customerData, documents, customerData?.loanAmount || 500000);
}

module.exports = {
    calculateApprovalScore,
    calculateCreditScore, // backward compatibility
    calculatePreApprovedLimit,
    calculateEMI,
    generateEMISchedule,
    getInterestRate,
    getGrade,
    getRiskLevel
};
