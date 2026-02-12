'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Icons
const Shield = ({ size = 24, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
);

const UserIcon = ({ size = 24, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const LockIcon = ({ size = 24, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const ArrowRight = ({ size = 24, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
    </svg>
);

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('user');
    const [step, setStep] = useState(1); // 1: Details, 2: OTP
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [devOtp, setDevOtp] = useState(null);

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
                setDevOtp(data.devOtp);
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
                body: JSON.stringify({ ...userForm, otp })
            });
            const data = await res.json();

            if (data.ok) {
                login(data.user, data.token);
                router.push('/dashboard');
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
                router.push('/admin');
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
        <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-[#040a08] text-white font-sans">
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital@1&display=swap');
                
                .glass-panel {
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }
                
                .input-field {
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    transition: all 0.3s ease;
                }
                
                .input-field:focus {
                    border-color: #10b981;
                    background: rgba(16, 185, 129, 0.05);
                    outline: none;
                }

                .tab-btn {
                    position: relative;
                    transition: all 0.3s ease;
                }
                
                .tab-btn.active {
                    color: #10b981;
                }
                
                .tab-btn.active::after {
                    content: '';
                    position: absolute;
                    bottom: -1px;
                    left: 0;
                    width: 100%;
                    height: 2px;
                    background: #10b981;
                }
            `}</style>

            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-[0.15] grayscale contrast-125"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#040a08] via-[#040a08]/90 to-transparent"></div>
            </div>

            <div className="relative z-10 w-full max-w-md">

                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#10b981]/10 border border-[#10b981]/20 mb-6 text-[#10b981]">
                        <Shield size={32} />
                    </div>
                    <h1 className="text-3xl font-light mb-2 tracking-tight">Access Portal</h1>
                    <p className="text-white/40 text-sm tracking-wide uppercase">Institutional Banking Grade Security</p>
                </div>

                <div className="glass-panel rounded-3xl p-8 relative overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-white/10 mb-8">
                        <button
                            className={`flex-1 pb-4 text-sm font-medium tracking-wide tab-btn ${activeTab === 'user' ? 'active' : 'text-white/40 hover:text-white/70'}`}
                            onClick={() => setActiveTab('user')}
                        >
                            CUSTOMER LOGIN
                        </button>
                        <button
                            className={`flex-1 pb-4 text-sm font-medium tracking-wide tab-btn ${activeTab === 'admin' ? 'active' : 'text-white/40 hover:text-white/70'}`}
                            onClick={() => setActiveTab('admin')}
                        >
                            ADMIN TERMINAL
                        </button>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12" y2="16" /></svg>
                            {error}
                        </div>
                    )}

                    {/* Customer Login */}
                    {activeTab === 'user' && (
                        <div>
                            {step === 1 ? (
                                <form onSubmit={handleSendOTP} className="space-y-5">
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Full Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 rounded-xl input-field text-sm"
                                            placeholder="e.g. Alex Sterling"
                                            value={userForm.name}
                                            onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Account Number</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 rounded-xl input-field text-sm font-mono"
                                            placeholder="XXXX-XXXX-XXXX"
                                            value={userForm.accountNumber}
                                            onChange={e => setUserForm({ ...userForm, accountNumber: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Phone Number</label>
                                        <input
                                            type="tel"
                                            className="w-full px-4 py-3 rounded-xl input-field text-sm font-mono"
                                            placeholder="+91 98765 43210"
                                            value={userForm.phone}
                                            onChange={e => setUserForm({ ...userForm, phone: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-4 mt-2 bg-[#10b981] hover:bg-[#059669] text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                                    >
                                        {loading ? 'Authenticating...' : 'Secure Login'} <ArrowRight size={16} />
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={handleVerifyOTP} className="space-y-6">
                                    <div className="text-center">
                                        <p className="text-white/60 text-sm mb-2">Verification Code Sent</p>
                                        <p className="text-[#10b981] text-xs font-mono">{userForm.phone}</p>
                                    </div>

                                    <div className="py-2">
                                        <input
                                            type="text"
                                            className="w-full px-4 py-5 rounded-xl input-field text-center text-3xl font-mono tracking-[0.5em]"
                                            placeholder="000000"
                                            value={otp}
                                            onChange={e => setOtp(e.target.value)}
                                            maxLength={6}
                                            required
                                            autoFocus
                                        />
                                    </div>

                                    {devOtp && (
                                        <div className="text-center p-2 rounded bg-[#10b981]/10 text-[#10b981] text-xs font-mono">
                                            DEV MODE OTP: {devOtp}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-4 bg-[#10b981] hover:bg-[#059669] text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                                    >
                                        {loading ? 'Verifying...' : 'Verify Access'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="w-full text-center text-xs text-white/30 hover:text-white transition-colors"
                                    >
                                        Wait, I need to change details
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Admin Login */}
                    {activeTab === 'admin' && (
                        <form onSubmit={handleAdminLogin} className="space-y-5">
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Admin Identity</label>
                                <div className="relative">
                                    <UserIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                                    <input
                                        type="email"
                                        className="w-full pl-12 pr-4 py-3 rounded-xl input-field text-sm"
                                        placeholder="admin@bfsi.com"
                                        value={adminForm.email}
                                        onChange={e => setAdminForm({ ...adminForm, email: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Secure Key</label>
                                <div className="relative">
                                    <LockIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                                    <input
                                        type="password"
                                        className="w-full pl-12 pr-4 py-3 rounded-xl input-field text-sm"
                                        placeholder="••••••••"
                                        value={adminForm.password}
                                        onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 mt-2 bg-white hover:bg-gray-100 text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? 'Authorizing...' : 'Initialize Session'} <ArrowRight size={16} />
                            </button>
                        </form>
                    )}
                </div>

                <div className="text-center mt-8">
                    <p className="text-[10px] text-white/20 uppercase tracking-[0.2em]">Authorized Personnel Only • 256-Bit Encrypted</p>
                </div>

            </div>
        </div>
    );
}
