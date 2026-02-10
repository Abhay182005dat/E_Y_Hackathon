
const { StateGraph, END } = require('@langchain/langgraph');
const { GraphState } = require('./graphState');

// Import all agents
const { detectLoanIntent, presentAndNegotiateOffer } = require('../agents/masterAgent');
const { collectUserData } = require('../agents/dataAgent');
const { verifyKYC } = require('../agents/verificationAgent');
const { analyzeCredit } = require('../agents/creditAgent');
const { evaluateRiskAndPrice } = require('../agents/underwritingAgent');
const { executeApproval } = require('../agents/approvalAgent');
const { generateSanctionLetter } = require('../agents/documentAgent');
const { disburseFunds } = require('../agents/disbursementAgent');
const { logEmiPayment } = require('../agents/monitoringAgent');

// ─── Node Functions ────────────────────────────────────────────────

/**
 * Node: Intent Detection
 * Uses the masterAgent to classify the user's message.
 */
async function intentDetectionNode(state) {
    console.log('🤖 [Graph] Node: intentDetection');
    try {
        const { intent, sessionId } = await detectLoanIntent(state.message, state.sessionId || undefined);
        return {
            intent,
            sessionId: state.sessionId || sessionId,
            currentAgent: 'masterAgent',
        };
    } catch (error) {
        console.error('Intent detection failed:', error.message);
        return { intent: 'offtopic', error: error.message, currentAgent: 'masterAgent' };
    }
}

/**
 * Node: Data Collection
 * Collects user consent and data via the dataAgent.
 */
async function dataCollectionNode(state) {
    console.log('📋 [Graph] Node: dataCollection');
    try {
        const { consentCid, interactionCid } = await collectUserData(state.sessionId, state.userData);
        return {
            currentAgent: 'dataAgent',
            cids: [
                { step: 'consent', cid: consentCid },
                { step: 'dataCollection', cid: interactionCid },
            ],
        };
    } catch (error) {
        console.error('Data collection failed:', error.message);
        return {
            currentAgent: 'dataAgent',
            status: 'rejected',
            rejectionReason: error.message,
            error: error.message,
        };
    }
}

/**
 * Node: KYC Verification
 * Verifies user identity documents via the verificationAgent.
 */
async function kycVerificationNode(state) {
    console.log('🔍 [Graph] Node: kycVerification');
    try {
        const { kycStatus, reason } = await verifyKYC(
            state.sessionId,
            state.userData.kycDocuments || state.userData,
            state.userId
        );
        return {
            kycStatus,
            kycReason: reason,
            currentAgent: 'verificationAgent',
        };
    } catch (error) {
        console.error('KYC verification failed:', error.message);
        return {
            kycStatus: 'rejected',
            kycReason: error.message,
            currentAgent: 'verificationAgent',
            error: error.message,
        };
    }
}

/**
 * Node: Credit Analysis
 * Evaluates credit risk via the creditAgent.
 */
async function creditAnalysisNode(state) {
    console.log('📊 [Graph] Node: creditAnalysis');
    try {
        const result = await analyzeCredit(state.sessionId, state.userData, state.userId);
        return {
            creditData: result.creditData,
            riskAcceptable: result.riskAcceptable,
            currentAgent: 'creditAgent',
            cids: [{ step: 'creditAnalysis', cid: result.creditData?.cid }],
            ...(result.riskAcceptable ? {} : {
                status: 'rejected',
                rejectionReason: result.reason || 'Credit risk not acceptable',
            }),
        };
    } catch (error) {
        console.error('Credit analysis failed:', error.message);
        return {
            riskAcceptable: false,
            currentAgent: 'creditAgent',
            status: 'rejected',
            rejectionReason: error.message,
            error: error.message,
        };
    }
}

/**
 * Node: Underwriting
 * Determines eligibility and pricing via the underwritingAgent.
 */
async function underwritingNode(state) {
    console.log('📝 [Graph] Node: underwriting');
    try {
        const result = await evaluateRiskAndPrice(state.sessionId, state.userData, state.creditData);
        return {
            underwriting: result,
            eligibility: result.eligibility,
            offer: result.offer || null,
            currentAgent: 'underwritingAgent',
            cids: [{ step: 'underwriting', cid: result.cid }],
            ...(result.eligibility ? {} : {
                status: 'rejected',
                rejectionReason: result.reason || 'Loan amount or credit score does not meet policy requirements',
            }),
        };
    } catch (error) {
        console.error('Underwriting failed:', error.message);
        return {
            eligibility: false,
            currentAgent: 'underwritingAgent',
            status: 'rejected',
            rejectionReason: error.message,
            error: error.message,
        };
    }
}

/**
 * Node: Offer Negotiation
 * Presents offer and handles negotiation via the masterAgent.
 */
async function offerNegotiationNode(state) {
    console.log('🤝 [Graph] Node: offerNegotiation');
    try {
        const negotiated = await presentAndNegotiateOffer(state.sessionId, state.offer);
        return {
            negotiatedOffer: negotiated,
            currentAgent: 'masterAgent',
            ...(negotiated.userResponse !== 'accepted' ? {
                status: 'rejected',
                rejectionReason: 'User rejected the offer',
            } : {}),
        };
    } catch (error) {
        console.error('Offer negotiation failed:', error.message);
        return {
            currentAgent: 'masterAgent',
            status: 'rejected',
            rejectionReason: error.message,
            error: error.message,
        };
    }
}

/**
 * Node: Approval
 * Final rule-based approval via the approvalAgent.
 */
async function approvalNode(state) {
    console.log('✅ [Graph] Node: approval');
    try {
        const creditCheck = { riskAcceptable: state.riskAcceptable, creditData: state.creditData };
        const result = await executeApproval(
            state.sessionId,
            state.kycStatus,
            creditCheck,
            state.negotiatedOffer
        );
        return {
            approvalStatus: result.approvalStatus,
            approvalCid: result.approvalCid || '',
            approvalReason: result.reason || '',
            currentAgent: 'approvalAgent',
            cids: [{ step: 'approval', cid: result.approvalCid }],
            ...(result.approvalStatus !== 'approved' ? {
                status: 'rejected',
                rejectionReason: result.reason || 'Approval denied',
            } : {}),
        };
    } catch (error) {
        console.error('Approval failed:', error.message);
        return {
            approvalStatus: 'rejected',
            currentAgent: 'approvalAgent',
            status: 'rejected',
            rejectionReason: error.message,
            error: error.message,
        };
    }
}

/**
 * Node: Document Generation
 * Generates the sanction letter via the documentAgent.
 */
async function documentGenerationNode(state) {
    console.log('📄 [Graph] Node: documentGeneration');
    try {
        const approvalDetails = { approvalStatus: state.approvalStatus, approvalCid: state.approvalCid };
        const { loanId, sanctionCid } = await generateSanctionLetter(
            state.sessionId,
            approvalDetails,
            state.negotiatedOffer
        );
        return {
            loanId,
            sanctionCid,
            currentAgent: 'documentAgent',
            cids: [{ step: 'sanction', cid: sanctionCid }],
        };
    } catch (error) {
        console.error('Document generation failed:', error.message);
        return {
            currentAgent: 'documentAgent',
            error: error.message,
        };
    }
}

/**
 * Node: Disbursement
 * Transfers funds via the disbursementAgent.
 */
async function disbursementNode(state) {
    console.log('💸 [Graph] Node: disbursement');
    try {
        const result = await disburseFunds(
            state.sessionId,
            state.loanId,
            { ...state.negotiatedOffer, userId: state.userId },
            state.userId
        );
        return {
            disbursement: result,
            currentAgent: 'disbursementAgent',
            cids: [{ step: 'disbursement', cid: result.disbursementCid }],
        };
    } catch (error) {
        console.error('Disbursement failed:', error.message);
        return {
            currentAgent: 'disbursementAgent',
            error: error.message,
        };
    }
}

/**
 * Node: Monitoring
 * Logs the first EMI payment for monitoring startup via the monitoringAgent.
 */
async function monitoringNode(state) {
    console.log('📈 [Graph] Node: monitoring');
    try {
        const { paymentCid } = await logEmiPayment(
            state.loanId,
            { amount: 0, paymentDate: new Date().toISOString(), emiNumber: 1 },
            state.userId
        );
        return {
            paymentCid,
            status: 'approved',
            currentAgent: 'monitoringAgent',
            cids: [{ step: 'monitoring', cid: paymentCid }],
        };
    } catch (error) {
        console.error('Monitoring failed:', error.message);
        return {
            status: 'approved', // Don't fail the whole loan for monitoring issues
            currentAgent: 'monitoringAgent',
            error: error.message,
        };
    }
}

// ─── Conditional Edge Routers ──────────────────────────────────────

function routeAfterIntent(state) {
    if (state.intent === 'loanapplication') {
        console.log('🔀 [Router] Intent → dataCollection');
        return 'dataCollection';
    }
    console.log(`🔀 [Router] Intent "${state.intent}" → END (not a loan application)`);
    return '__end__';
}

function routeAfterKyc(state) {
    if (state.kycStatus === 'verified') {
        console.log('🔀 [Router] KYC verified → creditAnalysis');
        return 'creditAnalysis';
    }
    console.log('🔀 [Router] KYC rejected → END');
    return '__end__';
}

function routeAfterCredit(state) {
    if (state.riskAcceptable) {
        console.log('🔀 [Router] Credit acceptable → underwriting');
        return 'underwriting';
    }
    console.log('🔀 [Router] Credit risk high → END');
    return '__end__';
}

function routeAfterUnderwriting(state) {
    if (state.eligibility) {
        console.log('🔀 [Router] Eligible → offerNegotiation');
        return 'offerNegotiation';
    }
    console.log('🔀 [Router] Ineligible → END');
    return '__end__';
}

function routeAfterNegotiation(state) {
    if (state.negotiatedOffer && state.negotiatedOffer.userResponse === 'accepted') {
        console.log('🔀 [Router] Offer accepted → approval');
        return 'approval';
    }
    console.log('🔀 [Router] Offer rejected → END');
    return '__end__';
}

function routeAfterApproval(state) {
    if (state.approvalStatus === 'approved') {
        console.log('🔀 [Router] Approved → documentGeneration');
        return 'documentGeneration';
    }
    console.log('🔀 [Router] Approval denied → END');
    return '__end__';
}

// ─── Build the Graph ───────────────────────────────────────────────

function buildLoanGraph() {
    const graph = new StateGraph(GraphState);

    // Add all agent nodes
    graph.addNode('intentDetection', intentDetectionNode);
    graph.addNode('dataCollection', dataCollectionNode);
    graph.addNode('kycVerification', kycVerificationNode);
    graph.addNode('creditAnalysis', creditAnalysisNode);
    graph.addNode('underwriting', underwritingNode);
    graph.addNode('offerNegotiation', offerNegotiationNode);
    graph.addNode('approval', approvalNode);
    graph.addNode('documentGeneration', documentGenerationNode);
    graph.addNode('disbursement', disbursementNode);
    graph.addNode('monitoring', monitoringNode);

    // Set entry point
    graph.setEntryPoint('intentDetection');

    // Conditional edges — each agent decides what happens next
    graph.addConditionalEdges('intentDetection', routeAfterIntent, {
        dataCollection: 'dataCollection',
        __end__: END,
    });

    // Sequential edges where there's no decision to make
    graph.addEdge('dataCollection', 'kycVerification');

    graph.addConditionalEdges('kycVerification', routeAfterKyc, {
        creditAnalysis: 'creditAnalysis',
        __end__: END,
    });

    graph.addConditionalEdges('creditAnalysis', routeAfterCredit, {
        underwriting: 'underwriting',
        __end__: END,
    });

    graph.addConditionalEdges('underwriting', routeAfterUnderwriting, {
        offerNegotiation: 'offerNegotiation',
        __end__: END,
    });

    graph.addConditionalEdges('offerNegotiation', routeAfterNegotiation, {
        approval: 'approval',
        __end__: END,
    });

    graph.addConditionalEdges('approval', routeAfterApproval, {
        documentGeneration: 'documentGeneration',
        __end__: END,
    });

    // After document generation, always go to disbursement → monitoring
    graph.addEdge('documentGeneration', 'disbursement');
    graph.addEdge('disbursement', 'monitoring');
    graph.addEdge('monitoring', END);

    return graph.compile();
}

// ─── Public API ────────────────────────────────────────────────────

// Compile the graph once at module load
let compiledGraph = null;

function getCompiledGraph() {
    if (!compiledGraph) {
        compiledGraph = buildLoanGraph();
    }
    return compiledGraph;
}

/**
 * Run the full loan-processing graph.
 *
 * @param {Object} input - Initial state with at least { message, userData }
 * @returns {Object} Final state after all nodes have executed
 */
async function runLoanGraph(input) {
    const graph = getCompiledGraph();

    const userId = input.userData?.phone || input.userData?.accountNumber || input.userData?.userId || 'unknown';

    const initialState = {
        message: input.message,
        userData: input.userData,
        userId,
        sessionId: input.sessionId || '',
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 [LangGraph] Starting loan processing for ${userId}`);
    console.log(`${'='.repeat(60)}`);

    const finalState = await graph.invoke(initialState);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏁 [LangGraph] Completed | Status: ${finalState.status} | Last Agent: ${finalState.currentAgent}`);
    console.log(`${'='.repeat(60)}\n`);

    return finalState;
}

module.exports = { runLoanGraph, buildLoanGraph, getCompiledGraph };
