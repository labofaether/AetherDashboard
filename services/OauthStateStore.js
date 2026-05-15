/**
 * In-memory OAuth state store, shared between the auth-url and callback
 * handlers. ReminderService owns its periodic expiry sweep so this module
 * stays free of timers.
 */

const TTL_MS = 10 * 60 * 1000;

class OauthStateStore {
    constructor(ttlMs = TTL_MS) {
        this.ttlMs = ttlMs;
        this.states = new Map();
    }

    set(key, type) {
        this.states.set(key, { type, createdAt: Date.now() });
    }

    get(key) {
        return this.states.get(key);
    }

    delete(key) {
        this.states.delete(key);
    }

    /**
     * Atomically validate, return, and consume a state.
     * Returns { type } when present and unexpired; otherwise { expired: true }
     * if the key existed but timed out, or null if absent. Always deletes the
     * key on a hit so a replayed callback cannot succeed twice.
     */
    consume(key) {
        const entry = this.states.get(key);
        if (!entry) return null;
        this.states.delete(key);
        if (Date.now() - entry.createdAt > this.ttlMs) return { expired: true };
        return { type: entry.type };
    }

    cleanup() {
        const now = Date.now();
        let removed = 0;
        for (const [k, v] of this.states) {
            if (now - v.createdAt > this.ttlMs) {
                this.states.delete(k);
                removed++;
            }
        }
        return removed;
    }

    size() {
        return this.states.size;
    }
}

module.exports = new OauthStateStore();
