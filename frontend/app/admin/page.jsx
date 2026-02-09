'use client';

import { useState, useEffect, Fragment } from 'react';
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
    const [expandedPhone, setExpandedPhone] = useState(null); // Track expanded phone numbers

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

    // Group applications by phone number
    const groupedByPhone = filteredApps.reduce((acc, app) => {
        const phone = app.phone || 'Unknown';
        if (!acc[phone]) {
            acc[phone] = [];
        }
        acc[phone].push(app);
        return acc;
    }, {});

    // Convert to array and sort by most recent application
    const phoneGroups = Object.entries(groupedByPhone).map(([phone, apps]) => {
        const sorted = [...apps].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        return {
            phone,
            applications: sorted,
            latestApp: sorted[0],
            totalAmount: apps.reduce((sum, app) => sum + app.amount, 0),
            count: apps.length
        };
    }).sort((a, b) => new Date(b.latestApp.submittedAt) - new Date(a.latestApp.submittedAt));

    const toggleExpand = (phone) => {
        setExpandedPhone(expandedPhone === phone ? null : phone);
    };

    const tableCardStyle = {
        overflowX: 'auto',
        borderRadius: '28px',
        padding: '20px 24px',
        background: 'linear-gradient(145deg, rgba(15,23,42,0.9), rgba(30,64,175,0.8))',
        boxShadow: '0 20px 60px rgba(15,23,42,0.35)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)'
    };

    const groupRowStyle = (phone) => ({
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        cursor: 'pointer',
        background: expandedPhone === phone ? 'rgba(255,255,255,0.05)' : 'transparent',
        transition: 'background 0.35s ease, transform 0.35s ease',
        transform: expandedPhone === phone ? 'scale(1.01)' : 'scale(1)'
    });

    const expandedRowStyle = {
        background: 'linear-gradient(135deg, rgba(30,58,138,0.15), rgba(59,130,246,0.1))',
        borderLeft: '4px solid rgba(59,130,246,0.9)',
        transition: 'background 0.3s ease'
    };

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
                <div style={tableCardStyle}>
                    {applications.length === 0 ? (
                        <div className="text-center p-8 text-muted" style={{ color: '#cbd5f5' }}>No applications found.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', textAlign: 'left' }}>
                                    <th style={{ padding: '16px', fontSize: '14px', letterSpacing: '0.08em', color: '#cbd5f5' }}>Customer</th>
                                    <th style={{ padding: '16px', fontSize: '14px', letterSpacing: '0.08em', color: '#cbd5f5' }}>Phone Number</th>
                                    <th style={{ padding: '16px', fontSize: '14px', letterSpacing: '0.08em', color: '#cbd5f5' }}>Total Apps</th>
                                    <th style={{ padding: '16px', fontSize: '14px', letterSpacing: '0.08em', color: '#cbd5f5' }}>Latest Amount</th>
                                    <th style={{ padding: '16px', fontSize: '14px', letterSpacing: '0.08em', color: '#cbd5f5' }}>Latest Status</th>
                                    <th style={{ padding: '16px', fontSize: '14px', letterSpacing: '0.08em', color: '#cbd5f5' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {phoneGroups.map(group => (
                                    <Fragment key={group.phone}>
                                        <tr
                                            style={groupRowStyle(group.phone)}
                                            onClick={() => toggleExpand(group.phone)}
                                        >
                                            <td style={{ padding: '16px' }}>
                                                <strong>{group.latestApp.customerName}</strong>
                                                <div className="text-muted" style={{ fontSize: '12px', color: '#94a3b8' }}>Acc: {group.latestApp.accountNumber}</div>
                                            </td>
                                            <td style={{ padding: '16px', fontWeight: 'bold' }}>
                                                📱 {group.phone}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <span style={{
                                                    padding: '6px 14px',
                                                    borderRadius: '999px',
                                                    background: expandedPhone === group.phone ? 'rgba(16,185,129,0.25)' : 'rgba(59,130,246,0.25)',
                                                    color: '#fff',
                                                    fontSize: '13px',
                                                    fontWeight: '600'
                                                }}>
                                                    {group.count}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px' }}>₹{formatAmount(group.latestApp.amount)}</td>
                                            <td style={{ padding: '16px' }}>
                                                <span style={{
                                                    padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 'bold',
                                                    ...getStatusStyle(group.latestApp.status),
                                                    color: '#fff'
                                                }}>
                                                    {group.latestApp.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center' }}>
                                                <span style={{ fontSize: '18px', color: '#94a3b8', transition: 'transform 0.3s ease' }}>
                                                    {expandedPhone === group.phone ? '▼' : '▶'}
                                                </span>
                                            </td>
                                        </tr>
                                        {expandedPhone === group.phone && group.applications.map((app) => (
                                            <tr
                                                key={app.id}
                                                style={expandedRowStyle}
                                            >
                                                <td style={{ padding: '16px', fontSize: '12px', fontFamily: 'monospace', color: '#e2e8f0' }}>
                                                    <div>{app.id}</div>
                                                    <div style={{ fontSize: '11px', color: '#cbd5e1' }}>{app.customerName}</div>
                                                </td>
                                                <td style={{ padding: '16px', color: '#e2e8f0' }}>
                                                    {new Date(app.submittedAt).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '16px', fontWeight: 'bold', color: app.approvalScore >= 700 ? '#10b981' : '#f59e0b' }}>
                                                    Score: {app.approvalScore}/10 %
                                                </td>
                                                <td style={{ padding: '16px', fontWeight: 'bold', color: '#e2e8f0' }}>
                                                    ₹{formatAmount(app.amount)}
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    <span style={{
                                                        padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 'bold',
                                                        ...getStatusStyle(app.status)
                                                    }}>
                                                        {app.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ fontSize: '12px', padding: '6px 12px' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedApp(app);
                                                        }}
                                                    >
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Modal */}
                {selectedApp && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                        <div style={{
                            width: '90%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            maxWidth: '550px',
                            background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,41,59,0.95))',
                            borderRadius: '24px',
                            padding: '28px',
                            border: '1px solid rgba(59,130,246,0.3)',
                            boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
                                <h2 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>📋 Application Details</h2>
                                <button onClick={() => setSelectedApp(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#fff', borderRadius: '50%', width: '36px', height: '36px' }}>×</button>
                            </div>

                            {/* Basic Info */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                <div><p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Application ID</p><p style={{ color: '#fff', fontWeight: '600' }}>{selectedApp.id}</p></div>
                                <div><p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Date</p><p style={{ color: '#fff' }}>{new Date(selectedApp.submittedAt).toLocaleDateString()}</p></div>
                                <div><p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Phone</p><p style={{ color: '#fff' }}>{selectedApp.phone}</p></div>
                                <div><p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Account</p><p style={{ color: '#fff' }}>{selectedApp.accountNumber}</p></div>
                                <div><p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Loan Amount</p><p style={{ color: '#10b981', fontSize: '20px', fontWeight: 'bold' }}>₹{formatAmount(selectedApp.amount)}</p></div>
                                <div><p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Tenure</p><p style={{ color: '#fff' }}>{selectedApp.tenure} months</p></div>
                                <div><p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Approval Score</p><p style={{ color: selectedApp.approvalScore >= 700 ? '#10b981' : '#f59e0b', fontSize: '18px', fontWeight: 'bold' }}>{selectedApp.approvalScore}/900</p></div>
                            </div>

                            {/* Unified Document Verification Data */}
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(16,185,129,0.05))',
                                borderRadius: '16px',
                                padding: '20px',
                                border: '1px solid rgba(59,130,246,0.2)',
                                marginBottom: '24px'
                            }}>
                                <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>🔍 Verified Customer Data</h3>

                                {(() => {
                                    const docs = selectedApp.documents || {};
                                    // Extract best values from all sources
                                    const name = docs.aadhaar?.name || docs.pan?.name || docs.salarySlip?.employeeName || selectedApp.customerName;
                                    const dob = docs.aadhaar?.dateOfBirth || docs.pan?.dateOfBirth || 'Not found';
                                    const aadhaarNum = docs.aadhaar?.aadhaar || 'Not found';
                                    const panNum = docs.pan?.pan || 'Not found';
                                    const netSalary = docs.salarySlip?.netSalary || null;

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                                                <span style={{ color: '#94a3b8', fontSize: '14px' }}>👤 Name</span>
                                                <span style={{ color: '#fff', fontWeight: '600', fontSize: '15px' }}>{name}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                                                <span style={{ color: '#94a3b8', fontSize: '14px' }}>📅 Date of Birth</span>
                                                <span style={{ color: '#fff', fontWeight: '600', fontSize: '15px' }}>{dob}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                                                <span style={{ color: '#94a3b8', fontSize: '14px' }}>🆔 Aadhaar Number</span>
                                                <span style={{ color: aadhaarNum !== 'Not found' ? '#10b981' : '#f59e0b', fontWeight: '600', fontSize: '15px', fontFamily: 'monospace' }}>{aadhaarNum}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                                                <span style={{ color: '#94a3b8', fontSize: '14px' }}>💳 PAN Number</span>
                                                <span style={{ color: panNum !== 'Not found' ? '#10b981' : '#f59e0b', fontWeight: '600', fontSize: '15px', fontFamily: 'monospace' }}>{panNum}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)' }}>
                                                <span style={{ color: '#94a3b8', fontSize: '14px' }}>💰 Net Salary</span>
                                                <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '18px' }}>{netSalary ? `₹${formatAmount(netSalary)}` : 'Not found'}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Live Photo Display */}
                            {selectedApp.documents?.livePhoto && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(16,185,129,0.05))',
                                    borderRadius: '16px',
                                    padding: '20px',
                                    border: '1px solid rgba(59,130,246,0.2)',
                                    marginBottom: '24px',
                                    textAlign: 'center'
                                }}>
                                    <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>📸 Live Verification Photo</h3>
                                    <img
                                        src={`${API_URL}${selectedApp.documents.livePhoto}`}
                                        alt="Live Verification"
                                        style={{
                                            maxWidth: '200px',
                                            borderRadius: '12px',
                                            border: '3px solid rgba(16,185,129,0.5)'
                                        }}
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.style.display = 'none';
                                            console.error('Failed to load photo:', `${API_URL}${selectedApp.documents.livePhoto}`);
                                        }}
                                    />
                                    <p style={{ color: '#64748b', fontSize: '11px', marginTop: '8px', wordBreak: 'break-all' }}>
                                        {selectedApp.documents.livePhoto}
                                    </p>
                                </div>
                            )}

                            {selectedApp.status === 'pending' && (
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <button style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '14px', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }} onClick={() => handleApprove(selectedApp.id)}>
                                        ✓ Approve
                                    </button>
                                    <button style={{ flex: 1, background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', border: 'none', padding: '14px', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }} onClick={() => handleReject(selectedApp.id)}>
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
