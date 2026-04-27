const express = require('express');
const { z } = require('zod');
const { getAllGoals, getGoalById, createGoal, updateGoal, incrementGoal, deleteGoal } = require('../models/GoalModel');
const { validate } = require('../middleware/validate');
const { validateIdParam } = require('../middleware/validateIdParam');
const log = require('../utils/logger');
const router = express.Router();

const createGoalSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    targetDate: z.string().nullable().optional(),
    targetCount: z.number().int().positive().optional(),
    category: z.string().max(100).optional(),
});

const updateGoalSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    targetDate: z.string().nullable().optional(),
    targetCount: z.number().int().positive().optional(),
    currentCount: z.number().int().min(0).optional(),
    category: z.string().max(100).optional(),
    completed: z.boolean().optional(),
});

router.get('/', (req, res) => {
    try {
        const goals = getAllGoals();
        res.json(goals);
    } catch (err) {
        log.error('Error fetching goals', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', validate(createGoalSchema), (req, res) => {
    const { title, targetDate, targetCount, category } = req.body;
    try {
        const id = createGoal(title, targetDate, targetCount, category);
        res.status(201).json({ message: 'Goal created', id });
    } catch (err) {
        log.error('Error creating goal', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', validateIdParam(), validate(updateGoalSchema), (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const updated = updateGoal(id, req.body);
        if (updated) {
            res.status(200).json({ message: 'Goal updated' });
        } else {
            res.status(404).json({ error: 'Goal not found' });
        }
    } catch (err) {
        log.error('Error updating goal', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id/increment', validateIdParam(), (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const updated = incrementGoal(id);
        if (updated) {
            const goal = getGoalById(id);
            res.status(200).json({ message: 'Goal incremented', goal });
        } else {
            res.status(404).json({ error: 'Goal not found' });
        }
    } catch (err) {
        log.error('Error incrementing goal', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', validateIdParam(), (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const deleted = deleteGoal(id);
        if (deleted) {
            res.status(200).json({ message: 'Goal deleted' });
        } else {
            res.status(404).json({ error: 'Goal not found' });
        }
    } catch (err) {
        log.error('Error deleting goal', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
