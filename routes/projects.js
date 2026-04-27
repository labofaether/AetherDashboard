const express = require('express');
const { z } = require('zod');
const {
    getAllProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject
} = require('../models/ProjectModel');
const { validate } = require('../middleware/validate');
const { validateIdParam } = require('../middleware/validateIdParam');
const log = require('../utils/logger');
const router = express.Router();

// Hex color only — front-end injects color into inline style="background: ${color}",
// so any unsanitized string here lets a malicious value break out of the property.
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex (e.g. #10a37f)');

const createProjectSchema = z.object({
    name: z.string().min(1, 'Project name is required').max(200),
    color: hexColor.optional(),
    description: z.string().max(2000).default(''),
});

const updateProjectSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    color: hexColor.optional(),
    description: z.string().max(2000).optional(),
});

router.get('/', (req, res) => {
    try {
        const projects = getAllProjects();
        res.json(projects);
    } catch (err) {
        log.error('Error fetching projects', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id', validateIdParam(), (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        const project = getProjectById(projectId);
        if (project) {
            res.json(project);
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (err) {
        log.error('Error fetching project', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', validate(createProjectSchema), (req, res) => {
    const { name, color, description } = req.body;

    try {
        const projectId = createProject(name.trim(), color, description || '');
        res.status(201).json({ message: 'Project created', projectId });
    } catch (err) {
        log.error('Error creating project', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', validateIdParam(), validate(updateProjectSchema), (req, res) => {
    const projectId = parseInt(req.params.id);
    const { name, color, description } = req.body;

    try {
        const updated = updateProject(projectId, name, color, description);
        if (updated) {
            res.status(200).json({ message: 'Project updated' });
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (err) {
        log.error('Error updating project', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', validateIdParam(), (req, res) => {
    const projectId = parseInt(req.params.id);

    try {
        const deleted = deleteProject(projectId);
        if (deleted) {
            res.status(200).json({ message: 'Project deleted' });
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (err) {
        log.error('Error deleting project', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
