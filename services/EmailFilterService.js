/**
 * Token-efficient AI Email Filtering Service
 * Uses minimal tokens by:
 * - Only sending subject + short preview (not full body)
 * - Concise prompt with binary output
 * - Caching results
 */

const { readDB, writeDB } = require('../db');
const axios = require('axios');
const LlmUsageModel = require('../models/LlmUsageModel');

// Cache to avoid re-filtering the same email
const filterCache = new Map();

// Important keywords for quick heuristic filtering (token-free)
const IMPORTANT_KEYWORDS = [
    'urgent', 'asap', 'important', 'critical', 'priority',
    'meeting', 'deadline', 'action required', 'please review',
    'question', 'help needed', 'could you', 'would you',
    'invoice', 'payment', 'contract', 'agreement',
    'interview', 'offer', 'hire', 'job',
    'emergency', 'problem', 'issue', 'error',
    '@me', 'mentioned you', 'assigned to you'
];

const UNIMPORTANT_KEYWORDS = [
    'newsletter', 'promotion', 'discount', 'sale', 'deal',
    'unsubscribe', 'marketing', 'spam', 'junk',
    'daily digest', 'weekly update', 'monthly report',
    'no-reply', 'donotreply', 'noreply',
    'you might also like', 'recommended for you',
    'thank you for your order', 'your order has shipped'
];

/**
 * Quick heuristic check (token-free) to avoid unnecessary LLM calls
 */
function heuristicFilter(email) {
    const subject = (email.subject || '').toLowerCase();
    const preview = (email.bodyPreview || '').toLowerCase();
    const from = (email.from || '').toLowerCase();
    const importance = (email.importance || '').toLowerCase();

    // High priority from email provider
    if (importance === 'high') {
        return { important: true, reason: 'provider_flagged_high', confidence: 0.9 };
    }

    // Check for obvious important patterns
    const hasImportantKeyword = IMPORTANT_KEYWORDS.some(kw =>
        subject.includes(kw) || preview.includes(kw)
    );

    if (hasImportantKeyword) {
        return { important: true, reason: 'keyword_match', confidence: 0.7 };
    }

    // Check for obvious unimportant patterns
    const hasUnimportantKeyword = UNIMPORTANT_KEYWORDS.some(kw =>
        subject.includes(kw) || preview.includes(kw) || from.includes(kw)
    );

    if (hasUnimportantKeyword) {
        return { important: false, reason: 'spam_keyword', confidence: 0.8 };
    }

    // Uncertain - needs LLM judgment
    return { important: null, reason: 'needs_llm', confidence: 0 };
}

/**
 * Build a minimal, token-efficient prompt for LLM
 */
function buildFilterPrompt(email) {
    const subject = (email.subject || '(no subject)').substring(0, 100);
    const preview = (email.bodyPreview || '').substring(0, 150);
    const sender = email.fromName || email.from || '(unknown sender)';

    // Extremely concise prompt - uses minimal tokens
    return `CLASSIFY AS IMPORTANT (true/false):
From: ${sender}
Subject: ${subject}
Preview: ${preview}

Only respond with JSON: {"important": true/false}`;
}

/**
 * Call LLM to filter email (token-efficient)
 */
async function callLLMForFilter(email) {
    // Check if we have API config in env
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages';
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-20240307';

    if (!apiKey) {
        console.log('No LLM API key found, using heuristic only');
        return { important: false, reason: 'no_llm_key', confidence: 0.5 };
    }

    const prompt = buildFilterPrompt(email);

    let success = false;
    let tokensUsed = null;

    try {
        // Using Volcano Engine Ark (Doubao) or Anthropic API
        const apiUrl = baseUrl.includes('/v1/messages') ? baseUrl : `${baseUrl}/v1/messages`;

        const response = await axios.post(apiUrl, {
            model: model,
            max_tokens: 50, // Minimal output
            temperature: 0,
            messages: [{
                role: 'user',
                content: prompt
            }]
        }, {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            }
        });

        success = true;
        tokensUsed = response.data.usage?.total_tokens || null;

        const content = response.data.content[0]?.text || '';

        // Parse the response
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', true, tokensUsed);
                return {
                    important: result.important === true,
                    reason: 'llm_classified',
                    confidence: 0.85
                };
            }
        } catch (e) {
            // Fallback: look for true/false
            if (content.toLowerCase().includes('true')) {
                LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', true, tokensUsed);
                return { important: true, reason: 'llm_parsed', confidence: 0.7 };
            }
        }

        LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', true, tokensUsed);
        return { important: false, reason: 'llm_fallback', confidence: 0.5 };

    } catch (error) {
        console.error('LLM call failed:', error.message);
        LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', false, null);
        return { important: false, reason: 'llm_error', confidence: 0.5 };
    }
}

/**
 * Main filter function - combines heuristic + LLM
 */
async function filterEmail(email) {
    const cacheKey = email.providerId || email.id;

    // Check cache first
    if (cacheKey && filterCache.has(cacheKey)) {
        return filterCache.get(cacheKey);
    }

    // First try heuristic (token-free)
    let result = heuristicFilter(email);

    // If uncertain and not cached, use LLM
    if (result.important === null) {
        result = await callLLMForFilter(email);
    }

    // Cache the result
    if (cacheKey) {
        filterCache.set(cacheKey, result);

        // Limit cache size
        if (filterCache.size > 1000) {
            const firstKey = filterCache.keys().next().value;
            filterCache.delete(firstKey);
        }
    }

    return result;
}

/**
 * Batch filter emails (optimized)
 */
async function filterEmails(emails) {
    const results = [];

    for (const email of emails) {
        const result = await filterEmail(email);
        results.push({
            ...email,
            important: result.important,
            filterReason: result.reason,
            filterConfidence: result.confidence
        });
    }

    return results;
}

/**
 * Get important emails only
 */
async function getImportantEmails(emails) {
    const filtered = await filterEmails(emails);
    return filtered.filter(e => e.important);
}

/**
 * Persist filter results to database
 */
function saveFilterResults(emailId, result) {
    const db = readDB();
    const existing = db.emailFilters?.find(f => f.emailId === emailId);

    const filterEntry = {
        emailId,
        important: result.important,
        reason: result.reason,
        confidence: result.confidence,
        filteredAt: new Date().toISOString()
    };

    if (existing) {
        Object.assign(existing, filterEntry);
    } else {
        if (!db.emailFilters) db.emailFilters = [];
        db.emailFilters.push(filterEntry);
    }

    writeDB(db);
}

/**
 * Get cached filter result from database
 */
function getCachedFilterResult(emailId) {
    const db = readDB();
    return db.emailFilters?.find(f => f.emailId === emailId);
}

module.exports = {
    filterEmail,
    filterEmails,
    getImportantEmails,
    heuristicFilter,
    saveFilterResults,
    getCachedFilterResult
};
