/**
 * Tech News Service
 * Aggregates from Hacker News + RSS feeds (TechCrunch / The Verge / 36氪),
 * filters with LLM (or heuristic fallback) for commercial events about notable
 * tech companies, and manages the daily news digest.
 */

const axios = require('axios');
const Parser = require('rss-parser');
const NewsModel = require('../models/NewsModel');
const newsConfig = require('../config/newsConfig');
const LlmUsageModel = require('../models/LlmUsageModel');
const log = require('../utils/logger');
const { todayLocal } = require('../utils/dateRange');

const rssParser = new Parser({ timeout: newsConfig.rss.timeout });

const httpCache = { topIds: null, fetchedAt: 0 };
const TOP_IDS_TTL_MS = 10 * 60 * 1000;

// ============================================================
// Source: Hacker News
// ============================================================
async function fetchTopStoryIds() {
    if (httpCache.topIds && Date.now() - httpCache.fetchedAt < TOP_IDS_TTL_MS) {
        return httpCache.topIds;
    }
    const res = await axios.get(newsConfig.hn.topStoriesUrl, { timeout: newsConfig.hn.timeout });
    const ids = Array.isArray(res.data) ? res.data : [];
    httpCache.topIds = ids;
    httpCache.fetchedAt = Date.now();
    return ids;
}

async function fetchHnItem(id) {
    const res = await axios.get(newsConfig.hn.itemUrl(id), { timeout: newsConfig.hn.timeout });
    return res.data;
}

function hnItemToNews(item) {
    if (!item || item.type !== 'story') return null;
    if (item.dead || item.deleted) return null;
    if (!item.title) return null;
    return {
        sourceId: 'hn:' + item.id,
        source: 'hackernews',
        title: item.title,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        author: item.by || null,
        score: item.score || 0,
        commentCount: item.descendants || 0,
        publishedAt: item.time ? new Date(item.time * 1000).toISOString() : new Date().toISOString()
    };
}

async function fetchHnStories() {
    const ids = await fetchTopStoryIds();
    const slice = ids.slice(0, newsConfig.hn.maxStoriesToFetch * 2);
    const results = [];
    for (const id of slice) {
        if (results.length >= newsConfig.hn.maxStoriesToFetch) break;
        try {
            const raw = await fetchHnItem(id);
            const mapped = hnItemToNews(raw);
            if (!mapped) continue;
            if (mapped.score < newsConfig.hn.minScore) continue;
            results.push(mapped);
        } catch (err) {
            log.warn(`Failed to fetch HN item ${id}: ${err.message}`);
        }
    }
    return results;
}

// ============================================================
// Source: RSS feeds (TechCrunch, The Verge, 36氪, ...)
// ============================================================
function rssItemToNews(item, feedConfig) {
    const guid = item.guid || item.link || item.id;
    if (!guid) return null;
    const publishedAt = item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString());
    return {
        sourceId: `${feedConfig.id}:${guid}`,
        source: feedConfig.id,
        title: item.title || '(untitled)',
        url: item.link || null,
        author: item.creator || item.author || feedConfig.name,
        score: 0,
        commentCount: 0,
        publishedAt,
        // contentSnippet sometimes carries useful copy when title is terse
        rssSnippet: (item.contentSnippet || item.summary || '').substring(0, 400)
    };
}

async function fetchRssFeed(feedConfig) {
    try {
        const feed = await rssParser.parseURL(feedConfig.url);
        const cutoffMs = Date.now() - newsConfig.rss.maxAgeHours * 3600 * 1000;
        const items = (feed.items || []).slice(0, feedConfig.maxItems * 2);
        const mapped = [];
        for (const raw of items) {
            const m = rssItemToNews(raw, feedConfig);
            if (!m) continue;
            const t = new Date(m.publishedAt).getTime();
            if (Number.isFinite(t) && t < cutoffMs) continue;
            mapped.push(m);
            if (mapped.length >= feedConfig.maxItems) break;
        }
        return mapped;
    } catch (err) {
        log.warn(`RSS feed "${feedConfig.name}" failed`, { url: feedConfig.url, message: err.message });
        return [];
    }
}

async function fetchAllRss() {
    const all = [];
    for (const feed of newsConfig.rssFeeds) {
        const items = await fetchRssFeed(feed);
        all.push(...items);
    }
    return all;
}

// ============================================================
// LLM evaluation — commercial-event focus
// ============================================================
function buildPrompt(item) {
    const snippet = item.rssSnippet ? `\nSnippet: ${item.rssSnippet.substring(0, 300)}` : '';
    return `You are filtering tech-business news for a busy product engineer who tracks commercial moves of internet/tech companies.

Title: ${item.title}
URL: ${item.url || '(none)'}
Source: ${item.source}${snippet}

Decide if this is worth showing. Worth showing = a commercial event about a notable tech company:
- funding (rounds, valuations, IPOs)
- earnings (quarterly results, revenue, guidance)
- M&A (acquisitions, mergers, divestitures)
- leadership (CEO/exec hires, departures, restructuring)
- launch (commercially significant product launches — emphasize business impact)
- regulatory (antitrust, lawsuits, fines, policy changes)
- partnership (major customer wins, large strategic deals)
- layoff (workforce reductions, hiring freezes)

Reject: pure tutorials, "Show HN" personal projects, opinion essays, generic research papers, hobby content, broad industry think-pieces with no specific company.

Reply with JSON only:
{
  "worthPushing": boolean,
  "company": "OpenAI" or null (the primary company; null if multiple/none),
  "eventType": one of ["funding","earnings","M&A","leadership","launch","regulatory","partnership","layoff"] or null,
  "summary": "one sentence ≤140 chars; include key numbers (round size, %, revenue) when present",
  "reason": "brief justification"
}`;
}

function heuristicNewsFilter(item) {
    const title = item.title.toLowerCase();
    const matched = newsConfig.targetCompanies.find(c => {
        const needle = c.toLowerCase();
        const idx = title.indexOf(needle);
        if (idx === -1) return false;
        const before = idx === 0 ? ' ' : title[idx - 1];
        const after = idx + needle.length >= title.length ? ' ' : title[idx + needle.length];
        return /[^a-z0-9]/.test(before) && /[^a-z0-9]/.test(after);
    });
    // Cheap event-type guess from keywords (best-effort; LLM is the real classifier).
    const text = title + ' ' + (item.rssSnippet || '').toLowerCase();
    let eventType = null;
    if (/\b(raises?|funding|series [a-z]|seed round|valuation)\b/.test(text)) eventType = 'funding';
    else if (/\b(earnings|revenue|quarterly|q[1-4]\b|guidance)\b/.test(text)) eventType = 'earnings';
    else if (/\b(acquires?|acquisition|merger|buys?|to buy)\b/.test(text)) eventType = 'M&A';
    else if (/\b(layoff|fires?|cuts? jobs|hiring freeze)\b/.test(text)) eventType = 'layoff';
    else if (/\b(ceo|cfo|cto|resigns?|steps? down|named|appointed)\b/.test(text)) eventType = 'leadership';
    else if (/\b(launch|launches|unveils|debuts|releases?|announces?)\b/.test(text)) eventType = 'launch';
    else if (/\b(antitrust|lawsuit|fines?|regulator|sec|ftc)\b/.test(text)) eventType = 'regulatory';

    return {
        worthPushing: !!matched,
        company: matched || null,
        eventType,
        summary: item.title.length > 140 ? item.title.substring(0, 137) + '...' : item.title,
        reason: matched ? `Heuristic match: ${matched}` : 'No target company in title'
    };
}

async function evaluateWithLLM(item) {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages';
    const model = newsConfig.llm.model;

    if (!apiKey) return heuristicNewsFilter(item);

    try {
        const apiUrl = baseUrl.includes('/v1/messages') ? baseUrl : `${baseUrl}/v1/messages`;
        const response = await axios.post(apiUrl, {
            model,
            max_tokens: newsConfig.llm.maxTokens,
            temperature: newsConfig.llm.temperature,
            messages: [{ role: 'user', content: buildPrompt(item) }]
        }, {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            // Cap LLM call at 15s — well under the 30s used for RSS feeds; the
            // model can timeout into a thinking spiral and the news cron must
            // still complete before the next 8am run.
            timeout: 15000
        });

        const tokensUsed = response.data.usage?.total_tokens || null;
        // Doubao emits {type:'thinking'} blocks alongside text — search every block.
        // See project_doubao_thinking_blocks.md for the why.
        const blocks = Array.isArray(response.data.content) ? response.data.content : [];
        const textBlock = blocks.find(b => b?.type === 'text' && b.text);
        const thinkingBlock = blocks.find(b => b?.type === 'thinking' && b.thinking);
        const content = textBlock?.text
            || response.data.choices?.[0]?.message?.content
            || thinkingBlock?.thinking
            || '';
        LlmUsageModel.logLlmCall('anthropic', model, '/messages', 'POST', true, tokensUsed);

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                const eventType = newsConfig.eventTypes.includes(parsed.eventType) ? parsed.eventType : null;
                return {
                    worthPushing: parsed.worthPushing === true,
                    company: parsed.company || null,
                    eventType,
                    summary: parsed.summary || item.title.substring(0, 140),
                    reason: parsed.reason || 'LLM-classified'
                };
            } catch (e) {
                log.warn('News LLM JSON parse failed', { message: e.message, raw: content.substring(0, 200) });
            }
        } else {
            log.warn('News LLM response had no JSON object', { raw: content.substring(0, 200) });
        }
        return heuristicNewsFilter(item);
    } catch (error) {
        log.error('News LLM evaluation failed', {
            message: error.message,
            status: error.response?.status,
            data: typeof error.response?.data === 'string'
                ? error.response.data.substring(0, 200)
                : error.response?.data
        });
        LlmUsageModel.logLlmCall('anthropic', model, '/messages', 'POST', false, null);
        return heuristicNewsFilter(item);
    }
}

// ============================================================
// Pipeline: fetch → evaluate → save
// ============================================================
// Tiny concurrency-limited Promise.all; avoids pulling in a dep for 8 lines.
async function pMapWithLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            out[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}

async function fetchAndEvaluate() {
    // Fan out to all sources in parallel; any individual failure is logged and
    // the others still succeed (RSS feeds especially can be flaky).
    const [hnItems, rssItems] = await Promise.all([
        fetchHnStories().catch(err => {
            log.warn('HN fetch failed', { message: err.message });
            return [];
        }),
        fetchAllRss()
    ]);
    const all = [...hnItems, ...rssItems];
    log.info(`News fetch complete`, { hn: hnItems.length, rss: rssItems.length, total: all.length });

    // Pre-load sourceIds we already evaluated this week so we skip the LLM call
    // for known stories without doing one SELECT per item.
    const knownIds = NewsModel.getRecentSourceIds(7);

    // Fast pass: re-emit anything already scored as worthPushing; queue the
    // rest for LLM evaluation.
    const fresh = [];
    const evaluated = [];
    for (const story of all) {
        if (knownIds.has(story.sourceId)) {
            const existing = NewsModel.getNewsBySourceId(story.sourceId);
            if (existing && existing.worthPushing) evaluated.push(existing);
            continue;
        }
        fresh.push(story);
    }

    // Evaluate with concurrency 3 — Doubao tolerates this; we still get most
    // of the throughput gain and avoid hammering on retries.
    const verdicts = await pMapWithLimit(fresh, 3, evaluateWithLLM);

    fresh.forEach((story, i) => {
        const verdict = verdicts[i];
        const itemData = {
            sourceId: story.sourceId,
            source: story.source,
            title: story.title,
            url: story.url,
            author: story.author,
            score: story.score,
            commentCount: story.commentCount,
            publishedAt: story.publishedAt,
            company: verdict.company,
            eventType: verdict.eventType,
            summary: verdict.summary,
            worthPushing: verdict.worthPushing,
            filterReason: verdict.reason,
            displayedOn: null
        };
        const id = NewsModel.saveNews(itemData);
        const saved = NewsModel.getNewsById(id);
        if (saved && saved.worthPushing) evaluated.push(saved);
    });
    return evaluated;
}

// Diversify by company + event type — avoid filling the digest with 5 items
// about the same OpenAI launch.
function selectDaily(candidates) {
    const seen = new Set();
    const sorted = candidates.slice().sort((a, b) => {
        // Prefer fresher, then higher HN score (RSS items tie at score=0).
        const ta = new Date(a.publishedAt).getTime();
        const tb = new Date(b.publishedAt).getTime();
        if (tb !== ta) return tb - ta;
        return (b.score || 0) - (a.score || 0);
    });
    const picked = [];
    for (const item of sorted) {
        if (picked.length >= newsConfig.selection.totalDailyItems) break;
        const key = `${item.company || '__'}::${item.eventType || '__'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push(item);
    }
    if (picked.length < newsConfig.selection.totalDailyItems) {
        for (const item of sorted) {
            if (picked.length >= newsConfig.selection.totalDailyItems) break;
            if (picked.includes(item)) continue;
            picked.push(item);
        }
    }
    return picked;
}

async function syncNews(force = false) {
    if (!force && NewsModel.hasTodaysNews()) {
        log.info('Already have news for today, skipping sync');
        return { success: true, items: NewsModel.getTodaysNews(), cached: true };
    }

    try {
        log.info('Starting daily news sync...');

        const undisplayed = NewsModel.getUndisplayedNews();
        let candidates = undisplayed;

        if (candidates.length < newsConfig.selection.totalDailyItems) {
            const fresh = await fetchAndEvaluate();
            const seen = new Set(candidates.map(c => c.sourceId));
            for (const f of fresh) {
                if (!seen.has(f.sourceId)) candidates.push(f);
            }
        }

        const selected = selectDaily(candidates);
        if (selected.length > 0) {
            NewsModel.markAsDisplayed(selected.map(s => s.id), todayLocal());
            log.info(`Selected ${selected.length} news items for today`);
        }

        try {
            const cleaned = NewsModel.cleanupOldNews();
            if (cleaned > 0) log.info(`Cleaned up ${cleaned} old news items`);
        } catch (e) {
            log.warn('News cleanup failed:', e.message);
        }

        return { success: true, items: selected, cached: false };
    } catch (error) {
        log.error('News sync failed:', error);
        return { success: false, error: error.message, items: [] };
    }
}

function getTodaysNews() { return NewsModel.getTodaysNews(); }
function getNewsHistory(days = 7) { return NewsModel.getNewsHistory(days); }

module.exports = {
    syncNews,
    getTodaysNews,
    getNewsHistory,
    fetchHnStories,
    fetchAllRss,
    evaluateWithLLM
};
