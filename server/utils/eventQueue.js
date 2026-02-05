/**
 * Event Queue System using MongoDB
 * 
 * Provides durable event queue for async processing:
 * - Document verification (OCR)
 * - Credit score calculation
 * - Loan approval notifications
 * - Ledger writes
 * - Admin activity logging
 * 
 * Uses atomic findOneAndUpdate for worker claim pattern.
 */

const { ObjectId } = require('mongodb');

/**
 * Publish an event to the queue
 * @param {Object} db - MongoDB database instance
 * @param {string} type - Event type (e.g., 'document:uploaded', 'loan:approved')
 * @param {Object} payload - Event data
 * @param {Object} options - Additional options (priority, delay, maxRetries)
 * @returns {Promise<string>} Event ID
 */
async function publishEvent(db, type, payload, options = {}) {
  const col = db.collection('events');
  
  const event = {
    type,
    payload,
    processed: false,
    attempts: 0,
    maxRetries: options.maxRetries || 3,
    priority: options.priority || 0, // Higher = more priority
    availableAt: options.delayMs 
      ? new Date(Date.now() + options.delayMs)
      : new Date(),
    createdAt: new Date(),
    metadata: options.metadata || {}
  };

  const result = await col.insertOne(event);
  return result.insertedId.toString();
}

/**
 * Claim an event for processing (worker pattern)
 * @param {Object} db - MongoDB database instance
 * @param {string} eventType - Event type to claim (or null for any)
 * @param {string} workerId - Unique worker identifier
 * @param {number} lockDurationMs - How long to lock the event (default: 30s)
 * @returns {Promise<Object|null>} Claimed event or null if none available
 */
async function claimEvent(db, eventType, workerId, lockDurationMs = 30000) {
  const col = db.collection('events');
  const now = new Date();
  const lockedUntil = new Date(Date.now() + lockDurationMs);

  const filter = {
    processed: { $ne: true },
    availableAt: { $lte: now },
    $or: [
      { lockedUntil: { $lt: now } },
      { lockedUntil: { $exists: false } }
    ]
  };

  if (eventType) {
    filter.type = eventType;
  }

  const update = {
    $set: {
      lockedUntil,
      lockedBy: workerId,
      lastAttemptAt: now
    },
    $inc: { attempts: 1 }
  };

  const result = await col.findOneAndUpdate(
    filter,
    update,
    {
      sort: { priority: -1, createdAt: 1 }, // Priority first, then FIFO
      returnDocument: 'after'
    }
  );

  return result.value;
}

/**
 * Mark an event as successfully processed
 * @param {Object} db - MongoDB database instance
 * @param {string|ObjectId} eventId - Event ID
 * @param {Object} result - Processing result
 */
async function completeEvent(db, eventId, result = {}) {
  const col = db.collection('events');
  
  await col.updateOne(
    { _id: typeof eventId === 'string' ? new ObjectId(eventId) : eventId },
    {
      $set: {
        processed: true,
        processedAt: new Date(),
        result
      },
      $unset: {
        lockedUntil: '',
        lockedBy: ''
      }
    }
  );
}

/**
 * Mark an event as failed (will retry if attempts < maxRetries)
 * @param {Object} db - MongoDB database instance
 * @param {string|ObjectId} eventId - Event ID
 * @param {string} error - Error message
 */
async function failEvent(db, eventId, error) {
  const col = db.collection('events');
  const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

  const event = await col.findOne({ _id: eventObjectId });
  
  if (!event) return;

  const update = {
    $set: {
      lastError: error,
      lastErrorAt: new Date()
    },
    $unset: {
      lockedUntil: '',
      lockedBy: ''
    }
  };

  // If max retries exceeded, mark as permanently failed
  if (event.attempts >= event.maxRetries) {
    update.$set.processed = true;
    update.$set.failed = true;
    update.$set.failedAt = new Date();
  } else {
    // Exponential backoff: delay retry
    const backoffMs = Math.min(60000, 1000 * Math.pow(2, event.attempts));
    update.$set.availableAt = new Date(Date.now() + backoffMs);
  }

  await col.updateOne({ _id: eventObjectId }, update);
}

/**
 * Get event queue statistics
 * @param {Object} db - MongoDB database instance
 * @returns {Promise<Object>} Queue stats
 */
async function getQueueStats(db) {
  const col = db.collection('events');
  const now = new Date();

  const [
    total,
    pending,
    processing,
    completed,
    failed
  ] = await Promise.all([
    col.countDocuments({}),
    col.countDocuments({ 
      processed: { $ne: true }, 
      $or: [
        { lockedUntil: { $lt: now } },
        { lockedUntil: { $exists: false } }
      ]
    }),
    col.countDocuments({ 
      processed: { $ne: true },
      lockedUntil: { $gte: now }
    }),
    col.countDocuments({ processed: true, failed: { $ne: true } }),
    col.countDocuments({ processed: true, failed: true })
  ]);

  return {
    total,
    pending,
    processing,
    completed,
    failed,
    successRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0
  };
}

/**
 * Retry a failed event
 * @param {Object} db - MongoDB database instance
 * @param {string|ObjectId} eventId - Event ID
 */
async function retryEvent(db, eventId) {
  const col = db.collection('events');
  
  await col.updateOne(
    { _id: typeof eventId === 'string' ? new ObjectId(eventId) : eventId },
    {
      $set: {
        processed: false,
        failed: false,
        availableAt: new Date(),
        attempts: 0
      },
      $unset: {
        lockedUntil: '',
        lockedBy: '',
        lastError: '',
        lastErrorAt: '',
        failedAt: ''
      }
    }
  );
}

/**
 * Clean up old processed events
 * @param {Object} db - MongoDB database instance
 * @param {number} olderThanDays - Delete events older than X days
 * @returns {Promise<number>} Number of deleted events
 */
async function cleanupOldEvents(db, olderThanDays = 7) {
  const col = db.collection('events');
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const result = await col.deleteMany({
    processed: true,
    processedAt: { $lt: cutoffDate }
  });

  return result.deletedCount;
}

module.exports = {
  publishEvent,
  claimEvent,
  completeEvent,
  failEvent,
  getQueueStats,
  retryEvent,
  cleanupOldEvents
};
