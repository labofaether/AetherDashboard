// Today View - Daily Planner with pinned tasks, overdue, and due soon
(function () {
    const pinnedEl = document.getElementById('todayPinned');
    const overdueEl = document.getElementById('todayOverdue');
    const dueSoonEl = document.getElementById('todayDueSoon');
    const dateEl = document.getElementById('todayDate');
    const pinBtn = document.getElementById('pinTaskBtn');

    if (!pinnedEl) return;

    function createTodayTaskItem(task, showPin) {
        const status = typeof mapStatusToFrontend === 'function' ? mapStatusToFrontend(task.status) : task.status;
        const isOverdue = task.dueDate && status !== 'done' && new Date(task.dueDate) < new Date();
        const dueText = task.dueDate ? formatSmartDue(new Date(task.dueDate)) : '';

        return `
            <div class="today-task-item" data-task-id="${task.id}">
                <span class="task-priority-dot ${task.priority}"></span>
                <span class="today-task-title">${escapeHtml(task.title)}</span>
                ${dueText ? `<span class="today-task-due ${isOverdue ? 'overdue' : ''}">${dueText}</span>` : ''}
                ${showPin ? `<button class="pin-btn ${task.pinnedToday ? 'pinned' : ''}" onclick="togglePin(${task.id}, ${task.pinnedToday ? 0 : 1})" title="${task.pinnedToday ? 'Unpin' : 'Pin'}">&#9733;</button>` : ''}
                <button class="pin-btn" onclick="moveTask(${task.id}, '${status}')" title="${typeof getNextStatusLabel === 'function' ? getNextStatusLabel(status) : 'Move'}">&rarr;</button>
            </div>
        `;
    }

    function formatSmartDue(date) {
        const now = new Date();
        const diff = date - now;
        const hours = diff / (1000 * 60 * 60);
        const days = diff / (1000 * 60 * 60 * 24);

        if (diff < 0) {
            const absDays = Math.abs(Math.floor(days));
            if (absDays === 0) return 'Due today';
            return `${absDays}d overdue`;
        }
        if (hours < 2) return `${Math.max(0, Math.floor(diff / 60000))}m left`;
        if (hours < 24) return `${Math.floor(hours)}h left`;
        if (days < 2) return 'Tomorrow';
        if (days < 7) return `${Math.floor(days)}d left`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    window.togglePin = async function (taskId, pinned) {
        try {
            await fetch(`/tasks/${taskId}/pin`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pinned: !!pinned }),
            });
            if (typeof loadTasks === 'function') await loadTasks();
        } catch (e) {
            console.error('Pin error:', e);
        }
    };

    window.renderTodayView = function () {
        if (typeof allTasks === 'undefined') return;

        dateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const now = new Date();
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        const soonEnd = new Date(now);
        soonEnd.setDate(soonEnd.getDate() + 3);

        const active = allTasks.filter(t => t.status !== 'donecontainer');
        const pinned = active.filter(t => t.pinnedToday);
        const overdue = active.filter(t => t.dueDate && new Date(t.dueDate) < now && !t.pinnedToday);
        const dueSoon = active.filter(t => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= soonEnd && !t.pinnedToday);

        pinnedEl.innerHTML = pinned.length
            ? pinned.map(t => createTodayTaskItem(t, true)).join('')
            : '<div class="empty-state">Pin tasks here for today\'s focus</div>';

        overdueEl.innerHTML = overdue.length
            ? overdue.map(t => createTodayTaskItem(t, true)).join('')
            : '<div class="empty-state">No overdue tasks</div>';

        dueSoonEl.innerHTML = dueSoon.length
            ? dueSoon.map(t => createTodayTaskItem(t, true)).join('')
            : '<div class="empty-state">No upcoming deadlines</div>';

        // Load sidebar widgets
        if (typeof loadScratchpad === 'function') loadScratchpad();
        if (typeof loadGoals === 'function') loadGoals();
    };

    // Pin task button - show a simple list to pick from
    if (pinBtn) {
        pinBtn.addEventListener('click', () => {
            if (typeof allTasks === 'undefined') return;
            const unpinned = allTasks.filter(t => t.status !== 'donecontainer' && !t.pinnedToday);
            if (unpinned.length === 0) {
                if (typeof showToast === 'function') showToast('No tasks to pin');
                return;
            }
            // Create a quick picker
            const existing = document.getElementById('pinPickerDropdown');
            if (existing) { existing.remove(); return; }

            const dropdown = document.createElement('div');
            dropdown.id = 'pinPickerDropdown';
            dropdown.style.cssText = 'position:absolute;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;padding:8px;z-index:100;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.1);min-width:250px;';

            unpinned.slice(0, 10).forEach(t => {
                const item = document.createElement('div');
                item.className = 'today-task-item';
                item.innerHTML = `<span class="task-priority-dot ${t.priority}"></span><span class="today-task-title">${escapeHtml(t.title)}</span>`;
                item.onclick = () => { togglePin(t.id, 1); dropdown.remove(); };
                dropdown.appendChild(item);
            });

            pinBtn.parentElement.style.position = 'relative';
            pinBtn.parentElement.appendChild(dropdown);

            setTimeout(() => {
                document.addEventListener('click', function close(e) {
                    if (!dropdown.contains(e.target) && e.target !== pinBtn) {
                        dropdown.remove();
                        document.removeEventListener('click', close);
                    }
                });
            }, 0);
        });
    }
})();
