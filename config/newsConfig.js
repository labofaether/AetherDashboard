/**
 * Tech News Configuration
 * Hybrid: Hacker News (engineering / AI lab announcements) + RSS feeds
 * (TechCrunch / The Verge / 36氪 — commercial events).
 * LLM filter targets commercial events about notable tech companies.
 */

module.exports = {
    // Hacker News API (Firebase, public, no auth required) — keeps coverage of
    // big-tech engineering & AI-lab announcements that don't always surface in
    // mainstream tech press the same day.
    hn: {
        topStoriesUrl: 'https://hacker-news.firebaseio.com/v0/topstories.json',
        itemUrl: (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        maxStoriesToFetch: 8,
        timeout: 30000,
        minScore: 50
    },

    // RSS feeds. Each entry: { id, name, url, maxItems, lang }.
    // - TechCrunch is the highest-signal feed for funding/M&A/layoffs.
    // - The Verge mixes consumer + commercial; widens coverage of Apple/Google/Meta moves.
    // - 36氪 (via rsshub) covers Chinese internet commercial; rsshub.app may rate-limit
    //   or be transiently down — feed-level errors are non-fatal (others still pull).
    rssFeeds: [
        { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', maxItems: 12, lang: 'en' },
        { id: 'theverge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', maxItems: 8, lang: 'en' },
        { id: '36kr', name: '36氪', url: 'https://36kr.com/feed', maxItems: 10, lang: 'zh' }
    ],

    rss: {
        timeout: 30000,
        // Skip items older than this many hours (RSS feeds keep weeks of history;
        // we only want fresh news for the daily digest).
        maxAgeHours: 48
    },

    // Output cap: how many items to display in today's digest.
    selection: {
        totalDailyItems: 6
    },

    // LLM filter config. maxTokens has to leave room for "extended thinking"
    // chain-of-thought (see project_doubao_thinking_blocks memory) plus the JSON
    // answer. 1024 keeps cost bounded while letting the model finish reasoning.
    llm: {
        maxTokens: 1024,
        temperature: 0,
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-20240307'
    },

    // Companies the heuristic filter (no-LLM fallback) will match in titles.
    // The LLM filter is more flexible — this list is just the safety net.
    targetCompanies: [
        // US big tech
        'Google', 'Alphabet', 'Meta', 'Facebook', 'Instagram', 'WhatsApp',
        'Apple', 'Amazon', 'AWS', 'Microsoft', 'Azure', 'GitHub',
        'Netflix', 'Tesla', 'SpaceX', 'Uber', 'Airbnb', 'Stripe', 'Shopify',
        'Salesforce', 'Oracle', 'IBM', 'Intel', 'Adobe', 'PayPal', 'Square',
        // AI labs / infra
        'OpenAI', 'Anthropic', 'DeepMind', 'xAI', 'Mistral', 'Cohere',
        'Hugging Face', 'Nvidia', 'AMD', 'Perplexity',
        // Chinese internet
        'ByteDance', 'TikTok', 'Tencent', 'WeChat', 'Alibaba', 'Taobao', 'Ant Group',
        'Baidu', 'Xiaomi', 'Meituan', 'Pinduoduo', 'JD', 'JD.com', 'DiDi', 'NIO',
        'Huawei', 'DeepSeek', 'Moonshot', 'Kimi', 'Zhipu', 'BYD',
        // Other notable
        'Twitter', 'X.com', 'LinkedIn', 'Reddit', 'Spotify', 'Discord',
        'Cloudflare', 'Vercel', 'Snowflake', 'Databricks', 'Coinbase', 'Robinhood',
        'Palantir', 'Datadog', 'MongoDB', 'Twilio', 'Atlassian'
    ],

    // Recognized eventType values (LLM-emitted). Frontend uses these to color badges.
    eventTypes: ['funding', 'earnings', 'M&A', 'leadership', 'launch', 'regulatory', 'partnership', 'layoff'],

    // Data retention policy
    retention: {
        maxAgeDays: 30,
        maxDisplayedDays: 7
    }
};
