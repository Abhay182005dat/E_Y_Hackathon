
const { Annotation } = require('@langchain/langgraph');

/**
 * Shared state schema for the LangGraph loan-processing workflow.
 * Every graph node reads from and writes to this state object.
 */
const GraphState = Annotation.Root({
    // ─── Session & Identity ───
    sessionId:   Annotation({ reducer: (_, v) => v, default: () => '' }),
    userId:      Annotation({ reducer: (_, v) => v, default: () => 'unknown' }),
    message:     Annotation({ reducer: (_, v) => v, default: () => '' }),

    // ─── Intent Detection ───
    intent:      Annotation({ reducer: (_, v) => v, default: () => '' }),

    // ─── User / Customer Data ───
    userData:    Annotation({ reducer: (_, v) => v, default: () => ({}) }),

    // ─── KYC Verification ───
    kycStatus:   Annotation({ reducer: (_, v) => v, default: () => '' }),
    kycReason:   Annotation({ reducer: (_, v) => v, default: () => '' }),

    // ─── Credit Analysis ───
    creditData:  Annotation({ reducer: (_, v) => v, default: () => null }),
    riskAcceptable: Annotation({ reducer: (_, v) => v, default: () => false }),

    // ─── Underwriting ───
    underwriting: Annotation({ reducer: (_, v) => v, default: () => null }),
    eligibility:  Annotation({ reducer: (_, v) => v, default: () => false }),
    offer:        Annotation({ reducer: (_, v) => v, default: () => null }),

    // ─── Offer Negotiation ───
    negotiatedOffer: Annotation({ reducer: (_, v) => v, default: () => null }),

    // ─── Approval ───
    approvalStatus: Annotation({ reducer: (_, v) => v, default: () => '' }),
    approvalCid:    Annotation({ reducer: (_, v) => v, default: () => '' }),
    approvalReason: Annotation({ reducer: (_, v) => v, default: () => '' }),

    // ─── Document Generation ───
    loanId:      Annotation({ reducer: (_, v) => v, default: () => '' }),
    sanctionCid: Annotation({ reducer: (_, v) => v, default: () => '' }),

    // ─── Disbursement ───
    disbursement: Annotation({ reducer: (_, v) => v, default: () => null }),

    // ─── Monitoring ───
    paymentCid:  Annotation({ reducer: (_, v) => v, default: () => '' }),

    // ─── Accumulated CIDs for audit trail ───
    cids: Annotation({
        reducer: (existing, incoming) => [...(existing || []), ...(incoming || [])],
        default: () => []
    }),

    // ─── Status & Error ───
    status:      Annotation({ reducer: (_, v) => v, default: () => 'pending' }),
    error:       Annotation({ reducer: (_, v) => v, default: () => null }),
    currentAgent: Annotation({ reducer: (_, v) => v, default: () => '' }),

    // ─── Rejection reason (for early exits) ───
    rejectionReason: Annotation({ reducer: (_, v) => v, default: () => '' }),
});

module.exports = { GraphState };
