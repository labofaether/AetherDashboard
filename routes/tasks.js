const express = require('express');
const { z } = require('zod');
const { getAllTasks, getTaskById, createTask, updateTask, updateTaskFields, deleteTask, updateTaskDescription, clearCompletedTasks, getDueReminders, markReminderTriggered, getSubtasks, createSubtask, updateSubtask, deleteSubtask, bulkUpdateTasks, bulkDeleteTasks, pinTaskToday, setTaskUrgentImportant } = require('../models/TaskModel');
const { validate } = require('../middleware/validate');
const { validateIdParam } = require('../middleware/validateIdParam');
const log = require('../utils/logger');
const router = express.Router();

const createTaskSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().max(5000).default(''),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    dueDate: z.string().nullable().optional(),
    projectId: z.number().int().positive().nullable().optional(),
});

const updateStatusSchema = z.object({
    taskId: z.number().int().positive('Task ID is required'),
    status: z.string().min(1, 'Status is required'),
});

const updateDescriptionSchema = z.object({
    taskId: z.number().int().positive('Task ID is required'),
    description: z.string().max(5000),
});

const deleteTaskSchema = z.object({
    taskId: z.number().int().positive('Task ID is required'),
});

const updateTaskSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    dueDate: z.string().nullable().optional(),
    projectId: z.number().int().positive().nullable().optional(),
});

const projectIdQuerySchema = z.object({
    projectId: z.coerce.number().int().positive().optional(),
});

router.get('/', validate(projectIdQuerySchema, 'query'), (req, res) => {
    try {
        const tasks = getAllTasks(req.query.projectId ?? null);
        res.json(tasks);
    } catch (err) {
        log.error('Error fetching tasks', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', validate(createTaskSchema), (req, res) => {
    const { title, description, priority, dueDate, projectId } = req.body;
    const status = 'todocontainer';
    const pid = projectId ? parseInt(projectId) : null;

    try {
        const taskId = createTask(title, description || '', priority, dueDate || null, status, pid);
        res.status(201).json({ message: 'Task created', taskId });
    } catch (err) {
        log.error('Error creating task', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/status', validate(updateStatusSchema), (req, res) => {
    const { taskId, status } = req.body;

    try {
        const updated = updateTask(taskId, status);
        if (updated) {
            res.status(200).json({ message: 'Task status updated' });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (err) {
        log.error('Error updating task status', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/description', validate(updateDescriptionSchema), (req, res) => {
    const { taskId, description } = req.body;

    try {
        const updated = updateTaskDescription(taskId, description);
        if (updated) {
            res.status(200).json({ message: 'Task description updated' });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (err) {
        log.error('Error updating task description', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/', validate(deleteTaskSchema), (req, res) => {
    const { taskId } = req.body;

    try {
        const deleted = deleteTask(taskId);
        if (deleted) {
            res.status(200).json({ message: 'Task deleted' });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (err) {
        log.error('Error deleting task', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', validateIdParam(), validate(updateTaskSchema), (req, res) => {
    const taskId = parseInt(req.params.id);
    try {
        const updated = updateTaskFields(taskId, req.body);
        if (updated) {
            res.status(200).json({ message: 'Task updated' });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (err) {
        log.error('Error updating task', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/reminders/due', (req, res) => {
    try {
        const reminders = getDueReminders();
        // Mark them as triggered so they don't fire again
        for (const r of reminders) {
            markReminderTriggered(r.id);
        }
        res.json({ reminders });
    } catch (err) {
        log.error('Error fetching due reminders', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id', validateIdParam(), (req, res) => {
    try {
        const task = getTaskById(parseInt(req.params.id));
        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    } catch (err) {
        log.error('Error fetching task', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/clear-completed', validate(projectIdQuerySchema, 'query'), (req, res) => {
    try {
        const count = clearCompletedTasks(req.query.projectId ?? null);
        res.status(200).json({ message: `${count} completed tasks cleared`, count });
    } catch (err) {
        log.error('Error clearing completed tasks', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Subtask endpoints
router.get('/:id/subtasks', validateIdParam(), (req, res) => {
    try {
        const subtasks = getSubtasks(parseInt(req.params.id));
        res.json({ subtasks });
    } catch (err) {
        log.error('Error fetching subtasks', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/:id/subtasks', validateIdParam(), validate(z.object({ title: z.string().min(1).max(500) })), (req, res) => {
    try {
        const subtaskId = createSubtask(parseInt(req.params.id), req.body.title);
        res.status(201).json({ subtaskId });
    } catch (err) {
        if (err.message === 'Task not found') return res.status(404).json({ error: err.message });
        log.error('Error creating subtask', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id/subtasks/:subtaskId', validateIdParam(), validateIdParam('subtaskId'), validate(z.object({
    title: z.string().min(1).max(500).optional(),
    completed: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
})), (req, res) => {
    try {
        const updated = updateSubtask(parseInt(req.params.subtaskId), req.body);
        if (updated) res.json({ message: 'Subtask updated' });
        else res.status(404).json({ error: 'Subtask not found' });
    } catch (err) {
        log.error('Error updating subtask', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id/subtasks/:subtaskId', validateIdParam(), validateIdParam('subtaskId'), (req, res) => {
    try {
        const deleted = deleteSubtask(parseInt(req.params.subtaskId));
        if (deleted) res.json({ message: 'Subtask deleted' });
        else res.status(404).json({ error: 'Subtask not found' });
    } catch (err) {
        log.error('Error deleting subtask', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Pin to today
router.put('/:id/pin', validateIdParam(), validate(z.object({
    pinned: z.boolean(),
})), (req, res) => {
    const taskId = parseInt(req.params.id);
    try {
        const updated = pinTaskToday(taskId, req.body.pinned);
        if (updated) res.json({ message: 'Task pin updated' });
        else res.status(404).json({ error: 'Task not found' });
    } catch (err) {
        log.error('Error pinning task', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Eisenhower matrix
router.put('/:id/eisenhower', validateIdParam(), validate(z.object({
    isUrgent: z.boolean(),
    isImportant: z.boolean(),
})), (req, res) => {
    const taskId = parseInt(req.params.id);
    try {
        const updated = setTaskUrgentImportant(taskId, req.body);
        if (updated) res.json({ message: 'Task eisenhower updated' });
        else res.status(404).json({ error: 'Task not found' });
    } catch (err) {
        log.error('Error updating task eisenhower', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Bulk operations
router.post('/bulk', validate(z.object({
    taskIds: z.array(z.number().int().positive()).min(1),
    action: z.enum(['move', 'delete', 'priority', 'project']),
    status: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    projectId: z.number().int().positive().nullable().optional(),
})), (req, res) => {
    try {
        const { taskIds, action, status, priority, projectId } = req.body;
        let count = 0;

        switch (action) {
            case 'move':
                if (!status) return res.status(400).json({ error: 'status required for move' });
                count = bulkUpdateTasks(taskIds, { status });
                break;
            case 'delete':
                count = bulkDeleteTasks(taskIds);
                break;
            case 'priority':
                if (!priority) return res.status(400).json({ error: 'priority required' });
                count = bulkUpdateTasks(taskIds, { priority });
                break;
            case 'project':
                count = bulkUpdateTasks(taskIds, { projectId: projectId || null });
                break;
        }

        res.json({ message: `${count} tasks updated`, count });
    } catch (err) {
        log.error('Error in bulk operation', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
