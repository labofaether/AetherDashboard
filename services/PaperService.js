/**
 * Paper Service
 * Fetches papers from arXiv, filters with LLM, and manages daily paper selection
 */

const axios = require('axios');
const PaperModel = require('../models/PaperModel');
const paperConfig = require('../config/paperCategories');
const LlmUsageModel = require('../models/LlmUsageModel');
const log = require('../utils/logger');
const { todayLocal } = require('../utils/dateRange');

/**
 * Simple XML parser for arXiv responses (no external dependencies)
 */
function parseArxivXml(xml) {
    const papers = [];

    // Handle XML namespaces - remove them for easier parsing
    const cleanXml = xml
        .replace(/<(\/?)[^:>]+:/g, '<$1')  // Remove namespace prefixes like <feed: -> <
        .replace(/\s+xmlns="[^"]+"/g, '')   // Remove xmlns attributes
        .replace(/\s+xmlns:[^=]+="[^"]+"/g, '');

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let entryMatch;

    while ((entryMatch = entryRegex.exec(cleanXml)) !== null) {
        const entry = entryMatch[1];

        // Extract fields using regex (more flexible)
        const idMatch = entry.match(/<id>([^<]+)<\/id>/);
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
        const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
        const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/);

        // Extract authors
        const authors = [];
        const authorRegex = /<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/g;
        let authorMatch;
        while ((authorMatch = authorRegex.exec(entry)) !== null) {
            authors.push(authorMatch[1]);
        }

        // Extract categories - handle both namespace formats
        const categories = [];
        const categoryRegex = /<category\s+[^>]*term="([^"]+)"/g;
        let categoryMatch;
        while ((categoryMatch = categoryRegex.exec(entry)) !== null) {
            categories.push(categoryMatch[1]);
        }

        // Also try primary_category
        const primaryCatMatch = entry.match(/<primary_category\s+[^>]*term="([^"]+)"/);
        if (primaryCatMatch && !categories.includes(primaryCatMatch[1])) {
            categories.unshift(primaryCatMatch[1]);
        }

        const paper = {
            arxivId: idMatch ? idMatch[1].replace('http://arxiv.org/abs/', '').replace('https://arxiv.org/abs/', '') : '',
            title: titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '',
            abstract: summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '',
            authors: authors,
            publishedAt: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
            updatedAt: updatedMatch ? updatedMatch[1] : new Date().toISOString(),
            url: idMatch ? idMatch[1] : '',
            categories: categories
        };

        if (paper.title && paper.arxivId) {
            papers.push(paper);
        }
    }

    return papers;
}

// Cache for arXiv API results to avoid excessive calls
const arxivCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Sample papers as fallback when arXiv is unavailable
const SAMPLE_PAPERS = {
    ai: [
        {
            arxivId: '2401.00001v1',
            title: 'Efficient Transformer Architecture for Edge Devices',
            abstract: 'We present a novel transformer architecture optimized for edge deployment with 50% fewer parameters while maintaining 95% accuracy on ImageNet. Our approach introduces sparse attention patterns and knowledge distillation techniques.',
            authors: ['Jane Smith', 'John Doe'],
            publishedAt: new Date(Date.now() - 86400000).toISOString(),
            updatedAt: new Date().toISOString(),
            url: 'https://arxiv.org/abs/2401.00001v1',
            categories: ['cs.AI', 'cs.LG']
        },
        {
            arxivId: '2401.00002v1',
            title: 'Self-Supervised Learning for Computer Vision',
            abstract: 'This work proposes a new self-supervised learning framework that achieves state-of-the-art performance on downstream tasks by leveraging contrastive learning with novel data augmentation strategies.',
            authors: ['Alex Chen', 'Sarah Johnson'],
            publishedAt: new Date(Date.now() - 172800000).toISOString(),
            updatedAt: new Date().toISOString(),
            url: 'https://arxiv.org/abs/2401.00002v1',
            categories: ['cs.CV', 'cs.LG']
        }
    ],
    network: [
        {
            arxivId: '2401.00003v1',
            title: 'High-Performance Routing Protocol for Data Centers',
            abstract: 'We introduce a new routing protocol that reduces latency by 40% in data center networks through intelligent path selection and congestion control mechanisms.',
            authors: ['Mike Wilson', 'Emily Brown'],
            publishedAt: new Date(Date.now() - 259200000).toISOString(),
            updatedAt: new Date().toISOString(),
            url: 'https://arxiv.org/abs/2401.00003v1',
            categories: ['cs.NI']
        }
    ],
    iot: [
        {
            arxivId: '2401.00004v1',
            title: 'Low-Power Communication Protocol for IoT Sensors',
            abstract: 'This paper presents an energy-efficient communication protocol for IoT devices that extends battery life by 3x through adaptive duty cycling and optimized data aggregation.',
            authors: ['David Lee', 'Lisa Wang'],
            publishedAt: new Date(Date.now() - 345600000).toISOString(),
            updatedAt: new Date().toISOString(),
            url: 'https://arxiv.org/abs/2401.00004v1',
            categories: ['cs.OS', 'cs.ET']
        }
    ]
};

/**
 * Fetch papers from arXiv API for a specific category
 */
async function fetchPapersFromArxiv(arxivCategories, maxResults = 20) {
    const cacheKey = arxivCategories.join('+');
    const cached = arxivCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        log.info(`Using cached papers for ${arxivCategories.join(',')}`);
        return cached.papers;
    }

    try {
        // Build arXiv query - OR between categories, use space for OR
        const categoryQuery = arxivCategories.map(cat => `cat:${cat}`).join(' OR ');

        // Calculate date range (last N hours)
        const lookbackMs = paperConfig.arxiv.lookbackHours * 60 * 60 * 1000;
        const lookbackDate = new Date(Date.now() - lookbackMs);

        log.info(`Fetching from arXiv: categories=${arxivCategories.join(',')}, lookback=${paperConfig.arxiv.lookbackHours}h`);
        log.info(`Query: ${categoryQuery}`);

        // Build URL manually for better control over encoding
        const queryString = [
            `search_query=${encodeURIComponent(categoryQuery)}`,
            `start=0`,
            `max_results=${maxResults}`,
            `sortBy=submittedDate`,
            `sortOrder=descending`
        ].join('&');

        const url = `${paperConfig.arxiv.baseUrl}?${queryString}`;
        log.info(`Request URL: ${url}`);

        const response = await axios.get(url, {
            timeout: paperConfig.arxiv.timeout
        });

        log.info(`arXiv API responded with status: ${response.status}`);

        // Parse XML response with custom parser
        const papers = parseArxivXml(response.data);

        log.info(`Parsed ${papers.length} papers from XML`);

        // Filter by date (only keep papers from lookback period)
        let recentPapers = papers.filter(p => {
            const pubDate = new Date(p.publishedAt);
            return pubDate >= lookbackDate;
        });

        // If too few papers, relax the date filter
        if (recentPapers.length < 5 && papers.length > 0) {
            log.info(`Only ${recentPapers.length} papers in date range, relaxing filter to use all ${papers.length} papers`);
            recentPapers = papers;
        }

        log.info(`Using ${recentPapers.length} papers for evaluation`);

        // Cache the results
        arxivCache.set(cacheKey, {
            papers: recentPapers,
            timestamp: Date.now()
        });

        // Limit cache size
        if (arxivCache.size > 20) {
            const firstKey = arxivCache.keys().next().value;
            arxivCache.delete(firstKey);
        }

        return recentPapers;

    } catch (error) {
        log.error('Error fetching from arXiv:', error.message);
        if (error.response) {
            log.error('arXiv API response:', error.response.status, error.response.data);
        }

        // Fallback to sample papers if arXiv is unavailable
        log.info('Falling back to sample papers');
        const fallbackPapers = [];

        // Add sample papers matching the requested categories
        for (const cat of arxivCategories) {
            if (cat.startsWith('cs.AI') || cat.startsWith('cs.LG') || cat.startsWith('cs.CL') ||
                cat.startsWith('cs.CV') || cat.startsWith('cs.NE') || cat.startsWith('cs.RO')) {
                fallbackPapers.push(...SAMPLE_PAPERS.ai);
            } else if (cat.startsWith('cs.NI') || cat.startsWith('cs.MA') || cat.startsWith('cs.DC')) {
                fallbackPapers.push(...SAMPLE_PAPERS.network);
            } else if (cat.startsWith('cs.OS') || cat.startsWith('cs.ET') || cat.startsWith('cs.SY')) {
                fallbackPapers.push(...SAMPLE_PAPERS.iot);
            }
        }

        // Remove duplicates and limit
        const uniquePapers = [];
        const seen = new Set();
        for (const p of fallbackPapers) {
            if (!seen.has(p.arxivId)) {
                seen.add(p.arxivId);
                uniquePapers.push(p);
            }
        }

        log.info(`Using ${uniquePapers.length} sample papers as fallback`);
        return uniquePapers.slice(0, maxResults);
    }
}

/**
 * Build LLM prompt for paper evaluation
 */
function buildPaperEvaluationPrompt(paper, category) {
    const title = paper.title.substring(0, 150);
    const abstract = paper.abstract.substring(0, 400);
    const categoryName = paperConfig.categories[category]?.displayName || category;

    return `Evaluate if this ${categoryName} paper is worth pushing (focus on the technology itself, not applications).

Paper info:
Title: ${title}
Category: ${categoryName}
Abstract: ${abstract}

Requirements:
- Only push papers about AI/Network/IoT technology itself
- Exclude applications like AI for Science/medical/finance
- Value method innovation, performance improvement, theoretical breakthrough

Respond with JSON only:
{"worthPushing": true/false, "reason": "brief reason", "innovation": "key innovation", "summary": "brief summary"}`;
}

/**
 * Simple heuristic filter when no LLM key is available
 */
function heuristicPaperFilter(paper, category) {
    const title = paper.title.toLowerCase();
    const abstract = paper.abstract.toLowerCase();

    // Positive indicators
    const positiveTerms = [
        'novel', 'new', 'improved', 'efficient', 'optimization',
        'algorithm', 'method', 'architecture', 'framework',
        'neural network', 'transformer', 'attention', 'gradient',
        'protocol', 'routing', 'congestion', 'throughput', 'latency',
        'distributed', 'consensus', 'synchronization', 'edge computing',
        'embedded', 'sensor', 'low-power', 'real-time'
    ];

    // Negative indicators (application-focused)
    const negativeTerms = [
        'medical', 'healthcare', 'clinical', 'biology', 'genomics',
        'protein', 'molecule', 'drug', 'finance', 'stock',
        'economics', 'social', 'humanities', 'survey', 'review'
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const term of positiveTerms) {
        if (title.includes(term) || abstract.includes(term)) {
            positiveCount++;
        }
    }

    for (const term of negativeTerms) {
        if (title.includes(term) || abstract.includes(term)) {
            negativeCount++;
        }
    }

    const worthPushing = positiveCount > 0 && negativeCount === 0;

    return {
        worthPushing: worthPushing,
        reason: worthPushing ? `heuristic_match_${positiveCount}` : 'heuristic_filtered',
        innovation: '',
        summary: paper.abstract.substring(0, 120)
    };
}

/**
 * Call LLM to evaluate a paper
 */
async function evaluatePaperWithLLM(paper, category) {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages';
    const model = paperConfig.llm.model;

    if (!apiKey) {
        log.info('No LLM API key found, using heuristic filter');
        const heuristicResult = heuristicPaperFilter(paper, category);
        log.info(`  Heuristic: "${paper.title.substring(0, 50)}..." -> ${heuristicResult.worthPushing}`);
        return heuristicResult;
    }

    const prompt = buildPaperEvaluationPrompt(paper, category);

    try {
        // Using Volcano Engine Ark (Doubao) or Anthropic API - exactly like EmailFilterService
        const apiUrl = baseUrl.includes('/v1/messages') ? baseUrl : `${baseUrl}/v1/messages`;

        const response = await axios.post(apiUrl, {
            model: model,
            max_tokens: paperConfig.llm.maxTokens,
            temperature: paperConfig.llm.temperature,
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

        const tokensUsed = response.data.usage?.total_tokens || null;
        const content = response.data.content[0]?.text || '';

        log.info(`  LLM response for "${paper.title.substring(0, 40)}...":`, content.substring(0, 100));

        // Parse JSON response
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', true, tokensUsed);
                log.info(`  Parsed: worthPushing=${result.worthPushing}`);
                return {
                    worthPushing: result.worthPushing === true,
                    reason: result.reason || '',
                    innovation: result.innovation || '',
                    summary: result.summary || paper.abstract.substring(0, 100)
                };
            }
        } catch (e) {
            log.warn('Failed to parse LLM JSON response:', e.message);
        }

        // Fallback: try heuristic if JSON fails
        LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', true, tokensUsed);
        log.info(`  Falling back to heuristic`);
        return heuristicPaperFilter(paper, category);

    } catch (error) {
        log.error('LLM evaluation failed:', error.message);
        if (error.response) {
            log.error('LLM API error response:', error.response.status, error.response.data);
        }
        LlmUsageModel.logLlmCall('volcano', model, '/messages', 'POST', false, null);
        // Fallback to heuristic on API error
        return heuristicPaperFilter(paper, category);
    }
}

/**
 * Fetch and evaluate papers for a single category
 */
async function fetchAndEvaluateCategory(categoryKey) {
    const category = paperConfig.categories[categoryKey];
    if (!category) return [];

    log.info(`Fetching papers for ${category.displayName}...`);

    // Fetch papers from arXiv
    const rawPapers = await fetchPapersFromArxiv(
        category.arxivCategories,
        paperConfig.arxiv.maxResultsPerCategory
    );

    log.info(`Fetched ${rawPapers.length} papers for ${category.displayName}`);

    if (rawPapers.length === 0) return [];

    // Evaluate each paper with LLM (sequentially to avoid rate limits)
    const evaluatedPapers = [];
    for (const rawPaper of rawPapers) {
        // Check if we already have this paper
        const existing = PaperModel.getPaperByArxivId(rawPaper.arxivId);
        if (existing) {
            if (existing.worthPushing) {
                evaluatedPapers.push(existing);
            }
            continue;
        }

        // Evaluate with LLM
        const evaluation = await evaluatePaperWithLLM(rawPaper, categoryKey);

        // Save to database
        const paperData = {
            ...rawPaper,
            category: categoryKey,
            worthPushing: evaluation.worthPushing,
            filterReason: evaluation.reason,
            summary: evaluation.summary,
            innovation: evaluation.innovation,
            displayedOn: null
        };

        const paperId = PaperModel.savePaper(paperData);
        const savedPaper = PaperModel.getPaperById(paperId);

        if (savedPaper && savedPaper.worthPushing) {
            evaluatedPapers.push(savedPaper);
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return evaluatedPapers;
}

/**
 * Select the best papers from each category
 */
function selectDailyPapers(evaluatedPapersByCategory) {
    const selected = [];

    for (const [category, papers] of Object.entries(evaluatedPapersByCategory)) {
        if (papers.length > 0) {
            // Sort by publication date (newest first) and pick top
            const sorted = papers.sort((a, b) =>
                new Date(b.publishedAt) - new Date(a.publishedAt)
            );
            selected.push(sorted[0]);
        }
    }

    return selected;
}

/**
 * Main sync function - fetch, evaluate, and select daily papers
 */
async function syncPapers(force = false) {
    // Check if we already have papers for today
    if (!force && PaperModel.hasTodaysPapers()) {
        log.info('Already have papers for today, skipping sync');
        return { success: true, papers: PaperModel.getTodaysPapers(), cached: true };
    }

    try {
        log.info('Starting daily paper sync...');

        // First, check undisplayed papers from previous days
        const undisplayed = PaperModel.getUndisplayedPapers();
        const undisplayedByCategory = {};

        for (const paper of undisplayed) {
            if (!undisplayedByCategory[paper.category]) {
                undisplayedByCategory[paper.category] = [];
            }
            undisplayedByCategory[paper.category].push(paper);
        }

        // Fetch and evaluate new papers for each category
        const evaluatedPapersByCategory = { ...undisplayedByCategory };

        for (const categoryKey of Object.keys(paperConfig.categories)) {
            if (!evaluatedPapersByCategory[categoryKey] ||
                evaluatedPapersByCategory[categoryKey].length < 3) {
                const newPapers = await fetchAndEvaluateCategory(categoryKey);
                if (newPapers.length > 0) {
                    if (!evaluatedPapersByCategory[categoryKey]) {
                        evaluatedPapersByCategory[categoryKey] = [];
                    }
                    evaluatedPapersByCategory[categoryKey].push(...newPapers);
                }
            }
        }

        // Select daily papers
        const selected = selectDailyPapers(evaluatedPapersByCategory);

        if (selected.length > 0) {
            // Mark as displayed today
            const today = todayLocal();
            PaperModel.markAsDisplayed(selected.map(p => p.id), today);
            log.info(`Selected ${selected.length} papers for today`);
        }

        // Cleanup old papers
        try {
            const cleaned = PaperModel.cleanupOldPapers();
            if (cleaned > 0) {
                log.info(`Cleaned up ${cleaned} old papers`);
            }
        } catch (e) {
            log.warn('Cleanup failed:', e.message);
        }

        return {
            success: true,
            papers: selected,
            cached: false
        };

    } catch (error) {
        log.error('Paper sync failed:', error);
        return {
            success: false,
            error: error.message,
            papers: []
        };
    }
}

/**
 * Get today's papers (convenience function)
 */
function getTodaysPapers() {
    return PaperModel.getTodaysPapers();
}

/**
 * Get paper history
 */
function getPaperHistory(days = 7) {
    return PaperModel.getPaperHistory(days);
}

module.exports = {
    syncPapers,
    getTodaysPapers,
    getPaperHistory,
    fetchPapersFromArxiv,
    evaluatePaperWithLLM
};
