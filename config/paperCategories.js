/**
 * Paper Categories Configuration
 * Defines arXiv categories for AI, Networking, and IoT papers
 */

module.exports = {
    // Category definitions with arXiv categories and display names
    categories: {
        ai: {
            name: 'AI',
            displayName: 'Artificial Intelligence',
            arxivCategories: [
                'cs.AI',    // Artificial Intelligence
                'cs.LG',    // Machine Learning
                'cs.CL',    // Computation and Language
                'cs.CV',    // Computer Vision
                'cs.NE',    // Neural and Evolutionary Computing
                'cs.RO'     // Robotics
            ],
            color: '#10a37f'
        },
        network: {
            name: 'Network',
            displayName: 'Networking',
            arxivCategories: [
                'cs.NI',    // Networking and Internet Architecture
                'cs.MA',    // Multiagent Systems
                'cs.DC'     // Distributed, Parallel, and Cluster Computing
            ],
            color: '#3b82f6'
        },
        iot: {
            name: 'IoT',
            displayName: 'Internet of Things',
            arxivCategories: [
                'cs.OS',    // Operating Systems
                'cs.ET',    // Emerging Technologies
                'cs.SY',    // Systems and Control
                'cs.NI'     // Networking (also relevant for IoT)
            ],
            color: '#f59e0b'
        }
    },

    // arXiv API configuration
    arxiv: {
        baseUrl: 'http://export.arxiv.org/api/query',
        maxResultsPerCategory: 5,
        // Time window: fetch papers from last 7 days (increased to ensure we have papers)
        lookbackHours: 168,
        timeout: 60000 // 60 second timeout
    },

    // Paper selection configuration
    selection: {
        papersPerCategory: 1,  // Select 1 paper per category
        totalDailyPapers: 3    // Total 3 papers daily
    },

    // LLM configuration for paper filtering
    llm: {
        maxTokens: 300,
        temperature: 0,
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-20240307'
    },

    // Data retention policy
    retention: {
        maxAgeDays: 90,         // Keep papers for 90 days
        maxDisplayedDays: 7     // Show papers from last 7 days in history
    }
};
