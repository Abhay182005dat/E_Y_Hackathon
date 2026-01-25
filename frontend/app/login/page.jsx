'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const { login } = useAuth();
    const [activeTab, setActiveTab] = useState('user');
    const [step, setStep] = useState(1); // 1: Details, 2: OTP
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [devOtp, setDevOtp] = useState(null); // To show OTP in UI for demo

    // Form States
    const [userForm, setUserForm] = useState({
        name: '',
        accountNumber: '',
        phone: ''
    });
    const [otp, setOtp] = useState('');

    const [adminForm, setAdminForm] = useState({
        email: '',
        password: ''
    });

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    // Step 1: Send OTP
    const handleSendOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/api/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userForm)
            });
            const data = await res.json();

            if (data.ok) {
                setStep(2);
                setDevOtp(data.devOtp); // For Hackathon Demo
            } else {
                setError(data.error || 'Failed to send OTP');
            }
        } catch (err) {
            setError('Connection failed');
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Verify OTP
    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...userForm,
                    otp
                })
            });
            const data = await res.json();

            if (data.ok) {
                login(data.user, data.token);
            } else {
                setError(data.error || 'Invalid OTP');
            }
        } catch (err) {
            setError('Connection failed');
        } finally {
            setLoading(false);
        }
    };

    // Admin Login
    const handleAdminLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/api/auth/admin-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adminForm)
            });
            const data = await res.json();

            if (data.ok) {
                login(data.user, data.token);
            } else {
                setError(data.error || 'Invalid credentials');
            }
        } catch (err) {
            setError('Connection failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h1 className="text-center mb-8" style={{ color: 'var(--primary)' }}>
                    🏦 BFSI Secure Login
                </h1>

                {/* Tabs */}
                <div className="tabs">
                    <div
                        className={`tab ${activeTab === 'user' ? 'active' : ''}`}
                        onClick={() => setActiveTab('user')}
                    >
                        Customer Login
                    </div>
                    <div
                        className={`tab ${activeTab === 'admin' ? 'active' : ''}`}
                        onClick={() => setActiveTab('admin')}
                    >
                        Admin Portal
                    </div>
                </div>

                {error && (
                    <div style={{
                        background: '#fee2e2', color: '#ef4444',
                        padding: '12px', borderRadius: '8px',
                        marginBottom: '20px', fontSize: '14px'
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* User Login Form */}
                {activeTab === 'user' && (
                    <>
                        {step === 1 ? (
                            <form onSubmit={handleSendOTP}>
                                <div className="input-group">
                                    <label>Full Name</label>
                                    <input
                                        type="text" className="form-input"
                                        placeholder="e.g. Hemanth CS"
                                        value={userForm.name}
                                        onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Account Number</label>
                                    <input
                                        type="text" className="form-input"
                                        placeholder="Enter your 12-digit account number"
                                        value={userForm.accountNumber}
                                        onChange={e => setUserForm({ ...userForm, accountNumber: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Phone Number</label>
                                    <input
                                        type="tel" className="form-input"
                                        placeholder="+91 98765 43210"
                                        value={userForm.phone}
                                        onChange={e => setUserForm({ ...userForm, phone: e.target.value })}
                                        required
                                    />
                                </div>
                                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                                    {loading ? 'Sending...' : 'Send Secure OTP'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleVerifyOTP}>
                                <div className="text-center mb-4">
                                    <p className="text-muted">OTP sent to {userForm.phone}</p>
                                    {devOtp && (
                                        <p style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                                            Demo OTP: {devOtp}
                                        </p>
                                    )}
                                </div>
                                <div className="input-group">
                                    <label>Enter OTP</label>
                                    <input
                                        type="text" className="form-input"
                                        placeholder="6-digit OTP"
                                        value={otp}
                                        onChange={e => setOtp(e.target.value)}
                                        maxLength={6}
                                        required
                                        style={{ letterSpacing: '8px', textAlign: 'center', fontSize: '24px' }}
                                    />
                                </div>
                                <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={loading}>
                                    {loading ? 'Verifying...' : 'Verify & Login'}
                                </button>
                                <p
                                    onClick={() => setStep(1)}
                                    style={{ textAlign: 'center', marginTop: '16px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}
                                >
                                    ← Back to details
                                </p>
                            </form>
                        )}
                    </>
                )}

                {/* Admin Login Form */}
                {activeTab === 'admin' && (
                    <form onSubmit={handleAdminLogin}>
                        <div className="input-group">
                            <label>Admin Email</label>
                            <input
                                type="email" className="form-input"
                                placeholder="admin@bfsi.com"
                                value={adminForm.email}
                                onChange={e => setAdminForm({ ...adminForm, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label>Password</label>
                            <input
                                type="password" className="form-input"
                                placeholder="••••••••"
                                value={adminForm.password}
                                onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                                required
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                            {loading ? 'Authenticating...' : 'Access Admin Portal'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
