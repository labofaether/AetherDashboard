const express = require('express');
const { getAllTasks, createTask, updateTask, deleteTask, updateTaskDescription, clearCompletedTasks } = require('../models/TaskModel');
const router = express.Router();

router.get('/', (req, res) => {
    try {
        const projectId = req.query.projectId ? parseInt(req.query.projectId) : null;
        const tasks = getAllTasks(projectId);
        res.json(tasks);
    } catch (err) {
        console.error('Error fetching tasks:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', (req, res) => {
    const { title, description, priority, dueDate, projectId } = req.body;
    const status = 'todocontainer';
    const pid = projectId ? parseInt(projectId) : null;

    try {
        const taskId = createTask(title, description || '', priority, dueDate || null, status, pid);
        res.status(201).json({ message: 'Task created', taskId });
    } catch (err) {
        console.error('Error creating task:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/status', (req, res) => {
    const { taskId, status } = req.body;

    try {
        const updated = updateTask(taskId, status);
        if (updated) {
            res.status(200).json({ message: 'Task status updated' });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (err) {
        console.error('Error updating task status:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/description', (req, res) => {
    const { taskId, description } = req.body;

    try {
        const updated = updateTaskDescription(taskId, description);
        if (updated) {
            res.status(200).json({ message: 'Task description updated' });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (err) {
        console.error('Error updating task description:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/', (req, res) => {
    const { taskId } = req.body;

    try {
        const deleted = deleteTask(taskId);
        if (deleted) {
            res.status(200).json({ message: 'Task deleted' });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (err) {
        console.error('Error deleting task:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/clear-completed', (req, res) => {
    try {
        const projectId = req.query.projectId ? parseInt(req.query.projectId) : null;
        const count = clearCompletedTasks(projectId);
        res.status(200).json({ message: `${count} completed tasks cleared`, count });
    } catch (err) {
        console.error('Error clearing completed tasks:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
