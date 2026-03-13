const express = require('express');
const path = require('path');
const taskRoutes = require('./routes/tasks');
const projectRoutes = require('./routes/projects');
const activityRoutes = require('./routes/activity');
const cors = require('cors');
const PORT = 3000;
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/tasks', taskRoutes);
app.use('/projects', projectRoutes);
app.use('/activity', activityRoutes);

app.listen(PORT, () => {
    console.log(`Mission Control v2 running at http://localhost:${PORT}`);
});
