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

const WORKER_ID = `ocr-worker-${crypto.randomBytes(4).toString('hex')}`;
const POLL_INTERVAL_MS = 1000;

async function processDocument(event, db) {
  console.log(`[${WORKER_ID}] Processing event:`, event._id.toString());

  try {
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

    console.log(`[${WORKER_ID}] ✅ Event completed:`, event._id.toString());
  } catch (error) {
    console.error(`[${WORKER_ID}] ❌ Processing failed:`, error.message);
    await failEvent(db, event._id, error.message);
  }
}

async function startWorker() {
  const { db } = await connectDB();
  console.log(`[${WORKER_ID}] Worker started. Polling for events...`);

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
process.on('SIGINT', () => {
  console.log(`[${WORKER_ID}] Shutting down...`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`[${WORKER_ID}] Shutting down...`);
  process.exit(0);
});

// Start the worker
startWorker().catch(error => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
