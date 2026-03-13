const express = require('express');
const {
    getAllProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject
} = require('../models/ProjectModel');
const router = express.Router();

router.get('/', (req, res) => {
    try {
        const projects = getAllProjects();
        res.json(projects);
    } catch (err) {
        console.error('Error fetching projects:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id', (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        const project = getProjectById(projectId);
        if (project) {
            res.json(project);
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (err) {
        console.error('Error fetching project:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', (req, res) => {
    const { name, color, description } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Project name is required' });
    }

    try {
        const projectId = createProject(name.trim(), color, description || '');
        res.status(201).json({ message: 'Project created', projectId });
    } catch (err) {
        console.error('Error creating project:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', (req, res) => {
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
        console.error('Error updating project:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', (req, res) => {
    const projectId = parseInt(req.params.id);

    try {
        const deleted = deleteProject(projectId);
        if (deleted) {
            res.status(200).json({ message: 'Project deleted' });
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (err) {
        console.error('Error deleting project:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
