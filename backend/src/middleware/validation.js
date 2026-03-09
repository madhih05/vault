const { validationResult } = require("express-validator");

function validate(req, res, next) {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
        return next();
    }

    return res.status(400).json({
        error: "Validation failed.",
        details: errors.array().map((item) => ({
            field: item.path,
            message: item.msg,
        })),
    });
}

module.exports = validate;
