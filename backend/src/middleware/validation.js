const logger = require("../logger");
const { validationResult } = require("express-validator");

function validate(req, res, next) {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
        return next();
    }

    const details = errors.array().map((item) => ({
        field: item.path,
        message: item.msg,
    }));

    logger.warn("Request validation failed", {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        details,
    });

    return res.status(400).json({
        error: "Validation failed.",
        details,
    });
}

module.exports = validate;
