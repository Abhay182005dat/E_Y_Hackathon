const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) throw new Error('MONGO_URI environment variable is required');

const client = new MongoClient(uri, {
  maxPoolSize: parseInt(process.env.DB_POOL_MAX || '50', 10), // Increased for 1000+ admins
  minPoolSize: 10,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

let _db = null;
let isConnecting = false;

/**
 * Connect to MongoDB and initialize indexes for high-concurrency operations
 */
async function connectDB() {
  if (_db) return { client, db: _db };
  if (isConnecting) {
    // Wait for existing connection attempt
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return { client, db: _db };
  }

  isConnecting = true;
  try {
    await client.connect();
    _db = client.db(process.env.MONGO_DB_NAME || 'eyhackathon');

    console.log('✅ MongoDB connected:', _db.databaseName);

    // Create indexes for distributed locks (TTL for auto-cleanup)
    await _db.collection('locks').createIndex(
      { expiresAt: 1 }, 
      { expireAfterSeconds: 0 }
    );

    // Create indexes for event queue (worker pattern)
    await _db.collection('events').createIndex(
      { type: 1, processed: 1, createdAt: 1 }
    );
    await _db.collection('events').createIndex(
      { lockedUntil: 1 }
    );

    // Create indexes for sessions (connect-mongo uses this)
    await _db.collection('sessions').createIndex(
      { expires: 1 }, 
      { expireAfterSeconds: 0 }
    );

    // Create compound indexes for high-traffic admin queries
    await _db.collection('applications').createIndex(
      { status: 1, createdAt: -1 }
    );
    await _db.collection('applications').createIndex(
      { userId: 1, status: 1 }
    );
    await _db.collection('applications').createIndex(
      { assignedAdmin: 1, status: 1 }
    );

    // Index for optimistic locking version field
    await _db.collection('applications').createIndex({ version: 1 });
    await _db.collection('loan_offers').createIndex({ version: 1 });

    console.log('✅ Database indexes created');

    isConnecting = false;
    return { client, db: _db };
  } catch (err) {
    isConnecting = false;
    throw err;
  }
}

/**
 * Get the active database connection
 */
function getDB() {
  if (!_db) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return _db;
}

/**
 * Close database connection gracefully
 */
async function closeDB() {
  if (client) {
    await client.close();
    _db = null;
    console.log('MongoDB connection closed');
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDB();
  process.exit(0);
});

module.exports = { connectDB, getDB, closeDB, client };
