'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const chatCardStyle = {
    borderRadius: '28px',
    background: 'radial-gradient(circle at top left, rgba(14,165,233,0.35), rgba(15,23,42,0.95))',
    border: '1px solid rgba(59,130,246,0.3)',
    boxShadow: '0 35px 65px rgba(15,23,42,0.55)',
    overflow: 'hidden',
    position: 'relative'
};

const messageListStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0.7), rgba(15,23,42,0.9))'
};

const bubbleStyle = (role) => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? 'linear-gradient(135deg, #22d3ee, #1d4ed8)' : 'rgba(248,250,252,0.9)',
    color: role === 'user' ? '#fff' : '#0f172a',
    padding: '14px 18px',
    borderRadius: role === 'user' ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
    maxWidth: '80%',
    boxShadow: '0 10px 25px rgba(15,23,42,0.18)',
    position: 'relative',
    whiteSpace: 'pre-wrap'
});

const pageWrapperStyle = {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, rgba(59,130,246,0.25), transparent 50%), linear-gradient(180deg, #020617 0%, #0b1221 45%, #020617 100%)',
    padding: '40px 0'
};

const applyContainerStyle = {
    width: 'min(1280px, 100%)',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    padding: '0 20px 60px'
};

const heroHeaderStyle = {
    padding: '40px',
    borderRadius: '36px',
    background: 'linear-gradient(145deg, rgba(59,130,246,0.18), rgba(2,6,23,0.95))',
    border: '1px solid rgba(59,130,246,0.35)',
    boxShadow: '0 45px 90px rgba(2,6,23,0.8)',
    position: 'relative',
    overflow: 'hidden'
};

const heroStatCardStyle = {
    borderRadius: '24px',
    background: 'rgba(2,6,23,0.8)',
    border: '1px solid rgba(148,163,184,0.3)',
    padding: '18px',
    boxShadow: '0 25px 45px rgba(2,6,23,0.55)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
};

const heroCTAStyle = {
    padding: '14px 26px',
    borderRadius: '999px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
};

const heroSecondaryStyle = {
    padding: '14px 26px',
    borderRadius: '999px',
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.5)',
    color: '#d1d5db',
    fontWeight: 600
};

const heroPillStyle = {
    padding: '8px 16px',
    borderRadius: '999px',
    background: 'rgba(148,163,184,0.12)',
    border: '1px solid rgba(148,163,184,0.3)',
    fontSize: '11px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#e2e8f0'
};

const progressTimelineStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px',
    borderRadius: '28px',
    background: 'rgba(15,23,42,0.55)',
    border: '1px solid rgba(59,130,246,0.25)',
    boxShadow: '0 25px 45px rgba(2,6,23,0.5)',
    gap: '12px'
};

const progressDot = (active, completed) => ({
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    background: completed ? 'var(--success)' : active ? 'var(--primary)' : 'rgba(148,163,184,0.25)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    boxShadow: active ? '0 12px 30px rgba(59,130,246,0.4)' : 'none'
});

const stepLabelStyle = (active) => ({
    fontSize: '12px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: active ? '#fff' : '#94a3b8'
});

const formGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '18px',
    marginBottom: '28px'
};

const documentGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '20px',
    marginBottom: '24px'
};

const documentCardStyle = {
    position: 'relative',
    borderRadius: '20px',
    border: '1px dashed rgba(148,163,184,0.5)',
    padding: '22px 16px',
    textAlign: 'center',
    background: 'rgba(15,23,42,0.4)',
    minHeight: '150px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '8px',
    transition: 'transform 0.3s ease, border-color 0.3s ease'
};

const documentIconStyle = {
    fontSize: '34px'
};

const infoStripStyle = {
    borderRadius: '16px',
    padding: '14px 18px',
    background: 'rgba(59,130,246,0.12)',
    border: '1px solid rgba(59,130,246,0.3)',
    marginBottom: '12px'
};

const sectionCardStyle = {
    borderRadius: '32px',
    background: 'linear-gradient(145deg, rgba(15,23,42,0.9), rgba(15,23,42,0.8))',
    border: '1px solid rgba(59,130,246,0.3)',
    boxShadow: '0 35px 70px rgba(2,6,23,0.7)',
    padding: '32px'
};

const verificationDetailStyle = {
    marginTop: '24px',
    display: 'flex',
    gap: '22px',
    flexWrap: 'wrap'
};

const detailItemStyle = {
    flex: '1 1 180px',
    padding: '16px',
    borderRadius: '18px',
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(148,163,184,0.3)'
};

const chatInfoStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
    margin: '0 28px 12px'
};

const chatStatStyle = {
    padding: '12px 18px',
    borderRadius: '14px',
    background: 'rgba(59,130,246,0.15)',
    border: '1px solid rgba(59,130,246,0.4)',
    fontSize: '13px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase'
};

const chatFooterStyle = {
    padding: '20px',
    borderTop: '1px solid rgba(148,163,184,0.3)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '12px',
    background: 'rgba(15,23,42,0.85)'
};

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

    // Live photo capture state
    const [livePhoto, setLivePhoto] = useState(null);
    const [cameraActive, setCameraActive] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    // Start camera - get stream first, then activate camera UI
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            streamRef.current = stream;
            setCameraActive(true); // This triggers video element to render
        } catch (err) {
            console.error('Camera error:', err);
            setError('Camera access denied. Please allow camera permissions.');
        }
    };

    // Attach stream to video when video element mounts
    useEffect(() => {
        if (cameraActive && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(console.error);
        }
    }, [cameraActive]);

    // Stop camera
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setCameraActive(false);
    };

    // Capture and compress photo
    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Use actual video dimensions, fallback to display dimensions
        const videoWidth = video.videoWidth || video.clientWidth || 640;
        const videoHeight = video.videoHeight || video.clientHeight || 480;

        // Resize to max 640px width for compression
        const maxWidth = 640;
        const scale = Math.min(maxWidth / videoWidth, 1);
        canvas.width = videoWidth * scale;
        canvas.height = videoHeight * scale;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Compress to JPEG 70%
        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `live_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
                setLivePhoto(file);
                stopCamera();
                console.log(`📸 Photo captured: ${(blob.size / 1024).toFixed(1)}KB`);
            }
        }, 'image/jpeg', 0.7);
    };

    // Cleanup camera on unmount
    useEffect(() => {
        return () => stopCamera();
    }, []);

    // Verification results
    const [verification, setVerification] = useState(null);
    const [approvalScore, setApprovalScore] = useState(null);

    const heroHighlights = [
        'AI concierge guidance',
        'Live document attestations',
        'Rate-backed EMI clarity'
    ];

    const preApprovedLimit = approvalScore?.preApprovedLimit || { limit: 500000, interestRate: 12, maxEMI: 25000 };
    const journeySteps = ['Document Upload', 'Verification', 'Loan Chat'];
    const displayScore = approvalScore?.approvalScore?.score || null; // Remove hardcoded 720
    const confidenceLabel = displayScore >= 700 ? 'High confidence' : displayScore >= 650 ? 'Moderate confidence' : 'Low confidence';
    const scoreRange = displayScore ? `${Math.max(displayScore - 40, 300)} - 900` : '300 - 900';

    // Chat state
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatSessionId, setChatSessionId] = useState(null);
    const [sessionRestored, setSessionRestored] = useState(false);
    const [restoringSession, setRestoringSession] = useState(false);
    const [isBotTyping, setIsBotTyping] = useState(false);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // SESSION PERSISTENCE: Save state on change
    useEffect(() => {
        if (step > 1 || formData.name) {
            const state = {
                step,
                formData,
                approvalScore,
                verification
            };
            localStorage.setItem('apply_session', JSON.stringify(state));
        }
    }, [step, formData, approvalScore, verification]);

    // SESSION PERSISTENCE: Restore state on mount
    useEffect(() => {
        // Wait for auth to finish loading before restoring
        if (authLoading) return;

        // Check if user wants to start fresh (coming from dashboard with ?fresh=true)
        const urlParams = new URLSearchParams(window.location.search);
        const forceFresh = urlParams.get('fresh') === 'true';

        if (forceFresh) {
            localStorage.removeItem('apply_session');
            // Remove the ?fresh param from URL without reload
            window.history.replaceState({}, '', '/apply');
            console.log('🆕 Starting fresh application (forced by URL parameter)');
            return; // Don't restore session
        }

        const saved = localStorage.getItem('apply_session');
        if (saved && user) {
            try {
                const parsed = JSON.parse(saved);
                // Only restore if it matches current user (security check)
                if (parsed.formData?.phone === user.phone) {
                    // If loan was already submitted (step 3 with completed status), start fresh
                    if (parsed.step === 3 && parsed.loanSubmitted) {
                        localStorage.removeItem('apply_session');
                        console.log('🆕 Previous loan was submitted. Starting fresh.');
                        return;
                    }
                    setStep(parsed.step || 1);
                    setFormData(parsed.formData || formData);
                    setApprovalScore(parsed.approvalScore || null);
                    setVerification(parsed.verification || null);
                    console.log('🔄 Session restored from localStorage');
                }
            } catch (e) {
                console.error('Failed to restore session:', e);
                localStorage.removeItem('apply_session');
            }
        }
    }, [user, authLoading]);

    // Function to reset session and start fresh
    const resetSession = () => {
        localStorage.removeItem('apply_session');
        setStep(1);
        setFormData({
            name: user?.name || '',
            phone: user?.phone || '',
            email: user?.email || '',
            accountNumber: user?.accountNumber || '',
            pan: '',
            monthlySalary: '',
            loanAmount: '',
            existingEMI: '0'
        });
        setApprovalScore(null);
        setVerification(null);
        setMessages([]);
        setChatSessionId(null);
        setError(null);
        console.log('🔄 Session reset. Starting fresh application.');
    };

    // Clear session when user navigates away (e.g., to dashboard)
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Check if there's a completed application (step 3 with messages)
            if (step === 3 && messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                // If last bot message indicates submission, clear session
                if (lastMessage.role === 'bot' &&
                    (lastMessage.content.toLowerCase().includes('submitted') ||
                        lastMessage.content.toLowerCase().includes('approved'))) {
                    localStorage.removeItem('apply_session');
                    console.log('🗑️  Session cleared on navigation (loan submitted)');
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [step, messages]);

    // Restore chat session when entering step 3
    useEffect(() => {
        const restoreSession = async () => {
            if (step === 3 && !sessionRestored && user) {
                setRestoringSession(true);
                try {
                    // Generate a consistent session ID based on user
                    const userSessionId = chatSessionId || `session_${user.phone}_${Date.now()}`;

                    const res = await fetch(`${API_URL}/api/chat/restore`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId: userSessionId,
                            customerData: formData
                        })
                    });

                    const data = await res.json();

                    if (data.ok) {
                        setChatSessionId(data.sessionId);

                        if (data.restored && data.messages && data.messages.length > 0) {
                            // Restore previous messages
                            setMessages(data.messages);
                            console.log(`✅ Session restored: ${data.sessionId} (${data.messages.length} messages)`);

                            // Show restoration message
                            setTimeout(() => {
                                setMessages(prev => [...prev, {
                                    role: 'bot',
                                    content: data.message || 'Welcome back! Continuing from where you left off...'
                                }]);
                            }, 500);
                        } else {
                            console.log(`✨ New session created: ${data.sessionId}`);
                        }

                        setSessionRestored(true);
                    }
                } catch (err) {
                    console.error('Session restoration error:', err);
                    // Continue with new session on error
                    setChatSessionId(`session_${user.phone}_${Date.now()}`);
                    setSessionRestored(true);
                }
                setRestoringSession(false);
            }
        };

        restoreSession();
    }, [step, sessionRestored, user]);

    const handleFileChange = (docType, e) => {
        const file = e.target.files[0];
        setDocuments({ ...documents, [docType]: file });
    };

    // Step 1: Verify Documents
    const verifyDocuments = async () => {
        setError('');

        // ── MANDATORY FIELD & DOCUMENT VALIDATION ──────────────────────────
        const missing = [];

        if (!formData.name?.trim())        missing.push('Full Name');
        if (!formData.monthlySalary)        missing.push('Monthly Salary');
        if (!formData.loanAmount)           missing.push('Loan Amount');
        if (!documents.aadhaar)             missing.push('Aadhaar Card (document upload)');
        if (!documents.pan)                 missing.push('PAN Card (document upload)');
        if (!documents.bankStatement)       missing.push('Bank Statement (document upload)');
        if (!documents.salarySlip)          missing.push('Salary Slip (document upload)');
        if (!livePhoto)                     missing.push('Live Photo (selfie)');

        if (missing.length > 0) {
            setError('⚠️ Please complete the following before proceeding:\n' + missing.map(m => `• ${m}`).join('\n'));
            return;
        }

        setLoading(true);

        try {
            const formDataAPI = new FormData();
            if (documents.aadhaar) formDataAPI.append('aadhaar', documents.aadhaar);
            if (documents.pan) formDataAPI.append('pan', documents.pan);
            if (documents.bankStatement) formDataAPI.append('bankStatement', documents.bankStatement);
            if (documents.salarySlip) formDataAPI.append('salarySlip', documents.salarySlip);
            if (livePhoto) formDataAPI.append('livePhoto', livePhoto);

            // Send user-entered name & salary so the server can compare them
            // against OCR-extracted values in performFraudCheck()
            formDataAPI.append('customerData', JSON.stringify({
                name: formData.name,
                monthlySalary: formData.monthlySalary
            }));

            const res = await fetch(`${API_URL}/api/verify-docs`, {
                method: 'POST',
                body: formDataAPI
            });

            const data = await res.json();

            if (data.ok) {
                setVerification(data);

                // ── FRAUD GATE ──────────────────────────────────────────────────
                // If any high-severity fraud issue is detected, block the application.
                const fc = data.fraudCheck;
                if (fc && fc.flagged) {
                    // Build a human-readable error from the issue list
                    const highIssues = fc.issues.filter(i => i.severity === 'high');
                    const msgs = (highIssues.length ? highIssues : fc.issues)
                        .map(i => i.message);
                    setError(
                        '⛔ Verification Failed — application cannot proceed:\n' +
                        msgs.join('\n')
                    );
                    setLoading(false);
                    return; // Hard stop — do NOT proceed to approval score or step 2
                }
                // ────────────────────────────────────────────────────────────────

                // Calculate approval score (only reached when fraud check passes)
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
                    console.log("this is the approval score:", scoreData);
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
        setIsBotTyping(true);

        try {
            const res = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userText,
                    customerData: formData,
                    creditScore: approvalScore, // Backend still expects this key
                    sessionId: chatSessionId,
                    documents: verification?.documents || null // Pass actual OCR document data
                })
            });

            const data = await res.json();

            if (data.ok && data.response) {
                if (data.sessionId) setChatSessionId(data.sessionId);
                setMessages(prev => [...prev, { role: 'bot', content: data.response }]);

                // Update loan amount if chatbot modified it
                if (data.updatedLoanAmount) {
                    setFormData(prev => ({ ...prev, loanAmount: data.updatedLoanAmount }));
                    console.log(`💰 Loan amount updated to: ₹${data.updatedLoanAmount}`);
                }

                // Check if loan was submitted
                const responseText = data.response.toLowerCase();
                if (data.submitted || responseText.includes('application submitted') ||
                    responseText.includes('loan has been submitted') ||
                    responseText.includes('successfully submitted') ||
                    responseText.includes('application has been submitted')) {
                    console.log('✅ Loan submitted! Clearing session in 3 seconds...');
                    setTimeout(() => {
                        localStorage.removeItem('apply_session');
                        console.log('🗑️  Session cleared. User can now start a new application.');
                    }, 3000);
                }
            } else {
                setMessages(prev => [...prev, { role: 'bot', content: data.error || 'Sorry, I encountered an error.' }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'bot', content: 'Connection error.' }]);
        } finally {
            setIsBotTyping(false);
        }
    };

    if (authLoading || !user) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    return (
        <div style={pageWrapperStyle}>
            <div style={applyContainerStyle}>
                <header style={heroHeaderStyle} className="glass-panel">
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#cbd5f5' }}>Precision Lending Studio</p>
                            <h1 style={{ margin: 0, fontSize: '2.8rem', fontWeight: 600 }}>Concierge-grade loans for the modern borrower</h1>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '15px', maxWidth: '480px' }}>Launch your loan path with a live AI concierge, instant document attestations, and EMI projections tuned to your needs.</p>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <Link href="/dashboard" className="btn btn-primary" style={heroCTAStyle}>
                                    View offer canvas
                                </Link>
                                <button type="button" className="btn" style={heroSecondaryStyle}>
                                    Schedule a call
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
                                {heroHighlights.map((label) => (
                                    <span key={label} style={heroPillStyle}>{label}</span>
                                ))}
                            </div>
                        </div>
                        <div style={{ flex: '0 1 320px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={heroStatCardStyle}>
                                <p style={{ margin: 0, fontSize: '12px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#94a3b8' }}>Progress</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '40px', fontWeight: 700, color: '#fff' }}>{step}/3</span>
                                    <span style={{ color: '#cbd5f5', fontSize: '13px' }}>Complete each stage to unlock instant disbursal</span>
                                </div>
                                <div style={{ height: '6px', borderRadius: '999px', background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${(step / 3) * 100}%`, background: 'linear-gradient(90deg, var(--primary), #22d3ee)' }} />
                                </div>
                            </div>
                            <div style={heroStatCardStyle}>
                                <p style={{ margin: 0, fontSize: '12px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#94a3b8' }}>Pre-approved ceiling</p>
                                <strong style={{ fontSize: '30px', color: '#bae6fd' }}>₹{preApprovedLimit.limit.toLocaleString()}</strong>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5f5' }}>
                                    <span>{preApprovedLimit.interestRate}% p.a.</span>
                                    <span>EMI ₹{preApprovedLimit.maxEMI.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at top right, rgba(59,130,246,0.25), transparent 60%)' }} />
                </header>

                <div style={progressTimelineStyle}>
                    {journeySteps.map((label, index) => {
                        const completed = step > index + 1;
                        const active = step === index + 1;
                        return (
                            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                <div style={progressDot(active, completed)}>{completed ? '✓' : index + 1}</div>
                                <span style={stepLabelStyle(active)}>{label}</span>
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div className="card" style={{ background: '#fee2e2', borderColor: 'var(--error)', marginBottom: '24px', padding: '16px' }}>
                        <p style={{ color: 'var(--error)', whiteSpace: 'pre-wrap' }}>⚠️ {error}</p>
                    </div>
                )}

                {step === 1 && (
                    <div className="card glass" style={sectionCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                            <h2 className="mb-8 text-center" style={{ margin: 0 }}>📄 Upload Your Documents</h2>
                            <span style={chatStatStyle}>256-bit encrypted</span>
                        </div>
                        <div style={formGridStyle}>
                            <div className="input-group">
                                <label>Full Name <span style={{color:'#f87171'}}>*</span></label>
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
                                <label>Monthly Salary (₹) <span style={{color:'#f87171'}}>*</span></label>
                                <input className="form-input" type="number" name="monthlySalary" value={formData.monthlySalary} onChange={handleInputChange} placeholder="50000" style={!formData.monthlySalary ? {borderColor:'rgba(248,113,113,0.5)'} : {}} />
                            </div>
                            <div className="input-group">
                                <label>Loan Amount (₹) <span style={{color:'#f87171'}}>*</span></label>
                                <input className="form-input" type="number" name="loanAmount" value={formData.loanAmount} onChange={handleInputChange} placeholder="500000" style={!formData.loanAmount ? {borderColor:'rgba(248,113,113,0.5)'} : {}} />
                            </div>
                            <div className="input-group">
                                <label>City</label>
                                <input className="form-input" name="city" value={formData.city} onChange={handleInputChange} placeholder="Mumbai" />
                            </div>
                        </div>
                        <div style={documentGridStyle}>
                            {[
                                { key: 'aadhaar', label: 'Aadhaar Card', icon: '🪪' },
                                { key: 'pan', label: 'PAN Card', icon: '💳' },
                                { key: 'bankStatement', label: 'Bank Statement', icon: '🏦' },
                                { key: 'salarySlip', label: 'Salary Slip', icon: '💰' }
                            ].map(doc => (
                                <label key={doc.key} className="document-card" style={{
                                    ...documentCardStyle,
                                    borderColor: documents[doc.key] ? 'rgba(34,197,94,0.6)' : 'rgba(248,113,113,0.5)',
                                    borderStyle: 'solid'
                                }}>
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={(e) => handleFileChange(doc.key, e)}
                                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                    />
                                    <span style={documentIconStyle}>{doc.icon}</span>
                                    <p style={{ fontWeight: 500 }}>
                                        {documents[doc.key]?.name || `Upload ${doc.label}`}
                                        {!documents[doc.key] && <span style={{color:'#f87171', marginLeft:'4px'}}>*</span>}
                                    </p>
                                    {documents[doc.key] ? (
                                        <span className="badge badge-success" style={{ display: 'inline-block', marginTop: '8px', padding: '4px 8px', borderRadius: '4px', background: 'var(--success)', color: '#fff', fontSize: '12px' }}>
                                            ✓ Uploaded
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>Required</span>
                                    )}
                                </label>
                            ))}
                        </div>

                        {/* Live Photo Capture Section */}
                        <div style={{
                            borderRadius: '20px',
                            border: '1px solid rgba(59,130,246,0.4)',
                            padding: '20px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(15,23,42,0.5))',
                            marginBottom: '20px',
                            textAlign: 'center'
                        }}>
                            <h3 style={{ margin: '0 0 12px', color: '#fff', fontSize: '16px' }}>📸 Live Photo Verification <span style={{color:'#f87171'}}>*</span></h3>
                            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>Take a selfie for identity verification — <strong style={{color:'#fca5a5'}}>required</strong></p>

                            <canvas ref={canvasRef} style={{ display: 'none' }} />

                            {!cameraActive && !livePhoto && (
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    className="btn btn-secondary"
                                    style={{ padding: '12px 24px', borderRadius: '12px' }}
                                >
                                    📷 Open Camera
                                </button>
                            )}

                            {cameraActive && (
                                <div>
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        style={{
                                            width: '100%',
                                            maxWidth: '320px',
                                            borderRadius: '12px',
                                            marginBottom: '12px',
                                            border: '2px solid rgba(59,130,246,0.5)'
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={capturePhoto}
                                            className="btn btn-primary"
                                            style={{ padding: '10px 20px' }}
                                        >
                                            📸 Capture
                                        </button>
                                        <button
                                            type="button"
                                            onClick={stopCamera}
                                            className="btn btn-secondary"
                                            style={{ padding: '10px 20px' }}
                                        >
                                            ✕ Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {livePhoto && (
                                <div>
                                    <img
                                        src={URL.createObjectURL(livePhoto)}
                                        alt="Captured"
                                        style={{
                                            width: '100%',
                                            maxWidth: '200px',
                                            borderRadius: '12px',
                                            marginBottom: '12px',
                                            border: '2px solid var(--success)'
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--success)', fontSize: '14px' }}>✓ Photo captured</span>
                                        <button
                                            type="button"
                                            onClick={() => { setLivePhoto(null); startCamera(); }}
                                            className="btn btn-secondary"
                                            style={{ padding: '6px 12px', fontSize: '12px' }}
                                        >
                                            Retake
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={infoStripStyle}>
                            <strong>All fields marked <span style={{color:'#f87171'}}>*</span> are mandatory.</strong> Your name and salary will be cross-verified against your uploaded documents. A salary mismatch of 20% or more will reject the application.
                        </div>
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '12px', padding: '16px' }}
                            onClick={verifyDocuments}
                            disabled={loading}
                        >
                            {loading ? 'Verifying...' : 'Verify Documents & Continue →'}
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="card glass" style={sectionCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                            <h2 className="mb-8 text-center" style={{ margin: 0 }}>✅ Verification Complete</h2>
                            <span style={chatStatStyle}>Score auto-refreshed</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                            <div className="card" style={{ flex: '1 1 280px', textAlign: 'center', padding: '28px', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
                                <h3 className="mb-4">Your Approval Score</h3>
                                {(() => {
                                    const score = displayScore;
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
                                <div style={{ marginTop: '16px', fontWeight: 'bold', color: displayScore >= 700 ? 'var(--success)' : 'var(--warning)' }}>
                                    Grade: {approvalScore?.approvalScore?.grade || 'B'}
                                </div>
                            </div>
                            <div className="card" style={{ flex: '1 1 280px', background: 'linear-gradient(135deg, var(--primary) 0%, #1e293b 100%)', color: '#fff', padding: '28px' }}>
                                <h3 className="mb-4" style={{ color: 'var(--accent)' }}>Pre-Approved Offer</h3>
                                <div className="mb-4">
                                    <p style={{ fontSize: '14px', opacity: 0.8 }}>Maximum Loan Amount</p>
                                    <p style={{ fontSize: '32px', fontWeight: '700', color: 'var(--accent)' }}>
                                        ₹{preApprovedLimit.limit.toLocaleString()}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '24px' }}>
                                    <div>
                                        <p style={{ fontSize: '14px', opacity: 0.8 }}>Interest Rate</p>
                                        <p style={{ fontSize: '20px', fontWeight: '600' }}>
                                            {preApprovedLimit.interestRate}%
                                        </p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '14px', opacity: 0.8 }}>Max EMI</p>
                                        <p style={{ fontSize: '20px', fontWeight: '600' }}>
                                            ₹{preApprovedLimit.maxEMI.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={verificationDetailStyle}>
                            {[
                                { label: 'Grade', value: approvalScore?.approvalScore?.grade || 'B' },
                                { label: 'Score Range', value: scoreRange },
                                { label: 'Confidence', value: confidenceLabel }
                            ].map((item) => (
                                <div key={item.label} style={detailItemStyle}>
                                    <p style={{ fontSize: '12px', letterSpacing: '0.2em', color: '#cbd5f5', margin: 0 }}>{item.label}</p>
                                    <p style={{ fontSize: '20px', margin: '8px 0 0', fontWeight: 600 }}>{item.value}</p>
                                </div>
                            ))}
                        </div>
                        <button className="btn btn-primary" style={{ width: '100%', marginTop: '32px' }} onClick={() => setStep(3)}>
                            Proceed to Loan Chat →
                        </button>
                    </div>
                )}

                {step === 3 && (
                    <div style={chatCardStyle}>
                        <div style={{ padding: '28px 28px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <p style={{ fontSize: '14px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#bae6fd', marginBottom: '4px' }}>personal concierge</p>
                                <h2 style={{ margin: 0, color: '#fff', fontSize: '2rem' }}>💬 Loan Assistant</h2>
                                <p style={{ color: '#93c5fd', marginTop: '4px' }}>
                                    {restoringSession ? 'Restoring your session...' : 'AI advisor live • powered by Ollama'}
                                </p>
                            </div>
                            <span className="pulse-badge"><span>{restoringSession ? 'loading' : 'online'}</span></span>
                        </div>
                        <div style={chatInfoStyle}>
                            <span style={chatStatStyle}>Avg answer 2s</span>
                            <span style={chatStatStyle}>Limit ₹{preApprovedLimit.limit.toLocaleString()}</span>
                            <span style={chatStatStyle}>Interest {preApprovedLimit.interestRate}%</span>
                        </div>
                        <div style={messageListStyle}>
                            {messages.length === 0 && !restoringSession && (
                                <div style={{ alignSelf: 'flex-start', background: 'rgba(248,250,252,0.6)', padding: '16px', borderRadius: '16px 16px 16px 0', maxWidth: '80%', boxShadow: '0 12px 30px rgba(15,23,42,0.15)' }}>
                                    Hello {user.name.split(' ')[0]}! 👋 I've analyzed your documents and tailored a pre-approval for you. Say "I need a loan" to activate your offer!
                                </div>
                            )}
                            {restoringSession && (
                                <div style={{ alignSelf: 'center', padding: '16px', color: '#93c5fd', textAlign: 'center' }}>
                                    <span>🔄 Loading your previous conversation...</span>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} style={bubbleStyle(msg.role)}>
                                    {msg.content}
                                </div>
                            ))}
                            {isBotTyping && (
                                <div style={{ ...bubbleStyle('bot'), display: 'flex', alignItems: 'center', gap: '4px', padding: '14px 22px' }}>
                                    <span className="typing-dot" style={{ animationDelay: '0s' }} />
                                    <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
                                    <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
                                    <span style={{ marginLeft: '8px', fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>AI is thinking...</span>
                                </div>
                            )}
                        </div>
                        <div style={chatFooterStyle}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: '#cbd5f5' }}>Live guidance</span>
                                <span style={{ fontSize: '14px', color: '#e0f2fe', fontWeight: '600' }}>Response within seconds</span>
                            </div>
                            <div style={{ flex: 1, minWidth: '260px', display: 'flex', gap: '10px' }}>
                                <input
                                    className="form-input"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                                    placeholder="Type your message..."
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
                                />
                                <button className="btn btn-primary" onClick={sendChatMessage} disabled={isBotTyping || !chatInput.trim()} style={{ padding: '12px 24px', fontWeight: '600', opacity: isBotTyping ? 0.5 : 1, cursor: isBotTyping ? 'not-allowed' : 'pointer' }}>{isBotTyping ? '⏳' : 'Send ➜'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <style jsx>{`
                .pulse-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.2em;
                    padding: 6px 14px;
                    border-radius: 999px;
                    border: 1px solid rgba(129,140,248,0.6);
                    color: #bae6fd;
                    position: relative;
                    overflow: hidden;
                    background: rgba(129,140,248,0.1);
                }

                .pulse-badge::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(circle, rgba(59,130,246,0.4), transparent 60%);
                    animation: pulse 2.4s infinite;
                    opacity: 0.7;
                }

                .pulse-badge span {
                    position: relative;
                    z-index: 1;
                }

                .document-card:hover {
                    transform: translateY(-6px);
                    border-color: rgba(59,130,246,0.7);
                }

                @keyframes pulse {
                    0% { transform: scale(0.6); opacity: 0.8; }
                    50% { transform: scale(1); opacity: 0.2; }
                    100% { transform: scale(1.4); opacity: 0; }
                }

                .typing-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #22d3ee);
                    display: inline-block;
                    animation: typingBounce 1.4s infinite ease-in-out;
                }

                @keyframes typingBounce {
                    0%, 80%, 100% { transform: scale(0.4); opacity: 0.3; }
                    40% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
