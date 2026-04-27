// Eisenhower Matrix View
(function () {
    const kanbanBtn = document.getElementById('kanbanViewBtn');
    const eisenhowerBtn = document.getElementById('eisenhowerViewBtn');
    const board = document.querySelector('.board');
    const grid = document.getElementById('eisenhowerGrid');

    if (!kanbanBtn || !eisenhowerBtn || !grid) return;

    kanbanBtn.addEventListener('click', () => {
        kanbanBtn.classList.add('active');
        eisenhowerBtn.classList.remove('active');
        if (board) board.style.display = '';
        grid.classList.add('hidden');
    });

    eisenhowerBtn.addEventListener('click', () => {
        eisenhowerBtn.classList.add('active');
        kanbanBtn.classList.remove('active');
        if (board) board.style.display = 'none';
        grid.classList.remove('hidden');
        renderEisenhower();
    });

    function renderEisenhower() {
        if (typeof allTasks === 'undefined') return;

        const filtered = typeof getFilteredTasks === 'function' ? getFilteredTasks() : allTasks;
        const active = filtered.filter(t => t.status !== 'donecontainer');

        const quadrants = {
            doFirst: [], // urgent + important
            schedule: [], // not urgent + important
            delegate: [], // urgent + not important
            eliminate: [], // not urgent + not important
        };

        active.forEach(task => {
            // Auto-classify based on priority and due date if eisenhower fields not set
            const isUrgent = task.isUrgent || (task.dueDate && isWithinDays(task.dueDate, 3)) || task.priority === 'high';
            const isImportant = task.isImportant || task.priority === 'high' || task.priority === 'medium';

            if (isUrgent && isImportant) quadrants.doFirst.push(task);
            else if (!isUrgent && isImportant) quadrants.schedule.push(task);
            else if (isUrgent && !isImportant) quadrants.delegate.push(task);
            else quadrants.eliminate.push(task);
        });

        renderQuadrant('eqDoFirst', quadrants.doFirst);
        renderQuadrant('eqSchedule', quadrants.schedule);
        renderQuadrant('eqDelegate', quadrants.delegate);
        renderQuadrant('eqEliminate', quadrants.eliminate);
    }

    function isWithinDays(dateStr, days) {
        const due = new Date(dateStr);
        const now = new Date();
        const diff = (due - now) / (1000 * 60 * 60 * 24);
        return diff <= days;
    }

    function renderQuadrant(elementId, tasks) {
        const el = document.getElementById(elementId);
        if (!el) return;

        el.innerHTML = tasks.length === 0
            ? '<li class="empty-state" style="padding:12px;font-size:12px;">No tasks</li>'
            : tasks.map(task => {
                const status = typeof mapStatusToFrontend === 'function' ? mapStatusToFrontend(task.status) : task.status;
                return `
                    <li class="eq-task-item" onclick="moveTask(${task.id}, '${status}')">
                        <span class="eq-priority ${task.priority}"></span>
                        <span>${typeof escapeHtml === 'function' ? escapeHtml(task.title) : task.title}</span>
                    </li>
                `;
            }).join('');
    }

    window.renderEisenhowerView = renderEisenhower;
})();
