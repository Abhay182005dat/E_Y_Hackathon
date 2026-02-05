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
const redis = require('redis');

const WORKER_ID = `approval-worker-${crypto.randomBytes(4).toString('hex')}`;
const POLL_INTERVAL_MS = 1000;
const SESSION_TTL = 3600; // 1 hour

let redisClient;

// Initialize Redis client
async function initRedis() {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  redisClient.on('error', (err) => console.error(`[${WORKER_ID}] Redis Error:`, err));
  await redisClient.connect();
  console.log(`[${WORKER_ID}] Redis connected`);
  return redisClient;
}

// Store processing state in Redis
async function storeSession(eventId, payload) {
  const sessionKey = `worker:session:${eventId}`;
  await redisClient.setEx(sessionKey, SESSION_TTL, JSON.stringify({
    workerId: WORKER_ID,
    eventId: eventId.toString(),
    payload,
    startedAt: new Date().toISOString(),
    status: 'processing'
  }));
  console.log(`[${WORKER_ID}] Session stored: ${sessionKey}`);
}

// Get session from Redis
async function getSession(eventId) {
  const sessionKey = `worker:session:${eventId}`;
  const data = await redisClient.get(sessionKey);
  return data ? JSON.parse(data) : null;
}

// Clear session after completion
async function clearSession(eventId) {
  const sessionKey = `worker:session:${eventId}`;
  await redisClient.del(sessionKey);
  console.log(`[${WORKER_ID}] Session cleared: ${sessionKey}`);
}

// Resume incomplete sessions on startup
async function resumeIncompleteSessions(db) {
  try {
    const keys = await redisClient.keys('worker:session:*');
    console.log(`[${WORKER_ID}] Found ${keys.length} incomplete sessions`);

    for (const key of keys) {
      const session = JSON.parse(await redisClient.get(key));
      const eventId = session.eventId;
      
      console.log(`[${WORKER_ID}] Resuming session: ${eventId}`);
      
      // Fetch event from DB
      const event = await db.collection('events').findOne({ 
        _id: new (require('mongodb').ObjectId)(eventId) 
      });

      if (event && event.status === 'claimed') {
        // Re-process the event
        await processApproval(event, db);
      } else {
        // Event already completed or doesn't exist, clean up
        await redisClient.del(key);
      }
    }
  } catch (error) {
    console.error(`[${WORKER_ID}] Error resuming sessions:`, error);
  }
}

async function processApproval(event, db) {
  console.log(`[${WORKER_ID}] Processing approval:`, event._id.toString());

  try {
    // Store session in Redis before processing
    await storeSession(event._id, event.payload);

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

    // Clear session from Redis after successful completion
    await clearSession(event._id);

  } catch (error) {
    console.error(`[${WORKER_ID}] ❌ Approval failed:`, error.message);
    await failEvent(db, event._id, error.message);
    
    // Keep session in Redis for manual recovery/debugging
    const sessionKey = `worker:session:${event._id}`;
    await redisClient.expire(sessionKey, 86400); // Extend to 24 hours for failed events
  }
}

async function startWorker() {
  const { db } = await connectDB();
  await initRedis();
  
  console.log(`[${WORKER_ID}] Approval worker started. Checking for incomplete sessions...`);
  
  // Resume any incomplete sessions from previous crash
  await resumeIncompleteSessions(db);
  
  console.log(`[${WORKER_ID}] Now polling for new events...`);

  while (true) {
    try {
      const event = await claimEvent(db, 'loan:approval_pending', WORKER_ID, 30000);
      if (event) {
        await processApproval(event, db);
      } else {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error(`[${WORKER_ID}] Worker error:`, error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

process.on('SIGINT', async () => {
  console.log(`[${WORKER_ID}] Shutting down...`);
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(`[${WORKER_ID}] Shutting down...`);
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

startWorker().catch(error => {
  console.error('Failed to start approval worker:', error);
  process.exit(1);
});
