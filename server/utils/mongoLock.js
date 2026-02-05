/**
 * Distributed Locking using MongoDB
 * 
 * Provides lock acquisition/release for critical sections when multiple
 * admins/workers need exclusive access to resources (e.g., loan approvals,
 * disbursements, ledger writes).
 * 
 * Uses MongoDB's TTL index on the 'locks' collection for auto-cleanup.
 */

const crypto = require('crypto');

/**
 * Acquire a distributed lock
 * @param {Object} db - MongoDB database instance
 * @param {string} resourceKey - Unique identifier for the resource to lock
 * @param {number} ttlMs - Time-to-live in milliseconds (default: 10 seconds)
 * @param {string} owner - Optional owner identifier (defaults to random ID)
 * @returns {Promise<Object>} { acquired: boolean, lockId: string }
 */
async function acquireLock(db, resourceKey, ttlMs = 10000, owner = null) {
  const col = db.collection('locks');
  const lockId = owner || `lock-${crypto.randomBytes(8).toString('hex')}`;
  const expiresAt = new Date(Date.now() + ttlMs);
  const now = new Date();

  try {
    // Try to insert a new lock or update expired one atomically
    const result = await col.findOneAndUpdate(
      {
        _id: resourceKey,
        $or: [
          { expiresAt: { $lt: now } }, // Lock expired
          { expiresAt: { $exists: false } } // No lock exists
        ]
      },
      {
        $set: {
          _id: resourceKey,
          owner: lockId,
          expiresAt,
          acquiredAt: new Date()
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    );

    // Check if we successfully acquired the lock
    const acquired = result.value && result.value.owner === lockId;
    
    return {
      acquired,
      lockId: acquired ? lockId : null,
      expiresAt: acquired ? expiresAt : null
    };
  } catch (err) {
    // Handle race condition where another process acquired the lock
    if (err.code === 11000) {
      return { acquired: false, lockId: null };
    }
    throw err;
  }
}

/**
 * Release a distributed lock
 * @param {Object} db - MongoDB database instance
 * @param {string} resourceKey - Unique identifier for the resource
 * @param {string} lockId - Lock ID returned from acquireLock
 */
async function releaseLock(db, resourceKey, lockId) {
  const col = db.collection('locks');
  
  // Only delete if the lock is owned by this lockId
  await col.deleteOne({
    _id: resourceKey,
    owner: lockId
  });
}

/**
 * Execute a function with an exclusive lock
 * @param {Object} db - MongoDB database instance
 * @param {string} resourceKey - Resource to lock
 * @param {Function} fn - Async function to execute
 * @param {number} ttlMs - Lock TTL (default: 10 seconds)
 * @param {number} retries - Number of retry attempts (default: 3)
 * @param {number} retryDelayMs - Delay between retries (default: 500ms)
 */
async function withLock(db, resourceKey, fn, ttlMs = 10000, retries = 3, retryDelayMs = 500) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { acquired, lockId } = await acquireLock(db, resourceKey, ttlMs);

    if (acquired) {
      try {
        const result = await fn();
        await releaseLock(db, resourceKey, lockId);
        return result;
      } catch (err) {
        await releaseLock(db, resourceKey, lockId);
        throw err;
      }
    }

    // Lock not acquired, wait and retry
    lastError = new Error(`Failed to acquire lock for resource: ${resourceKey}`);
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }

  throw lastError;
}

/**
 * Extend an existing lock's expiration time
 * @param {Object} db - MongoDB database instance
 * @param {string} resourceKey - Resource key
 * @param {string} lockId - Lock ID
 * @param {number} additionalMs - Additional milliseconds to extend
 */
async function extendLock(db, resourceKey, lockId, additionalMs = 10000) {
  const col = db.collection('locks');
  const newExpiresAt = new Date(Date.now() + additionalMs);

  const result = await col.updateOne(
    {
      _id: resourceKey,
      owner: lockId,
      expiresAt: { $gte: new Date() } // Ensure lock hasn't expired
    },
    {
      $set: { expiresAt: newExpiresAt }
    }
  );

  return result.modifiedCount > 0;
}

module.exports = {
  acquireLock,
  releaseLock,
  withLock,
  extendLock
};
