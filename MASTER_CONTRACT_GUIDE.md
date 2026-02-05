# 📄 Master Contract JSON - Complete Audit Trail

## What is the Master Contract?

The **Master Contract** is a comprehensive JSON file that aggregates ALL blockchain transactions for a user into one easy-to-read document. It's stored on **IPFS via Pinata** for permanent, decentralized storage.

---

## 🎯 How to Get Your Master Contract JSON

### Method 1: Automatic Generation (After Loan Acceptance)

When a user accepts a loan offer, the system **automatically**:
1. ✅ Logs transaction to Ethereum blockchain
2. ✅ Generates master contract JSON with all user data
3. ✅ Uploads to IPFS/Pinata with filename: `mastercontract_{userId}.json`
4. ✅ Returns IPFS hash and gateway URL

**Console Output:**
```
✅ [Application] Stored: LOAN-20260205-001 for Raj Kumar
📄 Generating master contract for +919876543210...
✅ Master contract uploaded to IPFS: QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
   📂 View at: https://gateway.pinata.cloud/ipfs/QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
```

---

### Method 2: API Endpoint (Get Cached or Generate New)

#### Get Master Contract (Use Cache if Available)
```bash
curl http://localhost:3001/api/blockchain/user/+919876543210/master-contract \
  -H "Authorization: Bearer YOUR_JWT"
```

**Response:**
```json
{
  "ok": true,
  "masterContract": {
    "version": "1.0",
    "generated": "2026-02-05T10:30:00.000Z",
    "userId": "+919876543210",
    "blockchain": {
      "network": "SEPOLIA",
      "contractAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "verificationUrl": "https://sepolia.etherscan.io/address/0x742d35Cc..."
    },
    "summary": {
      "totalApplications": 3,
      "totalChats": 24,
      "totalDocuments": 12,
      "totalCreditChecks": 2,
      "totalDisbursements": 1,
      "totalPayments": 0
    },
    "transactions": {
      "applications": [
        {
          "applicationId": "LOAN-20260205-001",
          "customerName": "Raj Kumar",
          "loanAmount": "500000",
          "interestRate": "11.75%",
          "approvalScore": "821",
          "status": "accepted",
          "timestamp": "2026-02-05T10:15:00.000Z",
          "documentHash": ""
        }
      ],
      "chatInteractions": [
        {
          "sessionId": "session_1738761234567",
          "messageHash": "a3f8b9c2d1e5f4a7...",
          "state": "negotiating",
          "negotiationCount": "2",
          "finalRate": "11.50%",
          "timestamp": "2026-02-05T10:10:00.000Z"
        }
      ],
      "documents": [...],
      "creditScores": [...],
      "disbursements": [...],
      "payments": [...]
    },
    "verification": {
      "dataHash": "d5e6f7a8b9c0d1e2...",
      "blockchainProof": "All transactions verifiable on Ethereum blockchain at 0x742d35Cc...",
      "ipfsStorage": "This master contract is stored on IPFS via Pinata for redundancy"
    }
  },
  "ipfsHash": "QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...",
  "ipfsUrl": "https://gateway.pinata.cloud/ipfs/QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...",
  "source": "cache"
}
```

---

#### Force Regenerate Master Contract
```bash
curl -X POST http://localhost:3001/api/blockchain/user/+919876543210/master-contract \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"regenerate": true}'
```

This will:
1. Query blockchain for latest data
2. Generate fresh JSON
3. Upload to IPFS/Pinata
4. Return new IPFS hash

---

## 📂 Where is the Master Contract Stored?

### 1. **IPFS/Pinata (Primary Storage)**
- **URL Format:** `https://gateway.pinata.cloud/ipfs/{IPFS_HASH}`
- **Filename:** `mastercontract_{userId}.json`
- **Permanent:** Files on IPFS are immutable and permanent
- **Access:** Anyone with the IPFS hash can view it

**Example URL:**
```
https://gateway.pinata.cloud/ipfs/QmXx9Yx8Zz7Aa6Bb5Cc4Dd3Ee2Ff1Gg0Hh9Ii8Jj7Kk6
```

### 2. **Local Backup (Server)**
- **Path:** `blockchain/master_contracts/{userId}_master.json`
- **Purpose:** Quick access without IPFS latency
- **Format:** Same JSON structure as IPFS version

**Example Path:**
```
F:\xyz\ey-techathonzip (1)\ey-techathon\blockchain\master_contracts\919876543210_master.json
```

### 3. **MongoDB (Reference)**
After generation, the application document is updated with:
```json
{
  "_id": "LOAN-20260205-001",
  "masterContractIPFS": "QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...",
  "masterContractUrl": "https://gateway.pinata.cloud/ipfs/QmXx9Yx8Zz7Aa6Bb5..."
}
```

---

## 🔍 Master Contract JSON Structure

```json
{
  "version": "1.0",
  "generated": "2026-02-05T10:30:00.000Z",
  "userId": "+919876543210",
  
  "blockchain": {
    "network": "SEPOLIA",
    "contractAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "verificationUrl": "https://sepolia.etherscan.io/address/0x742d35Cc..."
  },
  
  "summary": {
    "totalApplications": 3,
    "totalChats": 24,
    "totalDocuments": 12,
    "totalCreditChecks": 2,
    "totalDisbursements": 1,
    "totalPayments": 0
  },
  
  "transactions": {
    "applications": [
      {
        "applicationId": "LOAN-20260205-001",
        "customerName": "Raj Kumar",
        "loanAmount": "500000",
        "interestRate": "11.75%",
        "approvalScore": "821",
        "status": "accepted",
        "timestamp": "2026-02-05T10:15:00.000Z",
        "documentHash": ""
      }
    ],
    
    "chatInteractions": [
      {
        "sessionId": "session_1738761234567",
        "messageHash": "a3f8b9c2d1e5f4a7b8c9d0e1...",
        "state": "negotiating",
        "negotiationCount": "2",
        "finalRate": "11.50%",
        "timestamp": "2026-02-05T10:10:00.000Z"
      }
    ],
    
    "documents": [],
    
    "creditScores": [
      {
        "score": "821",
        "grade": "A",
        "preApprovedLimit": "₹5,00,000",
        "timestamp": "2026-02-05T10:05:00.000Z"
      }
    ],
    
    "disbursements": [
      {
        "loanId": "LOAN-20260205-001",
        "amount": "₹5,00,000",
        "recipientAccount": "ACC123456",
        "transactionId": "TXN-20260205-001",
        "timestamp": "2026-02-05T14:30:00.000Z"
      }
    ],
    
    "payments": [
      {
        "loanId": "LOAN-20260205-001",
        "emiNumber": "1",
        "amount": "₹16,622",
        "principalPaid": "₹12,000",
        "interestPaid": "₹4,622",
        "paymentStatus": "paid",
        "timestamp": "2026-03-05T00:00:00.000Z"
      }
    ]
  },
  
  "verification": {
    "dataHash": "d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6",
    "blockchainProof": "All transactions verifiable on Ethereum blockchain at 0x742d35Cc...",
    "ipfsStorage": "This master contract is stored on IPFS via Pinata for redundancy"
  }
}
```

---

## 🎯 Use Cases

### For Customers
- **Download complete loan history** in one JSON file
- **Verify transactions** on blockchain using Etherscan
- **Share with other banks** for loan applications
- **Legal proof** of transactions

### For Admins
- **Regulatory audits** - Submit to RBI/SEBI
- **Compliance reports** - Complete transaction history
- **Dispute resolution** - Immutable proof
- **Internal audits** - Easy to analyze

### For Developers
- **API integration** - Fetch complete user data
- **Data migration** - Export user records
- **Analytics** - Transaction pattern analysis

---

## 📊 Example: Check Master Contract in Browser

1. **Apply for loan** and accept offer
2. **Check console** for IPFS URL:
   ```
   ✅ Master contract uploaded to IPFS: QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
      📂 View at: https://gateway.pinata.cloud/ipfs/QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
   ```
3. **Open URL** in browser
4. **See complete JSON** with all transactions!

---

## 🔐 Security & Privacy

### What's Public?
- ✅ Transaction hashes (on blockchain)
- ✅ Application IDs
- ✅ Timestamps
- ✅ Loan amounts and rates

### What's Private?
- ❌ Personal messages (only hashes stored)
- ❌ Document content (only verification status)
- ❌ Account numbers (masked)
- ❌ Aadhaar/PAN details (only verification status)

### Access Control
- **User:** Can only access their own master contract
- **Admin:** Can access any user's master contract
- **Public:** Cannot access (requires JWT authentication)

---

## 🛠️ Troubleshooting

### "Master contract not found"
```bash
# Generate new one
curl -X POST http://localhost:3001/api/blockchain/user/+919876543210/master-contract \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"regenerate": true}'
```

### "IPFS upload failed"
- Check `PINATA_JWT` in `.env`
- Verify Pinata account is active
- Check internet connection
- Local backup still available at `blockchain/master_contracts/`

### "Blockchain not available"
- Contract not deployed yet
- Check `LOAN_LEDGER_CONTRACT_ADDRESS` in `.env`
- Verify Ethereum RPC connection

---

## 📚 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/blockchain/user/:userId/master-contract` | GET | Get cached master contract |
| `/api/blockchain/user/:userId/master-contract` | POST | Generate fresh master contract |
| `/api/blockchain/user/:userId/ledger` | GET | Get transaction IDs only |
| `/api/blockchain/user/:userId/history` | GET | Get blockchain data (no IPFS) |

---

## ✅ Benefits of Master Contract

### Compliance
✅ **Single file** for regulatory submissions  
✅ **Immutable proof** via blockchain  
✅ **Timestamped** transactions  
✅ **Verifiable** on Etherscan  

### Efficiency
✅ **One API call** gets everything  
✅ **Cached** for fast access  
✅ **IPFS** for permanent storage  
✅ **JSON format** for easy parsing  

### Transparency
✅ **Complete history** in one document  
✅ **Blockchain verification** links  
✅ **Human-readable** format  
✅ **Shareable** via IPFS URL  

---

**🎉 Your complete loan audit trail is now available as a JSON file on IPFS!**
