
const axios = require('axios');
require('dotenv').config();

// Ollama API configuration
// Default Ollama endpoint: http://localhost:11434
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b';

/**
 * Call local Ollama model instead of Gemini API.
 * Ollama must be running locally with the specified model pulled.
 * 
 * To set up:
 * 1. Install Ollama: https://ollama.com
 * 2. Pull a model: ollama pull llama3.1
 * 3. Start Ollama (it runs automatically on install)
 */
async function callGemini(prompt) {
    const url = `${OLLAMA_BASE_URL}/api/generate`;

    let retries = 3;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.post(url, {
                model: OLLAMA_MODEL,
                prompt: prompt,
                stream: false
            }, {
                timeout: 60000 // 60 second timeout for local models
            });

            return response.data.response;
        } catch (error) {
            const status = error.response ? error.response.status : undefined;
            const isConnectionError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND';

            if (isConnectionError) {
                console.error(`Ollama not running or unreachable at ${OLLAMA_BASE_URL}`);
                console.error('Make sure Ollama is installed and running. Try: ollama serve');
                throw new Error(`Cannot connect to Ollama at ${OLLAMA_BASE_URL}. Is Ollama running?`);
            }

            if (status === 404) {
                console.error(`Model "${OLLAMA_MODEL}" not found. Pull it with: ollama pull ${OLLAMA_MODEL}`);
                throw new Error(`Model "${OLLAMA_MODEL}" not found. Run: ollama pull ${OLLAMA_MODEL}`);
            }

            if (i < retries - 1) {
                console.log(`Ollama request failed. Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }

            console.error('Error calling Ollama API:', error.response ? error.response.data : error.message);
            throw new Error('Failed to call Ollama API.');
        }
    }
}

module.exports = { callGemini };
