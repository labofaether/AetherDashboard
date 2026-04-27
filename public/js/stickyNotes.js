// Sticky Notes / Scratchpad
(function () {
    const container = document.getElementById('scratchpadNotes');
    const addBtn = document.getElementById('addNoteBtn');

    if (!container) return;

    const noteColors = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#fed7aa'];

    async function loadNotes() {
        try {
            const res = await fetch('/notes');
            if (res.ok) {
                const notes = await res.json();
                renderNotes(notes);
            }
        } catch (e) { /* ignore */ }
    }

    function renderNotes(notes) {
        container.innerHTML = notes.length === 0
            ? '<div class="empty-state" style="grid-column:1/-1">No notes yet</div>'
            : notes.map(note => `
                <div class="note-card" style="background:${note.color || '#fef3c7'}"
                     contenteditable="true"
                     data-note-id="${note.id}"
                     onblur="saveNote(${note.id}, this.textContent)">${escapeHtml(note.content)}</div>
            `).join('');

        // Add delete and color buttons to each note card
        container.querySelectorAll('.note-card').forEach(card => {
            const noteId = card.dataset.noteId;

            const delBtn = document.createElement('button');
            delBtn.className = 'note-delete';
            delBtn.textContent = '\u00d7';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteNote(noteId); };
            card.appendChild(delBtn);

            const colors = document.createElement('div');
            colors.className = 'note-colors';
            noteColors.forEach(c => {
                const btn = document.createElement('button');
                btn.className = 'note-color-btn';
                btn.style.background = c;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    card.style.background = c;
                    updateNoteColor(noteId, c);
                };
                colors.appendChild(btn);
            });
            card.appendChild(colors);
        });
    }

    window.saveNote = async function (id, content) {
        try {
            await fetch(`/notes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: content.trim() }),
            });
        } catch (e) { /* ignore */ }
    };

    async function updateNoteColor(id, color) {
        try {
            await fetch(`/notes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ color }),
            });
        } catch (e) { /* ignore */ }
    }

    async function deleteNote(id) {
        try {
            await fetch(`/notes/${id}`, { method: 'DELETE' });
            loadNotes();
        } catch (e) { /* ignore */ }
    }

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            try {
                const color = noteColors[Math.floor(Math.random() * noteColors.length)];
                const res = await fetch('/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: '', color }),
                });
                if (res.ok) {
                    await loadNotes();
                    // Focus the new note
                    const cards = container.querySelectorAll('.note-card');
                    if (cards.length > 0) cards[cards.length - 1].focus();
                }
            } catch (e) { /* ignore */ }
        });
    }

    window.loadScratchpad = loadNotes;
})();
