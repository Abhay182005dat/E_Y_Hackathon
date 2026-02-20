const { OllamaEmbeddings } = require('@langchain/ollama');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// Load dotenv to get OLLAMA_BASE_URL if set in .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import NLP logic directly to ensure 100% match with server runtime
const { _internal } = require('../server/utils/vectorStore');

// --- Main Generation Script ---
async function generateEmbeddings() {
    console.log('\n🧠 [VectorStore Generator] Starting manual embedding generation...');

    const DATA_DIR = path.join(__dirname, '..', 'data');
    const QUESTIONS_PATH = path.join(DATA_DIR, 'basic_questions.json');
    const CACHE_PATH = path.join(DATA_DIR, 'embeddings_cache.json');
    const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    if (!fs.existsSync(QUESTIONS_PATH)) {
        console.error('❌ Error: basic_questions.json not found at', QUESTIONS_PATH);
        process.exit(1);
    }

    const rawData = fs.readFileSync(QUESTIONS_PATH, 'utf8');
    const questionsData = JSON.parse(rawData);
    const cleanedQuestions = questionsData.map(q => _internal.preprocessText(q.question));
    const currentHash = _internal.getQuestionsHash(questionsData);

    console.log(`✅ Loaded ${questionsData.length} questions from basic_questions.json`);
    console.log('🔄 Connecting to Ollama...');

    let embeddings = new OllamaEmbeddings({
        model: "nomic-embed-text",
        baseUrl: OLLAMA_BASE_URL,
    });

    try {
        await embeddings.embedQuery("test");
        console.log('✅ Connected to Ollama (nomic-embed-text)');
    } catch (e) {
        console.warn('⚠️ nomic-embed-text not responding, falling back to llama3.1...');
        embeddings = new OllamaEmbeddings({ model: "llama3.1", baseUrl: OLLAMA_BASE_URL });
        try {
            await embeddings.embedQuery("test");
            console.log('✅ Connected to Ollama (llama3.1)');
        } catch (e2) {
            console.error('❌ Failed to connect to Ollama. Is it running?');
            process.exit(1);
        }
    }

    console.log(`\n⏳ Generating embeddings for ${cleanedQuestions.length} questions. This may take a while...`);

    try {
        const questionEmbeddings = [];
        const batchSize = 5;

        for (let i = 0; i < cleanedQuestions.length; i += batchSize) {
            const batch = cleanedQuestions.slice(i, i + batchSize);
            console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cleanedQuestions.length / batchSize)}...`);
            const batchEmbeddings = await embeddings.embedDocuments(batch);
            questionEmbeddings.push(...batchEmbeddings);
        }

        fs.writeFileSync(CACHE_PATH, JSON.stringify({
            hash: currentHash,
            embeddings: questionEmbeddings,
            timestamp: new Date().toISOString()
        }, null, 2));

        console.log(`\n🎉 Success! Embeddings generated and cached at:`);
        console.log(`   ${CACHE_PATH}`);
        console.log(`\nThe main server will now load these instantly at startup.`);
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Failed to generate embeddings:', error.message);
        process.exit(1);
    }
}

generateEmbeddings();
