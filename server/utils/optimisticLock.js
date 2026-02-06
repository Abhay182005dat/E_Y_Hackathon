/**
 * Optimistic Locking for Concurrent Updates
 * 
 * Prevents lost updates when multiple admins modify the same document
 * simultaneously. Uses a version field that increments on each update.
 * 
 * Example:
 *   Admin A reads application (version: 1)
 *   Admin B reads application (version: 1)
 *   Admin A updates (version: 1 -> 2) ✅
 *   Admin B tries to update (version: 1) ❌ Conflict detected
 */

const { ObjectId } = require('mongodb');

/**
 * Helper: Check if string is a valid ObjectId format
 * @param {string} id - ID to check
 * @returns {boolean} True if valid ObjectId format
 */
function isValidObjectId(id) {
  if (typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Helper: Convert ID to proper format for MongoDB queries
 * @param {string|ObjectId} id - ID to convert
 * @returns {string|ObjectId} Proper ID format
 */
function toMongoId(id) {
  if (typeof id === 'string' && isValidObjectId(id)) {
    return new ObjectId(id);
  }
  return id; // Return as-is for custom string IDs like "LOAN-12345678"
}

/**
 * Update a document with optimistic locking
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Collection name
 * @param {string|ObjectId} docId - Document ID
 * @param {number} expectedVersion - Expected version number
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} { success: boolean, newVersion: number, conflict: boolean }
 */
async function updateWithVersion(db, collectionName, docId, expectedVersion, updateData) {
  const col = db.collection(collectionName);
  
  // Ensure we don't update version or _id fields
  delete updateData.version;
  delete updateData._id;

  const filter = {
    _id: toMongoId(docId),
    version: expectedVersion
  };

  const update = {
    $set: {
      ...updateData,
      updatedAt: new Date()
    },
    $inc: { version: 1 }
  };

  const result = await col.findOneAndUpdate(
    filter,
    update,
    { returnDocument: 'after' }
  );

  // Handle both null result and null result.value
  if (!result || !result.value) {
    // Check if document exists but version mismatch
    const existing = await col.findOne({ _id: filter._id });
    
    if (!existing) {
      return {
        success: false,
        conflict: false,
        error: 'Document not found'
      };
    }

    return {
      success: false,
      conflict: true,
      currentVersion: existing.version,
      error: `Version conflict: expected ${expectedVersion}, current is ${existing.version}`
    };
  }

  return {
    success: true,
    conflict: false,
    newVersion: result.value.version,
    document: result.value
  };
}

/**
 * Initialize a document with version field
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Collection name
 * @param {Object} docData - Document data
 * @returns {Promise<Object>} Created document with version: 1
 */
async function createWithVersion(db, collectionName, docData) {
  const col = db.collection(collectionName);
  
  const doc = {
    ...docData,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await col.insertOne(doc);
  return {
    ...doc,
    _id: result.insertedId
  };
}

/**
 * Get current version of a document
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Collection name
 * @param {string|ObjectId} docId - Document ID
 * @returns {Promise<number|null>} Current version or null if not found
 */
async function getCurrentVersion(db, collectionName, docId) {
  const col = db.collection(collectionName);
  const doc = await col.findOne(
    { _id: toMongoId(docId) },
    { projection: { version: 1 } }
  );
  
  return doc ? doc.version : null;
}

/**
 * Retry update with optimistic locking (auto-retry on conflict)
 * @param {Object} db - MongoDB database instance
 * @param {string} collectionName - Collection name
 * @param {string|ObjectId} docId - Document ID
 * @param {Function} updateFn - Function that receives current doc and returns update data
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<Object>} Final update result
 */
async function updateWithRetry(db, collectionName, docId, updateFn, maxRetries = 3) {
  const col = db.collection(collectionName);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Fetch latest version
    const current = await col.findOne({
      _id: toMongoId(docId)
    });

    if (!current) {
      // Document not found - may have been deleted during retry
      console.error(`⚠️  Document ${docId} not found during optimistic lock retry ${attempt + 1}`);
      throw new Error(`Document not found: ${docId}`);
    }

    // Verify document has version field
    if (typeof current.version !== 'number') {
      console.error(`⚠️  Document ${docId} missing version field`);
      throw new Error(`Document ${docId} is not versionable (missing version field)`);
    }

    // Generate update data based on current state
    const updateData = await updateFn(current);

    // Try to update with current version
    const result = await updateWithVersion(
      db,
      collectionName,
      docId,
      current.version,
      updateData
    );

    if (result.success) {
      return result;
    }

    if (!result.conflict) {
      throw new Error(result.error);
    }

    // Conflict detected, retry
    if (attempt === maxRetries) {
      throw new Error(`Update failed after ${maxRetries} retries due to version conflicts`);
    }

    // Exponential backoff with random jitter: 200ms, 400ms, 800ms, 1600ms, 3200ms (capped at 3s)
    const baseBackoff = Math.min(3000, 200 * Math.pow(2, attempt));
    const jitter = Math.random() * 200; // Add 0-200ms random jitter
    const backoffMs = Math.floor(baseBackoff + jitter);
    console.log(`⚠️  Version conflict on ${collectionName}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
    await new Promise(resolve => setTimeout(resolve, backoffMs));
  }
}

/**
 * Middleware to add version field to existing documents
 * Run once to migrate existing data
 */
async function migrateToVersioned(db, collectionName) {
  const col = db.collection(collectionName);
  
  const result = await col.updateMany(
    { version: { $exists: false } },
    {
      $set: {
        version: 1,
        updatedAt: new Date()
      }
    }
  );

  console.log(`✅ Migrated ${result.modifiedCount} documents in ${collectionName} to versioned`);
  return result.modifiedCount;
}

module.exports = {
  updateWithVersion,
  createWithVersion,
  getCurrentVersion,
  updateWithRetry,
  migrateToVersioned
};
