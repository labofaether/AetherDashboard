const express = require('express');
const { z } = require('zod');
const { getAllNotes, createNote, updateNote, deleteNote } = require('../models/NoteModel');
const { validate } = require('../middleware/validate');
const { validateIdParam } = require('../middleware/validateIdParam');
const log = require('../utils/logger');
const router = express.Router();

const createNoteSchema = z.object({
    content: z.string().min(0).max(5000),
    color: z.string().max(50).optional(),
});

const updateNoteSchema = z.object({
    content: z.string().min(0).max(5000).optional(),
    color: z.string().max(50).optional(),
    sortOrder: z.number().int().optional(),
});

router.get('/', (req, res) => {
    try {
        const notes = getAllNotes();
        res.json(notes);
    } catch (err) {
        log.error('Error fetching notes', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', validate(createNoteSchema), (req, res) => {
    const { content, color } = req.body;
    try {
        const id = createNote(content, color);
        res.status(201).json({ message: 'Note created', id });
    } catch (err) {
        log.error('Error creating note', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', validateIdParam(), validate(updateNoteSchema), (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const updated = updateNote(id, req.body);
        if (updated) {
            res.status(200).json({ message: 'Note updated' });
        } else {
            res.status(404).json({ error: 'Note not found' });
        }
    } catch (err) {
        log.error('Error updating note', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', validateIdParam(), (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const deleted = deleteNote(id);
        if (deleted) {
            res.status(200).json({ message: 'Note deleted' });
        } else {
            res.status(404).json({ error: 'Note not found' });
        }
    } catch (err) {
        log.error('Error deleting note', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
