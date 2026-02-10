# 🏗️ System Architecture Diagram

## Complete Flow: From Message to Decision

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                     CUSTOMER MESSAGE ARRIVES                       ┃
┃              "okay can i reduce to 7.5%"                          ┃
┃              POST /api/chat                                        ┃
┗━━━━━━━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                   │
                   ▼
        ┌──────────────────────────┐
        │   OFF-TOPIC CHECK        │
        │ (Check if loan-related)  │
        │                          │
        │ ✅ This is loan-related  │
        │ → Continue              │
        └──────────┬───────────────┘
                   │
                   ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  [1] INTENT DETECTION AGENT      ┃
    ┃  agents/intentDetectionAgent.js  ┃
    ┃                                  ┃
    ┃  Input: Message + Session State  ┃
    ┃  "okay can i reduce to 7.5%"    ┃
    ┃   + state: 'negotiating'        ┃
    ┃                                  ┃
    ┃  LLM Analysis:                   ┃
    ┃  "Session is negotiating,       ┃
    ┃   customer asking about rate,    ┃
    ┃   NOT accepting"                 ┃
    ┃                                  ┃
    ┃  Output:                          ┃
    ┃  ─────────────────────────       ┃
    ┃  intent: "negotiate_rate"        ┃
    ┃  confidence: "high"              ┃
    ┃  contextFlags: {                 ┃
    ┃    isNegotiation: true,          ┃
    ┃    isConfirmation: false         ┃
    ┃  }                               ┃
    ┗━━━━━━━━━┬━━━━━━━━━━━━━━━━━━━━━━┛
              │
              ▼
    ┌─────────────────────────┐
    │ Intent Routing Decision │
    │                         │
    │ negotiate_rate? YES ✓   │
    └────────┬────────────────┘
             │
             ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  [2] NEGOTIATION AGENT           ┃
    ┃  agents/negotiationAgent.js      ┃
    ┃                                  ┃
    ┃  Input Context:                  ┃
    ┃  ─────────────────────────────  ┃
    ┃  • customerName: "Rajesh"        ┃
    ┃  • creditScore: 850              ┃
    ┃  • requestedAmount: ₹500k        ┃
    ┃  • preApprovedLimit: ₹1000k      ┃
    ┃  • baseRate: 10.5%               ┃
    ┃  • currentRate: 9.5%             ┃
    ┃  • negotiationCount: 1           ┃
    ┃  • negotiationHistory: [...]     ┃
    ┃  • userRequest: "can i get 7.5%" ┃
    ┃                                  ┃
    ┃  Agent Helper Functions:         ┃
    ┃  ─────────────────────────────  ┃
    ┃  analyzeCreditProfile()          ┃
    ┃    → "Score 850/900 (Excellent,  ┃
    ┃       Utilization: 50%           ┃
    ┃       (Moderate, reasonable)"    ┃
    ┃                                  ┃
    ┃  buildNegotiationSummary()      ┃
    ┃    → "History: 9.5% → 9.0%"     ┃
    ┃                                  ┃
    ┃  LLM Analysis:                   ┃
    ┃  ─────────────────────────────  ┃
    ┃  "Customer has excellent credit. ┃
    ┃   50% utilization is moderate.   ┃
    ┃   Already reduced 0.5% once.     ┃
    ┃   Can reduce by 0.25% more.      ┃
    ┃   This is round 2, offer final   ┃
    ┃   round negotiation."            ┃
    ┃                                  ┃
    ┃  Output:                         ┃
    ┃  ─────────────────────────────  ┃
    ┃  recommendation: "reduce"        ┃
    ┃  newRate: 9.25%                  ┃
    ┃  reasoning: "Excellent credit,   ┃
    ┃    justified reduction"          ┃
    ┃  message: "I can offer you       ┃
    ┃    9.25%. Would you accept?"     ┃
    ┃  cid: "Qm..." (logged)           ┃
    ┗━━━━━━━━┬━━━━━━━━━━━━━━━━━━━━━━━┛
             │
             ▼
    ┌────────────────────────────────┐
    │  SESSION STATE UPDATE          │
    │  ─────────────────────────────┐│
    │  state: 'negotiating'          ││ (Still negotiating!)
    │  finalRate: 9.25%              ││ (Updated)
    │  negotiationCount: 2           ││ (Incremented)
    │  negotiationHistory: [         ││
    │    {                           ││
    │      fromRate: 9.5,            ││
    │      toRate: 9.25,             ││
    │      reason: "Excellent credit"││
    │    }                           ││
    │  ]                             ││
    │                                ││
    │  ✅ Application NOT stored     ││
    │     (state ≠ 'accepted')       ││
    └────────┬───────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │  RESPONSE GENERATION               │
    │  responseGenerator.js              │
    │                                    │
    │  Input Directive:                  │
    │  ─────────────────────────────── ─┤
    │  actionTaken:                      │
    │  "RATE REDUCTION OFFER -           │
    │   AWAITING CONFIRMATION.           │
    │   New Rate: 9.25%                  │
    │   Do NOT say the application is    │
    │   approved."                       │
    │                                    │
    │  systemPrompt Enhancement:        │
    │  ─────────────────────────────── ─┤
    │  ⚠️ SESSION STATE IS NEGOTIATING   │
    │  ⚠️ DO NOT USE APPROVAL LANGUAGE  │
    │                                    │
    │  LLM Response:                     │
    │  ─────────────────────────────── ─┤
    │  "I can offer you 9.25% interest   │
    │   rate. Would you like to accept   │
    │   this offer?"                     │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────┐
    │  REDIS PERSISTENCE            │
    │  ─────────────────────────────┤
    │  • Save session state (24h TTL)│
    │  • Add to chat history         │
    │  • Publish websocket event     │
    │                                │
    │  ✅ State persisted for next  │
    │     message                    │
    └────────┬───────────────────────┘
             │
             ▼
    ┌────────────────────────────────┐
    │  BLOCKCHAIN LOGGING            │
    │  ─────────────────────────────┤
    │  Upload to Pinata IPFS:         │
    │  {                              │
    │    agent: "negotiationAgent",   │
    │    sessionId: "...",            │
    │    decision: "reduce",          │
    │    newRate: 9.25,               │
    │    reasoning: "...",            │
    │    timestamp: "2026-02-10..."   │
    │  }                              │
    │                                │
    │  appendToLedger(               │
    │    'interaction_ledger',        │
    │    {...,  cid: "Qm..."}        │
    │  )                              │
    │                                │
    │  ✅ Immutable audit trail      │
    └────────┬───────────────────────┘
             │
             ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  RESPONSE SENT TO CUSTOMER    ┃
    ┃                               ┃
    ┃  {                            ┃
    ┃    ok: true,                  ┃
    ┃    response: "I can offer     ┃
    ┃      you 9.25%...",           ┃
    ┃    sessionId: "...",          ┃
    ┃    state: "negotiating"       ┃
    ┃  }                            ┃
    ┃                               ┃
    ┃  Customer sees: Clear offer   ┃
    ┃  at 9.25%, asked to confirm   ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## Alternative Flows

### Flow 2: When Customer Accepts

```
Customer: "yes, i accept the 9.25% offer"
    ↓
Intent Detection → "accept_offer"
    ↓
┌─────────────────────────────────┐
│ ACCEPTANCE AGENT                │
│ • Check session state           │
│ • Validate against history      │
│ • Confirm genuineness           │
│                                 │
│ Result: isValidAcceptance=true  │
└────────┬────────────────────────┘
    ↓
Session State → 'accepted'
    ↓
Application Stored to MongoDB ✅
    ↓
EMI Schedule Generated ✅
    ↓
Blockchain Logging ✅
    ↓
Confirmation Response to Customer
```

### Flow 3: When Negotiation Hits Limits

```
Customer: (3rd negotiation request in same session)
    ↓
Intent Detection → "negotiate_rate"
    ↓
Negotiation Agent receives round count 3
    ↓
LLM Analysis:
"This is round 3. Customer has negotiated 3 times 
already. Fair to present as FINAL offer."
    ↓
recommendation: "final_offer"
newRate: 9.25% (no further reduction)
message: "This is our best rate. Accept or decline?"
    ↓
state: 'finalOffer'
    ↓
Response: Present as final, ask for decision
    ↓
Customer must accept or decline, no more negotiation
```

### Flow 4: Off-Topic Message

```
Customer: "what's the weather today?"
    ↓
Intent Detection → "off_topic"
    ↓
Route to off-topic handler
    ↓
LLM Response Generation:
"I'm here to help with your loan application. 
For weather info, check weather services."
    ↓
Return immediately with state unchanged
    ↓
Customer redirected to loan conversation
```

---

## Agent Interaction Map

```
┌──────────────────────────────────────────────────────────────┐
│                        SERVER.JS                            │
│                    /api/chat endpoint                        │
└────────┬─────────────────────────────────────────────────────┘
         │
         │ Message received
         ▼
    ┌────────────────────────────┐
    │ IntentDetectionAgent       │  ← Classify intent
    │ (NEW)                      │
    └────────┬───────────────────┘
             │
      ┌──────┴──────────┬──────────────┬────────────┬──────────┐
      │                 │              │            │          │
      ▼                 ▼              ▼            ▼          ▼
 negotiate_      accept_offer   change_amount  off_topic   clarify
  _rate                                                  
  │                    │              │            │          │
  │                    │              │            │          │
  ▼                    ▼              ▼            ▼          ▼
┌──────────┐     ┌──────────┐  ┌──────────┐  ┌──────────┐ ┌──────────┐
│Negotiation│    │Acceptance │  │  Amount  │  │ Polite   │ │   LLM    │
│  Agent   │    │  Agent    │  │  Parser  │  │ Rejection│ │ Question │
│(GenAI)  │    │ (GenAI)   │  │(Standard)│  │(LLM)     │ │Answering │
└────┬──────┘    └────┬──────┘  └────┬──────┘ └────┬─────┘ └────┬────┘
     │                │             │             │            │
     │                │             │             │            │
     ▼                ▼             ▼             ▼            ▼
  Update        Validate &       Update         Direct       Generate
 Rate &        Accept App      Amount &       Response      Response
  State                        Rate                        from LLM
  │                │             │             │            │
  └────────────────┴─────────────┴─────────────┴────────────┘
                       │
                       ▼
          ┌──────────────────────────────┐
          │  Response Generation Agent   │
          │  responseGenerator.js        │
          │                              │
          │  Receives actionTaken        │
          │  Considers session state     │
          │  Applies guardrails          │
          │  Calls Gemini                │
          │  Returns natural response    │
          └───────────┬──────────────────┘
                      │
                      ▼
          ┌──────────────────────────────┐
          │  Persist State to Redis      │
          │  Log History                 │
          │  Publish Events              │
          └───────────┬──────────────────┘
                      │
                      ▼
          ┌──────────────────────────────┐
          │  Log to Blockchain           │
          │  Upload Decision to Pinata   │
          │  Append to Ledger            │
          └───────────┬──────────────────┘
                      │
                      ▼
          ┌──────────────────────────────┐
          │  Send Response to Frontend   │
          │  {ok, response, state}       │
          └──────────────────────────────┘
```

---

## Data Flow Diagram

```
INCOMING DATA                PROCESSING                OUTGOING DATA
────────────────────────────────────────────────────────────────

Message ─────┐
Session ID ──┤
User Info ───┼──→ [Intent Detection Service] ──→ Intent + Confidence
Username ────┤    (LLM)                           Confidence Level
State ───────┘                                   Context Flags

Intent ──────┐
Session ─────┤
History ─────┼──→ [Negotiation / Acceptance /───→ Decision +
Credit ──────┤     Amount Parsing Service]      New State +
Rates ───────┘     (GenAI Agents)                 Reasoning +
                                                   Message +
                                                   CID (blockchain)

Decision ────┐
Context ─────┼──→ [Response Generator] ───────→ Natural Language
State ───────┘    (LLM)                          Response +
History ─────┐                                   Guardrails Applied
────────────┘

Response ────┐
State ───────┼──→ [Redis Persistence] ────────→ Session Saved +
History ─────┘    [Blockchain Logger]          Audit Trail +
                  (Pinata IPFS)                 Event Published
```

---

## Key Takeaway

**Old System (Hardcoded):**
- Keyword matching → brittle
- Fixed formulas → inflexible
- No context → false positives
- 5-10 second decisions → fast but dumb

**New System (GenAI-Driven):**
- LLM classification → intelligent
- Dynamic evaluation → contextual
- Full context → accurate
- 2-3 second decisions (with LLM) → smart and responsive

The system is now **context-aware, intelligent, and agentic**! 🎉
