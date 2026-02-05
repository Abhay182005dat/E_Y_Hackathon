const Redis = require('ioredis');

let redisClient = null;
let redisSubscriber = null;
let redisPublisher = null;

/**
 * Initialize Redis connection with auto-reconnect
 */
async function connectRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Main client for general operations
    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        }
    });

    // Subscriber client for Redis Streams
    redisSubscriber = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: false
    });

    // Publisher client for Redis Streams
    redisPublisher = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: false
    });

    redisClient.on('connect', () => {
        console.log('✅ Redis: Connected');
    });

    redisClient.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
    });

    redisClient.on('reconnecting', () => {
        console.log('🔄 Redis: Reconnecting...');
    });

    // Wait for connection
    await redisClient.ping();
    console.log('✅ Redis: Ready for chat streaming');
}

/**
 * Get Redis client instance
 */
function getRedis() {
    if (!redisClient) {
        throw new Error('Redis not initialized. Call connectRedis() first.');
    }
    return redisClient;
}

/**
 * Get Redis publisher instance (for streams)
 */
function getRedisPublisher() {
    if (!redisPublisher) {
        throw new Error('Redis publisher not initialized.');
    }
    return redisPublisher;
}

/**
 * Get Redis subscriber instance (for streams)
 */
function getRedisSubscriber() {
    if (!redisSubscriber) {
        throw new Error('Redis subscriber not initialized.');
    }
    return redisSubscriber;
}

// ==================== CHAT SESSION MANAGEMENT ====================

/**
 * Store chat session data
 * @param {string} sessionId - Unique session identifier
 * @param {object} sessionData - Session state data
 * @param {number} ttl - Time to live in seconds (default: 24 hours)
 */
async function setChatSession(sessionId, sessionData, ttl = 86400) {
    const key = `chat:session:${sessionId}`;
    await redisClient.setex(key, ttl, JSON.stringify(sessionData));
}

/**
 * Get chat session data
 * @param {string} sessionId - Session identifier
 * @returns {object|null} Session data or null if not found
 */
async function getChatSession(sessionId) {
    const key = `chat:session:${sessionId}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
}

/**
 * Delete chat session
 * @param {string} sessionId - Session identifier
 */
async function deleteChatSession(sessionId) {
    const key = `chat:session:${sessionId}`;
    await redisClient.del(key);
}

/**
 * Extend chat session TTL
 * @param {string} sessionId - Session identifier
 * @param {number} ttl - New TTL in seconds
 */
async function extendChatSession(sessionId, ttl = 86400) {
    const key = `chat:session:${sessionId}`;
    await redisClient.expire(key, ttl);
}

// ==================== CHAT HISTORY ====================

/**
 * Add message to chat history (using Redis Lists for FIFO)
 * @param {string} sessionId - Session identifier
 * @param {object} message - Message object with role and content
 * @param {number} maxMessages - Maximum messages to keep (default: 50)
 */
async function addChatMessage(sessionId, message, maxMessages = 50) {
    const key = `chat:history:${sessionId}`;
    const msgStr = JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
    });
    
    // Add to list
    await redisClient.rpush(key, msgStr);
    
    // Trim to keep only last N messages
    await redisClient.ltrim(key, -maxMessages, -1);
    
    // Set expiry (24 hours)
    await redisClient.expire(key, 86400);
}

/**
 * Get chat history
 * @param {string} sessionId - Session identifier
 * @param {number} limit - Number of messages to retrieve (default: 50)
 * @returns {Array} Array of message objects
 */
async function getChatHistory(sessionId, limit = 50) {
    const key = `chat:history:${sessionId}`;
    const messages = await redisClient.lrange(key, -limit, -1);
    return messages.map(msg => JSON.parse(msg));
}

/**
 * Clear chat history
 * @param {string} sessionId - Session identifier
 */
async function clearChatHistory(sessionId) {
    const key = `chat:history:${sessionId}`;
    await redisClient.del(key);
}

// ==================== REDIS STREAMS (REAL-TIME EVENTS) ====================

/**
 * Publish chat event to Redis Stream
 * @param {string} sessionId - Session identifier
 * @param {string} eventType - Event type (user_message, bot_response, status_change)
 * @param {object} payload - Event payload
 */
async function publishChatEvent(sessionId, eventType, payload) {
    const streamKey = `chat:stream:${sessionId}`;
    
    await redisPublisher.xadd(
        streamKey,
        'MAXLEN', '~', '1000', // Keep ~1000 messages per stream
        '*', // Auto-generate ID
        'type', eventType,
        'payload', JSON.stringify(payload),
        'timestamp', Date.now()
    );
}

/**
 * Subscribe to chat events (for real-time updates)
 * @param {string} sessionId - Session identifier
 * @param {function} callback - Callback function (eventType, payload) => void
 */
async function subscribeToChatEvents(sessionId, callback) {
    const streamKey = `chat:stream:${sessionId}`;
    let lastId = '0'; // Start from beginning
    
    const pollStream = async () => {
        try {
            // Read new messages from stream
            const results = await redisSubscriber.xread(
                'BLOCK', '5000', // Block for 5 seconds
                'COUNT', '10',
                'STREAMS', streamKey, lastId
            );
            
            if (results && results.length > 0) {
                const [, messages] = results[0];
                
                for (const [id, fields] of messages) {
                    lastId = id;
                    
                    // Parse event data
                    const eventData = {};
                    for (let i = 0; i < fields.length; i += 2) {
                        eventData[fields[i]] = fields[i + 1];
                    }
                    
                    // Call callback with parsed data
                    callback(
                        eventData.type,
                        JSON.parse(eventData.payload),
                        eventData.timestamp
                    );
                }
            }
            
            // Continue polling
            setImmediate(pollStream);
        } catch (err) {
            console.error('Stream polling error:', err);
            // Retry after 2 seconds
            setTimeout(pollStream, 2000);
        }
    };
    
    // Start polling
    pollStream();
}

/**
 * Get chat stream statistics
 * @param {string} sessionId - Session identifier
 * @returns {object} Stream info (length, first/last IDs)
 */
async function getChatStreamInfo(sessionId) {
    const streamKey = `chat:stream:${sessionId}`;
    
    try {
        const info = await redisClient.xinfo('STREAM', streamKey);
        
        // Parse XINFO response
        const parsed = {};
        for (let i = 0; i < info.length; i += 2) {
            parsed[info[i]] = info[i + 1];
        }
        
        return {
            length: parsed.length || 0,
            firstId: parsed['first-entry']?.[0] || null,
            lastId: parsed['last-entry']?.[0] || null
        };
    } catch (err) {
        // Stream doesn't exist yet
        return { length: 0, firstId: null, lastId: null };
    }
}

// ==================== CHAT ANALYTICS ====================

/**
 * Increment chat metric counter
 * @param {string} metric - Metric name (e.g., 'total_messages', 'active_sessions')
 * @param {number} increment - Increment value (default: 1)
 */
async function incrementChatMetric(metric, increment = 1) {
    const key = `chat:metrics:${metric}`;
    await redisClient.incrby(key, increment);
}

/**
 * Get chat metric value
 * @param {string} metric - Metric name
 * @returns {number} Metric value
 */
async function getChatMetric(metric) {
    const key = `chat:metrics:${metric}`;
    const value = await redisClient.get(key);
    return value ? parseInt(value) : 0;
}

/**
 * Track active session
 * @param {string} sessionId - Session identifier
 * @param {number} ttl - TTL in seconds (default: 300 = 5 minutes)
 */
async function trackActiveSession(sessionId, ttl = 300) {
    const key = 'chat:active_sessions';
    await redisClient.setex(`chat:session:active:${sessionId}`, ttl, '1');
}

/**
 * Get count of active sessions
 * @returns {number} Number of active sessions
 */
async function getActiveSessionCount() {
    const keys = await redisClient.keys('chat:session:active:*');
    return keys.length;
}

/**
 * Close Redis connections gracefully
 */
async function closeRedis() {
    if (redisClient) await redisClient.quit();
    if (redisSubscriber) await redisSubscriber.quit();
    if (redisPublisher) await redisPublisher.quit();
    console.log('✅ Redis connections closed');
}

// Handle process termination
process.on('SIGINT', async () => {
    await closeRedis();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeRedis();
    process.exit(0);
});

module.exports = {
    connectRedis,
    getRedis,
    getRedisPublisher,
    getRedisSubscriber,
    closeRedis,
    
    // Chat session management
    setChatSession,
    getChatSession,
    deleteChatSession,
    extendChatSession,
    
    // Chat history
    addChatMessage,
    getChatHistory,
    clearChatHistory,
    
    // Redis Streams
    publishChatEvent,
    subscribeToChatEvents,
    getChatStreamInfo,
    
    // Analytics
    incrementChatMetric,
    getChatMetric,
    trackActiveSession,
    getActiveSessionCount
};
