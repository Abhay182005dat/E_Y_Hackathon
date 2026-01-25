'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Format number consistently
const formatAmount = (amount) => {
    return new Intl.NumberFormat('en-IN').format(amount);
};

export default function AdminPage() {
    const { user, logout, loading: authLoading } = useAuth();
    const router = useRouter();

    const [applications, setApplications] = useState([]);
    const [selectedApp, setSelectedApp] = useState(null);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);

    // Protect Route
    useEffect(() => {
        if (!authLoading) {
            if (!user || user.role !== 'admin') {
                router.push('/login');
            }
        }
    }, [user, authLoading, router]);

    // Fetch applications
    useEffect(() => {
        if (user && user.role === 'admin') {
            fetchApplications();
        }
    }, [user]);

    const fetchApplications = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/applications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok) {
                setApplications(data.applications);
            }
        } catch (err) {
            console.error('Failed to fetch applications:', err);
        }
        setLoading(false);
    };

    const stats = {
        total: applications.length,
        pending: applications.filter(a => a.status === 'pending').length,
        approved: applications.filter(a => a.status === 'approved').length,
        rejected: applications.filter(a => a.status === 'rejected').length,
        totalAmount: applications.filter(a => a.status === 'approved').reduce((sum, a) => sum + a.amount, 0)
    };

    const filteredApps = filter === 'all' ? applications : applications.filter(a => a.status === filter);

    const handleApprove = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/applications/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: 'approved' })
            });
            const data = await res.json();
            if (data.ok) {
                setApplications(apps => apps.map(a =>
                    a.id === id ? { ...a, status: 'approved' } : a
                ));
            }
        } catch (err) {
            console.error('Failed to approve:', err);
        }
        setSelectedApp(null);
    };

    const handleReject = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/applications/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: 'rejected' })
            });
            const data = await res.json();
            if (data.ok) {
                setApplications(apps => apps.map(a =>
                    a.id === id ? { ...a, status: 'rejected' } : a
                ));
            }
        } catch (err) {
            console.error('Failed to reject:', err);
        }
        setSelectedApp(null);
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'pending': return { background: 'var(--warning)', color: '#000' };
            case 'approved': return { background: 'var(--success)', color: '#fff' };
            case 'rejected': return { background: 'var(--error)', color: '#fff' };
            default: return { background: 'var(--text-muted)', color: '#fff' };
        }
    };

    if (authLoading || !user || user.role !== 'admin') {
        return <div className="p-8 text-center">Loading admin portal...</div>;
    }

    return (
        <>
            <header className="header" style={{ background: '#0f172a', color: '#fff' }}>
                <nav className="nav container" style={{ background: '#0f172a', borderBottom: '1px solid #333' }}>
                    <Link href="/admin" className="logo" style={{ color: '#fff' }}>🛡️ BFSI Admin</Link>
                    <ul className="nav-links" style={{ alignItems: 'center' }}>
                        <li><span className="badge badge-warning">Admin Access</span></li>
                        <li>
                            <button onClick={logout} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px', color: '#fff', borderColor: '#555' }}>
                                Logout
                            </button>
                        </li>
                    </ul>
                </nav>
            </header>

            <div className="container" style={{ padding: '40px 20px' }}>
                <h1 className="mb-8">📊 Admin Dashboard</h1>

                {/* Stats Cards */}
                <div className="grid-4 mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                    <div className="card">
                        <p className="text-muted">Total Applications</p>
                        <p style={{ fontSize: '36px', fontWeight: '700' }}>{stats.total}</p>
                    </div>
                    <div className="card">
                        <p className="text-muted">Pending Review</p>
                        <p style={{ fontSize: '36px', fontWeight: '700', color: 'var(--warning)' }}>{stats.pending}</p>
                    </div>
                    <div className="card">
                        <p className="text-muted">Approved</p>
                        <p style={{ fontSize: '36px', fontWeight: '700', color: 'var(--success)' }}>{stats.approved}</p>
                    </div>
                    <div className="card">
                        <p className="text-muted">Total Disbursed</p>
                        <p style={{ fontSize: '36px', fontWeight: '700', color: 'var(--secondary)' }}>₹{(stats.totalAmount / 100000).toFixed(1)}L</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="mb-8" style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary" onClick={fetchApplications}>🔄 Refresh</button>
                    {['all', 'pending', 'approved', 'rejected'].map(f => (
                        <button
                            key={f}
                            className={`btn`}
                            style={{
                                background: filter === f ? 'var(--primary)' : 'transparent',
                                color: filter === f ? '#fff' : 'var(--text)',
                                border: '1px solid var(--border)'
                            }}
                            onClick={() => setFilter(f)}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <div className="card" style={{ overflowX: 'auto' }}>
                    {applications.length === 0 ? (
                        <div className="text-center p-8 text-muted">No applications found.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                    <th style={{ padding: '16px' }}>Application ID</th>
                                    <th style={{ padding: '16px' }}>Customer</th>
                                    <th style={{ padding: '16px' }}>Amount</th>
                                    <th style={{ padding: '16px' }}>Approval %</th>
                                    <th style={{ padding: '16px' }}>Status</th>
                                    <th style={{ padding: '16px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredApps.map(app => (
                                    <tr key={app.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '16px', fontFamily: 'monospace' }}>{app.id}</td>
                                        <td style={{ padding: '16px' }}>
                                            <strong>{app.customerName}</strong>
                                            <div className="text-muted" style={{ fontSize: '12px' }}>{app.phone}</div>
                                        </td>
                                        <td style={{ padding: '16px' }}>₹{formatAmount(app.amount)}</td>
                                        <td style={{ padding: '16px' }}>
                                            <span style={{ fontWeight: 'bold', color: app.approvalScore >= 700 ? 'var(--success)' : 'var(--warning)' }}>
                                                {app.approvalScore}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <span style={{
                                                padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                                                ...getStatusStyle(app.status)
                                            }}>
                                                {app.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => setSelectedApp(app)}>
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Modal */}
                {selectedApp && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                        <div className="card glass animate-in" style={{ width: '90%', maxHeight: '90vh', overflowY: 'auto', maxWidth: '600px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                                <h2>Application Details</h2>
                                <button onClick={() => setSelectedApp(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
                            </div>

                            <div className="grid-2 mb-8" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div><p className="text-muted">ID</p><p>{selectedApp.id}</p></div>
                                <div><p className="text-muted">Date</p><p>{new Date(selectedApp.submittedAt).toLocaleDateString()}</p></div>
                                <div><p className="text-muted">Name</p><p>{selectedApp.customerName}</p></div>
                                <div><p className="text-muted">Phone</p><p>{selectedApp.phone}</p></div>
                                <div>
                                    <p className="text-muted">Amount</p>
                                    <p style={{ fontSize: '20px', fontWeight: 'bold' }}>₹{formatAmount(selectedApp.amount)}</p>
                                </div>
                                <div><p className="text-muted">Tenure</p><p>{selectedApp.tenure} months</p></div>
                            </div>

                            {selectedApp.status === 'pending' && (
                                <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                                    <button className="btn" style={{ flex: 1, background: 'var(--success)', color: '#fff', border: 'none' }} onClick={() => handleApprove(selectedApp.id)}>
                                        ✓ Approve
                                    </button>
                                    <button className="btn" style={{ flex: 1, background: 'var(--error)', color: '#fff', border: 'none' }} onClick={() => handleReject(selectedApp.id)}>
                                        ✗ Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
