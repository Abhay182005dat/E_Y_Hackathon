/**
 * Vector Store for Basic Questions
 * 
 * NLP Pipeline: Tokenize → Spell Correct → Remove Stop Words → Strip Symbols
 * → Embed cleaned tokens → Cosine Similarity matching
 * 
 * CACHING: Embeddings saved to data/embeddings_cache.json.
 * Only recomputed when basic_questions.json changes (MD5 hash check).
 * Ollama connection is LAZY (deferred to first search query).
 */

const { OllamaEmbeddings } = require('@langchain/ollama');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const SIMILARITY_THRESHOLD = 0.74; // Increased to avoid "need a loan" matching "prepay loan"

// Paths
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const QUESTIONS_PATH = path.join(DATA_DIR, 'basic_questions.json');
const CACHE_PATH = path.join(DATA_DIR, 'embeddings_cache.json');

let embeddings = null;
let embeddingsReady = false;
let embeddingsInitPromise = null;
let questionsData = [];
let questionEmbeddings = [];
let cleanedQuestions = []; // preprocessed question strings
let needsEmbedding = false;

// ==================== NLP PREPROCESSING ====================

/**
 * English stop words to remove before embedding
 */
const STOP_WORDS = new Set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
    'you', 'your', 'yours', 'yourself', 'yourselves',
    'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
    'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as',
    'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about',
    'against', 'between', 'through', 'during', 'before', 'after',
    'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
    'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
    'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
    'would', 'could', 'shall', 'may', 'might', 'must',
    'please', 'tell', 'give', 'get', 'show', 'let'
]);

/**
 * Common misspelling corrections for banking/loan domain
 */
const SPELL_CORRECTIONS = {
    // Loan-related
    'intrst': 'interest', 'intrest': 'interest', 'interset': 'interest',
    'intreest': 'interest', 'interst': 'interest',
    'loanamount': 'loan amount', 'loanamt': 'loan amount',
    'amt': 'amount', 'amnt': 'amount', 'amout': 'amount', 'ammount': 'amount',
    'repyment': 'repayment', 'repament': 'repayment',
    'emi': 'emi', 'emis': 'emi',
    'prepyment': 'prepayment', 'prepay': 'prepayment',
    'tennure': 'tenure', 'tenur': 'tenure', 'tenuree': 'tenure',
    'apprvd': 'approved', 'aproved': 'approved', 'appoved': 'approved',
    'elgible': 'eligible', 'eligble': 'eligible', 'eligibel': 'eligible',
    'disbrse': 'disburse', 'disburs': 'disburse', 'disbursmnt': 'disbursement',
    'forclose': 'foreclose', 'forclosure': 'foreclosure',
    'crdit': 'credit', 'cradit': 'credit', 'credt': 'credit',
    'cibil': 'credit score', 'cibel': 'credit score',
    // Personal
    'nam': 'name', 'namee': 'name',
    'salry': 'salary', 'sallary': 'salary', 'salari': 'salary', 'slary': 'salary',
    'phne': 'phone', 'phone no': 'phone', 'mobileno': 'phone',
    'accnt': 'account', 'acnt': 'account', 'acount': 'account', 'acconut': 'account',
    'adhar': 'aadhaar', 'aadhar': 'aadhaar', 'adhaar': 'aadhaar', 'adhr': 'aadhaar',
    // Process
    'staus': 'status', 'statues': 'status', 'sttus': 'status',
    'aplcation': 'application', 'aplication': 'application', 'appln': 'application',
    'vrify': 'verify', 'verfiy': 'verify', 'varify': 'verify',
    'documnt': 'document', 'docmnt': 'document', 'docs': 'document',
    'kyc': 'kyc verification',
    'mney': 'money', 'mony': 'money',
    'whn': 'when', 'hw': 'how', 'wht': 'what',
    'pls': 'please', 'plz': 'please',
    'ur': 'your', 'u': 'you', 'r': 'are',
    'wat': 'what', 'whts': 'what',
    // Rate
    'rt': 'rate', 'rat': 'rate',
    'prcentage': 'percentage', 'percnt': 'percentage',
    'mnthly': 'monthly', 'montly': 'monthly',
    'anual': 'annual', 'anualy': 'annually',
    'maximm': 'maximum', 'max': 'maximum', 'maxm': 'maximum',
    'minimm': 'minimum', 'min': 'minimum', 'minm': 'minimum'
};

/**
 * Step 1: Strip symbols, punctuation, and special characters.
 * Keeps only alphanumeric and spaces.
 */
function stripSymbols(text) {
    return text
        .replace(/₹/g, ' ')        // Remove rupee symbol
        .replace(/%/g, ' percent ') // Convert % to word
        .replace(/[^\w\s]/g, ' ')   // Remove all non-alphanumeric except spaces
        .replace(/\d+/g, (num) => num) // Keep numbers as-is
        .replace(/\s+/g, ' ')       // Collapse multiple spaces
        .trim();
}

/**
 * Step 2: Tokenize — split text into individual word tokens
 */
function tokenize(text) {
    return text.toLowerCase().split(/\s+/).filter(t => t.length > 0);
}

/**
 * Step 3: Spell correction using domain dictionary
 */
function spellCorrect(tokens) {
    return tokens.map(token => SPELL_CORRECTIONS[token] || token);
}

/**
 * Step 4: Remove stop words
 */
function removeStopWords(tokens) {
    const filtered = tokens.filter(t => !STOP_WORDS.has(t) && t.length > 1);
    // If everything was filtered out, keep original (safety)
    return filtered.length > 0 ? filtered : tokens;
}

/**
 * Full NLP preprocessing pipeline:
 * Raw text → strip symbols → tokenize → spell correct → remove stop words → rejoin
 */
function preprocessText(text) {
    const stripped = stripSymbols(text);
    let tokens = tokenize(stripped);
    tokens = spellCorrect(tokens);
    // Spell correction might produce multi-word replacements, re-tokenize
    tokens = tokens.flatMap(t => t.split(/\s+/));
    tokens = removeStopWords(tokens);
    return tokens.join(' ');
}

// ==================== VECTOR MATH ====================

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
}

// ==================== INITIALIZATION ====================

/**
 * Calculate MD5 hash of questions to check for changes
 */
function getQuestionsHash(questions) {
    return crypto.createHash('md5').update(JSON.stringify(questions)).digest('hex');
}

/**
 * Load embeddings from cache file if valid, otherwise generate new ones
 */
async function loadOrGenerateEmbeddings() {
    try {
        if (!fs.existsSync(QUESTIONS_PATH)) {
            console.error('❌ Questions file not found:', QUESTIONS_PATH);
            return false;
        }

        const rawData = fs.readFileSync(QUESTIONS_PATH, 'utf8');
        questionsData = JSON.parse(rawData);

        // Pre-process questions
        cleanedQuestions = questionsData.map(q => preprocessText(q.question));
        const currentHash = getQuestionsHash(questionsData);

        // Try to load cache
        if (fs.existsSync(CACHE_PATH)) {
            try {
                const cacheRaw = fs.readFileSync(CACHE_PATH, 'utf8');
                const cacheData = JSON.parse(cacheRaw);

                if (cacheData.hash === currentHash && cacheData.embeddings.length === questionsData.length) {
                    console.log('✅ [VectorStore] Loaded embeddings from cache (Fast Startup)');
                    questionEmbeddings = cacheData.embeddings;
                    embeddingsReady = true;
                    return true;
                } else {
                    console.log('info: Questions changed, regenerating embeddings...');
                }
            } catch (err) {
                console.warn('⚠️  Cache file corrupted, regenerating...');
            }
        }

        // Initialize Ollama
        console.log('🔄 [VectorStore] Connecting to Ollama (may take a moment)...');
        embeddings = new OllamaEmbeddings({
            model: "nomic-embed-text", // Prefer faster model
            baseUrl: OLLAMA_BASE_URL,
            requestOptions: {
                timeout: 30000 // 30s timeout
            }
        });

        // Test connection with fallback
        try {
            await embeddings.embedQuery("test");
        } catch (e) {
            console.warn('⚠️  nomic-embed-text not found, falling back to llama3.1');
            embeddings = new OllamaEmbeddings({
                model: "llama3.1",
                baseUrl: OLLAMA_BASE_URL,
            });
        }

        // Generate embeddings in batches to show progress
        console.log(`🔄 [VectorStore] Generating embeddings for ${cleanedQuestions.length} questions...`);
        questionEmbeddings = [];

        // Process in batches of 5
        const batchSize = 5;
        for (let i = 0; i < cleanedQuestions.length; i += batchSize) {
            const batch = cleanedQuestions.slice(i, i + batchSize);
            const batchEmbeddings = await embeddings.embedDocuments(batch);
            questionEmbeddings.push(...batchEmbeddings);
        }

        // Save to cache
        fs.writeFileSync(CACHE_PATH, JSON.stringify({
            hash: currentHash,
            embeddings: questionEmbeddings,
            timestamp: new Date().toISOString()
        }, null, 2));

        console.log('✅ [VectorStore] Embeddings generated and cached.');
        embeddingsReady = true;
        return true;

    } catch (error) {
        console.error('❌ [VectorStore] Initialization failed:', error.message);
        return false;
    }
}

/**
 * Initialize (Non-blocking wrapper)
 */
async function initializeVectorStore() {
    // Start initialization in background
    loadOrGenerateEmbeddings()
        .then(success => {
            if (success) console.log('✅ [VectorStore] Background initialization complete.');
            else console.warn('⚠️  [VectorStore] Background initialization failed/skewed.');
        })
        .catch(err => {
            console.error('❌ [VectorStore] Background initialization crashed:', err.message);
        });

    return true; // Return immediately to avoid blocking server start
}

// ==================== SEARCH ====================

/**
 * Search for a matching FAQ using preprocessed token embeddings.
 * 
 * Pipeline: User query → preprocess → embed → cosine similarity → best match
 */
async function searchBasicQuestions(query) {
    if (questionsData.length === 0) return null;

    try {
        // Wait for background initialization to finish if it hasn't already
        if (embeddingsInitPromise) {
            await embeddingsInitPromise;
        }

        if (!embeddingsReady || questionEmbeddings.length === 0) {
            console.warn('⚠️  VectorStore not initialized. FAQ will fallback to LLM.');
            return null;
        }

        // Preprocess the user query through same pipeline
        const cleanedQuery = preprocessText(query);
        console.log(`[NLP] Raw: "${query}" → Cleaned: "${cleanedQuery}"`);

        // Embed the cleaned query
        const queryEmbedding = await embeddings.embedQuery(cleanedQuery);

        // Find best cosine similarity match
        let bestScore = -1;
        let bestIndex = -1;

        for (let i = 0; i < questionEmbeddings.length; i++) {
            const similarity = cosineSimilarity(queryEmbedding, questionEmbeddings[i]);
            if (similarity > bestScore) {
                bestScore = similarity;
                bestIndex = i;
            }
        }

        const matchedQ = questionsData[bestIndex]?.question || '?';
        const cleanedMatchQ = cleanedQuestions[bestIndex] || '?';
        console.log(`[VectorSearch] "${cleanedQuery}" → "${cleanedMatchQ}" (${bestScore.toFixed(3)}) [original: "${matchedQ}"]`);

        if (bestScore >= SIMILARITY_THRESHOLD && bestIndex >= 0) {
            return {
                question: matchedQ,
                answer: questionsData[bestIndex].answer,
                score: bestScore
            };
        }

        return null;
    } catch (error) {
        console.error('[VectorSearch] Error:', error.message);
        return null;
    }
}

/**
 * Replace template placeholders in the answer with actual user data.
 */
function fillAnswerTemplate(answer, userData = {}) {
    const replacements = {
        '{name}': userData.name || 'Customer',
        '{loanAmount}': (parseInt(userData.loanAmount) || 500000).toLocaleString(),
        '{interestRate}': userData.interestRate || userData.currentRate || '12',
        '{creditScore}': userData.creditScore || userData.score || 'N/A',
        '{preApprovedLimit}': (parseInt(userData.preApprovedLimit) || 500000).toLocaleString(),
        '{maxEMI}': (parseInt(userData.maxEMI) || 25000).toLocaleString(),
        '{monthlySalary}': (parseInt(userData.monthlySalary) || 50000).toLocaleString(),
        '{phone}': userData.phone || 'N/A',
        '{accountNumber}': userData.accountNumber || 'N/A',
        '{loanPurpose}': userData.loanPurpose || 'Personal',
        '{city}': userData.city || 'N/A',
    };

    let filledAnswer = answer;
    for (const [placeholder, value] of Object.entries(replacements)) {
        filledAnswer = filledAnswer.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
    }

    return filledAnswer;
}

// Export for server use
module.exports = {
    initializeVectorStore,
    searchBasicQuestions,
    fillAnswerTemplate,

    // Exported for standalone script use (generate_embeddings.js)
    _internal: {
        preprocessText,
        getQuestionsHash
    }
};
