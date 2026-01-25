'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
            const res = await fetch(`${API_URL}/api/user/applications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
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
            <header className="header">
                <nav className="nav container">
                    <Link href="/dashboard" className="logo">🏦 BFSI User Portal</Link>
                    <ul className="nav-links" style={{ alignItems: 'center' }}>
                        <li>Hello, <strong>{user.name}</strong></li>
                        <li>
                            <button onClick={logout} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
                                Logout
                            </button>
                        </li>
                    </ul>
                </nav>
            </header>

            <main className="container" style={{ padding: '40px 20px' }}>
                {/* Welcome Section */}
                <div className="mb-8" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', color: 'var(--primary)', marginBottom: '8px' }}>
                            Welcome Back, {user.name.split(' ')[0]} 👋
                        </h1>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Account: <span style={{ fontFamily: 'monospace', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{user.accountNumber}</span>
                        </p>
                    </div>

                    {/* Primary Action */}
                    <Link href="/apply" className="btn btn-primary" style={{ padding: '16px 32px', fontSize: '18px', display: 'flex', gap: '10px' }}>
                        <span>🚀</span> Apply for New Loan
                    </Link>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid-4 mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                    <div className="card">
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Active Applications</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--warning)' }}>
                            {applications.filter(a => a.status === 'pending').length}
                        </p>
                    </div>
                    <div className="card">
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Approval Score</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--success)' }}>
                            {applications.length > 0 ? applications[applications.length - 1].approvalScore || '--' : '--'}
                        </p>
                    </div>
                    <div className="card">
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Approved Loans</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--secondary)' }}>
                            {applications.filter(a => a.status === 'approved').length}
                        </p>
                    </div>
                    <div className="card">
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Total Disbursed</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--primary)' }}>
                            ₹{applications.filter(a => a.status === 'approved').reduce((sum, a) => sum + a.amount, 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                {/* EMI Reminder Card */}
                {nextEMI && (
                    <div className="card mb-8" style={{
                        background: 'linear-gradient(135deg, var(--primary) 0%, #1e293b 100%)',
                        color: '#fff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '20px'
                    }}>
                        <div>
                            <p style={{ fontSize: '14px', opacity: 0.8 }}>📅 Next EMI Payment</p>
                            <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--accent)' }}>
                                ₹{nextEMI.amount.toLocaleString()}
                            </p>
                            <p style={{ fontSize: '14px', marginTop: '8px' }}>
                                Due on <strong>{nextEMI.date}</strong> • Loan: {nextEMI.loanId}
                            </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: '48px', fontWeight: 'bold',
                                color: nextEMI.daysLeft <= 7 ? 'var(--error)' : nextEMI.daysLeft <= 15 ? 'var(--warning)' : 'var(--success)'
                            }}>
                                {nextEMI.daysLeft}
                            </div>
                            <p style={{ fontSize: '14px', opacity: 0.8 }}>days left</p>
                        </div>
                    </div>
                )}

                {/* Recent Activity / Applications */}
                <h2 className="mb-4" style={{ borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                    My Loan Applications
                </h2>

                <div className="card">
                    {fetchLoading ? (
                        <div className="text-center p-8">Loading applications...</div>
                    ) : applications.length === 0 ? (
                        <div className="text-center" style={{ padding: '40px' }}>
                            <p style={{ fontSize: '48px', marginBottom: '16px' }}>📝</p>
                            <h3>No Active Applications</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                                You haven't submitted any loan applications yet.
                            </p>
                            <Link href="/apply" className="btn btn-gold">
                                Start Application Now
                            </Link>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                        <th style={{ padding: '16px' }}>Application ID</th>
                                        <th style={{ padding: '16px' }}>Date</th>
                                        <th style={{ padding: '16px' }}>Amount</th>
                                        <th style={{ padding: '16px' }}>EMI</th>
                                        <th style={{ padding: '16px' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {applications.map(app => (
                                        <tr key={app.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '16px', fontFamily: 'monospace' }}>{app.id}</td>
                                            <td style={{ padding: '16px' }}>{new Date(app.submittedAt).toLocaleDateString()}</td>
                                            <td style={{ padding: '16px', fontWeight: 'bold' }}>₹{app.amount.toLocaleString()}</td>
                                            <td style={{ padding: '16px' }}>
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
