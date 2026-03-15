/**
 * Simple centralized state management for Aether Dashboard
 */

// Initial state
const initialState = {
    currentModule: 'dashboard',
    currentProjectId: 'all',
    allTasks: [],
    allProjects: [],
    allEmails: [],
    allEvents: [],
    currentEmailFilter: 'all',
    selectedEmailId: null,
    emailButtonsSetup: false,
    selectedColor: '#10a37f',
    calendarMonth: new Date(),
    syncStatusData: null,
    llmSyncStatusData: null
};

// Current state
let state = { ...initialState };

// Subscribers
const subscribers = new Set();

/**
 * Get current state
 * @returns {Object} Current state
 */
export function getState() {
    return { ...state };
}

/**
 * Update state
 * @param {Object} updates - State updates to merge
 */
export function setState(updates) {
    state = { ...state, ...updates };
    notifySubscribers();
}

/**
 * Reset state to initial
 */
export function resetState() {
    state = { ...initialState };
    notifySubscribers();
}

/**
 * Subscribe to state changes
 * @param {Function} callback - Callback to run on state change
 * @returns {Function} Unsubscribe function
 */
export function subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

/**
 * Notify all subscribers of state change
 * @private
 */
function notifySubscribers() {
    subscribers.forEach(callback => callback(state));
}

// Convenience getters/setters for common state
export function getCurrentModule() { return state.currentModule; }
export function setCurrentModule(module) { setState({ currentModule: module }); }

export function getCurrentProjectId() { return state.currentProjectId; }
export function setCurrentProjectId(id) { setState({ currentProjectId: id }); }

export function getAllTasks() { return [...state.allTasks]; }
export function setAllTasks(tasks) { setState({ allTasks: [...tasks] }); }

export function getAllProjects() { return [...state.allProjects]; }
export function setAllProjects(projects) { setState({ allProjects: [...projects] }); }

export function getAllEmails() { return [...state.allEmails]; }
export function setAllEmails(emails) { setState({ allEmails: [...emails] }); }

export function getAllEvents() { return [...state.allEvents]; }
export function setAllEvents(events) { setState({ allEvents: [...events] }); }
