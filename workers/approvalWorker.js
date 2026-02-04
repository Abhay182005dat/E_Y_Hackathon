/**
 * Approval Worker - Background processor for loan approvals
 * 
 * This worker handles:
 * - Loan approval calculations
 * - Credit score processing
 * - Ledger writes with distributed locking
 * - Notification dispatch
 * 
 * Run multiple instances for horizontal scaling
 */

const { connectDB } = require('../server/db');
const { claimEvent, completeEvent, failEvent, publishEvent } = require('../server/utils/eventQueue');
const { withLock } = require('../server/utils/mongoLock');
const crypto = require('crypto');

const WORKER_ID = `approval-worker-${crypto.randomBytes(4).toString('hex')}`;

async function processApproval(event, db) {
  console.log(`[${WORKER_ID}] Processing approval:`, event._id.toString());

  try {
    const { applicationId, userId, loanAmount } = event.payload;

    // Use distributed lock for critical ledger write
    await withLock(db, `application:${applicationId}`, async () => {
      // Import agents
      const { calculateCreditScore } = require('../utils/creditScore');
      const { writeLedger } = require('../blockchain/ledger');

      // Calculate approval score
      const score = calculateCreditScore(event.payload.applicantData);

      // Write to ledger
      const ledgerEntry = {
        type: 'loan_approval',
        applicationId,
        userId,
        score,
        timestamp: new Date()
      };
      await writeLedger(db, 'approval_ledger', ledgerEntry);

      // Update application status
      const { updateWithVersion } = require('../server/utils/optimisticLock');
      await updateWithVersion(db, 'applications', applicationId, event.payload.version, {
        status: score >= 650 ? 'approved' : 'rejected',
        approvalScore: score,
        approvedAt: new Date(),
        approvedBy: WORKER_ID
      });

      console.log(`[${WORKER_ID}] ✅ Approval processed: ${applicationId}, Score: ${score}`);
    }, 15000); // 15 second lock

    await completeEvent(db, event._id, { success: true });

    // Publish notification event
    await publishEvent(db, 'notification:send', {
      userId,
      type: 'loan_approval',
      applicationId
    });

  } catch (error) {
    console.error(`[${WORKER_ID}] ❌ Approval failed:`, error.message);
    await failEvent(db, event._id, error.message);
  }
}

async function startWorker() {
  const { db } = await connectDB();
  console.log(`[${WORKER_ID}] Approval worker started`);

  while (true) {
    try {
      const event = await claimEvent(db, 'loan:approval_pending', WORKER_ID, 30000);
      if (event) {
        await processApproval(event, db);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`[${WORKER_ID}] Worker error:`, error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

startWorker().catch(error => {
  console.error('Failed to start approval worker:', error);
  process.exit(1);
});
