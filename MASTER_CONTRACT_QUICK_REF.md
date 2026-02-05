# 📋 Master Contract JSON - Quick Reference

## What You Asked For ✅

> **"After the file is saved on blockchain, that file stored in blockchain will be saved in Pinata too (with file name mastercontract)"**

**✅ IMPLEMENTED!**

---

## 📊 How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  Step 1: User Accepts Loan Offer                                   │
│  Frontend → Backend → Chat endpoint                                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Step 2: Log to Ethereum Blockchain                                 │
│  • Application details stored on-chain                              │
│  • Transaction hash: 0xa3f8b9c2d1e5...                              │
│  • Block confirmation (~15 seconds)                                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Step 3: Generate Master Contract JSON (Automatic)                  │
│  • Query blockchain for ALL user transactions                       │
│  • Aggregate: applications, chats, documents, credit scores, etc.   │
│  • Format as human-readable JSON                                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Step 4: Upload to IPFS/Pinata (Automatic)                          │
│  • Filename: mastercontract_{userId}.json                           │
│  • IPFS Hash: QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...                             │
│  • URL: https://gateway.pinata.cloud/ipfs/QmXx9...                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Step 5: Save References                                            │
│  • MongoDB: Save IPFS hash in application document                  │
│  • Local: blockchain/master_contracts/{userId}_master.json          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Where to Find Master Contract JSON

### 1. **IPFS/Pinata (Primary - Permanent Storage)**
```
URL: https://gateway.pinata.cloud/ipfs/{IPFS_HASH}
Filename: mastercontract_{userId}.json
Example: https://gateway.pinata.cloud/ipfs/QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
```

### 2. **Local Server (Backup)**
```
Path: F:\xyz\ey-techathonzip (1)\ey-techathon\blockchain\master_contracts\
File: {userId}_master.json
Example: 919876543210_master.json
```

### 3. **Console Log (After Loan Acceptance)**
```
✅ [Application] Stored: LOAN-20260205-001 for Raj Kumar
📄 Generating master contract for +919876543210...
✅ Master contract uploaded to IPFS: QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
   📂 View at: https://gateway.pinata.cloud/ipfs/QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
```

### 4. **API Endpoint**
```bash
# Get master contract
curl http://localhost:3001/api/blockchain/user/+919876543210/master-contract \
  -H "Authorization: Bearer YOUR_JWT"
```

### 5. **MongoDB (Reference Link)**
```json
{
  "_id": "LOAN-20260205-001",
  "masterContractIPFS": "QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...",
  "masterContractUrl": "https://gateway.pinata.cloud/ipfs/QmXx9..."
}
```

---

## 🎯 What's Inside the Master Contract JSON?

```json
{
  "version": "1.0",
  "userId": "+919876543210",
  "generated": "2026-02-05T10:30:00Z",
  
  "blockchain": {
    "contractAddress": "0x742d35Cc...",
    "network": "SEPOLIA",
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
    "applications": [ /* All loan applications */ ],
    "chatInteractions": [ /* All chat conversations */ ],
    "documents": [ /* All document verifications */ ],
    "creditScores": [ /* All credit score calculations */ ],
    "disbursements": [ /* All fund transfers */ ],
    "payments": [ /* All EMI payments */ ]
  },
  
  "verification": {
    "dataHash": "d5e6f7a8...",
    "blockchainProof": "All transactions verifiable on Ethereum...",
    "ipfsStorage": "This master contract is stored on IPFS..."
  }
}
```

---

## ✅ Test It Now!

### 1. Start Server
```bash
npm start
```

### 2. Apply for Loan
- Open: http://localhost:3000
- Login with phone
- Apply for loan
- Accept offer

### 3. Check Console
Look for:
```
✅ Master contract uploaded to IPFS: QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
   📂 View at: https://gateway.pinata.cloud/ipfs/QmXx9Yx8Zz7Aa6Bb5Cc4Dd3...
```

### 4. Open IPFS URL in Browser
You'll see the complete JSON file!

### 5. Check Local Backup
```
F:\xyz\ey-techathonzip (1)\ey-techathon\blockchain\master_contracts\919876543210_master.json
```

---

## 🔥 Key Features

### Automatic Generation
✅ Triggered when user accepts loan offer  
✅ No manual intervention required  
✅ Happens in background (non-blocking)  

### Dual Storage
✅ **Blockchain:** Immutable transaction records  
✅ **IPFS/Pinata:** Aggregated JSON file  
✅ **Local:** Fast access backup  

### Custom Filename
✅ Format: `mastercontract_{userId}.json`  
✅ Example: `mastercontract_919876543210.json`  
✅ Easy to identify and organize  

### Complete Audit Trail
✅ All applications  
✅ All chat interactions  
✅ All documents verified  
✅ All credit scores  
✅ All disbursements  
✅ All payments  

---

## 📚 Documentation

- **Full Setup:** [MASTER_CONTRACT_GUIDE.md](MASTER_CONTRACT_GUIDE.md)
- **Blockchain Setup:** [BLOCKCHAIN_SETUP.md](BLOCKCHAIN_SETUP.md)
- **Quick Start:** [BLOCKCHAIN_QUICK_START.md](BLOCKCHAIN_QUICK_START.md)

---

## 🎉 Summary

**What You Get:**

1. **Ethereum Blockchain** - Immutable transaction records ✅
2. **Master JSON File** - Complete aggregated audit trail ✅
3. **IPFS/Pinata Storage** - Permanent decentralized storage ✅
4. **Custom Filename** - `mastercontract_{userId}.json` ✅
5. **Automatic Process** - Triggers on loan acceptance ✅
6. **Local Backup** - Fast access copy ✅
7. **API Access** - Programmatic retrieval ✅

**Everything works automatically! Just accept a loan and the master contract JSON is generated and uploaded to Pinata with the name `mastercontract`!** 🚀
