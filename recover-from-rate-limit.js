console.log('🛑 Rate Limit Recovery Mode\n');
console.log('Your Sepolia RPC provider (Infura/Alchemy) has rate limited your requests.');
console.log('This typically happens after many rapid blockchain queries.\n');

console.log('📋 What happened:');
console.log('   • Too many RPC calls in short time (getBlockNumber, contract calls)');
console.log('   • Provider returned 429 (Too Many Requests)');
console.log('   • Retry loops cascaded, creating more 429 errors\n');

console.log('✅ Fixes applied:');
console.log('   • Increased retry backoff: 1s → 2s → 4s → 8s → 15s');
console.log('   • Web3 init delay: 5s → 10s → 15s on 429');
console.log('   • Rapid restart protection: 10s wait if restarted < 1min ago');
console.log('   • Rate limit errors no longer crash server\n');

console.log('⏳ Recovery steps:\n');

const steps = [
    { time: 0, action: 'Waiting 30 seconds for rate limit window to reset...' },
    { time: 30000, action: 'Rate limit should be clearing now...' },
    { time: 45000, action: 'Starting server...' }
];

let currentStep = 0;

function showProgress() {
    if (currentStep < steps.length) {
        const step = steps[currentStep];
        console.log(`   [${currentStep + 1}/${steps.length}] ${step.action}`);
        currentStep++;
        const nextStepDelay = currentStep < steps.length ? steps[currentStep].time - step.time : 0;
        if (nextStepDelay > 0) {
            setTimeout(showProgress, nextStepDelay);
        } else if (currentStep < steps.length) {
            showProgress();
        } else {
            startServer();
        }
    }
}

function startServer() {
    console.log('\n🚀 Starting server with rate limit protection...\n');
    const { spawn } = require('child_process');
    const serverProcess = spawn('npm', ['start'], {
        cwd: __dirname,
        shell: true,
        stdio: 'inherit'
    });
    
    serverProcess.on('error', (error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

console.log('');
showProgress();
