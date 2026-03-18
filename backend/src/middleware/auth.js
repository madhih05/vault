const jwt = require("jsonwebtoken");
const logger = require("../logger");

function buildAuthMeta(req, extra = {}) {
    return {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        ...extra,
    };
}

function requireAuth(req, res, next) {
    const token = req.header("x-auth-token") || req.query.token;

    if (!token) {
        logger.warn(
            "Unauthorized access attempt - No token",
            buildAuthMeta(req),
        );
        return res
            .status(401)
            .json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        logger.debug(
            "Authenticated request accepted",
            buildAuthMeta(req, {
                userId: decoded.id,
                username: decoded.username,
            }),
        );
        next();
    } catch (error) {
        logger.warn(
            "Unauthorized access attempt - Invalid token",
            buildAuthMeta(req, {
                message: error.message,
            }),
        );
        return res.status(401).json({ error: "Invalid or expired token." });
    }
}

module.exports = requireAuth;
