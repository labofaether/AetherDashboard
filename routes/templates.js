const express = require('express');
const { z } = require('zod');
const { getAllTemplates, createTemplate, deleteTemplate } = require('../models/TemplateModel');
const { validate } = require('../middleware/validate');
const { validateIdParam } = require('../middleware/validateIdParam');
const log = require('../utils/logger');
const router = express.Router();

const createTemplateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(500),
    subtasks: z.array(z.string().min(1).max(500)).default([]),
    defaultPriority: z.enum(['low', 'medium', 'high']).optional(),
});

router.get('/', (req, res) => {
    try {
        const templates = getAllTemplates();
        res.json(templates);
    } catch (err) {
        log.error('Error fetching templates', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', validate(createTemplateSchema), (req, res) => {
    const { name, subtasks, defaultPriority } = req.body;
    try {
        const id = createTemplate(name, subtasks, defaultPriority);
        res.status(201).json({ message: 'Template created', id });
    } catch (err) {
        log.error('Error creating template', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', validateIdParam(), (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const deleted = deleteTemplate(id);
        if (deleted) {
            res.status(200).json({ message: 'Template deleted' });
        } else {
            res.status(404).json({ error: 'Template not found' });
        }
    } catch (err) {
        log.error('Error deleting template', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
