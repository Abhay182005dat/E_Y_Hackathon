# Getting ABI from Remix IDE - Step by Step

## Visual Guide

### 1. Open Remix
- Go to: https://remix.ethereum.org/
- Load or create your Solidity files

### 2. Compile Contract

**Left Sidebar → Click "Solidity Compiler" icon (2nd icon)**

```
┌─────────────────────────┐
│  📁 File Explorer       │
│  🔧 Solidity Compiler ← CLICK THIS
│  🚀 Deploy & Run        │
│  📊 Plugin Manager      │
└─────────────────────────┘
```

**In Compiler Panel:**
- Select contract: `LoanCore.sol`
- Compiler version: `0.8.19+`
- Click: **"Compile LoanCore.sol"** (blue button)

### 3. Get ABI - Method 1 (Recommended)

**After compilation:**

1. Scroll down in compiler panel
2. Click **"Compilation Details"** button (bottom of panel)
3. A popup window opens with tabs: `Bytecode`, `ABI`, `Web3 Deploy`, etc.
4. Click **"ABI"** tab
5. Click the **📋 Copy** icon (top right)
6. ABI is now in clipboard!

```
Compilation Details Popup:
┌──────────────────────────────┐
│ Bytecode │ ABI │ Web3 Deploy │
│          └─────┘              │
│                               │
│  [                      📋    │← Copy icon
│    {                          │
│      "inputs": [...],         │
│      "name": "createLoan",    │
│      "outputs": [...],        │
│      ...                      │
│    },                         │
│    ...                        │
│  ]                            │
└──────────────────────────────┘
```

### 4. Get ABI - Method 2 (Alternative)

**Left Sidebar → Click "Deploy & Run" icon (3rd icon)**

1. Make sure contract is selected in dropdown
2. Scroll down to "Deployed Contracts" section
3. If you previously deployed, you'll see a copy ABI button
4. Click it to copy

### 5. Save ABI to Project

**Create/Update these files with the copied ABI:**

```
f:\xyz\ey-techathonzip (1)\ey-techathon\blockchain\contracts\
├── AccessControl.abi.json    ← Paste AccessControl ABI here
├── LoanCore.abi.json         ← Paste LoanCore ABI here
├── CreditRegistry.abi.json   ← Paste CreditRegistry ABI here
└── PaymentLedger.abi.json    ← Paste PaymentLedger ABI here
```

**File format:**
```json
[
  {
    "inputs": [...],
    "name": "functionName",
    "outputs": [...],
    "stateMutability": "...",
    "type": "function"
  },
  ...
]
```

## Quick Test

After saving all ABIs:

```bash
# Test if ABI loads correctly
node blockchain/diagnoseTx.js
```

Should show:
```
✅ Contract code exists
✅ Admin status check works
✅ Gas estimation succeeds
```

## Common Issues

### ❌ "ABI not found"
- Make sure file is named exactly: `ContractName.abi.json`
- File must be in: `blockchain/contracts/` folder

### ❌ "Invalid JSON"
- ABI must be a JSON array starting with `[` and ending with `]`
- Use an online JSON validator if needed

### ❌ "Function not found"
- Wrong ABI for the deployed contract
- Recompile in Remix and copy again
- Make sure compiler version matches

## Full Workflow

```bash
# 1. Get ABIs from Remix (follow steps above)
# 2. Save to blockchain/contracts/*.abi.json
# 3. Test connection
node blockchain/diagnoseTx.js

# 4. If successful, restart server
npm start

# 5. Test actual transaction
# Backend should now successfully write to blockchain
```

## Need Help?

If unclear, run the interactive updater:
```bash
node blockchain/updateABI.js
```

It will guide you through pasting each ABI.
