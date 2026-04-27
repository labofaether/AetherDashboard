const { ZodError } = require('zod');

function validate(schema, source = 'body') {
    return (req, res, next) => {
        try {
            req[source] = schema.parse(req[source]);
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: err.issues.map(e => ({
                        path: e.path.join('.'),
                        message: e.message
                    }))
                });
            }
            next(err);
        }
    };
}

module.exports = { validate };
