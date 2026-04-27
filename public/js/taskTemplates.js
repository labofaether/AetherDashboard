// Task Templates
(function () {
    const modal = document.getElementById('templateModal');
    const templateList = document.getElementById('templateList');
    const useBtn = document.getElementById('useTemplateBtn');
    const closeBtn = document.getElementById('closeTemplateModal');
    const saveBtn = document.getElementById('saveTemplateBtn');
    const nameInput = document.getElementById('templateName');
    const subtasksInput = document.getElementById('templateSubtasks');
    const priorityInput = document.getElementById('templatePriority');

    function parseSubtasks(raw) {
        if (!raw) return [];
        try { return JSON.parse(raw); }
        catch (e) { console.warn('template.subtasks parse failed', e); return []; }
    }

    if (!modal) return;

    function openModal() {
        modal.classList.remove('hidden');
        loadTemplates();
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    async function loadTemplates() {
        try {
            const res = await fetch('/templates');
            if (res.ok) {
                const templates = await res.json();
                renderTemplates(templates);
            }
        } catch (e) { /* ignore */ }
    }

    function renderTemplates(templates) {
        if (!templateList) return;
        templateList.innerHTML = templates.length === 0
            ? '<div class="empty-state">No templates yet. Create one below.</div>'
            : templates.map(t => {
                const subtasks = parseSubtasks(t.subtasks);
                return `
                    <div class="template-item">
                        <div>
                            <div class="template-item-name">${typeof escapeHtml === 'function' ? escapeHtml(t.name) : t.name}</div>
                            <div class="template-item-meta">${subtasks.length} subtask(s) \u00b7 ${t.defaultPriority} priority</div>
                        </div>
                        <div class="template-item-actions">
                            <button class="btn-primary" onclick="applyTemplate(${t.id})">Use</button>
                            <button class="goal-delete-btn" onclick="deleteTemplate(${t.id})">&times;</button>
                        </div>
                    </div>
                `;
            }).join('');
    }

    window.applyTemplate = async function (templateId) {
        try {
            const res = await fetch(`/templates`);
            if (!res.ok) return;
            const templates = await res.json();
            const template = templates.find(t => t.id === templateId);
            if (!template) return;

            const subtasks = parseSubtasks(template.subtasks);
            const projectId = typeof currentProjectId !== 'undefined' && currentProjectId !== 'all' ? currentProjectId : null;

            // Create the task
            const taskRes = await fetch('/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: template.name,
                    priority: template.defaultPriority,
                    description: '',
                    projectId,
                }),
            });

            if (taskRes.ok) {
                const taskData = await taskRes.json();
                const taskId = taskData.taskId;

                // Create subtasks
                for (const sub of subtasks) {
                    if (sub.trim()) {
                        await fetch(`/tasks/${taskId}/subtasks`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: sub.trim() }),
                        });
                    }
                }

                closeModal();
                if (typeof showToast === 'function') showToast(`Created task from template "${template.name}"`);
                if (typeof loadTasks === 'function') loadTasks();
            }
        } catch (e) {
            console.error('Apply template error:', e);
        }
    };

    window.deleteTemplate = async function (id) {
        try {
            await fetch(`/templates/${id}`, { method: 'DELETE' });
            loadTemplates();
        } catch (e) { /* ignore */ }
    };

    async function saveTemplate() {
        const name = nameInput.value.trim();
        if (!name) return;

        const subtasks = subtasksInput.value.split('\n').filter(s => s.trim());
        const priority = priorityInput.value;

        try {
            const res = await fetch('/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, subtasks, defaultPriority: priority }),
            });
            if (res.ok) {
                nameInput.value = '';
                subtasksInput.value = '';
                loadTemplates();
                if (typeof showToast === 'function') showToast('Template saved');
            }
        } catch (e) { /* ignore */ }
    }

    if (useBtn) useBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (saveBtn) saveBtn.addEventListener('click', saveTemplate);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
})();
