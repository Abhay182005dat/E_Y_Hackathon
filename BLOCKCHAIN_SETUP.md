# 🔗 Blockchain Integration Guide - MetaMask & Remix IDE

This guide explains how to deploy the LoanLedger smart contract to Ethereum blockchain and integrate it with the BFSI Loan Platform.

---

## 📋 Prerequisites

1. **MetaMask Wallet** - Browser extension for Ethereum transactions
2. **Remix IDE** - Online Solidity IDE at https://remix.ethereum.org
3. **Test ETH** - Free testnet ETH for deploying contracts
4. **Node.js & Web3.js** - Already installed in the project

---

## 🚀 Step 1: Set Up MetaMask

### Install MetaMask
1. Visit https://metamask.io/
2. Click "Download" and install the browser extension
3. Create a new wallet and **SAVE YOUR SECRET RECOVERY PHRASE** securely
4. Set a strong password

### Connect to Sepolia Testnet
1. Open MetaMask
2. Click network dropdown (top center)
3. Enable "Show test networks" in settings
4. Select "Sepolia test network"

### Get Test ETH
Visit one of these faucets:
- **Sepolia Faucet**: https://sepoliafaucet.com/
- **Alchemy Faucet**: https://sepoliafaucet.com/
- **Infura Faucet**: https://www.infura.io/faucet/sepolia

Request 0.5 ETH (should arrive in 1-2 minutes)

---

## 🔧 Step 2: Deploy Smart Contract Using Remix IDE

### Open Remix
1. Go to https://remix.ethereum.org
2. Create new file: `LoanLedger.sol`
3. Copy entire contents from `blockchain/contracts/LoanLedger.sol`
4. Paste into Remix editor

### Compile Contract
1. Click "Solidity Compiler" tab (left sidebar)
2. Select Compiler version: `0.8.19` or higher
3. Enable "Auto compile" (optional)
4. Click "Compile LoanLedger.sol"
5. ✅ Should see green checkmark (no errors)

### Deploy Contract
1. Click "Deploy & Run Transactions" tab
2. **Environment**: Select "Injected Provider - MetaMask"
3. MetaMask will popup → Click "Connect"
4. Verify network shows "Sepolia (11155111)"
5. Contract: Select "LoanLedger"
6. Click "Deploy"
7. MetaMask popup → Review gas fees → Click "Confirm"
8. Wait 15-30 seconds for transaction confirmation

### Save Contract Details
After deployment, you'll see deployed contract in "Deployed Contracts" section:

1. **Contract Address**: Copy the address (e.g., `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`)
2. **ABI**: Click "Compilation Details" → Copy ABI JSON

Save these for Step 3!

---

## 💾 Step 3: Configure Backend

### Update Environment Variables
Edit `.env` file:

```env
# Blockchain Configuration
BLOCKCHAIN_NETWORK=SEPOLIA
LOAN_LEDGER_CONTRACT_ADDRESS=0xYourContractAddressHere

# Sepolia RPC (use Infura or Alchemy)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID

# Admin wallet private key (for automated transactions)
# ⚠️ NEVER commit this to Git! Only use for testnet!
BLOCKCHAIN_PRIVATE_KEY=0xYourPrivateKeyHere
```

### Get Infura Project ID
1. Sign up at https://infura.io
2. Create new project
3. Copy Project ID
4. Replace in `SEPOLIA_RPC_URL`

### Get MetaMask Private Key
⚠️ **SECURITY WARNING**: Only use testnet wallets for development!

1. Open MetaMask
2. Click three dots → Account Details
3. Click "Export Private Key"
4. Enter password
5. Copy private key
6. Paste in `.env` file

### Save Contract ABI
Create file: `blockchain/contracts/LoanLedger.abi.json`

Paste the ABI JSON you copied from Remix

---

## 🎯 Step 4: Add Backend as Admin

After deployment, the contract owner (your MetaMask address) is automatically an admin. To allow the backend server to write to the blockchain:

### Get Backend Wallet Address
Run this in terminal:
```bash
node -e "
const Web3 = require('web3');
const web3 = new Web3();
const account = web3.eth.accounts.privateKeyToAccount('YOUR_BACKEND_PRIVATE_KEY');
console.log('Backend Address:', account.address);
"
```

### Add Backend as Admin
In Remix IDE:
1. Under "Deployed Contracts", expand your contract
2. Find `addAdmin` function
3. Enter backend address
4. Click "transact"
5. Confirm in MetaMask

---

## ✅ Step 5: Test Blockchain Integration

### Start Backend
```bash
npm start
```

You should see:
```
✅ MongoDB: Scalability features initialized
✅ Redis: Chat streaming enabled
✅ Connected to blockchain (Network: SEPOLIA, Block: 5234567)
✅ Account loaded: 0x742d35Cc...
✅ Contract loaded at 0x123abc...
✅ Blockchain: Ethereum ledger connected (immutable audit trail enabled)
```

### Test API Endpoints

#### 1. Check Blockchain Stats
```bash
curl http://localhost:3001/api/blockchain/stats \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
```

Expected response:
```json
{
  "ok": true,
  "success": true,
  "stats": {
    "totalApplications": 0,
    "totalChatInteractions": 0,
    "totalDocuments": 0,
    "totalCreditChecks": 0,
    "totalDisbursements": 0,
    "totalPayments": 0
  }
}
```

#### 2. Apply for Loan (Triggers Blockchain Logging)
1. Open frontend: http://localhost:3000
2. Login with phone
3. Fill application form
4. Upload documents → ✅ Logs to blockchain
5. Calculate credit score → ✅ Logs to blockchain
6. Chat with AI → ✅ Each interaction logs to blockchain
7. Accept loan → ✅ Application logs to blockchain

#### 3. Check User's Blockchain Ledger
```bash
curl http://localhost:3001/api/blockchain/user/+919876543210/ledger \
  -H "Authorization: Bearer YOUR_JWT"
```

Expected response:
```json
{
  "ok": true,
  "success": true,
  "userId": "+919876543210",
  "masterLedger": [
    "LOAN-20260205-001",
    "session_1738761234567",
    "DOC_1738761234567_aadhaar",
    "DOC_1738761234567_pan"
  ],
  "counts": {
    "applications": 1,
    "chats": 5,
    "documents": 4,
    "creditChecks": 1,
    "disbursements": 0,
    "payments": 0
  }
}
```

#### 4. Get Complete Blockchain History
```bash
curl http://localhost:3001/api/blockchain/user/+919876543210/history \
  -H "Authorization: Bearer YOUR_JWT"
```

Returns complete transaction history from blockchain!

---

## 🔍 Step 6: Verify on Blockchain Explorer

### View Transactions on Sepolia Etherscan
1. Go to https://sepolia.etherscan.io/
2. Search your contract address
3. Click "Internal Txns" tab
4. See all logged transactions!

### Verify Contract
1. On Etherscan, click "Contract" tab
2. Click "Verify and Publish"
3. Select Compiler version `0.8.19`
4. Paste contract source code
5. Verify
6. Now anyone can read your contract code!

---

## 📊 What Gets Logged to Blockchain?

### Document Verification
```solidity
Event: DocumentVerified
Data: {
  userId: "+919876543210",
  documentType: "aadhaar",
  verified: true,
  dataHash: "a3f8b9c2...",
  timestamp: 1738761234
}
```

### Credit Score Calculation
```solidity
Event: CreditScoreCalculated
Data: {
  userId: "+919876543210",
  score: 821,
  grade: "A",
  preApprovedLimit: 500000,
  timestamp: 1738761250
}
```

### Chat Interactions
```solidity
Event: ChatInteractionLogged
Data: {
  sessionId: "session_1738761234567",
  userId: "+919876543210",
  messageHash: "d5e6f7a8...",
  state: "negotiating",
  negotiationCount: 2,
  finalRate: 1150, // 11.50% in basis points
  timestamp: 1738761300
}
```

### Loan Application Accepted
```solidity
Event: ApplicationLogged
Data: {
  applicationId: "LOAN-20260205-001",
  userId: "+919876543210",
  customerName: "Raj Kumar",
  loanAmount: 500000,
  interestRate: 1175, // 11.75%
  approvalScore: 821,
  status: "accepted",
  timestamp: 1738761350
}
```

---

## 🎨 Step 7: Add Blockchain UI (Optional)

### Show Blockchain Transaction Hash in Frontend

Update `frontend/app/apply/page.jsx`:

```jsx
const [blockchainTx, setBlockchainTx] = useState(null);

// After application is accepted
if (data.ok && data.response.includes('approved')) {
  // Call backend to get latest blockchain tx
  const txRes = await fetch(`${API_URL}/api/blockchain/user/${user.phone}/ledger`);
  const txData = await txRes.json();
  
  if (txData.ok && txData.masterLedger.length > 0) {
    setBlockchainTx(txData.masterLedger[txData.masterLedger.length - 1]);
  }
}

// Display blockchain tx in UI
{blockchainTx && (
  <div style={{ 
    marginTop: '20px', 
    padding: '16px', 
    background: 'rgba(34, 197, 94, 0.1)',
    borderRadius: '12px',
    border: '1px solid rgba(34, 197, 94, 0.3)'
  }}>
    <p style={{ margin: 0, fontSize: '14px', color: '#10b981' }}>
      🔗 Blockchain Record: <code>{blockchainTx}</code>
    </p>
    <a 
      href={`https://sepolia.etherscan.io/address/${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`}
      target="_blank"
      style={{ fontSize: '12px', color: '#22d3ee' }}
    >
      View on Etherscan →
    </a>
  </div>
)}
```

---

## 🔐 Security Best Practices

### For Development (Testnet)
✅ Use testnet ETH (free, no real value)
✅ Use separate wallet for development
✅ Never share private keys in public repos
✅ Add `.env` to `.gitignore`

### For Production (Mainnet)
⚠️ **CRITICAL**: Production deployment requires:
1. Professional security audit of smart contract
2. Multi-signature wallet for admin operations
3. Hardware wallet (Ledger/Trezor) for key storage
4. Proper key management system (AWS KMS, HashiCorp Vault)
5. Gas price optimization
6. Emergency pause mechanism in contract

**DO NOT deploy to mainnet without professional audit!**

---

## 🆘 Troubleshooting

### "Contract not initialized"
- Check `.env` has correct `LOAN_LEDGER_CONTRACT_ADDRESS`
- Verify ABI file exists at `blockchain/contracts/LoanLedger.abi.json`
- Check console logs for Web3 connection errors

### "Insufficient funds for gas"
- Add more test ETH to your MetaMask wallet
- Use faucet: https://sepoliafaucet.com/

### "Invalid address"
- Ensure contract address starts with `0x`
- Verify address is from Sepolia network (not mainnet)

### "Transaction failed"
- Check gas limit (increase in Remix deployment)
- Verify backend address is added as admin
- Check Sepolia network status: https://sepolia.etherscan.io/

### "RPC URL error"
- Verify Infura/Alchemy project ID is correct
- Check network is set to "SEPOLIA" in `.env`
- Try alternative RPC: `https://rpc.sepolia.org`

---

## 📚 Additional Resources

- **Remix IDE**: https://remix.ethereum.org/
- **MetaMask**: https://metamask.io/
- **Sepolia Faucet**: https://sepoliafaucet.com/
- **Etherscan (Sepolia)**: https://sepolia.etherscan.io/
- **Web3.js Docs**: https://web3js.readthedocs.io/
- **Solidity Docs**: https://docs.soliditylang.org/

---

## 🎉 Success Checklist

- [ ] MetaMask installed and configured
- [ ] Test ETH received on Sepolia
- [ ] Contract deployed via Remix
- [ ] Contract address saved in `.env`
- [ ] ABI saved in `LoanLedger.abi.json`
- [ ] Backend added as contract admin
- [ ] Backend starts without errors
- [ ] Blockchain stats API returns data
- [ ] Loan application triggers blockchain logging
- [ ] User ledger query returns transactions
- [ ] Transactions visible on Etherscan

**Congratulations! Your loan platform now has immutable blockchain audit trails! 🚀**
