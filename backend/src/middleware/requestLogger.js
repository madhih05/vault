const logger = require("../logger");

function requestLogger(req, res, next) {
    const startedAt = Date.now();

    res.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        logger.info("HTTP request completed", {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
        });
    });

    next();
}

module.exports = requestLogger;
