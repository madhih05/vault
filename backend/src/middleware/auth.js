const jwt = require("jsonwebtoken");
const logger = require("../logger");

function requireAuth(req, res, next) {
    const token = req.header("x-auth-token") || req.query.token;

    if (!token) {
        logger.warn("Unauthorized access attempt - No token");
        return res
            .status(401)
            .json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        logger.warn("Unauthorized access attempt - Invalid token");
        return res.status(401).json({ error: "Invalid or expired token." });
    }
}

module.exports = requireAuth;
