// Quick Capture - floating button for instant task creation
(function () {
    const btn = document.getElementById('quickCaptureBtn');
    const modal = document.getElementById('quickCaptureModal');
    const input = document.getElementById('quickCaptureInput');
    const priority = document.getElementById('quickCapturePriority');
    const saveBtn = document.getElementById('quickCaptureSave');

    if (!btn || !modal) return;

    function toggle() {
        modal.classList.toggle('hidden');
        if (!modal.classList.contains('hidden')) {
            input.value = '';
            input.focus();
        }
    }

    function close() {
        modal.classList.add('hidden');
    }

    async function save() {
        const text = input.value.trim();
        if (!text) return;
        try {
            const response = await fetch('/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: text,
                    priority: priority.value,
                    description: '',
                }),
            });
            if (response.ok) {
                close();
                if (typeof showToast === 'function') showToast('Task captured');
                if (typeof loadTasks === 'function') loadTasks();
            }
        } catch (err) {
            console.error('Quick capture error:', err);
        }
    }

    btn.addEventListener('click', toggle);
    saveBtn.addEventListener('click', save);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') close();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!modal.contains(e.target) && e.target !== btn && !modal.classList.contains('hidden')) {
            close();
        }
    });

    // Ctrl+Q global shortcut — but skip if user is typing somewhere else
    document.addEventListener('keydown', (e) => {
        if (!((e.ctrlKey || e.metaKey) && e.key === 'q')) return;
        const ae = document.activeElement;
        const tag = ae?.tagName;
        const inOtherInput = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae?.isContentEditable)
            && ae !== input;
        if (inOtherInput) return;
        e.preventDefault();
        toggle();
    });
})();
