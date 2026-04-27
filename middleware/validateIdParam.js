function validateIdParam(paramName = 'id') {
    return (req, res, next) => {
        const raw = req.params[paramName];
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0 || String(n) !== String(raw).trim()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: [{ path: `params.${paramName}`, message: 'must be a positive integer' }],
            });
        }
        req.params[paramName] = n;
        next();
    };
}

module.exports = { validateIdParam };
