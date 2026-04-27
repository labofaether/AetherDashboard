require('dotenv').config();
const { validateEnv, reportAndExitOnFatal } = require('./utils/envValidator');
reportAndExitOnFatal(validateEnv());
const express = require('express');
const path = require('path');
const taskRoutes = require('./routes/tasks');
const projectRoutes = require('./routes/projects');
const activityRoutes = require('./routes/activity');
const emailRoutes = require('./routes/emails');
const paperRoutes = require('./routes/papers');
const searchRoutes = require('./routes/search');
const noteRoutes = require('./routes/notes');
const goalRoutes = require('./routes/goals');
const focusRoutes = require('./routes/focus');
const templateRoutes = require('./routes/templates');
const statsRoutes = require('./routes/stats');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const reminderService = require('./services/ReminderService');
const { closeDb } = require('./db');
const log = require('./utils/logger');
const PORT = parseInt(process.env.PORT) || 3000;
const app = express();

// CORS - restrict to allowed origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || `http://localhost:${PORT}`)
    .split(',')
    .map(o => o.trim());
app.use(cors({
    origin(origin, cb) {
        // Allow requests with no origin (same-origin, curl, etc.)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    }
}));

app.use(express.json());

// Global rate limiter: 100 requests per minute per IP
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
});
app.use(globalLimiter);

// Strict rate limiter for auth-related endpoints: 10 requests per minute
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth requests, please try again later' },
});
app.use('/emails/providers/:type/auth-url', authLimiter);
app.use('/emails/:type/callback', authLimiter);

// Health check endpoint (before static middleware)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/tasks', taskRoutes);
app.use('/projects', projectRoutes);
app.use('/activity', activityRoutes);
app.use('/emails', emailRoutes);
app.use('/papers', paperRoutes);
app.use('/search', searchRoutes);
app.use('/notes', noteRoutes);
app.use('/goals', goalRoutes);
app.use('/focus', focusRoutes);
app.use('/templates', templateRoutes);
app.use('/stats', statsRoutes);

// Global Express error handler — catches errors from route handlers,
// middleware (incl. zod validation passing err to next()), and async throws.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    log.error('Unhandled route error', {
        method: req.method,
        path: req.path,
        status,
        message: err.message,
        stack: err.stack,
    });
    res.status(status).json({
        error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
    });
});

const httpServer = app.listen(PORT, '0.0.0.0', () => {
    log.info('Aether Dashboard started', { port: PORT, url: `http://localhost:${PORT}` });
    reminderService.start();
});

// Process-level safety nets — log and keep running. Crashing on every async hiccup
// is worse than degrading; SIGTERM/SIGINT remain the controlled shutdown paths.
process.on('unhandledRejection', (reason) => {
    log.error('Unhandled promise rejection', {
        message: reason?.message || String(reason),
        stack: reason?.stack,
    });
});

process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', {
        message: err?.message || String(err),
        stack: err?.stack,
    });
});

// Graceful shutdown — drain in-flight requests, then close. Hard-cap at 10s so
// a hung keep-alive connection can't block redeploys.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Shutting down gracefully (${signal})`);
    reminderService.stop();

    const forceExit = setTimeout(() => {
        log.error('Forced shutdown — server.close() did not complete in time', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
        try { closeDb(); } catch {}
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    httpServer.close((err) => {
        if (err) log.error('Error closing HTTP server', { message: err.message });
        try { closeDb(); } catch (e) { log.error('Error closing DB', { message: e.message }); }
        clearTimeout(forceExit);
        process.exit(err ? 1 : 0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
