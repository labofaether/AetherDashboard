/**
 * API client for Aether Dashboard
 */

const API_BASE = '/tasks';
const PROJECT_API_BASE = '/projects';
const ACTIVITY_API_BASE = '/activity';
const EMAIL_API_BASE = '/emails';

/**
 * Generic fetch wrapper with error handling
 * @param {string} url - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} Response data
 */
async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'API request failed');
    }

    return response.json();
}

// Tasks API
export const TasksApi = {
    async getAll(projectId = null) {
        const url = projectId ? `${API_BASE}?projectId=${projectId}` : API_BASE;
        const data = await apiFetch(url);
        return data.tasks;
    },

    async create(title, description, priority, dueDate, status, projectId) {
        const data = await apiFetch(API_BASE, {
            method: 'POST',
            body: JSON.stringify({ title, description, priority, dueDate, status, projectId })
        });
        return data.taskId;
    },

    async updateStatus(id, status) {
        await apiFetch(`${API_BASE}/status`, {
            method: 'PUT',
            body: JSON.stringify({ id, status })
        });
    },

    async updateDescription(id, description) {
        await apiFetch(`${API_BASE}/description`, {
            method: 'PUT',
            body: JSON.stringify({ id, description })
        });
    },

    async delete(id) {
        await apiFetch(`${API_BASE}?id=${id}`, {
            method: 'DELETE'
        });
    },

    async clearCompleted() {
        await apiFetch(`${API_BASE}/clear-completed`, {
            method: 'POST'
        });
    }
};

// Projects API
export const ProjectsApi = {
    async getAll() {
        const data = await apiFetch(PROJECT_API_BASE);
        return data.projects;
    },

    async create(name, color) {
        const data = await apiFetch(PROJECT_API_BASE, {
            method: 'POST',
            body: JSON.stringify({ name, color })
        });
        return data.projectId;
    },

    async delete(id) {
        await apiFetch(`${PROJECT_API_BASE}?id=${id}`, {
            method: 'DELETE'
        });
    }
};

// Activity API
export const ActivityApi = {
    async getAll() {
        const data = await apiFetch(ACTIVITY_API_BASE);
        return data.activities;
    }
};

// Emails API
export const EmailsApi = {
    async getAll(filters = {}) {
        const params = new URLSearchParams(filters);
        const url = `${EMAIL_API_BASE}${params.toString() ? '?' + params.toString() : ''}`;
        const data = await apiFetch(url);
        return data.emails;
    },

    async getImportant(providerType = null) {
        const params = providerType ? new URLSearchParams({ providerType }) : '';
        const url = `${EMAIL_API_BASE}/filter/important${params.toString() ? '?' + params.toString() : ''}`;
        const data = await apiFetch(url);
        return data.emails;
    },

    async getById(id) {
        const data = await apiFetch(`${EMAIL_API_BASE}/${id}`);
        return data.email;
    },

    async markAsRead(id, isRead = true) {
        await apiFetch(`${EMAIL_API_BASE}/${id}/read`, {
            method: 'PUT',
            body: JSON.stringify({ isRead })
        });
    },

    async markAllAsRead(providerType = 'outlook') {
        const data = await apiFetch(`${EMAIL_API_BASE}/mark-all-read`, {
            method: 'PUT',
            body: JSON.stringify({ providerType })
        });
        return data.count;
    },

    async convertToTask(id, options = {}) {
        const data = await apiFetch(`${EMAIL_API_BASE}/${id}/convert-task`, {
            method: 'POST',
            body: JSON.stringify(options)
        });
        return data.taskId;
    },

    async delete(id) {
        await apiFetch(`${EMAIL_API_BASE}/${id}`, {
            method: 'DELETE'
        });
    },

    async sync(providerType = 'outlook') {
        const data = await apiFetch(`${EMAIL_API_BASE}/sync`, {
            method: 'POST',
            body: JSON.stringify({ providerType })
        });
        return data;
    },

    async getProviders() {
        const data = await apiFetch(`${EMAIL_API_BASE}/providers`);
        return data.providers;
    },

    async getAuthUrl(providerType = 'outlook') {
        const data = await apiFetch(`${EMAIL_API_BASE}/providers/${providerType}/auth-url`);
        return data.authUrl;
    },

    async getSyncStatus(providerType = null) {
        const params = providerType ? new URLSearchParams({ providerType }) : '';
        const url = `${EMAIL_API_BASE}/sync-state${params.toString() ? '?' + params.toString() : ''}`;
        const data = await apiFetch(url);
        return providerType ? data.state : data.states;
    },

    async getApiUsageStats(hours = 24) {
        const data = await apiFetch(`${EMAIL_API_BASE}/usage/stats?hours=${hours}`);
        return data.stats;
    },

    async getApiSyncStatus() {
        const data = await apiFetch(`${EMAIL_API_BASE}/usage/sync-status`);
        return data.status;
    },

    async getLlmUsageStats(hours = 24) {
        const data = await apiFetch(`${EMAIL_API_BASE}/llm-usage/stats?hours=${hours}`);
        return data.stats;
    },

    async getLlmSyncStatus() {
        const data = await apiFetch(`${EMAIL_API_BASE}/llm-usage/sync-status`);
        return data.status;
    }
};

// Events API
export const EventsApi = {
    async getAll(filters = {}) {
        const params = new URLSearchParams(filters);
        const url = `${EMAIL_API_BASE}/events${params.toString() ? '?' + params.toString() : ''}`;
        const data = await apiFetch(url);
        return data.events;
    }
};
