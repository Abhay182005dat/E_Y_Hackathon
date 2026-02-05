/**
 * OCR Worker - Background processor for document verification
 * 
 * This worker:
 * 1. Claims 'document:uploaded' events from the queue
 * 2. Processes OCR using utils/ocr.js
 * 3. Publishes 'document:verified' event
 * 4. Marks original event as complete
 * 
 * Run multiple instances for horizontal scaling:
 *   node workers/ocrWorker.js
 */

const { connectDB } = require('../server/db');
const { claimEvent, completeEvent, failEvent } = require('../server/utils/eventQueue');
const crypto = require('crypto');
const redis = require('redis');

const WORKER_ID = `ocr-worker-${crypto.randomBytes(4).toString('hex')}`;
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
        await processDocument(event, db);
      } else {
        // Event already completed or doesn't exist, clean up
        await redisClient.del(key);
      }
    }
  } catch (error) {
    console.error(`[${WORKER_ID}] Error resuming sessions:`, error);
  }
}

async function processDocument(event, db) {
  console.log(`[${WORKER_ID}] Processing event:`, event._id.toString());

  try {
    // Store session in Redis before processing
    await storeSession(event._id, event.payload);

    // Import OCR utility
    const { performOCR } = require('../utils/ocr');
    
    const { fileBuffer, fileName, documentType } = event.payload;

    // Perform OCR
    const ocrResult = await performOCR(fileBuffer, documentType);

    console.log(`[${WORKER_ID}] OCR completed for ${fileName}`);

    // Mark event as complete
    await completeEvent(db, event._id, {
      ocrResult,
      fileName,
      processedBy: WORKER_ID
    });

    // Optionally publish a follow-up event
    const { publishEvent } = require('../server/utils/eventQueue');
    await publishEvent(db, 'document:verified', {
      documentId: event.payload.documentId,
      ocrResult,
      verifiedAt: new Date()
    });

    // Clear session from Redis after successful completion
    await clearSession(event._id);

    console.log(`[${WORKER_ID}] ✅ Event completed:`, event._id.toString());
  } catch (error) {
    console.error(`[${WORKER_ID}] ❌ Processing failed:`, error.message);
    await failEvent(db, event._id, error.message);
    
    // Keep session in Redis for manual recovery/debugging
    const sessionKey = `worker:session:${event._id}`;
    await redisClient.expire(sessionKey, 86400); // Extend to 24 hours for failed events
  }
}

async function startWorker() {
  const { db } = await connectDB();
  await initRedis();
  
  console.log(`[${WORKER_ID}] Worker started. Checking for incomplete sessions...`);
  
  // Resume any incomplete sessions from previous crash
  await resumeIncompleteSessions(db);
  
  console.log(`[${WORKER_ID}] Now polling for new events...`);

  while (true) {
    try {
      // Claim an event
      const event = await claimEvent(db, 'document:uploaded', WORKER_ID, 30000);

      if (event) {
        await processDocument(event, db);
      } else {
        // No events available, wait before polling again
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error(`[${WORKER_ID}] Worker error:`, error);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Backoff on error
    }
  }
}

// Graceful shutdown
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

// Start the worker
startWorker().catch(error => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
