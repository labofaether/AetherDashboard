// Goal Tracking
(function () {
    const listEl = document.getElementById('goalsList');
    const addBtn = document.getElementById('addGoalBtn');
    const modal = document.getElementById('goalModal');
    const saveBtn = document.getElementById('saveGoalBtn');
    const cancelBtn = document.getElementById('cancelGoalBtn');
    const closeBtn = document.getElementById('closeGoalModal');

    if (!listEl) return;

    async function loadGoalsList() {
        try {
            const res = await fetch('/goals');
            if (res.ok) {
                const goals = await res.json();
                renderGoals(goals);
            }
        } catch (e) { /* ignore */ }
    }

    function renderGoals(goals) {
        if (goals.length === 0) {
            listEl.innerHTML = '<div class="empty-state">Set goals to track progress</div>';
            return;
        }

        listEl.innerHTML = goals.map(goal => {
            const pct = goal.targetCount > 0 ? Math.min(100, (goal.currentCount / goal.targetCount) * 100) : 0;
            const isComplete = goal.completed || goal.currentCount >= goal.targetCount;
            const dateStr = goal.targetDate
                ? new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '';

            return `
                <div class="goal-item ${isComplete ? 'completed' : ''}">
                    <div class="goal-item-header">
                        <span class="goal-item-title">${typeof escapeHtml === 'function' ? escapeHtml(goal.title) : goal.title}</span>
                        <span class="goal-item-count">${goal.currentCount}/${goal.targetCount}</span>
                    </div>
                    <div class="goal-progress-bar">
                        <div class="goal-progress-fill ${isComplete ? 'complete' : ''}" style="width:${pct.toFixed(0)}%"></div>
                    </div>
                    <div class="goal-item-actions">
                        ${!isComplete ? `<button class="goal-increment-btn" onclick="incrementGoal(${goal.id})">+1</button>` : ''}
                        ${dateStr ? `<span class="goal-target-date">${dateStr}</span>` : ''}
                        <button class="goal-delete-btn" onclick="deleteGoal(${goal.id})" title="Delete">&times;</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.incrementGoal = async function (id) {
        try {
            const res = await fetch(`/goals/${id}/increment`, { method: 'PUT' });
            if (res.ok) {
                loadGoalsList();
                if (typeof showToast === 'function') showToast('Goal progress updated');
            }
        } catch (e) { /* ignore */ }
    };

    window.deleteGoal = async function (id) {
        try {
            await fetch(`/goals/${id}`, { method: 'DELETE' });
            loadGoalsList();
        } catch (e) { /* ignore */ }
    };

    function openModal() {
        if (!modal) return;
        modal.classList.remove('hidden');
        document.getElementById('goalTitle').value = '';
        document.getElementById('goalTargetDate').value = '';
        document.getElementById('goalTargetCount').value = '1';
        document.getElementById('goalCategory').value = 'general';
        document.getElementById('goalTitle').focus();
    }

    function closeModal() {
        if (modal) modal.classList.add('hidden');
    }

    async function saveGoal() {
        const title = document.getElementById('goalTitle').value.trim();
        if (!title) return;

        const targetDate = document.getElementById('goalTargetDate').value || null;
        const targetCount = parseInt(document.getElementById('goalTargetCount').value) || 1;
        const category = document.getElementById('goalCategory').value;

        try {
            const res = await fetch('/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, targetDate, targetCount, category }),
            });
            if (res.ok) {
                closeModal();
                loadGoalsList();
                if (typeof showToast === 'function') showToast('Goal created');
            }
        } catch (e) { /* ignore */ }
    }

    if (addBtn) addBtn.addEventListener('click', openModal);
    if (saveBtn) saveBtn.addEventListener('click', saveGoal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    window.loadGoals = loadGoalsList;
})();
