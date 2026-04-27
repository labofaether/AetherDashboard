const { getDb } = require('../db');
const axios = require('axios');
const LlmUsageModel = require('../models/LlmUsageModel');
const log = require('../utils/logger');

const filterCache = new Map();

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

function heuristicFilter(email) {
    const subject = (email.subject || '').toLowerCase();
    const preview = (email.bodyPreview || '').toLowerCase();
    const from = (email.from || '').toLowerCase();
    const importance = (email.importance || '').toLowerCase();

    if (importance === 'high') {
        return { important: true, reason: 'provider_flagged_high', confidence: 0.9 };
    }

    const hasImportantKeyword = IMPORTANT_KEYWORDS.some(kw =>
        subject.includes(kw) || preview.includes(kw)
    );
    if (hasImportantKeyword) {
        return { important: true, reason: 'keyword_match', confidence: 0.7 };
    }

    const hasUnimportantKeyword = UNIMPORTANT_KEYWORDS.some(kw =>
        subject.includes(kw) || preview.includes(kw) || from.includes(kw)
    );
    if (hasUnimportantKeyword) {
        return { important: false, reason: 'spam_keyword', confidence: 0.8 };
    }

    return { important: null, reason: 'needs_llm', confidence: 0 };
}

function buildFilterPrompt(email) {
    const subject = (email.subject || '(no subject)').substring(0, 100);
    const preview = (email.bodyPreview || '').substring(0, 150);
    const sender = email.fromName || email.from || '(unknown sender)';

    return `CLASSIFY AS IMPORTANT (true/false):
From: ${sender}
Subject: ${subject}
Preview: ${preview}

Only respond with JSON: {"important": true/false}`;
}

async function callLLMForFilter(email) {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages';
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';

    if (!apiKey) {
        log.info('No LLM API key found, using heuristic only');
        return { important: false, reason: 'no_llm_key', confidence: 0.5 };
    }

    const prompt = buildFilterPrompt(email);

    try {
        const apiUrl = baseUrl.includes('/v1/messages') ? baseUrl : `${baseUrl}/v1/messages`;
        const response = await axios.post(apiUrl, {
            model, max_tokens: 50, temperature: 0,
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            }
        });

        const tokensUsed = response.data.usage?.total_tokens || null;
        const content = response.data.content[0]?.text || '';

        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', true, tokensUsed);
                return { important: result.important === true, reason: 'llm_classified', confidence: 0.85 };
            }
        } catch (e) {
            if (content.toLowerCase().includes('true')) {
                LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', true, tokensUsed);
                return { important: true, reason: 'llm_parsed', confidence: 0.7 };
            }
        }

        LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', true, tokensUsed);
        return { important: false, reason: 'llm_fallback', confidence: 0.5 };

    } catch (error) {
        log.error('LLM call failed', { error: error.message });
        LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', false, null);
        return { important: false, reason: 'llm_error', confidence: 0.5 };
    }
}

async function filterEmail(email) {
    const cacheKey = email.providerId || email.id;

    if (cacheKey && filterCache.has(cacheKey)) {
        return filterCache.get(cacheKey);
    }

    let result = heuristicFilter(email);

    if (result.important === null) {
        result = await callLLMForFilter(email);
    }

    if (cacheKey) {
        filterCache.set(cacheKey, result);
        if (filterCache.size > 1000) {
            const firstKey = filterCache.keys().next().value;
            filterCache.delete(firstKey);
        }
    }

    return result;
}

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

async function getImportantEmails(emails) {
    const filtered = await filterEmails(emails);
    return filtered.filter(e => e.important);
}

function saveFilterResults(emailId, result) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM email_filters WHERE emailId = ?').get(emailId);

    if (existing) {
        db.prepare('UPDATE email_filters SET important = ?, reason = ?, confidence = ?, filteredAt = ? WHERE id = ?')
            .run(result.important ? 1 : 0, result.reason, result.confidence, new Date().toISOString(), existing.id);
    } else {
        db.prepare('INSERT INTO email_filters (emailId, important, reason, confidence, filteredAt) VALUES (?, ?, ?, ?, ?)')
            .run(emailId, result.important ? 1 : 0, result.reason, result.confidence, new Date().toISOString());
    }
}

function getCachedFilterResult(emailId) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM email_filters WHERE emailId = ?').get(emailId);
    if (!row) return null;
    return { ...row, important: !!row.important };
}

module.exports = {
    filterEmail,
    filterEmails,
    getImportantEmails,
    heuristicFilter,
    saveFilterResults,
    getCachedFilterResult
};
