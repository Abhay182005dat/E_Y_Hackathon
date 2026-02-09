'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const gradientBackground = {
    background: 'radial-gradient(circle at top, rgba(59,130,246,0.34), transparent 45%), linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.85) 50%, rgba(2,6,23,0.9) 100%)',
    minHeight: '100vh',
    color: '#e2e8f0'
};

const statCardStyle = {
    borderRadius: '24px',
    padding: '24px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(56,189,248,0.08))',
    boxShadow: '0 20px 40px rgba(15,23,42,0.55)'
};

const emiCardStyle = {
    borderRadius: '28px',
    padding: '24px 32px',
    background: 'linear-gradient(135deg, rgba(16,185,129,0.65), rgba(5,150,105,0.25))',
    border: '1px solid rgba(16,185,129,0.7)',
    boxShadow: '0 30px 60px rgba(5,150,105,0.35)'
};

const tableHighlight = {
    borderRadius: '28px',
    padding: '24px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(2,6,23,0.9))',
    border: '1px solid rgba(59,130,246,0.4)',
    boxShadow: '0 30px 80px rgba(2,6,23,0.6)'
};

export default function DashboardPage() {
    const { user, logout, loading } = useAuth();
    const router = useRouter();
    const [applications, setApplications] = useState([]);
    const [fetchLoading, setFetchLoading] = useState(true);

    // Redirect if not logged in
    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        } else if (user) {
            fetchUserApplications();
        }
    }, [user, loading, router]);

    const fetchUserApplications = async () => {
        try {
            const token = localStorage.getItem('token');
            console.log('📊 [Dashboard] Fetching applications for user:', user?.phone || user?.accountNumber);
            console.log('   Token (first 20 chars):', token?.substring(0, 20));

            const res = await fetch(`${API_URL}/api/user/applications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            console.log('📊 [Dashboard] Received applications:', data.applications?.length || 0);
            if (data.applications?.length > 0) {
                console.log('   First app phone:', data.applications[0].phone);
                console.log('   First app userId:', data.applications[0].userId);
            }

            if (data.ok) {
                setApplications(data.applications);
            }
        } catch (err) {
            console.error('Failed to fetch applications:', err);
        } finally {
            setFetchLoading(false);
        }
    };

    if (loading || !user) {
        return <div className="p-8 text-center">Loading dashboard...</div>;
    }

    const getStatusBadge = (status) => {
        const colors = {
            pending: 'var(--warning)',
            approved: 'var(--success)',
            rejected: 'var(--error)',
            disbursed: 'var(--primary)'
        };
        const color = colors[status] || 'gray';

        return (
            <span style={{
                background: color, color: status === 'pending' ? '#000' : '#fff',
                padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase'
            }}>
                {status}
            </span>
        );
    };

    // Get next EMI info for approved loans
    const getNextEMI = () => {
        const approvedApps = applications.filter(a => a.status === 'approved' && a.nextEmiDate);
        if (approvedApps.length === 0) return null;

        const nextApp = approvedApps[0];
        const nextDate = new Date(nextApp.nextEmiDate);
        const today = new Date();
        const daysLeft = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));

        return {
            date: nextDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
            amount: nextApp.emi,
            daysLeft: daysLeft,
            loanId: nextApp.id
        };
    };

    const nextEMI = getNextEMI();

    return (
        <>
            <header className="header" style={{ background: 'linear-gradient(135deg, rgba(2,6,23,0.8), rgba(15,23,42,0.95))', position: 'sticky', top: 0, zIndex: 20, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <nav className="nav container" style={{ background: 'transparent', padding: '24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Link href="/dashboard" className="logo" style={{ color: 'white' }}>🏦 BFSI User Portal</Link>
                    <ul className="nav-links " style={{ alignItems: 'center' }}>
                        <li style={{ color: 'white' }}>Hello, <strong>{user.name}</strong></li>
                        <li>
                            <button onClick={logout} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
                                Logout
                            </button>
                        </li>
                    </ul>
                </nav>
            </header>

            <main className="container" style={{ padding: '40px 20px', ...gradientBackground }}>
                {/* Welcome Section */}
                <div className="mb-8" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', color: 'white', marginBottom: '8px' }}>
                            Welcome Back, {user.name.split(' ')[0]} 👋
                        </h1>
                        <p style={{ color: 'white' }}>
                            Account: <span style={{ fontFamily: 'monospace', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#000' }}>{user.accountNumber}</span>
                        </p>
                    </div>

                    {/* Primary Action */}
                    <Link href="/apply?fresh=true" className="btn btn-primary" style={{ padding: '16px 32px', fontSize: '18px', display: 'flex', gap: '10px' }}>
                        <span>🚀</span> Apply for New Loan
                    </Link>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid-4 mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                    <div className="card" style={statCardStyle}>
                        <p style={{ color: 'white', fontSize: '14px' }}>Active Applications</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: 'white' }}>
                            {applications.filter(a => a.status === 'pending').length}
                        </p>
                    </div>
                    <div className="card" style={statCardStyle}>
                        <p style={{ color: 'white', fontSize: '14px' }}>Approval Score</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: 'white' }}>
                            {applications.length > 0 ? applications[applications.length - 1].approvalScore || '--' : '--'}
                        </p>
                    </div>
                    <div className="card" style={statCardStyle}>
                        <p style={{ color: 'white', fontSize: '14px' }}>Approved Loans</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: 'white' }}>
                            {applications.filter(a => a.status === 'approved').length}
                        </p>
                    </div>
                    <div className="card" style={statCardStyle}>
                        <p style={{ color: 'white', fontSize: '14px' }}>Total Disbursed</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: 'white' }}>
                            ₹{applications.filter(a => a.status === 'approved').reduce((sum, a) => sum + a.amount, 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                {/* EMI Reminder Card */}
                {nextEMI && (
                    <div className="card mb-8" style={emiCardStyle}>
                        <div>
                            <p style={{ fontSize: '14px', opacity: 0.8, color: 'white' }}>📅 Next EMI Payment</p>
                            <p style={{ fontSize: '28px', fontWeight: '700', color: 'white' }}>
                                ₹{nextEMI.amount.toLocaleString()}
                            </p>
                            <p style={{ fontSize: '14px', marginTop: '8px', color: 'white' }}>
                                Due on <strong>{nextEMI.date}</strong> • Loan: {nextEMI.loanId}
                            </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: '48px', fontWeight: 'bold',
                                color: 'white'
                            }}>
                                {nextEMI.daysLeft}
                            </div>
                            <p style={{ fontSize: '14px', opacity: 0.8, color: 'white' }}>days left</p>
                        </div>
                    </div>
                )}

                {/* Recent Activity / Applications */}
                <h2 className="mb-4" style={{ borderBottom: '2px solid var(--border)', paddingBottom: '10px', color: 'white' }}>
                    My Loan Applications
                </h2>

                <div className="card" style={tableHighlight}>
                    {fetchLoading ? (
                        <div className="text-center p-8" style={{ color: 'white' }}>Loading applications...</div>
                    ) : applications.length === 0 ? (
                        <div className="text-center" style={{ padding: '40px' }}>
                            <p style={{ fontSize: '48px', marginBottom: '16px' }}>📝</p>
                            <h3 style={{ color: 'white' }}>No Active Applications</h3>
                            <p style={{ color: 'white', marginBottom: '24px' }}>
                                You haven't submitted any loan applications yet.
                            </p>
                            <Link href="/apply?fresh=true" className="btn btn-gold">
                                Start Application Now
                            </Link>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px', color: 'white' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.2)', textAlign: 'left' }}>
                                        <th style={{ padding: '16px', color: 'white' }}>Application ID</th>
                                        <th style={{ padding: '16px', color: 'white' }}>Date</th>
                                        <th style={{ padding: '16px', color: 'white' }}>Amount</th>
                                        <th style={{ padding: '16px', color: 'white' }}>EMI</th>
                                        <th style={{ padding: '16px', color: 'white' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {applications.map(app => (
                                        <tr key={app.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '16px', fontFamily: 'monospace', color: 'white' }}>{app.id}</td>
                                            <td style={{ padding: '16px', color: 'white' }}>{new Date(app.submittedAt).toLocaleDateString()}</td>
                                            <td style={{ padding: '16px', fontWeight: 'bold', color: 'white' }}>₹{app.amount.toLocaleString()}</td>
                                            <td style={{ padding: '16px', color: 'white' }}>
                                                {app.emi ? `₹${app.emi.toLocaleString()}/mo` : '-'}
                                            </td>
                                            <td style={{ padding: '16px' }}>{getStatusBadge(app.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}
