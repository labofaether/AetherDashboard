require('dotenv').config();
const express = require('express');
const path = require('path');
const taskRoutes = require('./routes/tasks');
const projectRoutes = require('./routes/projects');
const activityRoutes = require('./routes/activity');
const emailRoutes = require('./routes/emails');
const cors = require('cors');
const reminderService = require('./services/ReminderService');
const PORT = 3000;
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/tasks', taskRoutes);
app.use('/projects', projectRoutes);
app.use('/activity', activityRoutes);
app.use('/emails', emailRoutes);

app.listen(PORT, () => {
    console.log(`Aether Dashboard running at http://localhost:${PORT}`);
    // Start reminder service
    reminderService.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    reminderService.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    reminderService.stop();
    process.exit(0);
});

