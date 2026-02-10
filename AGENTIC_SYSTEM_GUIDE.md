# 🤖 Agentic System Architecture Guide

## System Flow: From Hardcoded to GenAI-Driven

```
┌─────────────────────────────────────────────────────────────────┐
│                    Customer Message Arrives                      │
│                    (e.g., "can I reduce to 7.5%?")              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────┐
    │  1. INTENT DETECTION AGENT             │
    │  ✅ NEW: LLM-powered classification    │
    │  ❌ OLD: Hardcoded keyword matching    │
    │                                        │
    │  Input: Message, session state         │
    │  Output: Intent (classify what they    │
    │          want to do), confidence,      │
    │          contextual flags              │
    └────────┬─────────────────────────────────┘
             │
             ├─ "negotiate_rate" ──────────────┐
             │                                 │
             ├─ "accept_offer" ────────────┐   │
             │                             │   │
             ├─ "change_amount" ────────┐  │   │
             │                          │  │   │
             ├─ "off_topic" ────────┐   │  │   │
             │                      │   │  │   │
             └─ "clarification" ──┐ │   │  │   │
                                  │ │   │  │   │
                        ▼         ▼ ▼   ▼  ▼   ▼
    ┌──────────────────────────────────────────────────────┐
    │           AGENT ROUTING (Intent-based)               │
    └──────────────────────────────────────────────────────┘
             │
    ┌────────┴────────────────────────────────────────┐
    │                                                 │
    ▼                                                 ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│ 2. NEGOTIATION AGENT        │    │ 3. ACCEPTANCE AGENT         │
│ ✅ NEW: 100% GenAI          │    │ ✅ NEW: LLM-validated       │
│ ❌ OLD: Hardcoded formulas  │    │ ❌ OLD: Simple keyword      │
│                             │    │                             │
│ Decision: Can we reduce the │    │ Decision: Is this really    │
│ rate? What's reasonable?    │    │ acceptance or just          │
│ What's the new rate?        │    │ politeness?                 │
│                             │    │                             │
│ Input:                      │    │ Input:                      │
│ • Credit score              │    │ • Session state             │
│ • Utilization ratio         │    │ • Negotiation history       │
│ • Previous negotiations     │    │ • Current offer             │
│ • Customer request          │    │ • Customer's exact phrases  │
│                             │    │                             │
│ Output:                     │    │ Output:                     │
│ • recommendation:           │    │ • isValidAcceptance: bool   │
│   ├─ reduce (offer new %)   │    │ • confidence: high|med|low  │
│   ├─ final_offer (last try) │    │ • nextAction: accept|       │
│   ├─ decline (not possible) │    │              clarify|       │
│   └─ accept                 │    │              continue       │
│ • newRate (if reducing)     │    │ • message (to tell customer)│
│ • reasoning (why)           │    │                             │
│ • message (to customer)     │    │                             │
│                             │    │                             │
│ GenAI Magic:                │    │ GenAI Magic:                │
│ "Customer credit 850, only  │    │ "Session is 'negotiating',  │
│  80% utilization → can      │    │  customer said 'ok reduce   │
│  reduce by 0.5%"            │    │  to 7.5%' → not final      │
│                             │    │  acceptance, clarification  │
│                             │    │  needed"                    │
└──────────┬──────────────────┘    └──────────┬──────────────────┘
           │                                  │
           ▼                                  ▼
       ┌──────────────────┐          ┌──────────────────┐
       │ Update session:  │          │ Is Valid?        │
       │ • state=negotiati│          │ YES: Accept app? │
       │ • finalRate=7.25%│          │ NO: Ask for      │
       │ • recordHistory  │          │     confirmation │
       └──────────────────┘          └──────────────────┘
```

---

## Agent Details: What Changed

### 🔍 **AGENT 1: Intent Detection Agent**
**File:** `agents/intentDetectionAgent.js`

**Purpose:** Classify what the customer wants to do

**Old Approach:**
```javascript
// Hardcoded keyword matching - brittle!
if (lower.includes('negotiate') || lower.includes('reduce')) { ... }
if (lower.includes('yes') || lower.includes('accept')) { ... }
```

**New Approach:**
```javascript
const intent = await detectIntent(message, sessionState, customerName);
// Returns: {
//   intent: 'negotiate_rate' | 'accept_offer' | 'change_amount' | 'off_topic' | etc.
//   confidence: 'high' | 'medium' | 'low'
//   contextFlags: {
//     isNegotiation: bool,
//     isConfirmation: bool,
//     isAmountChange: bool,
//     isOffTopic: bool
//   }
// }
```

**Why It's Better:**
- ✅ Understands natural language variations
- ✅ Context-aware ("okay" in negotiation ≠ "okay" as agreement)
- ✅ Handles typos and synonyms
- ✅ Confidence scores guide decisions
- ❌ No More brittle keyword matching

**GenAI Prompt:**
```
"You are a banking chatbot intent classifier. 
Analyze the customer's message and determine their intent.
Consider context and natural language, not just keywords."
```

---

### 💰 **AGENT 2: Negotiation Agent - FULLY REFACTORED**
**File:** `agents/negotiationAgent.js`

**Purpose:** Intelligently decide on interest rate reductions

**Old Approach (❌ Hardcoded):**
```javascript
// Fixed formula
const reduction = negotiationCount >= 2 ? 0% : 0.25%;
const newRate = currentRate - reduction;
if (newRate < baseRate - 2) newRate = baseRate - 2; // Hardcoded floor
```

**New Approach (✅ 100% GenAI):**
```javascript
const negotiationResult = await handleNegotiation(sessionId, {
    customerName: 'Rajesh',
    creditScore: 850,
    requestedAmount: 500000,
    preApprovedLimit: 1000000,
    baseRate: 10.5,
    currentRate: 9.5,
    negotiationCount: 1,
    negotiationHistory: [{
        fromRate: 9.5,
        toRate: 9.0,
        reason: 'Customer requested reduction'
    }],
    userRequest: 'Can I get 8.5%?'
});

// Returns: {
//   recommendation: 'reduce' | 'final_offer' | 'decline',
//   newRate: 8.3,
//   reasoning: "Credit score 850 is excellent, utilization 50% is moderate, 
//               customer has been patient. Reducing by 0.25% is justified.
//               This is round 2, can offer one more round if needed.",
//   message: "I can offer you 8.3% interest rate. Would you like to accept this offer?",
//   cid: 'Qm...' // Logged to blockchain
// }
```

**Helper Functions:**
```javascript
analyzeCreditProfile(score, amount, limit)
  // Dynamic analysis:
  // Score 850 + 50% utilization = "Excellent, low risk, flexible"
  // Score 650 + 80% utilization = "Fair, high risk, limited flexibility"

buildNegotiationSummary(history)
  // Smart context:
  // "Round 1: 9.5% → 9.0% (Customer priority: cost)"
  // "Round 2: 9.0% → 8.5%? (Evaluating...)"

validateDecisionStructure(decision)
  // Ensures LLM response has required fields
```

**Why It's Better:**
- ✅ Considers credit profile, not fixed formulas
- ✅ Understands negotiation fairness ("How much more can we reduce?")
- ✅ Dynamic reasoning ("This customer deserves 0.5%, not 0.25%")
- ✅ Learns from history ("3rd round → probably final offer time")
- ✅ Every decision auditable with reasoning
- ❌ No hardcoded minimums
- ❌ No hardcoded reduction formula
- ❌ No hardcoded round limits

**GenAI Prompt (Simplified):**
```
"You are a smart loan pricing officer. 
Analyze customer's credit (850), utilization (50%), and negotiation history.
Customer wants 8.5%. What's reasonable?

Respond with:
{
  recommendation: 'reduce' | 'final_offer' | 'decline',
  newRate: X,
  reasoning: '2-3 sentences',
  message: '2-3 sentences to tell customer'
}"
```

**The LLM Thinks Like This:**
- "Score 850 = low risk → can reduce more"
- "50% utilization = we're not overextended → flexibility exists"
- "Already reduced 0.5% once → diminishing returns, can offer 0.25% more"
- "This is round 2 → I can offer one more round if needed"

---

### ✅ **AGENT 3: Acceptance Agent - NEW**
**File:** `agents/acceptanceAgent.js`

**Purpose:** Validate that customer acceptance is genuine

**Old Approach (❌):**
```javascript
// Simple keyword matching = wrong!
if (lower.includes('yes') || lower.includes('accept')) {
    session.state = 'accepted';
}
// Result: "okay can i reduce to 7.5%?" → Wrong acceptance!
```

**New Approach (✅):**
```javascript
const acceptanceResult = await handleAcceptance(sessionId, {
    customerName: 'Rajesh',
    sessionState: 'negotiating', // Critical context!
    currentRate: 9.5,
    requestedAmount: 500000,
    approvedAmount: 500000,
    preApprovedLimit: 1000000,
    creditScore: 850,
    negotiationHistory: [...]
});

// Returns: {
//   isValidAcceptance: false, // Even if they said "okay"
//   confidence: 'high',
//   reasoning: 'Session is negotiating, customer asking about rate reduction, not confirming acceptance',
//   nextAction: 'clarify', // Ask for explicit confirmation
//   message: 'Would you like to accept the 9.5% rate offer?'
// }
```

**Why It's Better:**
- ✅ Understands context (negotiating ≠ accepting)
- ✅ Distinguishes between acknowledgment and acceptance
- ✅ Prevents premature application submission
- ✅ Asks for explicit confirmation if uncertain
- ✅ Confidence levels guide next action
- ❌ No false positives
- ❌ No auto-approval during negotiation

**GenAI Logic:**
```
Input: "okay can i reduce to 7.5%"
Session: 'negotiating'

LLM thinks: 
"'Okay' usually means 'I heard you' not 'I agree'.
Session is negotiating, so clearly asking about rate.
This is NOT acceptance. Need explicit YES."

Output: isValidAcceptance = false
```

---

## 🔄 Intent-Based Routing in Server.js

**Location:** `server.js:717-881`

**Flow:**
```javascript
// STEP 1: Detect intent using LLM
const detectedIntent = await detectIntent(message, session.state, name);
const intent = detectedIntent.intent;

// STEP 2: Route based on intent
if (intent === 'negotiate_rate') {
    const negotiationResult = await handleNegotiation(...);
    // Handle rate negotiation
    
} else if (intent === 'accept_offer') {
    const acceptanceResult = await handleAcceptance(...);
    // Validate and process acceptance
    
} else if (intent === 'change_amount') {
    // Handle amount change with validation
    
} else if (intent === 'off_topic') {
    // Reject politely with LLM
    
} else if (intent === 'query_terms' || intent === 'clarification') {
    // Let LLM answer questions
    
} else {
    // Default: remind of current offer
}
```

**Key Difference:**
- OLD: 100+ lines of if-else with keyword checks
- NEW: Clean intent routing, each intent has dedicated agent

---

## 🛡️ Fallback Strategy

**If Gemini APIs fail:**

1. **Intent Detection Fallback:**
   ```javascript
   // Falls back to keyword matching if LLM unavailable
   function generateFallbackIntent(message, sessionState) {
       if (message.includes('yes')) intent = 'accept_offer';
       else if (message.includes('reduce')) intent = 'negotiate_rate';
       // Minimal fallback, still works
   }
   ```

2. **Negotiation Fallback:**
   ```javascript
   // If negotiation agent fails, ask LLM how to handle fallback
   return await generateAgenticFallback(customerName, currentRate, creditScore, round, error);
   // Still uses LLM, just different prompt
   ```

3. **Acceptance Fallback:**
   ```javascript
   // If agent fails, use strict validation
   // Only accept explicit 'yes'/'accept'/'proceed' keywords
   // Better safe than sorry
   ```

---

## 📊 Comparison: Old vs New

| Feature | Old | New |
|---------|-----|-----|
| **Intent Detection** | Keyword matching | LLM classification |
| **Negotiation** | 0.25% formula | LLM reasoning |
| **Rate Minimums** | Hardcoded `baseRate - 2%` | LLM evaluates per customer |
| **Negotiation Rounds** | Max 3 rounds hardcoded | LLM decides fairness |
| **Acceptance** | Simple keyword match | LLM validates in context |
| **Reasoning** | None | Every decision explained |
| **Auditability** | No reasoning | Blockchain logged |
| **Scalability** | Code changes needed | Prompt changes only |
| **Lines of Code** | 100+ hardcoded if-else | Clean intent routing |

---

## 🎯 Key Takeaways

1. **Zero Hardcoding:** All business logic delegated to LLM agents
2. **Context-Aware:** Agents understand session state and history
3. **Explainable:** Every decision has reasoning logged
4. **Auditable:** Blockchain records all decisions
5. **Adaptable:** Change behavior by updating prompts, not code
6. **Intelligent:** Fine-tuned reasoning, not keyword matching
7. **Safe:** Validation at every step, graceful fallbacks

---

## 🚀 Next Steps to Test

1. **Test Intent Detection:**
   ```
   Message: "okay what about 7.5%" → Should detect 'negotiate_rate', not 'accept_offer'
   ```

2. **Test Negotiation:**
   ```
   Credit Score: 750, Ask for 8% rate → Should evaluate using credit profile
   Credit Score: 650, Ask for 8% rate → Should be more conservative
   ```

3. **Test Acceptance:**
   ```
   In 'negotiating' state, say "okay" → Should ask for clarification, not accept
   In 'offered' state, say "yes" → Should validate and accept
   ```

4. **Test Off-Topic:**
   ```
   Message: "what's the weather?" → Should reject as off_topic via LLM
   ```

All agents have LLM calls, so they improve with more interactions!
