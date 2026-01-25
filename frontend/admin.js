document.addEventListener('DOMContentLoaded', () => {
    const adminState = document.getElementById('admin-state');
    const adminDisb = document.getElementById('admin-disb');
    const adminRecipient = document.getElementById('admin-recipient');
    const adminAmount = document.getElementById('admin-amount');
    const adminEta = document.getElementById('admin-eta');
    const adminEmi = document.getElementById('admin-emi');
    const adminDue = document.getElementById('admin-due');
    const adminStatus = document.getElementById('admin-status');
    const adminProgress = document.getElementById('admin-progress');
    const releaseBtn = document.getElementById('admin-release');
    const resetBtn = document.getElementById('admin-reset');
    const adminUser = document.getElementById('admin-user');
    const adminCity = document.getElementById('admin-city');
    const adminIncome = document.getElementById('admin-income');
    const adminCibil = document.getElementById('admin-cibil');
    const adminLoanStatus = document.getElementById('admin-loan-status');
    const adminRisk = document.getElementById('admin-risk');

    let cached = loadCachedDisbursement();
    hydrateUI(cached);

    releaseBtn.addEventListener('click', () => {
        releaseBtn.disabled = true;
        adminStatus.textContent = 'Releasing funds...';
        adminProgress.style.width = '60%';

        setTimeout(() => {
            adminProgress.style.width = '100%';
            adminStatus.textContent = 'Funds sent to user account';
            adminDue.textContent = nextDueDate();
            signalRelease(cached);
        }, 900);
    });

    resetBtn.addEventListener('click', () => {
        cached = null;
        localStorage.removeItem('lastDisbursement');
        adminState.textContent = 'Waiting for latest loan approval...';
        adminDisb.classList.add('hidden');
    });

    function hydrateUI(data) {
        if (!data) {
            adminDisb.classList.add('hidden');
            return;
        }

        adminDisb.classList.remove('hidden');
        adminState.textContent = 'Ready to release';
        adminRecipient.textContent = data.recipient || 'User (latest approval)';
        adminAmount.textContent = `₹${data.amount?.toLocaleString?.() || '—'}`;
        adminEta.textContent = `${data.etaDays || 2} days`;
        adminEmi.textContent = `₹${data.emiValue || data.monthlyEmi || '—'}`;
        adminStatus.textContent = 'Awaiting release';
        adminProgress.style.width = '30%';

        if (data.borrower) {
            adminUser.textContent = data.borrower.name || '—';
            adminCity.textContent = data.borrower.city || '—';
            adminIncome.textContent = data.borrower.income ? `₹${Number(data.borrower.income).toLocaleString()}` : '—';
            adminCibil.textContent = data.borrower.cibilScore ? `CIBIL ${data.borrower.cibilScore}` : '—';
            adminLoanStatus.textContent = (data.status || 'approved').toUpperCase();
            adminRisk.textContent = riskFlag(data.borrower.income);
        }
    }

    function loadCachedDisbursement() {
        try {
            const raw = localStorage.getItem('lastDisbursement');
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            console.warn('Failed to load cached disbursement', err);
            return null;
        }
    }

    function signalRelease(data) {
        try {
            localStorage.setItem('fundsReleased', JSON.stringify({
                ...data,
                releasedAt: new Date().toISOString()
            }));
        } catch (err) {
            console.warn('Failed to signal release', err);
        }
    }

    function nextDueDate() {
        const dt = new Date();
        dt.setMonth(dt.getMonth() + 1);
        return dt.toISOString().slice(0, 10);
    }

    function riskFlag(income) {
        const amt = Number(income || 0);
        if (!amt) return 'Needs manual check';
        const flags = amt < 25000
            ? ['High risk: low income', 'Doubtful: verify employer', 'Manual review required']
            : amt < 50000
                ? ['Medium risk: income modest', 'Check bank statements', 'Mildly doubtful, verify']
                : ['Low risk: stable income', 'Passes automated check', 'Green: auto-approve'];
        return flags[Math.floor(Math.random() * flags.length)];
    }
});
