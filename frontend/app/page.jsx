'use client';

import Link from 'next/link';

export default function Home() {
    return (
        <>
            <div className="hero-section" style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, #000 100%)',
                color: '#fff',
                minHeight: '100vh',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Background Decorative Elements */}
                <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(212,175,55,0.1) 0%, transparent 70%)', borderRadius: '50%' }}></div>

                <nav className="nav container" style={{ background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'relative', zIndex: 10 }}>
                    <Link href="/" className="logo" style={{ color: '#fff' }}>🏦 BFSI Premium</Link>
                    <ul className="nav-links" style={{ alignItems: 'center' }}>
                        <li><Link href="/login" style={{ color: 'var(--text-light)', textDecoration: 'none' }}>Log In</Link></li>
                        <li>
                            <Link href="/login" className="btn btn-gold">
                                Get Started
                            </Link>
                        </li>
                    </ul>
                </nav>

                <div className="container" style={{ display: 'flex', alignItems: 'center', minHeight: '80vh', position: 'relative', zIndex: 10 }}>
                    <div style={{ maxWidth: '600px' }}>
                        <span className="badge" style={{ background: 'rgba(212,175,55,0.2)', color: 'var(--accent)', marginBottom: '24px', display: 'inline-block', padding: '8px 16px', borderRadius: '30px', border: '1px solid var(--accent)' }}>
                            AI-Powered Instant Loans
                        </span>
                        <h1 style={{ fontSize: '4rem', lineHeight: '1.1', marginBottom: '24px' }}>
                            Banking for the <br />
                            <span style={{ color: 'var(--accent)' }}>Modern Era</span>
                        </h1>
                        <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.8)', marginBottom: '40px' }}>
                            Experience lightning-fast loan approvals with our secure, AI-driven platform. No paperwork, just results.
                        </p>
                        <div style={{ display: 'flex', gap: '20px' }}>
                            <Link href="/login" className="btn btn-gold" style={{ padding: '16px 32px', fontSize: '18px' }}>
                                Apply Now →
                            </Link>
                            <Link href="/login" className="btn btn-secondary" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', padding: '16px 32px', fontSize: '18px' }}>
                                Track Status
                            </Link>
                        </div>

                        <div style={{ marginTop: '60px', display: 'flex', gap: '40px' }}>
                            <div>
                                <p style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--accent)' }}>₹5Cr+</p>
                                <p style={{ fontSize: '14px', opacity: 0.7 }}>Disbursed</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--accent)' }}>10k+</p>
                                <p style={{ fontSize: '14px', opacity: 0.7 }}>Happy Customers</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--accent)' }}>2min</p>
                                <p style={{ fontSize: '14px', opacity: 0.7 }}>Approval Time</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Features */}
            <div className="container" style={{ padding: '100px 20px' }}>
                <h2 className="text-center mb-8" style={{ fontSize: '2.5rem' }}>Why Choose <span className="text-gold">BFSI</span>?</h2>
                <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px' }}>
                    <div className="card text-center" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚡</div>
                        <h3>Instant Approval</h3>
                        <p className="text-muted">Our AI analyzes your profile in seconds to give you the best offer instantly.</p>
                    </div>
                    <div className="card text-center" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🛡️</div>
                        <h3>Bank-Grade Security</h3>
                        <p className="text-muted">Your data is encrypted with AES-256 and protected by multi-factor authentication.</p>
                    </div>
                    <div className="card text-center" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📄</div>
                        <h3>Zero Paperwork</h3>
                        <p className="text-muted">Upload digital documents and get verified instantly via our OCR technology.</p>
                    </div>
                </div>
            </div>
        </>
    );
}
