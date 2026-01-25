document.addEventListener('DOMContentLoaded', () => {
    const loanForm = document.getElementById('loan-form');
    const statusDisplay = document.getElementById('status-display');
    const resultDisplay = document.querySelector('#loan-result pre code');
    const loader = document.getElementById('loader');
    const submitBtn = document.getElementById('apply-btn');
    const auditTrailSection = document.getElementById('audit-trail');
    const cidList = document.getElementById('cid-list');
    const cibilInput = document.getElementById('cibil');
    const cibilRandomBtn = document.getElementById('cibil-random-btn');
    const cibilHint = document.getElementById('cibil-hint');
    const disbSection = document.getElementById('disbursement');
    const disbAmount = document.getElementById('disb-amount');
    const disbEta = document.getElementById('disb-eta');
    const disbEmi = document.getElementById('disb-emi');
    const disbProgress = document.getElementById('disb-progress');
    const disbNote = document.getElementById('disb-note');
    const emiAmountEl = document.getElementById('emi-amount');
    const emiDueEl = document.getElementById('emi-due');
    const emiStatusEl = document.getElementById('emi-status');
    const releaseFlag = document.getElementById('release-flag');
    const docsSection = document.getElementById('docs-status');
    const panStatus = document.getElementById('pan-status');
    const panDesc = document.getElementById('pan-desc');
    const aadhaarStatus = document.getElementById('aadhaar-status');
    const aadhaarDesc = document.getElementById('aadhaar-desc');
    const bankStatus = document.getElementById('bank-status');
    const bankDesc = document.getElementById('bank-desc');
    const panFileInput = document.getElementById('pan-file');
    const aadhaarFileInput = document.getElementById('aadhaar-file');
    const identityForm = document.getElementById('identity-form');
    const identityLoader = document.getElementById('identity-loader');
    const identitySubmit = document.getElementById('identity-submit');
    let lastBorrower = null;
    let statusTicker = null;
    const statusMessages = [
        'Intent detected: personal loan journey started...',
        'Session ID created and logged to ledger...',
        'Capturing consent for credit and KYC checks...',
        'Collecting income, employment, city, and amount...',
        'KYC: PAN/Aadhaar OCR initiated...',
        'KYC: Document authenticity validation running...',
        'KYC: Government KYC API verification in progress...',
        'KYC: Identity ledger hash queued...',
        'Credit agent fetching CIBIL score...',
        'Credit agent checking past loan history...',
        'Underwriting agent calculating risk and eligibility...',
        'Underwriting agent pricing interest and tenure...',
        'Offer prepared; negotiation window open...',
        'Offer adjustment based on customer feedback...',
        'Smart contract approval: validating KYC and credit rules...',
        'Smart contract recording approval on-chain...',
        'Document agent drafting sanction letter...',
        'Document agent signing and hashing sanction letter...',
        'Sanction letter anchored to loan ledger...',
        'Disbursement agent queuing bank transfer...',
        'Disbursement hash recorded to loan ledger...',
        'EMI schedule generated and stored...',
        'Monitoring agent arming EMI reminders...',
        'Analytics agent watching early warning signals...',
        'Audit trail complete across identity, credit, loan, and payment ledgers.'
    ];

    loanForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handleLoanApplication();
    });

    if (cibilRandomBtn) {
        cibilRandomBtn.addEventListener('click', () => {
            setRandomCibil();
        });
    }

    if (identitySubmit) {
        identitySubmit.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            runIdentityPrototype();
        });
    }

    setRandomCibil();
    hydrateFromCache();
    window.addEventListener('storage', () => {
        hydrateFromCache();
        applyAdminReleaseSignal();
    });

    function setRandomCibil() {
        const min = 400;
        const max = 800;
        const score = Math.floor(Math.random() * (max - min + 1)) + min;
        cibilInput.value = score;
        if (cibilHint) {
            cibilHint.textContent = `Demo bank CIBIL generated (${min}-${max}): ${score}`;
        }
    }

    function showLoading(isLoading) {
        if (isLoading) {
            loader.classList.remove('hidden');
            if (submitBtn) submitBtn.disabled = true;
            statusDisplay.innerHTML = '<p>Submitting... The agents are at work. This may take a moment.</p>';
            resultDisplay.textContent = '';
            auditTrailSection.classList.add('hidden');
            cidList.innerHTML = '';
        } else {
            loader.classList.add('hidden');
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function displayAuditTrail(cids) {
        if (!cids || cids.length === 0) {
            auditTrailSection.classList.add('hidden');
            return;
        }

        cidList.innerHTML = ''; // Clear previous results
        
        cids.forEach(item => {
            if (!item.cid) return;

            const li = document.createElement('li');
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'cid-info';

            const phaseP = document.createElement('p');
            phaseP.className = 'cid-phase';
            phaseP.textContent = item.step || 'Unnamed Step';
            
            const link = document.createElement('a');
            link.className = 'cid-link';
            link.href = `https://gateway.pinata.cloud/ipfs/${item.cid}`;
            link.textContent = item.cid;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            infoDiv.appendChild(phaseP);
            infoDiv.appendChild(link);
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-cid-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(item.cid).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                });
            });

            li.appendChild(infoDiv);
            li.appendChild(copyBtn);
            cidList.appendChild(li);
        });

        auditTrailSection.classList.remove('hidden');
    }

    async function handleLoanApplication() {
        showLoading(true);

        const identityOk = await runIdentityPrototype();
        if (!identityOk) {
            showLoading(false);
            return;
        }

        startStatusTicker();

        const requestBody = {
            message: document.getElementById('user-message').value,
            userData: {
                name: document.getElementById('name').value,
                kycDocuments: {
                    pan: document.getElementById('pan').value,
                    aadhaar: document.getElementById('aadhaar').value
                },
                cibilScore: parseInt(document.getElementById('cibil').value, 10),
                income: parseInt(document.getElementById('income').value, 10),
                employmentType: document.getElementById('employment-type').value,
                city: document.getElementById('city').value,
                loanAmount: parseInt(document.getElementById('loan-amount').value, 10),
                consent: {
                    kyc: true,
                    creditCheck: true
                }
            }
        };
        lastBorrower = requestBody.userData;

        const apiUrl = '/loan';

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            const result = await response.json();

            displayAuditTrail(result.cids);

            if (!response.ok || result.status === 'error' || result.status === 'rejected') {
                throw result;
            }

            stopStatusTicker();
            statusDisplay.innerHTML = `<p>Application processed! Status: <strong>${result.status.toUpperCase()}</strong></p>`;
            resultDisplay.textContent = JSON.stringify({
                status: result.status,
                loanId: result.loanId
            }, null, 2);

            await hydrateDisbursement(result.cids, {
                amount: requestBody.userData.loanAmount,
                termMonths: 36,
                annualRate: 10,
                etaDays: randomEtaDays()
            });

            persistJourney({
                status: result.status,
                loanId: result.loanId,
                amount: requestBody.userData.loanAmount,
                etaDays: null,
                emi: disbEmi.textContent,
                timestamp: Date.now(),
                borrower: scrubBorrower(lastBorrower)
            });

            updateDocCards({ status: 'verified', pan: 'OCR matched', aadhaar: 'OCR matched', bank: 'Verified via admin' });

        } catch (error) {
            console.error('API Error:', error);
            stopStatusTicker();
            const reason = error.reason || error.message || 'An unknown error occurred.';
            statusDisplay.innerHTML = `<p class="error"><strong>Application Failed</strong>: ${reason}</p>`;
            // Still display CIDs if the process failed midway but returned some
            displayAuditTrail(error.cids);
            resultDisplay.textContent = JSON.stringify(error, null, 2);
            resetDisbursement();
        } finally {
            stopStatusTicker();
            showLoading(false);
        }
    }

    async function fetchJsonFromCid(cid) {
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
        if (!res.ok) {
            throw new Error(`Failed to fetch CID ${cid}: ${res.status}`);
        }
        return res.json();
    }

    function startStatusTicker() {
        let idx = 0;
        if (statusTicker) clearInterval(statusTicker);
        statusDisplay.innerHTML = `<p>${statusMessages[idx]}</p>`;
        statusTicker = setInterval(() => {
            idx = (idx + 1) % statusMessages.length;
            statusDisplay.innerHTML = `<p>${statusMessages[idx]}</p>`;
        }, 1000);
    }

    function stopStatusTicker() {
        if (statusTicker) {
            clearInterval(statusTicker);
            statusTicker = null;
        }
    }

    async function hydrateDisbursement(cids, fallback) {
        if (!disbSection) return;
        const disbCid = (cids || []).find(item => item.step === 'disbursement' && item.cid)?.cid;

        if (disbCid) {
            try {
                const data = await fetchJsonFromCid(disbCid);
                setupDisbursement({
                    amount: data.amount || fallback.amount,
                    termMonths: (data.emiSchedule && data.emiSchedule.length) || fallback.termMonths,
                    monthlyEmi: data.monthlyEmi,
                    etaDays: randomEtaDays(),
                    source: 'pinata'
                });
                return;
            } catch (err) {
                console.error('Failed to load disbursement from Pinata:', err);
            }
        }

        setupDisbursement({ ...fallback, source: 'fallback' });
    }

    function setupDisbursement({ amount, termMonths, annualRate, monthlyEmi, etaDays }) {
        if (!disbSection) return;
        disbSection.classList.remove('hidden');

        disbAmount.textContent = `₹${amount?.toLocaleString() || '—'}`;
        disbEta.textContent = `${etaDays} days`; // represent bank transfer ETA
        const emiValue = monthlyEmi || calculateEmi(amount, annualRate, termMonths);
        disbEmi.textContent = `₹${emiValue}`;
        emiAmountEl.textContent = `₹${emiValue}`;
        emiStatusEl.textContent = 'Awaiting admin release';
        emiDueEl.textContent = 'TBD after release';

        disbProgress.style.width = '40%';
        disbNote.textContent = 'Awaiting bank release by admin...';
        releaseFlag.textContent = 'Awaiting admin action.';

        cacheDisbursementLocally({ amount, emiValue, etaDays, borrower: scrubBorrower(lastBorrower) });
        applyAdminReleaseSignal();
    }

    function resetDisbursement() {
        if (!disbSection) return;
        disbProgress.style.width = '0';
        disbNote.textContent = 'Funds are queued for release.';
        disbSection.classList.add('hidden');
    }

    function calculateEmi(principal, annualRatePct, months) {
        if (!principal || !annualRatePct || !months) return '—';
        const r = (annualRatePct / 100) / 12;
        const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
        return Math.round(emi).toLocaleString();
    }

    function randomEtaDays() {
        return Math.floor(Math.random() * 4) + 1; // 1–4 days
    }

    function cacheDisbursementLocally(payload) {
        try {
            localStorage.setItem('lastDisbursement', JSON.stringify(payload));
        } catch (err) {
            console.warn('Could not cache disbursement locally', err);
        }
    }

    function persistJourney(payload) {
        try {
            localStorage.setItem('journeyState', JSON.stringify(payload));
        } catch (err) {
            console.warn('Could not persist journey', err);
        }
    }

    function hydrateFromCache() {
        try {
            const raw = localStorage.getItem('journeyState');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.status) {
                statusDisplay.innerHTML = `<p>Resumed session. Status: <strong>${data.status.toUpperCase()}</strong></p>`;
            }
            if (data.loanId) {
                resultDisplay.textContent = JSON.stringify({ status: data.status, loanId: data.loanId }, null, 2);
            }
            if (data.emi) {
                emiAmountEl.textContent = data.emi;
            }
            docsSection.classList.remove('hidden');
            updateDocCards({ status: 'verified', pan: 'OCR matched', aadhaar: 'OCR matched', bank: 'Verified via admin' });
            disbSection.classList.remove('hidden');
            applyAdminReleaseSignal();
        } catch (err) {
            console.warn('Could not hydrate from cache', err);
        }
    }

    function updateDocCards({ status, pan, aadhaar, bank }) {
        if (!docsSection) return;
        docsSection.classList.remove('hidden');
        panStatus.textContent = status || 'Pending';
        panDesc.textContent = pan || 'OCR pending';
        aadhaarStatus.textContent = status || 'Pending';
        aadhaarDesc.textContent = aadhaar || 'OCR pending';
        bankStatus.textContent = status || 'Pending';
        bankDesc.textContent = bank || 'Bank check pending';
    }

    function scrubBorrower(data) {
        if (!data) return null;
        return {
            name: data.name,
            city: data.city,
            income: data.income,
            cibilScore: data.cibilScore,
            loanAmount: data.loanAmount,
            pan: data.kycDocuments?.pan,
            aadhaar: data.kycDocuments?.aadhaar
        };
    }

    async function runIdentityPrototype() {
        docsSection.classList.remove('hidden');
        const hasPanFile = panFileInput && panFileInput.files && panFileInput.files.length > 0;
        const hasAadhaarFile = aadhaarFileInput && aadhaarFileInput.files && aadhaarFileInput.files.length > 0;
        if (!hasPanFile || !hasAadhaarFile) {
            statusDisplay.innerHTML = '<p class="error"><strong>Upload required:</strong> Please attach PAN and Aadhaar files before verification.</p>';
            return false;
        }

        statusDisplay.innerHTML = '<p>Loading documents...</p>';
        panStatus.textContent = 'Checking...';
        aadhaarStatus.textContent = 'Checking...';
        bankStatus.textContent = 'Checking...';
        panDesc.textContent = 'Running OCR on uploaded PAN (dummy)';
        aadhaarDesc.textContent = 'Running OCR on uploaded Aadhaar (dummy)';
        bankDesc.textContent = 'Cross-checking bank presence (dummy)';

        if (identityLoader) identityLoader.classList.remove('hidden');

        await delay(1000);
        statusDisplay.innerHTML = '<p>OCR running...</p>';
        await delay(2000);
        statusDisplay.innerHTML = '<p>Verifying with bank database...</p>';
        await delay(3000);

        const fakePan = document.getElementById('pan').value || 'ABCDE1234F';
        const fakeAadhaar = document.getElementById('aadhaar').value || '123456789012';
        panStatus.textContent = 'Verified';
        aadhaarStatus.textContent = 'Verified';
        bankStatus.textContent = 'Present in bank records';
        panDesc.textContent = `PAN ${fakePan} matched (OCR model)`;
        aadhaarDesc.textContent = `Aadhaar ${fakeAadhaar} matched (OCR model)`;
        bankDesc.textContent = 'Bank database check passed (prototype)';
        statusDisplay.innerHTML = '<p>Identity verified by OCR model and bank database.</p>';
        if (identityLoader) identityLoader.classList.add('hidden');
        persistJourney({
            status: 'verified',
            loanId: localStorage.getItem('journeyState') ? JSON.parse(localStorage.getItem('journeyState')).loanId : null,
            amount: null,
            etaDays: null,
            emi: disbEmi.textContent,
            timestamp: Date.now(),
            identityVerified: true
        });
        return true;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function applyAdminReleaseSignal() {
        try {
            const raw = localStorage.getItem('fundsReleased');
            if (!raw) return;
            const data = JSON.parse(raw);
            releaseFlag.textContent = `Funds released by admin at ${new Date(data.releasedAt).toLocaleString()}`;
            disbProgress.style.width = '100%';
            disbNote.textContent = 'Funds transferred to user account.';
            emiStatusEl.textContent = 'Active';
            emiDueEl.textContent = nextDueDate();
        } catch (err) {
            console.warn('Failed to apply admin release signal', err);
        }
    }

    function nextDueDate() {
        const dt = new Date();
        dt.setMonth(dt.getMonth() + 1);
        return dt.toISOString().slice(0, 10);
    }
});