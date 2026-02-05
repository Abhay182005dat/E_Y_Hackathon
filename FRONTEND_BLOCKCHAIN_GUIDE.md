# 🎨 Frontend Integration Guide - Modular Blockchain

## Overview

Your blockchain now uses **hash-based storage** with 4 modular contracts. This guide shows how to integrate them into your frontend.

---

## 🔑 Key Concept: Hashing

### Why Hash?

✅ **Privacy:** Sensitive data not visible on-chain  
✅ **Gas Efficiency:** bytes32 is cheaper than string  
✅ **Security:** Can't reverse-engineer original data  
✅ **Consistency:** Same input → same hash  

### How It Works

```
User Data          →  Hash Function  →  Blockchain
"+919876543210"    →  keccak256      →  0x5f8d9c3e2a1b...
"LOAN-001"         →  keccak256      →  0x7a2e4b9f1c3d...
```

**Full data stored in:** MongoDB + IPFS

---

## 📦 Installation

```bash
npm install ethers@6
```

---

## 🔧 Setup

### 1. Contract Addresses & ABIs

Create `frontend/app/contracts/addresses.js`:

```javascript
export const CONTRACTS = {
  SEPOLIA: {
    ACCESS_CONTROL: "0xYOUR_ACCESS_CONTROL_ADDRESS",
    LOAN_CORE: "0xYOUR_LOAN_CORE_ADDRESS",
    CREDIT_REGISTRY: "0xYOUR_CREDIT_REGISTRY_ADDRESS",
    PAYMENT_LEDGER: "0xYOUR_PAYMENT_LEDGER_ADDRESS"
  }
};

export const NETWORK = {
  SEPOLIA: {
    chainId: "0xaa36a7", // 11155111 in hex
    name: "Sepolia Testnet",
    rpcUrl: "https://sepolia.infura.io/v3/YOUR_KEY",
    explorer: "https://sepolia.etherscan.io"
  }
};
```

### 2. Create Hash Utility

Create `frontend/app/utils/blockchainHash.js`:

```javascript
import { ethers } from 'ethers';

/**
 * Hash string to bytes32 (same as backend)
 * @param {string} input - String to hash
 * @returns {string} - 0x-prefixed hex string
 */
export function hashToBytes32(input) {
  if (!input) return "0x" + "0".repeat(64);
  return ethers.keccak256(ethers.toUtf8Bytes(input.toString()));
}

/**
 * Hash multiple values together
 */
export function hashMultiple(...values) {
  const combined = values.join('|');
  return hashToBytes32(combined);
}

// Example usage:
// const userIdHash = hashToBytes32("+919876543210");
// const loanIdHash = hashToBytes32("LOAN-20260205-001");
```

---

## 🎯 Connect to MetaMask

Create `frontend/app/utils/web3Provider.js`:

```javascript
import { ethers } from 'ethers';
import { CONTRACTS, NETWORK } from '../contracts/addresses';

let provider = null;
let signer = null;
let userAddress = null;

/**
 * Connect to MetaMask wallet
 */
export async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask not installed!');
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({ 
      method: 'eth_requestAccounts' 
    });
    
    userAddress = accounts[0];
    
    // Create provider and signer
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    
    // Check network
    const network = await provider.getNetwork();
    const chainId = "0x" + network.chainId.toString(16);
    
    if (chainId !== NETWORK.SEPOLIA.chainId) {
      await switchToSepolia();
    }
    
    console.log('✅ Connected:', userAddress);
    return { address: userAddress, provider, signer };
    
  } catch (error) {
    console.error('❌ Failed to connect:', error);
    throw error;
  }
}

/**
 * Switch to Sepolia network
 */
async function switchToSepolia() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: NETWORK.SEPOLIA.chainId }],
    });
  } catch (switchError) {
    // Network not added, add it
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: NETWORK.SEPOLIA.chainId,
          chainName: NETWORK.SEPOLIA.name,
          rpcUrls: [NETWORK.SEPOLIA.rpcUrl],
          blockExplorerUrls: [NETWORK.SEPOLIA.explorer]
        }],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Get current user address
 */
export function getUserAddress() {
  return userAddress;
}

/**
 * Get provider (read-only)
 */
export function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(NETWORK.SEPOLIA.rpcUrl);
  }
  return provider;
}

/**
 * Get signer (for transactions)
 */
export function getSigner() {
  return signer;
}

/**
 * Listen for account changes
 */
export function onAccountChange(callback) {
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      userAddress = accounts[0];
      callback(accounts[0]);
    });
  }
}

/**
 * Listen for network changes
 */
export function onNetworkChange(callback) {
  if (window.ethereum) {
    window.ethereum.on('chainChanged', (chainId) => {
      callback(chainId);
      window.location.reload(); // Reload on network change
    });
  }
}
```

---

## 📜 Contract Instances

Create `frontend/app/contracts/instances.js`:

```javascript
import { ethers } from 'ethers';
import { CONTRACTS } from './addresses';
import { getProvider, getSigner } from '../utils/web3Provider';

// Import ABIs (you'll need to copy these from Remix)
import LoanCoreABI from './LoanCore.abi.json';
import CreditRegistryABI from './CreditRegistry.abi.json';
import PaymentLedgerABI from './PaymentLedger.abi.json';
import AccessControlABI from './AccessControl.abi.json';

/**
 * Get LoanCore contract instance
 * @param {boolean} withSigner - Use signer for write operations
 */
export function getLoanCoreContract(withSigner = false) {
  const providerOrSigner = withSigner ? getSigner() : getProvider();
  return new ethers.Contract(
    CONTRACTS.SEPOLIA.LOAN_CORE,
    LoanCoreABI,
    providerOrSigner
  );
}

/**
 * Get CreditRegistry contract instance
 */
export function getCreditRegistryContract(withSigner = false) {
  const providerOrSigner = withSigner ? getSigner() : getProvider();
  return new ethers.Contract(
    CONTRACTS.SEPOLIA.CREDIT_REGISTRY,
    CreditRegistryABI,
    providerOrSigner
  );
}

/**
 * Get PaymentLedger contract instance
 */
export function getPaymentLedgerContract(withSigner = false) {
  const providerOrSigner = withSigner ? getSigner() : getProvider();
  return new ethers.Contract(
    CONTRACTS.SEPOLIA.PAYMENT_LEDGER,
    PaymentLedgerABI,
    providerOrSigner
  );
}

/**
 * Get AccessControl contract instance
 */
export function getAccessControlContract(withSigner = false) {
  const providerOrSigner = withSigner ? getSigner() : getProvider();
  return new ethers.Contract(
    CONTRACTS.SEPOLIA.ACCESS_CONTROL,
    AccessControlABI,
    providerOrSigner
  );
}
```

---

## 🔍 Read Data from Blockchain

Create `frontend/app/services/blockchainService.js`:

```javascript
import { hashToBytes32 } from '../utils/blockchainHash';
import {
  getLoanCoreContract,
  getCreditRegistryContract,
  getPaymentLedgerContract
} from '../contracts/instances';

/**
 * Get all loans for a user
 * @param {string} userId - User phone number (e.g., "+919876543210")
 */
export async function getUserLoans(userId) {
  try {
    const contract = getLoanCoreContract();
    const userIdHash = hashToBytes32(userId);
    
    const loans = await contract.getLoans(userIdHash);
    
    return loans.map(loan => ({
      loanIdHash: loan.loanId,
      amount: ethers.formatEther(loan.amount), // Convert from wei
      interestRate: (Number(loan.interestBps) / 100).toFixed(2), // Convert from basis points
      score: Number(loan.score),
      status: getStatusString(loan.status),
      timestamp: new Date(Number(loan.timestamp) * 1000).toISOString()
    }));
  } catch (error) {
    console.error('❌ Failed to get user loans:', error);
    throw error;
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(userId) {
  try {
    const contract = getLoanCoreContract();
    const userIdHash = hashToBytes32(userId);
    
    const stats = await contract.getUserStats(userIdHash);
    
    return {
      totalLoans: Number(stats.loans),
      totalChats: Number(stats.chats),
      totalDocuments: Number(stats.documents)
    };
  } catch (error) {
    console.error('❌ Failed to get user stats:', error);
    throw error;
  }
}

/**
 * Get latest credit score
 */
export async function getLatestCreditScore(userId) {
  try {
    const contract = getCreditRegistryContract();
    const userIdHash = hashToBytes32(userId);
    
    const credit = await contract.latestCredit(userIdHash);
    
    return {
      score: Number(credit.score),
      grade: getGradeString(credit.grade),
      limit: ethers.formatEther(credit.limit),
      timestamp: new Date(Number(credit.timestamp) * 1000).toISOString()
    };
  } catch (error) {
    console.error('❌ No credit history found');
    return null;
  }
}

/**
 * Get user disbursements
 */
export async function getUserDisbursements(userId) {
  try {
    const contract = getPaymentLedgerContract();
    const userIdHash = hashToBytes32(userId);
    
    const disbursements = await contract.getUserDisbursements(userIdHash);
    
    return disbursements.map(disb => ({
      loanIdHash: disb.loanId,
      amount: ethers.formatEther(disb.amount),
      accountHash: disb.accountHash,
      txHash: disb.txHash,
      timestamp: new Date(Number(disb.timestamp) * 1000).toISOString()
    }));
  } catch (error) {
    console.error('❌ Failed to get disbursements:', error);
    throw error;
  }
}

/**
 * Get user EMI payments
 */
export async function getUserEMIs(userId) {
  try {
    const contract = getPaymentLedgerContract();
    const userIdHash = hashToBytes32(userId);
    
    const emis = await contract.getUserEMIs(userIdHash);
    
    return emis.map(emi => ({
      loanIdHash: emi.loanId,
      emiNumber: Number(emi.emiNo),
      amount: ethers.formatEther(emi.amount),
      principalPaid: ethers.formatEther(emi.principalPaid),
      interestPaid: ethers.formatEther(emi.interestPaid),
      status: getPaymentStatusString(emi.status),
      timestamp: new Date(Number(emi.timestamp) * 1000).toISOString()
    }));
  } catch (error) {
    console.error('❌ Failed to get EMIs:', error);
    throw error;
  }
}

/**
 * Get master ledger (all transaction hashes)
 */
export async function getMasterLedger(userId) {
  try {
    const contract = getLoanCoreContract();
    const userIdHash = hashToBytes32(userId);
    
    const ledger = await contract.getMasterLedger(userIdHash);
    
    return ledger; // Array of bytes32 hashes
  } catch (error) {
    console.error('❌ Failed to get master ledger:', error);
    throw error;
  }
}

// Helper functions
function getStatusString(code) {
  const statuses = ['pending', 'offered', 'negotiating', 'accepted', 'approved', 'rejected', 'disbursed'];
  return statuses[Number(code)] || 'unknown';
}

function getGradeString(code) {
  const grades = ['A+', 'A', 'B', 'C', 'D'];
  return grades[Number(code)] || 'Unknown';
}

function getPaymentStatusString(code) {
  const statuses = ['pending', 'paid', 'overdue', 'failed'];
  return statuses[Number(code)] || 'unknown';
}
```

---

## 🎨 React Component Example

Create `frontend/app/components/UserLoans.jsx`:

```jsx
'use client';
import { useState, useEffect } from 'react';
import { connectWallet } from '../utils/web3Provider';
import { getUserLoans, getUserStats, getLatestCreditScore } from '../services/blockchainService';

export default function UserLoans({ userId }) {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [loans, setLoans] = useState([]);
  const [stats, setStats] = useState(null);
  const [credit, setCredit] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    try {
      const { address } = await connectWallet();
      setAddress(address);
      setConnected(true);
    } catch (error) {
      alert('Failed to connect: ' + error.message);
    }
  };

  const loadBlockchainData = async () => {
    setLoading(true);
    try {
      // Load loans
      const userLoans = await getUserLoans(userId);
      setLoans(userLoans);

      // Load stats
      const userStats = await getUserStats(userId);
      setStats(userStats);

      // Load credit score
      const creditScore = await getLatestCreditScore(userId);
      setCredit(creditScore);
    } catch (error) {
      console.error('Failed to load blockchain data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected && userId) {
      loadBlockchainData();
    }
  }, [connected, userId]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Blockchain Data</h2>

      {!connected ? (
        <button 
          onClick={handleConnect}
          className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
        >
          🦊 Connect MetaMask
        </button>
      ) : (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Connected: {address.slice(0, 6)}...{address.slice(-4)}
          </p>

          {loading ? (
            <p>Loading blockchain data...</p>
          ) : (
            <>
              {/* Stats */}
              {stats && (
                <div className="bg-gray-100 p-4 rounded mb-4">
                  <h3 className="font-bold mb-2">Statistics</h3>
                  <p>Total Loans: {stats.totalLoans}</p>
                  <p>Total Chats: {stats.totalChats}</p>
                  <p>Total Documents: {stats.totalDocuments}</p>
                </div>
              )}

              {/* Credit Score */}
              {credit && (
                <div className="bg-green-100 p-4 rounded mb-4">
                  <h3 className="font-bold mb-2">Latest Credit Score</h3>
                  <p className="text-3xl font-bold">{credit.score}</p>
                  <p>Grade: {credit.grade}</p>
                  <p>Pre-approved Limit: ₹{parseFloat(credit.limit).toLocaleString()}</p>
                </div>
              )}

              {/* Loans */}
              <div>
                <h3 className="font-bold mb-2">Loans ({loans.length})</h3>
                {loans.length === 0 ? (
                  <p className="text-gray-500">No loans found on blockchain</p>
                ) : (
                  <div className="space-y-2">
                    {loans.map((loan, idx) => (
                      <div key={idx} className="border p-4 rounded">
                        <p><strong>Amount:</strong> ₹{parseFloat(loan.amount).toLocaleString()}</p>
                        <p><strong>Interest Rate:</strong> {loan.interestRate}%</p>
                        <p><strong>Score:</strong> {loan.score}</p>
                        <p><strong>Status:</strong> 
                          <span className={`ml-2 px-2 py-1 rounded text-sm ${
                            loan.status === 'approved' ? 'bg-green-200' : 
                            loan.status === 'rejected' ? 'bg-red-200' : 
                            'bg-yellow-200'
                          }`}>
                            {loan.status}
                          </span>
                        </p>
                        <p className="text-sm text-gray-500">{new Date(loan.timestamp).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 🔗 Verify on Etherscan

Add link to verify transactions:

```jsx
function TransactionLink({ txHash }) {
  return (
    <a 
      href={`https://sepolia.etherscan.io/tx/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline"
    >
      View on Etherscan ↗
    </a>
  );
}
```

---

## 📱 Complete Page Example

Create `frontend/app/blockchain/page.jsx`:

```jsx
'use client';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import UserLoans from '../components/UserLoans';

export default function BlockchainPage() {
  const { user } = useContext(AuthContext);

  if (!user) {
    return <div className="p-6">Please login first</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🔗 Blockchain Verification</h1>
      
      <div className="bg-blue-50 p-4 rounded mb-6">
        <p className="text-sm">
          All your loan data is stored immutably on the Ethereum blockchain.
          Connect your MetaMask wallet to verify the data.
        </p>
      </div>

      <UserLoans userId={user.phoneNumber} />
    </div>
  );
}
```

---

## 🎯 Key Takeaways

### ✅ Do's
- Always hash user IDs before querying blockchain
- Use read-only provider for data queries (saves gas)
- Handle errors gracefully (user might not have data yet)
- Convert wei → ether and basis points → percentages
- Cache blockchain data in React state

### ❌ Don'ts
- Don't send unhashed strings to blockchain
- Don't use signer for read operations (wastes gas)
- Don't query blockchain on every render (use useEffect)
- Don't expose private keys in frontend code
- Don't forget to handle MetaMask not installed

---

## 🔒 Security Notes

1. **Never expose private keys** in frontend
2. **Backend writes** to blockchain (admin-only)
3. **Frontend reads** from blockchain (public)
4. **Hashes protect privacy** - can't reverse engineer
5. **Full data in MongoDB** - blockchain has only hashes

---

## 🚀 Next Steps

1. Copy ABIs from Remix to `frontend/app/contracts/`
2. Update contract addresses in `addresses.js`
3. Install ethers: `npm install ethers@6`
4. Create utility functions
5. Build React components
6. Test on Sepolia testnet

---

**🎉 Your frontend is now blockchain-powered!**
