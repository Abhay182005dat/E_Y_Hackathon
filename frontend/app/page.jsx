'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from './context/AuthContext';

// Icons (unchanged)
const Shield = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const Landmark = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 20 7 4 7" />
    <line x1="3" y1="22" x2="21" y2="22" />
  </svg>
);

const CheckCircle = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ArrowRight = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export default function LandingPage() {

  const { user, loading } = useAuth();
  const router = useRouter();

  const handleLoginClick = () => {
    if (user) router.push(user.role === 'admin' ? '/admin' : '/dashboard');
    else router.push('/login');
  };

  return (
    <div className="min-h-screen text-white relative overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,.7),rgba(0,0,0,.8)),url(https://images.unsplash.com/photo-1601597111158-2fceff292cdc)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>

      <style jsx global>{`
body{margin:0;font-family:Inter}

.btn-primary{
background:linear-gradient(135deg,#C5A059,#D4AF37);
color:black;font-weight:600;padding:14px 36px;border-radius:10px;
display:inline-flex;gap:8px;align-items:center;
transition:.3s}

.btn-primary:hover{transform:translateY(-2px);box-shadow:0 15px 30px rgba(197,160,89,.3)}

.btn-outline{border:1px solid #C5A059;color:#C5A059;padding:10px 24px;border-radius:8px}

.glass{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(14px);border-radius:18px;padding:28px}

.phoneFloat{
animation:float 6s ease-in-out infinite;
}

@keyframes float{
0%,100%{transform:translateY(0)}
50%{transform:translateY(-15px)}
}

.screenSlide{
animation:slide 12s infinite;
}

@keyframes slide{
0%{transform:translateY(0)}
25%{transform:translateY(-100%)}
50%{transform:translateY(-200%)}
75%{transform:translateY(-300%)}
100%{transform:translateY(0)}`
      }
      </style>

      {/* Navbar */}
      <nav className="fixed w-full top-0 z-50 border-b border-white/10 backdrop-blur">
        <div className="max-w-7xl mx-auto h-20 flex justify-between items-center px-6">

          <div className="flex items-center gap-3">
            <Landmark />
            <div>
              <h1 className="font-bold">BFSI PLATFORM</h1>
              <p className="text-xs opacity-50">Institutional Banking</p>
            </div>
          </div>

          <button onClick={handleLoginClick} className="btn-outline">
            {loading ? 'Thinking...' : user ? 'Dashboard' : 'Login'}
          </button>

        </div>
      </nav>

      {/* HERO */}
      <main className="pt-40 pb-24 px-6 grid md:grid-cols-2 gap-16 max-w-7xl mx-auto items-center">

        {/* LEFT */}
        <div>

          <div className="inline-flex gap-2 items-center mb-8 px-4 py-2 rounded-full border border-[#C5A05933] text-[#C5A059]">
            <Shield size={14} /> AI Powered Verification
          </div>

          <h1 className="text-6xl font-light leading-tight mb-6">
            Instant AI Lending<br />
            <span className="italic text-[#C5A059]">For Modern Banking</span>
          </h1>

          <p className="text-white/60 mb-10 max-w-xl">
            Apply → AI verifies → Credit scored → Chat negotiate → Blockchain approval → Funds disbursed.
            All in minutes.
          </p>

          <a href="/apply" className="btn-primary">Apply Now <ArrowRight size={18} /></a>

          <div className="grid grid-cols-3 mt-14 text-center max-w-md">
            {['98% Accuracy', '2 Min', '100% Audit'].map((x, i) => (
              <div key={i}>
                <h3 className="text-2xl text-[#C5A059] font-semibold">{x.split(' ')[0]}</h3>
                <p className="opacity-50">{x.split(' ')[1]}</p>
              </div>
            ))}
          </div>

        </div>

        {/* RIGHT PHONE */}
        <div className="relative flex justify-center phoneFloat">

          <div className="w-[280px] h-[560px] rounded-[40px] border-4 border-white/20 bg-black overflow-hidden shadow-2xl">

            <div className="screenSlide h-full">

              {/* Screen 1 */}
              <div className="h-full flex flex-col justify-center items-center text-center p-6 bg-gradient-to-b from-[#0f172a] to-black">
                <h3 className="text-[#C5A059] text-xl mb-3">Apply Loan</h3>
                <p className="text-white/60">Upload Aadhaar, PAN & Salary Slip</p>
              </div>

              {/* Screen 2 */}
              <div className="h-full flex flex-col justify-center items-center text-center p-6 bg-gradient-to-b from-[#020617] to-black">
                <h3 className="text-[#C5A059] text-xl mb-3">AI Verification</h3>
                <p className="text-white/60">OCR + Face Match + Fraud Check</p>
              </div>

              {/* Screen 3 */}
              <div className="h-full flex flex-col justify-center items-center text-center p-6 bg-gradient-to-b from-[#020617] to-black">
                <h3 className="text-[#C5A059] text-xl mb-3">Chat Negotiation</h3>
                <p className="text-white/60">Lower interest with AI agent</p>
              </div>

              {/* Screen 4 */}
              <div className="h-full flex flex-col justify-center items-center text-center p-6 bg-gradient-to-b from-[#020617] to-black">
                <h3 className="text-[#C5A059] text-xl mb-3">Loan Approved</h3>
                <p className="text-white/60">Funds Disbursed + Blockchain Logged</p>
              </div>

            </div>

          </div>

        </div>

      </main>

      {/* FEATURES */}
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10 px-6">

        {[
          ['AI KYC', 'Live photo + OCR verification'],
          ['Credit Agents', 'Automated underwriting'],
          ['Blockchain', 'Immutable audit trail']
        ].map((f, i) => (
          <div key={i} className="glass hover:scale-[1.03] transition">
            <CheckCircle />
            <h3 className="text-xl mt-4 mb-2 text-[#C5A059]">{f[0]}</h3>
            <p className="opacity-50">{f[1]}</p>
          </div>
        ))}

      </div>

      <footer className="border-t border-white/10 py-12 text-center opacity-40 mt-32">
        © 2026 BFSI Platform
      </footer>

    </div>
  );
}
