# ⚡ Quick Start: Running the GenAI-Driven System

## ✅ What Was Fixed

| Issue | Solution |
|-------|----------|
| ❌ Hardcoded keyword matching | ✅ LLM-powered intent detection |
| ❌ Hardcoded negotiation formula (0.25%) | ✅ GenAI considers credit profile |
| ❌ Hardcoded rate minimums | ✅ LLM evaluates per customer |
| ❌ Auto-approval during negotiation | ✅ Acceptance validation agent |
| ❌ 100+ lines of if-else logic | ✅ Clean intent-based routing |
| ❌ No reasoning/auditability | ✅ Every decision logged to blockchain |

---

## 📁 Files Modified

### New Agents Created:
1. **`agents/intentDetectionAgent.js`** - Classify user intent
2. **`agents/acceptanceAgent.js`** - Validate acceptance
3. **`AGENTIC_REFACTORING.md`** - Detailed refactoring guide
4. **`AGENTIC_SYSTEM_GUIDE.md`** - Architecture guide

### Files Refactored:
1. **`agents/negotiationAgent.js`** - 100% GenAI, no hardcoded rules
2. **`server.js`** - Intent-based routing (lines 60, 717-881)
3. **`conversational/responseGenerator.js`** - Enhanced guardrails

---

## 🚀 To Start the Application

```bash
# Navigate to project
cd d:\Game\hackathon\E_Y_Hackathon

# Install dependencies (if not already done)
npm install

# Start the server
npm start
```

**Expected Output:**
```
Express server running on port 5000
MongoDB connected: [connection string]
Redis initialized: [host:port]
Web3 initialized: Sepolia testnet
✅ All systems ready
```

---

## 🧪 Quick Test Cases

### Test 1: Negotiation Intent Detection
```
User Message: "okay can i reduce to 7.5%"

OLD BEHAVIOR (❌ Auto-approved):
- Matched "ok" keyword
- Moved to acceptance block
- Application submitted without negotiation

NEW BEHAVIOR (✅ Intelligent):
1. IntentDetectionAgent classifies: "negotiate_rate"
2. NegotiationAgent called
3. Evaluates if 7.5% is reasonable
4. Returns offer: "I can offer 7.25%, would you accept?"
5. State remains 'negotiating' until explicit YES
```

**How to Test:**
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "okay can i reduce to 7.5%",
    "sessionId": "test-123"
  }'

# Expected response:
# {
#   "response": "I can offer you 7.25% interest rate...",
#   "state": "negotiating",
#   "sessionId": "test-123"
# }
```

---

### Test 2: Acceptance Validation
```
Scenario: In negotiation, customer says "okay"

OLD BEHAVIOR (❌):
- Keyword match on "okay"
- Accepted application

NEW BEHAVIOR (✅):
1. IntentDetectionAgent: Could be acknowledgment or acceptance?
2. AcceptanceAgent: Checks session state ('negotiating')
3. Decision: "Not valid acceptance in this state"
4. Response: "Just to confirm, do you accept the 8.0% rate?"
```

---

### Test 3: Amount Change
```
User Message: "can i change to 7 lakhs?"

NEW BEHAVIOR:
1. IntentDetectionAgent: "change_amount"
2. Route to amount change handler
3. Parse "7 lakhs" → 700000
4. Validate against pre-approved limit
5. Calculate new rate if needed
6. Present revised offer
```

---

### Test 4: Off-Topic Query
```
User Message: "what's the weather today?"

OLD BEHAVIOR (❌): Keyword matching might fail

NEW BEHAVIOR (✅):
1. IntentDetectionAgent: "off_topic"
2. Reject with LLM-generated polite message
3. Redirect to loan topic
```

---

## 🔍 Debugging: Enable Verbose Logging

### Check Agent Logs in Console
```javascript
// Each agent logs its decisions
[NegotiationAgent] Processing request for Rajesh (Credit: 850, Round: 1)
[NegotiationAgent] ✅ Decision: reduce | New Rate: 8.25% | CID: Qm...
[IntentDetectionAgent] Detected intent: negotiate_rate (confidence: high)
[AcceptanceAgent] Validation: isValidAcceptance=false, nextAction=clarify
[Chat] State check before storing: state='negotiating'...
```

### Monitor Redis Session State
```bash
# Connect to Redis
redis-cli

# View session data
GET session:test-123-hash

# Should show:
# {
#   "state": "negotiating",
#   "finalRate": "8.25",
#   "negotiationCount": 1,
#   "negotiationHistory": [...]
# }
```

### Check Blockchain Records
All decisions logged to Pinata IPFS:
```javascript
// Check agent decision records
interaction_ledger.json → Contains all agent decisions with CID
```

---

## ⚠️ Troubleshooting

### Problem 1: "IntentDetectionAgent called but returns unknown"

**Cause:** Gemini API failing or poor prompt formatting

**Solution:**
```javascript
// Check server logs for:
[IntentDetectionAgent] Error: [error message]

// If Gemini unavailable, fallback triggers automatically
// Falls back to keyword-based intent detection
```

**Fix:**
```bash
# Verify .env has valid Gemini API key
echo $GEMINI_API_KEY

# Test Gemini directly
curl -X POST https://api.generative.ai/...
```

---

### Problem 2: "Application stored in 'negotiating' state"

**Cause:** Session state not persisted correctly

**Solution:**
Check the logs:
```
[Chat] State check before storing: state='negotiating', applicationStored=false
```

Should NOT reach storage if state ≠ 'accepted'.

**Verify:**
```bash
# Check Redis session
redis-cli GET session:SESSIONID
# state should be 'negotiating', not 'accepted'
```

---

### Problem 3: "Acceptance Agent returns wrong decision"

**Cause:** Session context not passed correctly

**Solution:**
```javascript
// Verify acceptanceAgent receives full context:
{
  customerName: 'Name',
  sessionState: 'negotiating', // Must be passed!
  currentRate: X,
  negotiationHistory: [...],  // Must have history!
  ...
}
```

---

### Problem 4: "Negotiation Agent always offers same reduction"

**Cause:** LLM prompt not being followed

**Solution:**
```bash
# Check that negotiationAgent is calling Gemini with full context:
console.log of buildNegotiationPrompt() should include:
- Credit score analysis
- Utilization percentage
- Full negotiation history
- Previous recommendations

# If LLM ignores context, it's a prompt issue, not code issue
```

---

## 📊 Monitoring the System

### Key Metrics to Watch

1. **Intent Detection Accuracy:**
   ```
   Run 100 test messages, check classification correctness
   Goal: >95% accuracy
   ```

2. **Negotiation Agent Decisions:**
   ```
   Check reasoning field:
   - Should mention credit score
   - Should mention utilization
   - Should reference history
   - Should have business justification
   ```

3. **Acceptance Validation:**
   ```
   In 'negotiating' state, "okay" should = clarification needed
   In 'offered' state, "yes" should = valid acceptance
   ```

---

## 🚨 If Something Breaks

1. **Check server.js imports:**
   ```javascript
   const { detectIntent } = require('./agents/intentDetectionAgent');
   const { handleAcceptance } = require('./agents/acceptanceAgent');
   const { handleNegotiation } = require('./agents/negotiationAgent');
   ```

2. **Verify agent files exist:**
   ```bash
   ls agents/intentDetectionAgent.js
   ls agents/acceptanceAgent.js
   ls agents/negotiationAgent.js
   ```

3. **Check for syntax errors:**
   ```bash
   node -c agents/intentDetectionAgent.js  # Syntax check
   node -c agents/acceptanceAgent.js
   node -c agents/negotiationAgent.js
   ```

4. **Test Gemini connection:**
   ```javascript
   // In server, try:
   const { callGemini } = require('./utils/geminiClient');
   const response = await callGemini('Say hello');
   console.log(response);
   ```

---

## ✅ Verification Checklist

Before deploying:

- [ ] All agent files created and syntax verified
- [ ] Imports added to server.js (lines 59-60)
- [ ] Intent-based routing implemented (lines 717-881)
- [ ] Gemini API key configured in .env
- [ ] Redis session management working
- [ ] Blockchain connection active
- [ ] No console errors on startup
- [ ] Fallback agents functioning
- [ ] Test cases pass (negotiation, acceptance, off-topic)

---

## 🎯 Expected Behavior After Fix

### Scenario: "okay can i reduce to 7.5%"

**Step 1: Intent Detection**
```
Input: "okay can i reduce to 7.5%"
Output: { intent: 'negotiate_rate', confidence: 'high' }
```

**Step 2: Negotiation Agent**
```
Input: Credit 850, asking 7.5%, currently 9.5%
Output: { 
  recommendation: 'reduce', 
  newRate: 9.0,
  reasoning: "Credit score 850 is excellent, can reduce by 0.5%",
  message: "I can offer you 9.0%. Would you like to accept?"
}
```

**Step 3: Response Generation**
```
Input: actionTaken = 'RATE REDUCTION OFFER - AWAITING CONFIRMATION...'
Output: "I can offer you 9.0% interest rate. Would you like to accept this offer?"
```

**Step 4: State Management**
```
Session State: 'negotiating' (NOT 'accepted')
Application Storage: NOT triggered
Waiting For: Customer to say "yes" explicitly
```

---

## 🎓 Learning Resources

- `AGENTIC_REFACTORING.md` - Deep dive into changes
- `AGENTIC_SYSTEM_GUIDE.md` - Architecture explanation
- Agent code comments - Implementation details
- Blockchain interaction_ledger.json - Decision audit trail

---

## 🚀 You're Ready!

The system is now:
- ✅ GenAI-driven (no hardcoded rules)
- ✅ Context-aware (understands negotiation state)
- ✅ Intelligent (uses LLM for decisions)
- ✅ Auditable (logs all decisions to blockchain)
- ✅ Adaptable (change via prompts, not code)

**Start the server and test!**
