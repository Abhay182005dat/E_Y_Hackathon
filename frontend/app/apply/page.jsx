'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ApplyPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Form data
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        accountNumber: '',
        pan: '',
        aadhaar: '',
        monthlySalary: '',
        employmentType: 'salaried',
        city: '',
        loanAmount: '',
        loanPurpose: ''
    });

    // Protect Route & Pre-fill
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        } else if (user) {
            setFormData(prev => ({
                ...prev,
                name: user.name,
                phone: user.phone || '',
                accountNumber: user.accountNumber || ''
            }));
        }
    }, [user, authLoading, router]);

    // Document files
    const [documents, setDocuments] = useState({
        aadhaar: null,
        pan: null,
        bankStatement: null,
        salarySlip: null
    });

    // Verification results
    const [verification, setVerification] = useState(null);
    const [approvalScore, setApprovalScore] = useState(null);

    // Chat state
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatSessionId, setChatSessionId] = useState(null);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (docType, e) => {
        const file = e.target.files[0];
        setDocuments({ ...documents, [docType]: file });
    };

    // Step 1: Verify Documents
    const verifyDocuments = async () => {
        setLoading(true);
        setError('');

        try {
            const formDataAPI = new FormData();
            if (documents.aadhaar) formDataAPI.append('aadhaar', documents.aadhaar);
            if (documents.pan) formDataAPI.append('pan', documents.pan);
            if (documents.bankStatement) formDataAPI.append('bankStatement', documents.bankStatement);
            if (documents.salarySlip) formDataAPI.append('salarySlip', documents.salarySlip);

            const res = await fetch(`${API_URL}/api/verify-docs`, {
                method: 'POST',
                body: formDataAPI
            });

            const data = await res.json();

            if (data.ok) {
                setVerification(data);

                // Calculate approval score
                const scoreRes = await fetch(`${API_URL}/api/calculate-score`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerData: {
                            ...formData,
                            monthlySalary: parseInt(formData.monthlySalary) || 50000,
                            loanAmount: parseInt(formData.loanAmount) || 500000,
                            age: 30
                        },
                        documents: data.documents
                    })
                });

                const scoreData = await scoreRes.json();
                if (scoreData.ok) {
                    setApprovalScore(scoreData);
                }

                setStep(2);
            } else {
                setError(data.error || 'Verification failed');
            }
        } catch (err) {
            setError('Connection error: ' + err.message);
        }

        setLoading(false);
    };

    // Step 3: Chat - calls backend which uses Ollama AI
    const sendChatMessage = async () => {
        if (!chatInput.trim()) return;

        const userMsg = { role: 'user', content: chatInput };
        setMessages([...messages, userMsg]);
        const userText = chatInput;
        setChatInput('');

        try {
            const res = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userText,
                    customerData: formData,
                    creditScore: approvalScore, // Backend still expects this key
                    sessionId: chatSessionId
                })
            });

            const data = await res.json();

            if (data.ok && data.response) {
                if (data.sessionId) setChatSessionId(data.sessionId);
                setMessages(prev => [...prev, { role: 'bot', content: data.response }]);
            } else {
                setMessages(prev => [...prev, { role: 'bot', content: data.error || 'Sorry, I encountered an error.' }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'bot', content: 'Connection error.' }]);
        }
    };

    if (authLoading || !user) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    return (
        <>
            <header className="header">
                <nav className="nav container">
                    <Link href="/dashboard" className="logo">🏦 BFSI Loan Platform</Link>
                    <ul className="nav-links">
                        <li><Link href="/dashboard">Dashboard</Link></li>
                        <li><span className="badge badge-success">Apply</span></li>
                    </ul>
                </nav>
            </header>

            <div className="container" style={{ padding: '40px 20px' }}>
                {/* Progress Steps */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginBottom: '40px' }}>
                    {['Documents', 'Verification', 'Loan Chat'].map((label, i) => (
                        <div key={i} style={{ textAlign: 'center' }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                background: step > i ? 'var(--success)' : step === i + 1 ? 'var(--primary)' : 'var(--border)',
                                color: step >= i + 1 ? '#fff' : 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontWeight: 'bold'
                            }}>
                                {step > i + 1 ? '✓' : i + 1}
                            </div>
                            <span style={{ color: step >= i + 1 ? 'var(--primary)' : 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="card" style={{ background: '#fee2e2', borderColor: 'var(--error)', marginBottom: '24px', padding: '16px' }}>
                        <p style={{ color: 'var(--error)' }}>⚠️ {error}</p>
                    </div>
                )}

                {/* Step 1: Document Upload */}
                {step === 1 && (
                    <div className="card glass">
                        <h2 className="mb-8 text-center">📄 Upload Your Documents</h2>

                        <div className="grid-2 mb-8" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="input-group">
                                <label>Full Name</label>
                                <input className="form-input" name="name" value={formData.name} onChange={handleInputChange} disabled />
                            </div>
                            <div className="input-group">
                                <label>Phone Number</label>
                                <input className="form-input" name="phone" value={formData.phone} onChange={handleInputChange} disabled />
                            </div>
                            <div className="input-group">
                                <label>PAN Number</label>
                                <input className="form-input" name="pan" value={formData.pan} onChange={handleInputChange} placeholder="ABCDE1234F" />
                            </div>
                            <div className="input-group">
                                <label>Monthly Salary (₹)</label>
                                <input className="form-input" type="number" name="monthlySalary" value={formData.monthlySalary} onChange={handleInputChange} placeholder="50000" />
                            </div>
                            <div className="input-group">
                                <label>Loan Amount (₹)</label>
                                <input className="form-input" type="number" name="loanAmount" value={formData.loanAmount} onChange={handleInputChange} placeholder="500000" />
                            </div>
                            <div className="input-group">
                                <label>City</label>
                                <input className="form-input" name="city" value={formData.city} onChange={handleInputChange} placeholder="Mumbai" />
                            </div>
                        </div>

                        <h3 className="mb-4">Upload Documents</h3>
                        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            {[
                                { key: 'aadhaar', label: 'Aadhaar Card', icon: '🪪' },
                                { key: 'pan', label: 'PAN Card', icon: '💳' },
                                { key: 'bankStatement', label: 'Bank Statement', icon: '🏦' },
                                { key: 'salarySlip', label: 'Salary Slip', icon: '💰' }
                            ].map(doc => (
                                <div key={doc.key} className="card" style={{ position: 'relative', textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--border)' }}>
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={(e) => handleFileChange(doc.key, e)}
                                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                    />
                                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>{doc.icon}</div>
                                    <p style={{ fontWeight: '500' }}>{documents[doc.key]?.name || `Upload ${doc.label}`}</p>
                                    {documents[doc.key] && <span className="badge badge-success" style={{ display: 'inline-block', marginTop: '8px', padding: '4px 8px', borderRadius: '4px', background: 'var(--success)', color: '#fff', fontSize: '12px' }}>✓ Uploaded</span>}
                                </div>
                            ))}
                        </div>

                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '32px', padding: '16px' }}
                            onClick={verifyDocuments}
                            disabled={loading}
                        >
                            {loading ? 'Verifying...' : 'Verify Documents & Continue →'}
                        </button>
                    </div>
                )}

                {/* Step 2: Verification Results */}
                {step === 2 && (
                    <div className="card glass">
                        <h2 className="mb-8 text-center">✅ Verification Complete</h2>

                        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            {/* Approval Score */}
                            <div className="card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
                                <h3 className="mb-4">Your Approval Score</h3>
                                {(() => {
                                    const score = approvalScore?.approvalScore?.score || 720;
                                    const minScore = 300;
                                    const maxScore = 900;
                                    const percentage = ((score - minScore) / (maxScore - minScore)) * 100;
                                    const circumference = 2 * Math.PI * 52;
                                    const strokeDashoffset = circumference - (percentage / 100) * circumference;
                                    const color = score >= 750 ? 'var(--success)' : score >= 650 ? 'var(--warning)' : 'var(--error)';

                                    return (
                                        <div style={{ position: 'relative', width: '130px', height: '130px', margin: '0 auto' }}>
                                            <svg width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
                                                <circle cx="65" cy="65" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                                                <circle
                                                    cx="65" cy="65" r="52" fill="none"
                                                    stroke={color} strokeWidth="10"
                                                    strokeDasharray={circumference}
                                                    strokeDashoffset={strokeDashoffset}
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                            <div style={{
                                                position: 'absolute', top: '50%', left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: '28px', fontWeight: 'bold', color: '#0f172a'
                                            }}>
                                                {score}
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div style={{ marginTop: '16px', fontWeight: 'bold', color: approvalScore?.approvalScore?.score >= 700 ? 'var(--success)' : 'var(--warning)' }}>
                                    Grade: {approvalScore?.approvalScore?.grade || 'B'}
                                </div>
                            </div>

                            {/* Pre-Approved Limit */}
                            <div className="card" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, #1e293b 100%)', color: '#fff' }}>
                                <h3 className="mb-4" style={{ color: 'var(--accent)' }}>Pre-Approved Offer</h3>
                                <div className="mb-4">
                                    <p style={{ fontSize: '14px', opacity: 0.8 }}>Maximum Loan Amount</p>
                                    <p style={{ fontSize: '32px', fontWeight: '700', color: 'var(--accent)' }}>
                                        ₹{(approvalScore?.preApprovedLimit?.limit || 500000).toLocaleString()}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '24px' }}>
                                    <div>
                                        <p style={{ fontSize: '14px', opacity: 0.8 }}>Interest Rate</p>
                                        <p style={{ fontSize: '20px', fontWeight: '600' }}>
                                            {approvalScore?.preApprovedLimit?.interestRate || 12}%
                                        </p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '14px', opacity: 0.8 }}>Max EMI</p>
                                        <p style={{ fontSize: '20px', fontWeight: '600' }}>
                                            ₹{(approvalScore?.preApprovedLimit?.maxEMI || 25000).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', marginTop: '32px' }} onClick={() => setStep(3)}>
                            Proceed to Loan Chat →
                        </button>
                    </div>
                )}

                {/* Step 3: Loan Chat */}
                {step === 3 && (
                    <div className="card glass" style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
                            <h2>💬 Loan Assistant</h2>
                            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>AI Agent is online</p>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {messages.length === 0 && (
                                <div style={{ alignSelf: 'flex-start', background: '#f1f5f9', padding: '12px 16px', borderRadius: '12px 12px 12px 0', maxWidth: '80%' }}>
                                    Hello {user.name.split(' ')[0]}! 👋 I've analyzed your profile. Say "I need a loan" to confirm your offer!
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} style={{
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    background: msg.role === 'user' ? 'var(--primary)' : '#f1f5f9',
                                    color: msg.role === 'user' ? '#fff' : '#000', // Force black text for bot on light bg
                                    padding: '12px 16px',
                                    borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                                    maxWidth: '80%',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {msg.content}
                                </div>
                            ))}
                        </div>

                        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px' }}>
                            <input
                                className="form-input"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                                placeholder="Type your message..."
                            />
                            <button className="btn btn-primary" onClick={sendChatMessage}>Send</button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
