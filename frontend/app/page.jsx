'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './context/AuthContext';

// --- Assets / Icons (SVG Replacements for Lucide) ---

const Shield = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const Globe = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10 z" />
  </svg>
);

const Lock = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const BarChart3 = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

const FileText = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const Sun = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" /><path d="M12 20v2" /><path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M6.34 17.66l-1.41 1.41" /><path d="M19.07 4.93l-1.41 1.41" />
  </svg>
);

const Moon = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const Landmark = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <line x1="3" y1="22" x2="21" y2="22" />
    <line x1="6" y1="18" x2="6" y2="11" />
    <line x1="10" y1="18" x2="10" y2="11" />
    <line x1="14" y1="18" x2="14" y2="11" />
    <line x1="18" y1="18" x2="18" y2="11" />
    <polygon points="12 2 20 7 4 7" />
  </svg>
);

const TrendingUp = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const Clock = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const ArrowUpRight = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <line x1="7" y1="17" x2="17" y2="7" />
    <polyline points="7 7 17 7 17 17" />
  </svg>
);

const ChevronRight = ({ size = 24, className = "", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);


// --- Hooks ---

function useScrollPosition() {
  const [scrollPos, setScrollPos] = useState(0);
  useEffect(() => {
    const handleScroll = () => setScrollPos(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return scrollPos;
}

function useReveal(delay = 0) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.1 });
    
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible, style: { 
    opacity: isVisible ? 1 : 0, 
    transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
    transition: `opacity 1s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 1s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`
  }};
}

// --- Components ---

const Reveal = ({ children, delay = 0, className = "" }) => {
  const { ref, style } = useReveal(delay);
  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  );
};

export default function App() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(true);
  const [activeView, setActiveView] = useState('overview');
  const scrollY = useScrollPosition();

  // Slow, dignified transition effect for theme switching
  useEffect(() => {
    document.documentElement.style.transition = 'background-color 0.8s ease, color 0.8s ease, border-color 0.8s ease';
  }, []);

  // Theme Variables via Style Object to simulate CSS Variables/Classes
  const theme = {
    bg: darkMode ? '#050B18' : '#FDFCFB',
    surface: darkMode ? 'rgba(10, 17, 40, 0.6)' : 'rgba(255, 255, 255, 0.9)',
    surfaceSolid: darkMode ? '#0A1128' : '#FFFFFF',
    border: darkMode ? '#1E293B' : '#E2E8F0',
    textPrimary: darkMode ? '#E2E8F0' : '#0F172A',
    textSecondary: darkMode ? '#94A3B8' : '#64748B',
    accent: '#C5A059', // Muted Gold
    chartPos: '#10b981',
    chartNeg: '#f43f5e'
  };

  const handleLoginClick = () => {
    if (user) {
        router.push(user.role === 'admin' ? '/admin' : '/dashboard');
    } else {
        router.push('/login');
    }
  };

  return (
    <div className="app-container" style={{ 
      backgroundColor: theme.bg, 
      color: theme.textPrimary,
      minHeight: '100vh',
    }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        :root {
          --ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
        }

        body {
          margin: 0;
          font-family: 'Inter', sans-serif;
          overflow-x: hidden;
          transition: background-color 0.8s var(--ease-out-expo);
        }
        
        button {
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
          color: inherit;
          padding: 0;
        }

        .font-mono { font-family: 'JetBrains Mono', monospace; }

        .tracking-widest { letter-spacing: 0.15em; }
        .tracking-ultra { letter-spacing: 0.25em; }

        .border-b { border-bottom: 1px solid ${theme.border}; transition: border-color 0.8s ease; }
        .border-all { border: 1px solid ${theme.border}; transition: border-color 0.8s ease; }
        .border-top { border-top: 1px solid ${theme.border}; transition: border-color 0.8s ease; }

        .hover-accent:hover { color: ${theme.accent}; transition: color 0.3s ease; }
        
        .nav-link {
          position: relative;
          opacity: 0.6;
          transition: all 0.3s ease;
        }
        .nav-link:hover, .nav-link.active {
          opacity: 1;
          color: ${theme.accent};
        }
        .nav-link::after {
          content: '';
          position: absolute;
          bottom: -4px;
          left: 0;
          width: 0%;
          height: 1px;
          background-color: ${theme.accent};
          transition: width 0.3s ease;
        }
        .nav-link.active::after {
          width: 100%;
        }

        /* Glassmorphism */
        .glass-panel {
          background: ${theme.surface};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        /* Custom Scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: ${theme.bg};
        }
        ::-webkit-scrollbar-thumb {
          background: ${theme.border};
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${theme.accent};
        }
      `}</style>

      {/* Top Regulatory Header */}
      <div className="border-b" style={{ padding: '8px 24px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: darkMode ? 'linear-gradient(90deg, rgba(15,23,42,0.95), rgba(59,130,246,0.65))' : '#F8FAFC' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: theme.textSecondary }}>Institutional Access</span>
          <span style={{ height: '12px', width: '1px', background: theme.border }}></span>
          <span style={{ color: theme.textSecondary }}>Market Status: <span style={{ color: theme.chartPos }}>Open (HKG)</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: theme.textSecondary }}>Tier 1 Capital Ratio: 18.4%</span>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="hover-accent"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {darkMode ? <Sun size={12} /> : <Moon size={12} />}
            <span>{darkMode ? 'Document Mode' : 'Terminal Mode'}</span>
          </button>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="glass-panel border-b" style={{ position: 'sticky', top: 0, zIndex: 50, width: '100%', transition: 'background-color 0.5s ease' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', height: '80px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="border-all" style={{ padding: '10px', borderRadius: '18px', background: 'rgba(255,255,255,0.05)', boxShadow: '0 10px 25px rgba(15,23,42,0.35)' }}>
              <Landmark size={24} style={{ color: theme.accent }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontSize: '21px', fontWeight: 700, letterSpacing: '-0.02em', textTransform: 'uppercase', fontStyle: 'italic' }}>Lumina</span>
              <span style={{ fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.7 }}>Institutional</span>
            </div>
          </div>

          {/* Links */}
          <div style={{ display: 'flex', gap: '40px' }} className="hidden-mobile">
            {['Overview', 'Treasury', 'Custody', 'Compliance'].map(id => (
              <button
                key={id}
                onClick={() => setActiveView(id.toLowerCase())}
                className={`nav-link ${activeView === id.toLowerCase() ? 'active' : ''}`}
                style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                {id}
              </button>
            ))}
          </div>

          {/* Right Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div className="font-mono" style={{ fontSize: '12px', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} />
              <span>14:32:05 GMT</span>
            </div>
            <button 
              className="border-all hover-accent"
              style={{ padding: '10px 26px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', transition: 'all 0.3s ease', borderRadius: '999px', background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(14,165,233,0.15))' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.accent; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = theme.textPrimary; }}
              onClick={handleLoginClick}
            >
              {loading ? '...' : (user ? (user.role === 'admin' ? 'Admin Terminal' : 'Dashboard Access') : 'Client Login')}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header style={{ padding: '120px 24px 100px', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
        <Reveal>
          <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', border: `1px solid ${theme.accent}40`, backgroundColor: `${theme.accent}10`, borderRadius: '100px', marginBottom: '32px' }}>
              <Shield size={14} style={{ color: theme.accent }} />
              <span style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: theme.accent }}>Audited & Regulated Global Custodian</span>
            </div>
            
            <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '32px' }}>
              Preserving Generational Capital <br />
              Through <span style={{ fontStyle: 'italic', fontWeight: 400, color: theme.accent }}>Institutional Discipline.</span>
            </h1>
            
            <p style={{ maxWidth: '640px', margin: '0 auto', fontSize: '1.125rem', color: theme.textSecondary, lineHeight: 1.6 }}>
              Lumina provides the infrastructure for sovereign wealth, institutional endowments, and family offices to navigate global markets with absolute composure.
            </p>
          </div>
        </Reveal>
      </header>

      {/* Core Content Grid */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '80px 24px', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '32px' }}>
        
        {/* Sidebar - Market Pulse */}
        <aside style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '32px' }} className="grid-col-mobile">
          <Reveal delay={100}>
            <div className="glass-panel border-all" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 size={16} style={{ color: theme.accent }} /> Global Indices
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {[
                  { name: 'S&P 500', val: '5,241.53', change: '+0.42%' },
                  { name: 'FTSE 100', val: '7,935.09', change: '-0.12%' },
                  { name: 'Nikkei 225', val: '38,992.08', change: '+1.04%' },
                  { name: 'Gold (Oz)', val: '$2,384.20', change: '+0.05%' }
                ].map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '8px', borderBottom: `1px solid ${theme.border}` }}>
                    <div>
                      <p style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, opacity: 0.6, marginBottom: '4px' }}>{m.name}</p>
                      <p className="font-mono" style={{ fontSize: '14px' }}>{m.val}</p>
                    </div>
                    <p className="font-mono" style={{ fontSize: '12px', color: m.change.startsWith('+') ? theme.chartPos : theme.chartNeg }}>{m.change}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="border-all" style={{ padding: '24px', background: 'linear-gradient(135deg, #0A1128 0%, #050B18 100%)', color: '#fff' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>Security Advisory</h3>
              <p style={{ fontSize: '12px', opacity: 0.7, lineHeight: 1.6, marginBottom: '24px' }}>
                Hardware MFA is now mandatory for all cross-border transactions exceeding $50M USD equivalent.
              </p>
              <button 
                style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', color: theme.accent }}
                className="hover-opacity"
              >
                Security Protocol <ChevronRight size={14} />
              </button>
            </div>
          </Reveal>
        </aside>

        {/* Main Content Area */}
        <section style={{ gridColumn: 'span 9', display: 'flex', flexDirection: 'column', gap: '32px' }} className="grid-col-mobile">
          
          {/* Main Balance */}
          <Reveal delay={150}>
            <div className="glass-panel border-all" style={{ padding: '40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, padding: '40px', opacity: 0.03, pointerEvents: 'none' }}>
                <Landmark size={200} />
              </div>
              
              <div style={{ position: 'relative', zIndex: 10 }}>
                <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.6, marginBottom: '12px' }}>Total Managed Liquidity</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '32px' }}>
                  <h2 className="font-mono" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 500, letterSpacing: '-0.02em' }}>$4,821,490,203.42</h2>
                  <span className="font-mono" style={{ fontSize: '14px', color: theme.chartPos, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ArrowUpRight size={16} /> +12.4% <span style={{ fontSize: '10px', opacity: 0.6 }}>YTD</span>
                  </span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px' }}>
                  {[
                    { label: 'Treasury Bills', val: '$1.24B', pct: '25%' },
                    { label: 'Equities', val: '$2.01B', pct: '45%' },
                    { label: 'Fixed Income', val: '$1.57B', pct: '30%' }
                  ].map((item, i) => (
                    <div key={i}>
                      <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, opacity: 0.5, marginBottom: '6px' }}>{item.label}</p>
                      <p className="font-mono" style={{ fontSize: '20px' }}>{item.val}</p>
                      <div style={{ width: '100%', height: '4px', background: `${theme.textPrimary}15`, marginTop: '8px' }}>
                        <div style={{ height: '100%', width: item.pct, background: theme.accent, transition: 'width 1s ease-out' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Transactions Table */}
          <Reveal delay={300}>
            <div className="glass-panel border-all">
              <div className="border-b" style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Recent Institutional Activity</h3>
                <button style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-opacity">
                  Export Ledger <FileText size={14} />
                </button>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', background: darkMode ? '#030712' : '#F8FAFC', borderBottom: `1px solid ${theme.border}` }}>
                      <th style={{ padding: '16px 32px', fontWeight: 700 }}>Execution Date</th>
                      <th style={{ padding: '16px 32px', fontWeight: 700 }}>Entity / Asset</th>
                      <th style={{ padding: '16px 32px', fontWeight: 700 }}>Ref No.</th>
                      <th style={{ padding: '16px 32px', fontWeight: 700 }}>Type</th>
                      <th style={{ padding: '16px 32px', fontWeight: 700, textAlign: 'right' }}>Amount (USD)</th>
                      <th style={{ padding: '16px 32px', fontWeight: 700 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono" style={{ fontSize: '12px' }}>
                    {[
                      { date: '2024-03-12', entity: 'US TREASURY 10Y BOND', ref: 'TX-99021', type: 'Purchase', amount: '250,000,000.00', status: 'Settled' },
                      { date: '2024-03-11', entity: 'JPMORGAN CHASE & CO', ref: 'TX-98442', type: 'Dividend', amount: '12,482,000.00', status: 'Cleared' },
                      { date: '2024-03-10', entity: 'LUMINA CUSTODY FEE', ref: 'INV-4412', type: 'Service', amount: '-450,000.00', status: 'Processed' },
                      { date: '2024-03-08', entity: 'APPLE INC. (AAPL)', ref: 'TX-98210', type: 'Sale', amount: '84,120,550.00', status: 'Settled' },
                      { date: '2024-03-05', entity: 'GOLDMAN SACHS INT.', ref: 'TX-97881', type: 'Transfer', amount: '1,200,000.00', status: 'Flagged' },
                    ].map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}`, transition: 'background-color 0.2s' }} 
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.textPrimary}05`}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={{ padding: '16px 32px', opacity: 0.6 }}>{row.date}</td>
                        <td style={{ padding: '16px 32px', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{row.entity}</td>
                        <td style={{ padding: '16px 32px', opacity: 0.6 }}>{row.ref}</td>
                        <td style={{ padding: '16px 32px', fontFamily: 'Inter, sans-serif' }}>{row.type}</td>
                        <td style={{ padding: '16px 32px', textAlign: 'right', fontWeight: 700, color: row.amount.startsWith('-') ? theme.chartNeg : 'inherit' }}>
                          {row.amount}
                        </td>
                        <td style={{ padding: '16px 32px' }}>
                          <span style={{ 
                            padding: '4px 8px', borderRadius: '2px', fontSize: '9px', textTransform: 'uppercase', fontWeight: 700,
                            backgroundColor: row.status === 'Settled' ? `${theme.chartPos}20` : row.status === 'Flagged' ? '#f59e0b20' : '#3b82f620',
                            color: row.status === 'Settled' ? theme.chartPos : row.status === 'Flagged' ? '#f59e0b' : '#3b82f6'
                          }}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Trust Markers */}
      <section style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: darkMode ? '#030712' : '#F8FAFC', padding: '80px 24px' }}>
        <Reveal>
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '48px' }}>
            {[
              { icon: Shield, title: 'Sovereign Compliance', text: 'Fully compliant with Basel III requirements and localized regulatory frameworks in 42 jurisdictions.' },
              { icon: Globe, title: 'Global Desk Access', text: '24/7 direct lines to institutional traders in London, New York, Singapore, and Zurich.' },
              { icon: Lock, title: 'Vault Infrastructure', text: 'Cold-storage physical asset custody integrated with real-time digital balance auditing.' },
              { icon: TrendingUp, title: 'Liquidity Depth', text: 'Direct market access providing institutional spreads even during high-volatility events.' }
            ].map((item, i) => (
              <div key={i}>
                <div style={{ display: 'inline-block', padding: '12px', border: `1px solid ${theme.accent}40`, marginBottom: '16px' }}>
                  <item.icon size={24} style={{ color: theme.accent }} />
                </div>
                <h4 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>{item.title}</h4>
                <p style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.6 }}>{item.text}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface, padding: '48px 24px' }}>
        <Reveal>
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Landmark size={18} style={{ color: theme.accent }} />
                <span style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Lumina Institutional Banking Group</span>
              </div>
              <p style={{ fontSize: '10px', color: theme.textSecondary, letterSpacing: '0.05em' }}>
                © 2026 Lumina Global. Authorized by the Prudential Regulation Authority.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '32px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.15em', color: theme.textSecondary }}>
              {['Legal', 'Privacy Policy', 'Market Disclosures', 'Governance'].map(link => (
                <Link key={link} href="#" style={{ textDecoration: 'none', color: 'inherit', transition: 'color 0.3s' }} className="hover-accent">
                  {link}
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      </footer>
      
      <style jsx>{`
        @media (max-width: 1024px) {
          .grid-col-mobile { grid-column: span 12 !important; }
        }
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}
