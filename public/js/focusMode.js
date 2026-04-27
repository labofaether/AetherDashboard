// Focus Mode / Pomodoro Timer
(function () {
    const display = document.getElementById('focusTimerDisplay');
    const startBtn = document.getElementById('focusStartBtn');
    const resetBtn = document.getElementById('focusResetBtn');
    const taskSelect = document.getElementById('focusTaskSelect');
    const taskLabel = document.getElementById('focusTaskLabel');
    const presets = document.querySelectorAll('.focus-preset');
    const totalTimeEl = document.getElementById('focusTotalTime');
    const sessionsEl = document.getElementById('focusSessions');
    const historyEl = document.getElementById('focusHistory');

    if (!display || !startBtn) return;

    let duration = 25 * 60; // seconds
    let remaining = duration;
    let timerInterval = null;
    let state = 'idle'; // idle, running, paused
    let currentSessionId = null;

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function updateDisplay() {
        display.textContent = formatTime(remaining);
        display.className = 'focus-timer-display' + (state === 'running' ? ' running' : state === 'paused' ? ' paused' : '');
    }

    function tick() {
        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            state = 'idle';
            remaining = 0;
            updateDisplay();
            completeSession();
            return;
        }
        remaining--;
        updateDisplay();
    }

    async function startTimer() {
        if (state === 'idle') {
            remaining = duration;
            state = 'running';
            startBtn.textContent = 'Pause';
            resetBtn.style.display = 'inline-block';
            timerInterval = setInterval(tick, 1000);
            updateDisplay();

            // Start session on backend
            const taskId = taskSelect.value ? parseInt(taskSelect.value) : null;
            try {
                const res = await fetch('/focus/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId, duration }),
                });
                if (res.ok) {
                    const data = await res.json();
                    currentSessionId = data.sessionId;
                }
            } catch (e) { /* continue timer even if backend fails */ }

            // Update task label
            const selected = taskSelect.options[taskSelect.selectedIndex];
            taskLabel.textContent = selected && selected.value ? selected.text : 'Free focus session';

        } else if (state === 'running') {
            clearInterval(timerInterval);
            timerInterval = null;
            state = 'paused';
            startBtn.textContent = 'Resume';
            updateDisplay();

        } else if (state === 'paused') {
            state = 'running';
            startBtn.textContent = 'Pause';
            timerInterval = setInterval(tick, 1000);
            updateDisplay();
        }
    }

    function resetTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
        state = 'idle';
        remaining = duration;
        startBtn.textContent = 'Start Focus';
        resetBtn.style.display = 'none';
        taskLabel.textContent = taskSelect.value ? taskSelect.options[taskSelect.selectedIndex].text : 'No task selected';
        currentSessionId = null;
        updateDisplay();
    }

    async function completeSession() {
        startBtn.textContent = 'Start Focus';
        resetBtn.style.display = 'none';

        if (typeof showToast === 'function') showToast('Focus session complete!');

        // Notify
        if (Notification.permission === 'granted') {
            new Notification('Focus Session Complete', { body: 'Great work! Take a short break.' });
        }

        // End session on backend
        if (currentSessionId) {
            try {
                await fetch(`/focus/${currentSessionId}/stop`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ elapsed: duration, completed: true }),
                });
            } catch (e) { /* ignore */ }
            currentSessionId = null;
        }

        loadFocusStats();
        loadFocusHistory();
    }

    // Preset buttons
    presets.forEach(btn => {
        btn.addEventListener('click', () => {
            if (state !== 'idle') return;
            presets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            duration = parseInt(btn.dataset.minutes) * 60;
            remaining = duration;
            updateDisplay();
        });
    });

    startBtn.addEventListener('click', startTimer);
    resetBtn.addEventListener('click', resetTimer);

    // Populate task select when focus view becomes active
    window.populateFocusTaskSelect = function () {
        if (!taskSelect || typeof allTasks === 'undefined') return;
        const activeTasks = allTasks.filter(t => t.status !== 'donecontainer');
        taskSelect.innerHTML = '<option value="">Select a task to focus on...</option>';
        activeTasks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.title;
            taskSelect.appendChild(opt);
        });
    };

    taskSelect.addEventListener('change', () => {
        const selected = taskSelect.options[taskSelect.selectedIndex];
        taskLabel.textContent = selected && selected.value ? selected.text : 'No task selected';
    });

    // Load stats
    async function loadFocusStats() {
        try {
            const res = await fetch('/focus/today');
            if (res.ok) {
                const data = await res.json();
                const mins = Math.round((data.totalTime || 0) / 60);
                totalTimeEl.textContent = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                sessionsEl.textContent = data.sessions || 0;
            }
        } catch (e) { /* ignore */ }
    }

    async function loadFocusHistory() {
        try {
            const res = await fetch('/focus/history');
            if (res.ok) {
                const data = await res.json();
                const sessions = data.sessions || data || [];
                historyEl.innerHTML = sessions.length === 0
                    ? '<div class="empty-state">No sessions yet today</div>'
                    : sessions.map(s => {
                        const mins = Math.round((s.elapsed || s.duration) / 60);
                        const time = new Date(s.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        return `
                            <div class="focus-history-item">
                                <span class="fh-icon">${s.completed ? '\u2705' : '\u23f8\ufe0f'}</span>
                                <span class="fh-task">${s.taskTitle || 'Free session'}</span>
                                <span class="fh-duration">${mins}m</span>
                                <span class="fh-time">${time}</span>
                            </div>
                        `;
                    }).join('');
            }
        } catch (e) { /* ignore */ }
    }

    window.loadFocusView = function () {
        populateFocusTaskSelect();
        loadFocusStats();
        loadFocusHistory();
    };

    updateDisplay();
})();
